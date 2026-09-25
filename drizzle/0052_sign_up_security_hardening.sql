-- T-181 security review follow-up (M1, L1, L3, L5). A new migration rather than
-- an edit of 0051: drizzle's migrator applies a file only when its journal time
-- is newer than the last applied row and never compares hashes, so a database
-- that already ran 0051 (the developer database) would silently keep the old
-- objects if 0051 were edited.

-- 1. M1: `requireEmailVerification` must not lock out the accounts that existed
-- before self-service sign-up. They were created by operators, never through a
-- public form, so their email_verified was never meaningful. Verified here: a
-- user holding an ACTIVE membership or a platform role who did not register
-- through `register_tenant_self_service` (every account that did carries its
-- TENANT_SELF_REGISTERED audit event and must still prove its inbox).
UPDATE users SET email_verified = true, updated_at = now()
WHERE email_verified = false
  AND (
    EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.status = 'ACTIVE')
    OR EXISTS (SELECT 1 FROM platform_roles p WHERE p.user_id = users.id)
  )
  AND NOT EXISTS (
    SELECT 1 FROM audit_events e
    WHERE e.action = 'TENANT_SELF_REGISTERED' AND e.actor_id = users.id
  );
--> statement-breakpoint

-- 2. L1: 0051 granted the runtime role UPDATE (email_verified, updated_at) so
-- Better Auth can mark an address verified. That grant alone also let it clear
-- verification on any user. Only false -> true is accepted from anyone but the
-- table owner or a superuser (migrations and operators).
CREATE FUNCTION guard_user_email_verified() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.email_verified IS DISTINCT FROM OLD.email_verified
    AND NOT (OLD.email_verified = false AND NEW.email_verified = true)
    AND CURRENT_USER <> (SELECT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class c WHERE c.oid = 'public.users'::regclass)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = CURRENT_USER AND r.rolsuper)
  THEN
    RAISE EXCEPTION 'An email verification can only be granted, not withdrawn.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION guard_user_email_verified() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER users_email_verified_guard
  BEFORE UPDATE OF email_verified ON users
  FOR EACH ROW EXECUTE FUNCTION guard_user_email_verified();
--> statement-breakpoint

-- 3. L3: the approval queue also requires that `app.user_id` is an ACTIVE Super
-- Admin, so forging `app.platform_admin` alone reads nothing.
-- `withPlatformContext` sets `app.user_id` before `app.platform_admin`.
CREATE OR REPLACE VIEW platform_registration_queue
WITH (security_barrier = true)
AS
SELECT
  t.id AS tenant_id,
  t.name AS store_name,
  t.contact_whatsapp,
  t.mengantar_credential_policy,
  t.created_at AS registered_at,
  owner_user.name AS owner_name,
  owner_user.email AS owner_email,
  owner_user.email_verified AS owner_email_verified
FROM tenants t
JOIN LATERAL (
  SELECT u.name, u.email, u.email_verified
  FROM memberships m JOIN users u ON u.id = m.user_id
  WHERE m.tenant_id = t.id AND m.role = 'TENANT_ADMIN'
  ORDER BY m.created_at, m.id
  LIMIT 1
) owner_user ON true
WHERE t.status = 'PROVISIONING'
  AND current_setting('app.platform_admin', true) = 'true'
  AND EXISTS (
    SELECT 1 FROM platform_roles p JOIN users admin_user ON admin_user.id = p.user_id
    WHERE p.user_id = NULLIF(current_setting('app.user_id', true), '')
      AND p.role = 'SUPER_ADMIN' AND admin_user.status = 'ACTIVE'
  );
--> statement-breakpoint

-- 4. L5: the registration function refuses Unicode format characters (general
-- category Cf: soft hyphen, bidi controls and isolates, zero-width characters,
-- BOM, interlinear annotation, tag characters) in both names, as the server
-- validation does (`src/lib/self-registration.ts`). Body otherwise unchanged
-- from 0051; CREATE OR REPLACE keeps the OID the 0051 policies resolve.
CREATE OR REPLACE FUNCTION register_tenant_self_service(
  p_email text, p_owner_name text, p_password_hash text, p_store_name text, p_whatsapp text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  owner_name text := btrim(coalesce(p_owner_name, ''));
  store_name text := btrim(coalesce(p_store_name, ''));
  new_user text := replace(gen_random_uuid()::text, '-', '');
  new_tenant uuid := gen_random_uuid();
  previous_user text := current_setting('app.user_id', true);
  previous_tenant text := current_setting('app.tenant_id', true);
  format_characters constant text := '[­؀-؅؜۝܏࢐-࢑࣢᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻\U000110BD\U000110CD\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0001\U000E0020-\U000E007F]';
BEGIN
  IF char_length(normalized_email) NOT BETWEEN 3 AND 254
    OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR char_length(owner_name) NOT BETWEEN 2 AND 120 OR owner_name ~ '[[:cntrl:]]' OR owner_name ~ format_characters
    OR char_length(store_name) NOT BETWEEN 2 AND 120 OR store_name ~ '[[:cntrl:]]' OR store_name ~ format_characters
    OR p_whatsapp IS NULL OR p_whatsapp !~ '^0[2-9][0-9]{7,11}$'
    OR p_password_hash IS NULL OR char_length(p_password_hash) NOT BETWEEN 16 AND 512
  THEN
    RAISE EXCEPTION 'Self-registration input is invalid.' USING ERRCODE = '22023';
  END IF;
  -- An existing account is not an error the caller may surface: it returns NULL,
  -- and the concurrent case surfaces as the users.email unique violation.
  IF EXISTS (SELECT 1 FROM public.users WHERE lower(users.email) = normalized_email) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.users (id, name, email, email_verified, status)
  VALUES (new_user, owner_name, normalized_email, false, 'ACTIVE');
  INSERT INTO public.accounts (id, account_id, provider_id, issuer, user_id, password)
  VALUES (replace(gen_random_uuid()::text, '-', ''), new_user, 'credential', 'local:credential', new_user, p_password_hash);
  INSERT INTO public.tenants (id, name, status, mengantar_credential_policy, contact_whatsapp)
  VALUES (new_tenant, store_name, 'PROVISIONING', 'PRIVATE_ONLY', p_whatsapp);

  PERFORM set_config('app.user_id', new_user, true);
  PERFORM set_config('app.tenant_id', new_tenant::text, true);
  INSERT INTO public.memberships (tenant_id, user_id, role, status)
  VALUES (new_tenant, new_user, 'TENANT_ADMIN', 'ACTIVE');
  -- The application has no outlet-creation path; a store starts with one outlet
  -- named after it, which the admin configures (PR-60).
  INSERT INTO public.outlets (tenant_id, name) VALUES (new_tenant, store_name);
  INSERT INTO public.audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, to_status, metadata)
  VALUES (new_user, 'TENANT_MEMBER', new_tenant, 'TENANT_SELF_REGISTERED', 'TENANT', new_tenant::text, 'SUCCESS',
    'PROVISIONING', jsonb_build_object('credentialPolicy', 'PRIVATE_ONLY'));
  PERFORM set_config('app.user_id', coalesce(previous_user, ''), true);
  PERFORM set_config('app.tenant_id', coalesce(previous_tenant, ''), true);
  RETURN new_tenant;
END;
$function$;
