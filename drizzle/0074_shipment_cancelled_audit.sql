-- T-281 (D-42): "Batalkan kiriman" cancels the order on Mengantar (DELETE /order) and, once
-- Mengantar confirms, moves the shipment to CANCELLED with one SHIPMENT_CANCELLED audit row.
-- Additive only: one new audit action (every existing row still passes the CHECK), one
-- boolean SECURITY DEFINER lookup and one restrictive INSERT policy. No row, table grant or
-- existing policy changes.
--
-- MIG-1 lock-light rule: the CHECK is re-added NOT VALID, then validated. drizzle-kit migrate
-- applies pending migrations in one transaction, so the DROP's lock is still held while
-- VALIDATE scans; the scan reads one text column and every row already passed the narrower
-- CHECK it replaces.
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_valid";--> statement-breakpoint
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
        'SHIPMENT_CANCELLED'
      )) NOT VALID;--> statement-breakpoint
ALTER TABLE "audit_events" VALIDATE CONSTRAINT "audit_events_action_valid";
--> statement-breakpoint
-- Whether the context user may record the cancellation of this shipment: the actor is the
-- context user, an ACTIVE TENANT_ADMIN of the context tenant (ACTIVE user, ACTIVE gerai), and
-- the shipment belongs to that tenant and is now CANCELLED. Answers only for the context tenant
-- (app.tenant_id), whoever owns it (0072's lesson: a superuser or BYPASSRLS owner is not bound
-- by FORCE RLS). search_path pinned; EXECUTE for the runtime role only. The migration owner,
-- which owns the SECURITY DEFINER audit writers, owns this function and needs no grant.
CREATE FUNCTION public.shipment_cancel_audit_allowed(event_tenant uuid, event_shipment text, event_actor text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN event_tenant = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND event_actor = NULLIF(current_setting('app.user_id', true), '')
    AND EXISTS (
      SELECT 1
      FROM public.memberships m
      JOIN public.users u ON u.id = m.user_id
      JOIN public.tenants t ON t.id = m.tenant_id
      WHERE m.tenant_id = event_tenant
        AND m.user_id = event_actor
        AND m.role = 'TENANT_ADMIN'
        AND m.status = 'ACTIVE'
        AND u.status = 'ACTIVE'
        AND t.status = 'ACTIVE'
    )
    AND EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id::text = event_shipment
        AND s.tenant_id = event_tenant
        AND s.status = 'CANCELLED'
    );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shipment_cancel_audit_allowed(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.shipment_cancel_audit_allowed(uuid, text, text) TO geraicuan_app;
--> statement-breakpoint
-- The cancellation audit row: a successful tenant-member row about a shipment of the context
-- tenant, written by that tenant's active Tenant Admin after the shipment became CANCELLED.
-- The runtime role cannot write one for another gerai, as an Operator, or for a live shipment.
CREATE POLICY audit_events_shipment_cancelled_guard ON audit_events
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    action <> 'SHIPMENT_CANCELLED'
    OR (
      outcome = 'SUCCESS'
      AND actor_role = 'TENANT_MEMBER'
      AND target_type = 'SHIPMENT'
      AND from_status IS NULL
      AND to_status IS NULL
      AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      AND public.shipment_cancel_audit_allowed(tenant_id, target_id, actor_id)
    )
  );
