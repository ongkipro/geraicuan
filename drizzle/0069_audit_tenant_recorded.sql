-- T-259 (DATA-23, D-35): every new audit row about a gerai carries its tenant_id. Fix forward
-- only: no existing audit row is read, updated or deleted (audit is append-only).
--
-- 1. The only writer that stored a gerai event without its tenant was the implicit prefix lock
--    in allocate_shipment_reference() (0040): tenant_id NULL with the gerai as target_id. It is
--    re-created unchanged except that the row now stores NEW.tenant_id. CREATE OR REPLACE keeps
--    the owner and the 0040 REVOKEs (no EXECUTE for PUBLIC or geraicuan_app); the trigger
--    shipments_allocate_public_reference keeps pointing at it.
-- 2. Guard: CHECK audit_events_tenant_recorded. A tenantless row is allowed only for a
--    PLATFORM target (announcements, global monitoring view) or a DENIED lifecycle attempt
--    (TENANT_CREATED/SUSPENDED/REACTIVATED) whose gerai was never verified. Every other action,
--    including one added later, must carry tenant_id (fail closed). NOT VALID: the existing
--    implicit-lock rows are not validated and stay as written; every later INSERT is checked,
--    for every role including the migration owner and SECURITY DEFINER functions (a CHECK is
--    not bypassed by RLS exemptions). Audit rows are never updated (no UPDATE grant), so the
--    NOT VALID caveat about later updates of old rows (0060) does not apply here.
CREATE OR REPLACE FUNCTION public.allocate_shipment_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  allocated integer;
  prefix text;
  locked_at timestamptz;
BEGIN
  IF actor IS NULL THEN
    -- Missing context is supported only for migration/owner synthetic fixtures.
    IF NEW.created_by_user_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = session_user AND (rolsuper OR rolbypassrls)
    ) THEN
      RAISE EXCEPTION 'Shipment creator context is required.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.created_by_user_id IS NOT NULL AND NEW.created_by_user_id <> actor THEN
      RAISE EXCEPTION 'Shipment creator does not match context.' USING ERRCODE = '42501';
    END IF;
    PERFORM 1
    FROM public.users u
    JOIN public.memberships m ON m.user_id = u.id AND m.tenant_id = NEW.tenant_id
    JOIN public.tenants t ON t.id = m.tenant_id
    JOIN public.outlets o ON o.tenant_id = t.id AND o.id = NEW.outlet_id
    WHERE u.id = actor AND u.status = 'ACTIVE' AND m.status = 'ACTIVE' AND t.status = 'ACTIVE';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shipment creator is not authorized.' USING ERRCODE = '42501';
    END IF;
    NEW.created_by_user_id := actor;
  END IF;
  -- One statement allocates the number and, only on a tenant's first allocation, locks an
  -- unsaved prefix. The counter row lock serializes allocation with a concurrent prefix save.
  INSERT INTO public.tenant_shipment_counters AS counter (tenant_id, last_number, shipment_prefix_locked_at)
  VALUES (NEW.tenant_id, 10000, now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    last_number = coalesce(counter.last_number, 9999) + 1,
    shipment_prefix_locked_at = CASE
      WHEN counter.last_number IS NULL THEN coalesce(counter.shipment_prefix_locked_at, now())
      ELSE counter.shipment_prefix_locked_at
    END
  RETURNING counter.last_number, counter.shipment_prefix, counter.shipment_prefix_locked_at
  INTO allocated, prefix, locked_at;
  NEW.tenant_number := allocated;
  NEW.public_reference := prefix || '-' || allocated::text;
  IF allocated = 10000 AND locked_at = now() THEN
    -- This allocation locked the default prefix implicitly; record it like an explicit save,
    -- with the gerai as tenant_id (T-259). NEW.tenant_id is server-side: the shipment's own
    -- tenant, checked above against the actor's active membership and by the shipment's RLS
    -- WITH CHECK and FK after this trigger (a refused shipment rolls this row back with it).
    INSERT INTO public.audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, metadata)
    VALUES (actor, CASE WHEN actor IS NULL THEN NULL ELSE 'TENANT_MEMBER' END, NEW.tenant_id,
      'SHIPMENT_PREFIX_LOCKED', 'TENANT', NEW.tenant_id::text, 'SUCCESS',
      jsonb_build_object('implicit', true, 'prefix', prefix));
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_recorded" CHECK (tenant_id IS NOT NULL OR target_type = 'PLATFORM' OR (outcome = 'DENIED' AND action IN ('TENANT_CREATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED'))) NOT VALID;
