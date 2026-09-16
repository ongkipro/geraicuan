-- PR-44 / T-147: per-tenant shipment numbers with a one-time tenant prefix.
-- Replaces PR-41's creator-date-serial display reference. UUID keys are unchanged.
-- Numbering state lives in tenant_shipment_counters (no RLS, no runtime privilege) so the
-- owner-run SECURITY DEFINER functions below do not depend on a superuser migration role.
-- The migration runner must execute this file in one transaction.
LOCK TABLE public.shipments IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE "tenant_shipment_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer,
	"shipment_prefix" text DEFAULT 'GC' NOT NULL,
	"shipment_prefix_locked_at" timestamp with time zone,
	CONSTRAINT "tenant_shipment_counters_last_number_valid" CHECK (last_number IS NULL OR last_number >= 10000),
	CONSTRAINT "tenant_shipment_counters_prefix_valid" CHECK (shipment_prefix ~ '^[A-Z0-9]{2,5}$')
);
ALTER TABLE "tenant_shipment_counters" ADD CONSTRAINT "tenant_shipment_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER shipments_allocate_public_reference ON public.shipments;
DROP TRIGGER shipments_protect_public_reference ON public.shipments;
--> statement-breakpoint
-- Drop the global PR-41 uniqueness first: per-tenant references legitimately repeat across tenants.
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_public_reference_key";
ALTER TABLE public.shipments ADD COLUMN tenant_number integer DEFAULT NULL;
-- Existing shipments: numbered per tenant in creation order (id breaks ties). Their prefix
-- stays unlocked, so a tenant with history can still choose it once; later allocations do
-- not lock it (only a tenant's very first allocation does).
WITH numbered AS (
  SELECT id, (9999 + row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id))::integer AS number
  FROM public.shipments
)
UPDATE public.shipments s
SET tenant_number = n.number, public_reference = 'GC-' || n.number
FROM numbered n WHERE s.id = n.id;
INSERT INTO public.tenant_shipment_counters (tenant_id, last_number)
SELECT tenant_id, max(tenant_number) FROM public.shipments GROUP BY tenant_id;
ALTER TABLE public.shipments ALTER COLUMN tenant_number SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_reference_owner_date_sequence_key";
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_reference_owner_valid";
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_daily_sequence_positive";
ALTER TABLE "shipments" DROP COLUMN "reference_user_number";
ALTER TABLE "shipments" DROP COLUMN "reference_date";
ALTER TABLE "shipments" DROP COLUMN "daily_sequence";
DROP TABLE public.shipment_reference_counters;
--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_tenant_number_key" UNIQUE("tenant_id","tenant_number");
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_tenant_number_valid" CHECK (tenant_number >= 10000);
-- With the per-tenant number unique, this also makes the displayed reference unique per tenant.
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_public_reference_format" CHECK (public_reference ~ '^[A-Z0-9]{2,5}-[0-9]{5,}$' AND split_part(public_reference, '-', 2) = tenant_number::text);
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_valid";
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
        'SHIPMENT_PREFIX_UNLOCKED'
      ));
--> statement-breakpoint
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
    -- This allocation locked the default prefix implicitly; record it like an explicit save. The
    -- tenant is the target only, so an automatic row does not pin the tenant's retention (FK).
    INSERT INTO public.audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, metadata)
    VALUES (actor, CASE WHEN actor IS NULL THEN NULL ELSE 'TENANT_MEMBER' END, NULL,
      'SHIPMENT_PREFIX_LOCKED', 'TENANT', NEW.tenant_id::text, 'SUCCESS',
      jsonb_build_object('implicit', true, 'prefix', prefix));
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER shipments_allocate_public_reference BEFORE INSERT ON public.shipments
FOR EACH ROW EXECUTE FUNCTION public.allocate_shipment_reference();
--> statement-breakpoint
CREATE FUNCTION public.set_tenant_shipment_prefix(requested text, attempt_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  previous text;
BEGIN
  IF requested IS NULL OR requested !~ '^[A-Z0-9]{2,5}$' THEN
    RAISE EXCEPTION 'Shipment prefix is invalid.' USING ERRCODE = '22023';
  END IF;
  IF actor IS NULL OR tenant IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.memberships m
    JOIN public.users u ON u.id = m.user_id
    JOIN public.tenants t ON t.id = m.tenant_id
    WHERE m.tenant_id = tenant AND m.user_id = actor AND m.role = 'TENANT_ADMIN'
      AND m.status = 'ACTIVE' AND u.status = 'ACTIVE' AND t.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Shipment prefix change is not authorized.' USING ERRCODE = '42501';
  END IF;
  SELECT shipment_prefix INTO previous FROM public.tenant_shipment_counters WHERE tenant_id = tenant FOR UPDATE;
  INSERT INTO public.tenant_shipment_counters AS counter (tenant_id, shipment_prefix, shipment_prefix_locked_at)
  VALUES (tenant, requested, now())
  ON CONFLICT (tenant_id) DO UPDATE SET shipment_prefix = EXCLUDED.shipment_prefix, shipment_prefix_locked_at = now()
  WHERE counter.shipment_prefix_locked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment prefix is locked.' USING ERRCODE = '55000';
  END IF;
  PERFORM set_config('app.shipment_prefix_rewrite', 'on', true);
  UPDATE public.shipments SET public_reference = requested || '-' || tenant_number::text
  WHERE tenant_id = tenant AND public_reference <> requested || '-' || tenant_number::text;
  PERFORM set_config('app.shipment_prefix_rewrite', 'off', true);
  INSERT INTO public.audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, metadata)
  VALUES (actor, 'TENANT_MEMBER', tenant, 'SHIPMENT_PREFIX_LOCKED', 'TENANT', tenant::text, 'SUCCESS',
    jsonb_build_object('attemptId', attempt_id, 'previousPrefix', coalesce(previous, 'GC'), 'prefix', requested));
  RETURN requested;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.protect_public_reference_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF NEW.public_number IS DISTINCT FROM OLD.public_number THEN
      RAISE EXCEPTION 'Public user number is immutable.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF ROW(NEW.created_by_user_id, NEW.tenant_number) IS DISTINCT FROM ROW(OLD.created_by_user_id, OLD.tenant_number) THEN
      RAISE EXCEPTION 'Shipment number is immutable.' USING ERRCODE = '42501';
    END IF;
    -- Only the owner-run prefix function may rewrite the displayed prefix; the number never moves.
    IF NEW.public_reference IS DISTINCT FROM OLD.public_reference AND NOT (
      -- coalesce: an unset setting is NULL, and NULL here would silently skip the RAISE below.
      coalesce(current_setting('app.shipment_prefix_rewrite', true), '') = 'on'
      -- Inside the SECURITY DEFINER prefix function current_user is its owner; the app role never is.
      AND current_user = (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
        WHERE oid = 'public.set_tenant_shipment_prefix(text, uuid)'::regprocedure)
    ) THEN
      RAISE EXCEPTION 'Shipment reference is immutable.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER shipments_protect_public_reference BEFORE UPDATE ON public.shipments
FOR EACH ROW EXECUTE FUNCTION public.protect_public_reference_identity();
--> statement-breakpoint
CREATE FUNCTION public.unlock_tenant_shipment_prefix(target uuid, attempt_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  current_prefix text;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.platform_roles p JOIN public.users u ON u.id = p.user_id
    WHERE p.user_id = actor AND u.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Shipment prefix unlock is not authorized.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.tenant_shipment_counters SET shipment_prefix_locked_at = NULL
  WHERE tenant_id = target AND shipment_prefix_locked_at IS NOT NULL
  RETURNING shipment_prefix INTO current_prefix;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment prefix is not locked.' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, metadata)
  VALUES (actor, 'SUPER_ADMIN', target, 'SHIPMENT_PREFIX_UNLOCKED', 'TENANT', target::text, 'SUCCESS',
    jsonb_build_object('attemptId', attempt_id, 'prefix', current_prefix));
END;
$$;
--> statement-breakpoint
-- Read-only state for Pengaturan (own tenant, active member) or platform tenant detail (active Super Admin).
CREATE FUNCTION public.tenant_shipment_prefix_state(target uuid DEFAULT NULL)
RETURNS TABLE (prefix text, locked_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  tenant uuid;
BEGIN
  IF target IS NULL THEN
    tenant := nullif(current_setting('app.tenant_id', true), '')::uuid;
    IF actor IS NULL OR tenant IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.memberships m JOIN public.users u ON u.id = m.user_id JOIN public.tenants t ON t.id = m.tenant_id
      WHERE m.tenant_id = tenant AND m.user_id = actor AND m.status = 'ACTIVE' AND u.status = 'ACTIVE' AND t.status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'Shipment prefix state is not authorized.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF actor IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.platform_roles p JOIN public.users u ON u.id = p.user_id WHERE p.user_id = actor AND u.status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'Shipment prefix state is not authorized.' USING ERRCODE = '42501';
    END IF;
    tenant := target;
  END IF;
  RETURN QUERY
    SELECT coalesce(c.shipment_prefix, 'GC'), c.shipment_prefix_locked_at
    FROM (SELECT tenant AS id) requested
    LEFT JOIN public.tenant_shipment_counters c ON c.tenant_id = requested.id;
END;
$$;
--> statement-breakpoint
-- Only the prefix functions (their owner) may append prefix audit rows; the runtime role cannot forge them.
CREATE POLICY "audit_events_shipment_prefix_guard" ON public.audit_events
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    action NOT IN ('SHIPMENT_PREFIX_LOCKED', 'SHIPMENT_PREFIX_UNLOCKED')
    OR current_user = (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
      WHERE oid = 'public.set_tenant_shipment_prefix(text, uuid)'::regprocedure)
  );
--> statement-breakpoint
REVOKE ALL ON public.tenant_shipment_counters FROM PUBLIC, geraicuan_app;
REVOKE ALL ON FUNCTION public.allocate_shipment_reference() FROM PUBLIC, geraicuan_app;
REVOKE ALL ON FUNCTION public.protect_public_reference_identity() FROM PUBLIC, geraicuan_app;
REVOKE ALL ON FUNCTION public.set_tenant_shipment_prefix(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlock_tenant_shipment_prefix(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_shipment_prefix_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_tenant_shipment_prefix(text, uuid) TO geraicuan_app;
GRANT EXECUTE ON FUNCTION public.unlock_tenant_shipment_prefix(uuid, uuid) TO geraicuan_app;
GRANT EXECUTE ON FUNCTION public.tenant_shipment_prefix_state(uuid) TO geraicuan_app;
