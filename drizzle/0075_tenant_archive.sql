-- T-279 (T-105 residual; spec 17 UX-v3.1, UX-v3.3): a Super Admin archives a gerai,
-- ACTIVE or SUSPENDED -> ARCHIVED, with one TENANT_ARCHIVED audit row and the sessions of every
-- member of that gerai deleted in the same transaction. ARCHIVED already exists in
-- tenants_status_valid (0000) and is refused by every tenant scope like SUSPENDED (the CMS
-- principal and tenant context admit only ACTIVE and PROVISIONING).
--
-- The archive runs through the lifecycle path of 0024 (attempt receipt, fingerprint,
-- serialized target), so the lifecycle vocabulary grows by one action in three places: the
-- action CHECK, the tenantless-denial CHECK (0069) and the attempt-receipt read policy (0024).
-- The row itself is guarded by a restrictive INSERT policy below rather than by rewriting the
-- long permissive `audit_events_append` policy.
--
-- The attempt-receipt unique index `audit_events_platform_lifecycle_attempt_key` (0024) is not
-- widened: rebuilding an `audit_events` index inside the migration transaction would block every
-- audited action (MIG-1 needs CREATE INDEX CONCURRENTLY, which drizzle-kit migrate cannot run).
-- One archive receipt per attempt follows from the per-attempt advisory lock and the receipt
-- re-read under it, as 0074 chose for SHIPMENT_CANCELLED.
--
-- MIG-1 lock-light rule: audit_events_action_valid is re-added NOT VALID, then validated
-- (every existing row passed the narrower CHECK it replaces). audit_events_tenant_recorded
-- stays NOT VALID exactly as 0069 left it: rows written before 0069 are still not re-checked.
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_valid";--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_tenant_recorded";--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_valid" CHECK (action IN (
        'TENANT_CREATED',
        'TENANT_SUSPENDED',
        'TENANT_REACTIVATED',
        'PLATFORM_MONITORING_VIEWED',
        'MEMBER_INVITED',
        'MEMBER_ROLE_CHANGED',
        'MEMBER_DEACTIVATED',
        'OUTLET_SETTINGS_CHANGED',
        'MENGANTAR_CREDENTIAL_CREATED',
        'MENGANTAR_CREDENTIAL_REPLACED',
        'MENGANTAR_PLATFORM_DEFAULT_RESTORED',
        'SHIPMENT_PREFIX_LOCKED',
        'SHIPMENT_PREFIX_UNLOCKED',
        'TENANT_SELF_REGISTERED',
        'TENANT_REGISTRATION_APPROVED',
        'TENANT_REGISTRATION_REJECTED',
        'TENANT_CONTACT_UPDATED',
        'ANNOUNCEMENT_SAVED',
        'ANNOUNCEMENT_PUBLISHED',
        'ANNOUNCEMENT_UNPUBLISHED',
        'SHIPMENT_HANDOVER_RECORDED',
        'SHIPMENT_HANDOVER_UNDONE',
        'SHIPMENT_CANCELLED',
        'TENANT_ARCHIVED'
      )) NOT VALID;--> statement-breakpoint
ALTER TABLE "audit_events" VALIDATE CONSTRAINT "audit_events_action_valid";--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_recorded" CHECK (tenant_id IS NOT NULL OR target_type = 'PLATFORM' OR (outcome = 'DENIED' AND action IN ('TENANT_CREATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED', 'TENANT_ARCHIVED'))) NOT VALID;
--> statement-breakpoint
-- The Super Admin's own attempt receipts, now including archive receipts, so a replayed
-- archive attempt returns its first result instead of writing a second row (0024).
DROP POLICY "audit_events_platform_lifecycle_attempt_read" ON public.audit_events;
--> statement-breakpoint
CREATE POLICY "audit_events_platform_lifecycle_attempt_read" ON public.audit_events
  FOR SELECT
  USING (
    actor_id = NULLIF(current_setting('app.user_id', true), '')
    AND actor_role = 'SUPER_ADMIN'
    AND target_type = 'TENANT'
    AND action IN ('TENANT_CREATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED', 'TENANT_ARCHIVED')
    AND metadata ? 'attemptId'
    AND current_setting('app.platform_admin', true) = 'true'
  );
--> statement-breakpoint
-- The archive audit row. A success is a Super Admin row in the platform context, about a gerai
-- that is now ARCHIVED, from ACTIVE or SUSPENDED, carrying its attempt receipt. A refusal is
-- either a Super Admin refusal with its receipt or a tenantless refusal of an unauthorized
-- actor (the same three shapes 0024 allows for the other lifecycle actions). Nobody else can
-- write TENANT_ARCHIVED: not a tenant member, not outside the platform context, not for a gerai
-- that is not archived.
CREATE POLICY audit_events_tenant_archived_guard ON audit_events
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    action <> 'TENANT_ARCHIVED'
    OR (
      target_type = 'TENANT'
      AND (
        (
          outcome = 'SUCCESS'
          AND actor_role = 'SUPER_ADMIN'
          AND current_setting('app.platform_admin', true) = 'true'
          AND tenant_id IS NOT NULL
          AND target_id = tenant_id::text
          AND metadata ? 'attemptId'
          AND metadata ? 'fingerprint'
          AND from_status IN ('ACTIVE', 'SUSPENDED')
          AND to_status = 'ARCHIVED'
          AND EXISTS (
            SELECT 1 FROM public.tenants AS archive_target
            WHERE archive_target.id = audit_events.tenant_id
              AND archive_target.status = 'ARCHIVED'
          )
        )
        OR (
          outcome = 'DENIED'
          AND tenant_id IS NULL
          AND from_status IS NULL
          AND to_status IS NULL
        )
        OR (
          outcome = 'DENIED'
          AND actor_role = 'SUPER_ADMIN'
          AND current_setting('app.platform_admin', true) = 'true'
          AND metadata ? 'attemptId'
          AND metadata ? 'fingerprint'
        )
      )
    )
  );
--> statement-breakpoint
-- Archiving signs out every member of the gerai, as suspending does (0073 L1). The helper keeps
-- its name, signature and OID (the 0073 memberships read policy resolves it by regprocedure) and
-- now also acts on an ARCHIVED gerai. Still only for an ACTIVE Super Admin in `app.user_id`, and
-- still never on an ACTIVE or PROVISIONING gerai.
CREATE OR REPLACE FUNCTION public.revoke_suspended_tenant_sessions(target uuid) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  revoked integer;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.platform_roles p JOIN public.users u ON u.id = p.user_id
    WHERE p.user_id = actor AND p.role = 'SUPER_ADMIN' AND u.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Session revocation is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF target IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = target AND t.status IN ('SUSPENDED', 'ARCHIVED')
  ) THEN
    RAISE EXCEPTION 'Tenant is not suspended or archived.' USING ERRCODE = '55000';
  END IF;
  DELETE FROM public.sessions s
  USING public.memberships m
  WHERE m.tenant_id = target AND s.user_id = m.user_id;
  GET DIAGNOSTICS revoked = ROW_COUNT;
  RETURN revoked;
END;
$function$;
