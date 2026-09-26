-- Review 2026-09-26 (finding 3): 0058's UPDATE policy let the SECURITY DEFINER owner role
-- update ANY tenant row. Every definer function shares that owner, so where the owner is not
-- a superuser any of them would gain unrestricted UPDATE on tenants. Narrow it to the tenant
-- the session is scoped to (set_tenant_contact_whatsapp only ever updates that row).
-- Policy change only: no column, grant or data changes.
ALTER POLICY tenants_contact_whatsapp_function_update ON tenants
  USING (
    CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.set_tenant_contact_whatsapp(text)'::regprocedure::oid)
    AND id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.set_tenant_contact_whatsapp(text)'::regprocedure::oid)
    AND id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );
