-- T-198 (security review, finding 3): a rejected registration must not lock the
-- real owner of the address out. Before this migration an attacker could
-- register someone else's email and never verify it; after the Super Admin
-- rejected the store the account stayed ACTIVE with the attacker's password,
-- `/daftar` found the address taken, recovery sent nothing to a user of an
-- ARCHIVED store, and sign-in failed: the address was unusable for good.
--
-- A rejection now releases the address when the owner never verified it: the
-- account keeps its id (the audit trail and the archived store still point at
-- it) but its email becomes a reserved non-deliverable address and the account
-- is SUSPENDED. A later sign-up with the released address goes through
-- `register_tenant_self_service` unchanged, so it creates a new user with a new
-- id and the new password, a new PROVISIONING store, and nothing of the old one.
-- An owner who verified the address proved the inbox and keeps the account.
--
-- A new migration rather than an edit of 0051 or 0052, for the reason 0052
-- gives: the migrator never re-applies an edited file.

-- 1. The review function reads whether the owner holds a platform role. The
-- only other SELECT policy on platform_roles shows a caller its own row, so a
-- function owner that does not bypass RLS would otherwise see none and treat a
-- Super Admin as releasable.
CREATE POLICY platform_roles_registration_review_read ON platform_roles
  AS PERMISSIVE FOR SELECT TO public
  USING (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'review_tenant_registration(uuid,text,text,uuid)'::regprocedure::oid));
--> statement-breakpoint

-- 2. The review function. Body as in 0051, plus: the owner row is locked, so a
-- verification cannot land between the check and the release, and a rejection
-- of a never-verified owner with no platform role and no other store that is
-- not ARCHIVED releases the address. The result still carries the original
-- address, so the rejection mail reaches it. CREATE OR REPLACE keeps the OID
-- the 0051 policies resolve.
CREATE OR REPLACE FUNCTION review_tenant_registration(
  target uuid, decision text, reason text, attempt_id uuid
) RETURNS TABLE (tenant_name text, owner_email text, owner_name text, to_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  trimmed_reason text := nullif(btrim(coalesce(reason, '')), '');
  next_status text;
  found_tenant record;
  found_owner record;
  released boolean := false;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.platform_roles p JOIN public.users u ON u.id = p.user_id
    WHERE p.user_id = actor AND p.role = 'SUPER_ADMIN' AND u.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Registration review is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF target IS NULL OR attempt_id IS NULL OR decision IS NULL OR decision NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'Registration review input is invalid.' USING ERRCODE = '22023';
  END IF;
  IF decision = 'REJECT' AND (trimmed_reason IS NULL OR char_length(trimmed_reason) > 500 OR trimmed_reason ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'A rejection reason is required.' USING ERRCODE = '22023';
  END IF;

  SELECT t.id, t.name, t.status INTO found_tenant FROM public.tenants t WHERE t.id = target FOR UPDATE;
  IF NOT FOUND OR found_tenant.status <> 'PROVISIONING' THEN
    RAISE EXCEPTION 'Tenant is not awaiting approval.' USING ERRCODE = '55000';
  END IF;
  SELECT u.id, u.email, u.name, u.email_verified INTO found_owner
  FROM public.memberships m JOIN public.users u ON u.id = m.user_id
  WHERE m.tenant_id = target AND m.role = 'TENANT_ADMIN'
  ORDER BY m.created_at, m.id LIMIT 1
  FOR UPDATE OF u;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant has no owner.' USING ERRCODE = '55000';
  END IF;
  IF decision = 'APPROVE' AND NOT found_owner.email_verified THEN
    RAISE EXCEPTION 'Owner email is not verified.' USING ERRCODE = '55000';
  END IF;

  next_status := CASE decision WHEN 'APPROVE' THEN 'ACTIVE' ELSE 'ARCHIVED' END;
  UPDATE public.tenants SET status = next_status, updated_at = now()
  WHERE id = target AND status = 'PROVISIONING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant is not awaiting approval.' USING ERRCODE = '55000';
  END IF;

  IF decision = 'REJECT' AND NOT found_owner.email_verified
    AND NOT EXISTS (SELECT 1 FROM public.platform_roles p WHERE p.user_id = found_owner.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.memberships m JOIN public.tenants t ON t.id = m.tenant_id
      WHERE m.user_id = found_owner.id AND t.status <> 'ARCHIVED'
    )
    -- Never fail a rejection on the reserved address being taken.
    AND NOT EXISTS (SELECT 1 FROM public.users WHERE users.email = 'released+' || found_owner.id || '@registration.invalid')
  THEN
    UPDATE public.users
    SET email = 'released+' || id || '@registration.invalid', status = 'SUSPENDED', updated_at = now()
    WHERE id = found_owner.id AND email_verified = false;
    released := FOUND;
  END IF;

  INSERT INTO public.audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, from_status, to_status, metadata)
  VALUES (actor, 'SUPER_ADMIN', target,
    CASE decision WHEN 'APPROVE' THEN 'TENANT_REGISTRATION_APPROVED' ELSE 'TENANT_REGISTRATION_REJECTED' END,
    'TENANT', target::text, 'SUCCESS', 'PROVISIONING', next_status,
    CASE decision WHEN 'APPROVE' THEN jsonb_build_object('attemptId', attempt_id)
      ELSE jsonb_build_object('attemptId', attempt_id, 'reason', trimmed_reason, 'ownerEmailReleased', released) END);

  tenant_name := found_tenant.name;
  owner_email := found_owner.email;
  owner_name := found_owner.name;
  to_status := next_status;
  RETURN NEXT;
END;
$function$;
--> statement-breakpoint

-- 3. Stores rejected before this migration: release the address of every
-- never-verified owner of a rejected, ARCHIVED registration who holds no
-- platform role and no store that is not ARCHIVED. Verified owners, pending
-- registrations and every other account are untouched.
UPDATE users
SET email = 'released+' || users.id || '@registration.invalid', status = 'SUSPENDED', updated_at = now()
WHERE users.email_verified = false
  AND NOT EXISTS (SELECT 1 FROM platform_roles p WHERE p.user_id = users.id)
  AND EXISTS (
    SELECT 1 FROM memberships m
    JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = users.id AND m.role = 'TENANT_ADMIN' AND t.status = 'ARCHIVED'
      AND EXISTS (
        SELECT 1 FROM audit_events e
        WHERE e.tenant_id = t.id AND e.action = 'TENANT_REGISTRATION_REJECTED'
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM memberships m JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = users.id AND t.status <> 'ARCHIVED'
  );
