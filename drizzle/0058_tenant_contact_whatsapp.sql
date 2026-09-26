-- T-233: the gerai WhatsApp (tenants.contact_whatsapp, printed on the nota and
-- prefilled as the label sender) becomes editable by the gerai's own Tenant Admin.
-- Additive: the audit action list gains one value (every existing row still passes),
-- and one SECURITY DEFINER function is the only write path. The runtime role gets no
-- UPDATE on the column and no tenant-admin UPDATE policy on `tenants`: a row policy
-- cannot limit columns, and the role's UPDATE (name, status) grant exists for the
-- Super Admin path, so a policy would have let a Tenant Admin rename or reactivate
-- their own tenant. The function writes the one column, for the caller's own tenant,
-- only for an active Tenant Admin, and audits in the same statement.
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
        'TENANT_CONTACT_UPDATED'
      ));
--> statement-breakpoint
CREATE FUNCTION public.set_tenant_contact_whatsapp(requested text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  previous text;
BEGIN
  -- Same rule as the column CHECK (DATA-12); the application normalises first.
  IF requested IS NULL OR requested !~ '^0[2-9][0-9]{7,11}$' THEN
    RAISE EXCEPTION 'Tenant WhatsApp is invalid.' USING ERRCODE = '22023';
  END IF;
  -- Store setup (PR-60): an approved or pending gerai; never a suspended or archived one.
  IF actor IS NULL OR tenant IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.memberships m
    JOIN public.users u ON u.id = m.user_id
    JOIN public.tenants t ON t.id = m.tenant_id
    WHERE m.tenant_id = tenant AND m.user_id = actor AND m.role = 'TENANT_ADMIN'
      AND m.status = 'ACTIVE' AND u.status = 'ACTIVE' AND t.status IN ('ACTIVE', 'PROVISIONING')
  ) THEN
    RAISE EXCEPTION 'Tenant WhatsApp change is not authorized.' USING ERRCODE = '42501';
  END IF;
  SELECT contact_whatsapp INTO previous FROM public.tenants WHERE id = tenant FOR UPDATE;
  IF previous IS NOT DISTINCT FROM requested THEN
    RETURN requested;
  END IF;
  UPDATE public.tenants SET contact_whatsapp = requested, updated_at = now() WHERE id = tenant;
  -- The numbers are not copied into the audit trail (privacy minimum, spec 13).
  INSERT INTO public.audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, metadata)
  VALUES (actor, 'TENANT_MEMBER', tenant, 'TENANT_CONTACT_UPDATED', 'TENANT', tenant::text, 'SUCCESS',
    jsonb_build_object('field', 'contact_whatsapp', 'hadPrevious', previous IS NOT NULL));
  RETURN requested;
END;
$$;
--> statement-breakpoint
-- The function owner writes the row when it is not a superuser or BYPASSRLS role
-- (FORCE RLS on tenants, 0034); the runtime role never is that owner.
CREATE POLICY tenants_contact_whatsapp_function_update ON tenants
  AS PERMISSIVE FOR UPDATE TO public
  USING (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.set_tenant_contact_whatsapp(text)'::regprocedure::oid))
  WITH CHECK (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.set_tenant_contact_whatsapp(text)'::regprocedure::oid));
--> statement-breakpoint
-- Only the function (its owner) may append this audit action; the runtime role cannot forge it.
CREATE POLICY audit_events_tenant_contact_guard ON audit_events
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    action <> 'TENANT_CONTACT_UPDATED'
    OR CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.set_tenant_contact_whatsapp(text)'::regprocedure::oid)
  );
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.set_tenant_contact_whatsapp(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.set_tenant_contact_whatsapp(text) TO geraicuan_app;
