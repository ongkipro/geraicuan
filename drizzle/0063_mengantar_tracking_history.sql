-- T-238 (DATA-13, DATA-18, D-30): Mengantar tracking history, return resi, attention
-- signals and the signed webhook receiver's database entry point.
-- Additive for existing rows: every observation before 0063 is a pull (source DEFAULT
-- 'PULL', pull_id still set) and satisfies the new source CHECK; the transition CHECK is
-- re-created as a superset (SUPERSEDED added); new columns are NULL. No row is rewritten.
-- Owner addition: shipments.status gains CANCELLED (Mengantar reported the order cancelled);
-- the CHECK is re-created as a superset and validated, so every existing row still passes.
CREATE TABLE "provider_order_history_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_order_history_events_event_key" UNIQUE("tenant_id","shipment_id","occurred_at","description"),
	CONSTRAINT "provider_order_history_events_source_valid" CHECK (source IN ('HISTORY', 'LAST_HISTORY')),
	CONSTRAINT "provider_order_history_events_description_valid" CHECK (char_length(description) BETWEEN 1 AND 500 AND description !~ '[[:cntrl:]]')
);
--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" DROP CONSTRAINT "provider_order_status_observations_transition_valid";--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ALTER COLUMN "pull_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_order_snapshots" ADD COLUMN "return_cnote_no" text;--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD COLUMN "source" text DEFAULT 'PULL' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD COLUMN "provider_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD COLUMN "cnote_no_rts" text;--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD COLUMN "last_undelivered_code" text;--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD COLUMN "is_breach" boolean;--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD COLUMN "claim_status" text;--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD COLUMN "ticket_status" text;--> statement-breakpoint
ALTER TABLE "provider_order_history_events" ADD CONSTRAINT "provider_order_history_events_shipment_outlet_tenant_fkey" FOREIGN KEY ("shipment_id","outlet_id","tenant_id") REFERENCES "public"."shipments"("id","outlet_id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_order_status_observations_webhook_event_key" ON "provider_order_status_observations" USING btree ("tenant_id","shipment_id","provider_event_at","provider_status") WHERE source = 'WEBHOOK';--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD CONSTRAINT "provider_order_status_observations_source_valid" CHECK ((source = 'PULL' AND pull_id IS NOT NULL AND provider_event_at IS NULL)
        OR (source = 'WEBHOOK' AND pull_id IS NULL AND provider_event_at IS NOT NULL));--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD CONSTRAINT "provider_order_status_observations_transition_valid" CHECK ((transition_outcome IS NULL AND from_status IS NULL AND mapped_status IS NULL)
        OR (
          transition_outcome IN ('APPLIED', 'UNCHANGED', 'REFUSED', 'NO_LIFECYCLE_STATE', 'UNRECOGNISED', 'SUPERSEDED')
          AND from_status IS NOT NULL
          AND (mapped_status IS NULL) = (transition_outcome IN ('NO_LIFECYCLE_STATE', 'UNRECOGNISED'))
        ));
--> statement-breakpoint
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_status_valid";--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_status_valid" CHECK (status IN (
        'DRAFT',
        'ESTIMATED',
        'SUBMISSION_QUEUED',
        'SUBMISSION_UNKNOWN',
        'ISSUED',
        'AWAITING_UPSTREAM_PAYMENT',
        'FAILED',
        'RTS_QUEUED',
        'RTS_IN_TRANSIT',
        'RTS_RECEIVED',
        'IN_TRANSIT',
        'DELIVERED',
        'PROBLEM',
        'CANCELLED'
      ));
--> statement-breakpoint
-- provider_order_history_events: append-only, both tenant roles read, Tenant Admin writes
-- (only the status pull inserts). No UPDATE or DELETE grant.
REVOKE ALL ON provider_order_history_events FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT ON provider_order_history_events TO geraicuan_app;--> statement-breakpoint
ALTER TABLE provider_order_history_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE provider_order_history_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "provider_order_history_events_active_tenant_select" ON provider_order_history_events
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_order_history_events.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "provider_order_history_events_tenant_admin_insert" ON provider_order_history_events
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_order_history_events.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
-- The pull writes the return resi it saw; the runtime role gains this one column, the way
-- 0056 granted provider_batch_id. The existing active-member UPDATE policy applies.
GRANT UPDATE (return_cnote_no) ON provider_order_snapshots TO geraicuan_app;--> statement-breakpoint
-- The lifecycle decision of src/lib/provider-delivery-status.ts, for the webhook path that
-- decides inside the database. tests/mengantar-webhook.integration.test.ts compares it with
-- decideProviderDeliveryTransition for every (current, mapped) pair.
CREATE FUNCTION public.provider_delivery_outcome(current_status text, mapped_status text, recognised boolean)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN NOT recognised THEN 'UNRECOGNISED'
    WHEN mapped_status IS NULL THEN 'NO_LIFECYCLE_STATE'
    WHEN mapped_status = current_status THEN 'UNCHANGED'
    -- A return report behind where the return already stands says nothing new.
    WHEN array_position(ARRAY['RTS_QUEUED', 'RTS_IN_TRANSIT', 'RTS_RECEIVED'], mapped_status)
      <= array_position(ARRAY['RTS_QUEUED', 'RTS_IN_TRANSIT', 'RTS_RECEIVED'], current_status) THEN 'UNCHANGED'
    WHEN (current_status, mapped_status) IN (
      ('ISSUED', 'IN_TRANSIT'), ('ISSUED', 'PROBLEM'), ('ISSUED', 'DELIVERED'), ('ISSUED', 'RTS_QUEUED'), ('ISSUED', 'RTS_IN_TRANSIT'),
      ('ISSUED', 'CANCELLED'), ('IN_TRANSIT', 'CANCELLED'), ('PROBLEM', 'CANCELLED'),
      ('AWAITING_UPSTREAM_PAYMENT', 'IN_TRANSIT'), ('AWAITING_UPSTREAM_PAYMENT', 'PROBLEM'), ('AWAITING_UPSTREAM_PAYMENT', 'DELIVERED'),
      ('AWAITING_UPSTREAM_PAYMENT', 'RTS_QUEUED'), ('AWAITING_UPSTREAM_PAYMENT', 'RTS_IN_TRANSIT'),
      ('IN_TRANSIT', 'PROBLEM'), ('IN_TRANSIT', 'DELIVERED'), ('IN_TRANSIT', 'RTS_QUEUED'), ('IN_TRANSIT', 'RTS_IN_TRANSIT'),
      ('PROBLEM', 'DELIVERED'), ('PROBLEM', 'RTS_QUEUED'), ('PROBLEM', 'RTS_IN_TRANSIT'),
      ('RTS_QUEUED', 'RTS_IN_TRANSIT'), ('RTS_QUEUED', 'RTS_RECEIVED'),
      ('RTS_IN_TRANSIT', 'RTS_RECEIVED')
    ) THEN 'APPLIED'
    ELSE 'REFUSED'
  END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.provider_delivery_outcome(text, text, boolean) FROM PUBLIC;--> statement-breakpoint
-- D-30 webhook ingestion. The route verifies the HMAC signature and the timestamp before it
-- calls this; the function has no user principal, so it resolves the shipment itself: the AWB
-- on an order of the given Mengantar account (the platform account's key), in an ACTIVE
-- tenant, exactly one match. It then decides with provider_delivery_outcome, records one
-- WEBHOOK observation (a retried delivery is 'DUPLICATE'), and writes shipments.status only
-- on APPLIED. A delivery older than one already recorded is 'SUPERSEDED' instead of APPLIED or
-- REFUSED: Mengantar says deliveries can arrive out of order, so it is history, not a conflict.
-- Returns the outcome, 'NOT_FOUND' (no or several matches) or 'DUPLICATE'.
CREATE FUNCTION public.record_mengantar_webhook_event(
  p_account_key text,
  p_cnote_no text,
  p_provider_status text,
  p_mapped_status text,
  p_recognised boolean,
  p_event_at timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  target_tenant uuid;
  target_shipment uuid;
  target_outlet uuid;
  match_count integer;
  current_status text;
  outcome text;
  recorded uuid;
BEGIN
  IF p_account_key IS NULL OR p_account_key !~ '^[0-9a-f]{64}$'
    OR p_cnote_no IS NULL OR p_cnote_no !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'
    OR p_provider_status IS NULL OR p_provider_status !~ '^[A-Za-z][A-Za-z0-9 /_()-]{0,59}$'
    OR p_recognised IS NULL OR p_event_at IS NULL
    OR (p_mapped_status IS NOT NULL AND (NOT p_recognised OR p_mapped_status NOT IN (
      'IN_TRANSIT', 'PROBLEM', 'DELIVERED', 'RTS_QUEUED', 'RTS_IN_TRANSIT', 'RTS_RECEIVED', 'CANCELLED')))
  THEN
    RAISE EXCEPTION 'Mengantar webhook event is invalid.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), min(s.tenant_id::text)::uuid, min(s.id::text)::uuid, min(s.outlet_id::text)::uuid
    INTO match_count, target_tenant, target_shipment, target_outlet
  FROM public.provider_order_snapshots o
  JOIN public.provider_batches b ON b.id = o.batch_id AND b.tenant_id = o.tenant_id
  JOIN public.shipments s ON s.id = o.shipment_id AND s.tenant_id = o.tenant_id
  JOIN public.tenants t ON t.id = s.tenant_id
  WHERE b.provider_account_key = p_account_key AND o.cnote_no = p_cnote_no AND t.status = 'ACTIVE';
  IF match_count <> 1 THEN
    RETURN 'NOT_FOUND';
  END IF;

  -- Scopes the owner policies below to this one tenant for the rest of the call.
  PERFORM set_config('app.tenant_id', target_tenant::text, true);
  SELECT s.status INTO current_status FROM public.shipments s
  WHERE s.id = target_shipment AND s.tenant_id = target_tenant FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.provider_order_status_observations obs
    WHERE obs.tenant_id = target_tenant AND obs.shipment_id = target_shipment AND obs.source = 'WEBHOOK'
      AND obs.provider_event_at = p_event_at AND obs.provider_status = p_provider_status
  ) THEN
    RETURN 'DUPLICATE';
  END IF;

  outcome := public.provider_delivery_outcome(current_status, p_mapped_status, p_recognised);
  IF outcome IN ('APPLIED', 'REFUSED') AND EXISTS (
    SELECT 1 FROM public.provider_order_status_observations obs
    WHERE obs.tenant_id = target_tenant AND obs.shipment_id = target_shipment AND obs.source = 'WEBHOOK'
      AND obs.provider_event_at > p_event_at
  ) THEN
    outcome := 'SUPERSEDED';
  END IF;

  INSERT INTO public.provider_order_status_observations (
    tenant_id, pull_id, shipment_id, outlet_id, cnote_no, provider_status, source, provider_event_at,
    from_status, mapped_status, transition_outcome
  ) VALUES (
    target_tenant, NULL, target_shipment, target_outlet, p_cnote_no, p_provider_status, 'WEBHOOK', p_event_at,
    current_status, p_mapped_status, outcome
  )
  ON CONFLICT (tenant_id, shipment_id, provider_event_at, provider_status) WHERE source = 'WEBHOOK' DO NOTHING
  RETURNING id INTO recorded;
  IF recorded IS NULL THEN
    RETURN 'DUPLICATE';
  END IF;

  IF outcome = 'APPLIED' THEN
    UPDATE public.shipments SET status = p_mapped_status, updated_at = now()
    WHERE id = target_shipment AND tenant_id = target_tenant;
  END IF;
  RETURN outcome;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_mengantar_webhook_event(text, text, text, text, boolean, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_mengantar_webhook_event(text, text, text, text, boolean, timestamptz) TO geraicuan_app;--> statement-breakpoint
-- Owner policies: needed when the function owner is neither superuser nor BYPASSRLS (FORCE
-- RLS). Reads resolve one AWB across tenants; every write is limited to the tenant the
-- function set in app.tenant_id, and observation inserts to WEBHOOK rows.
CREATE POLICY provider_order_snapshots_webhook_ingest_read ON provider_order_snapshots
  AS PERMISSIVE FOR SELECT TO public
  USING (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.record_mengantar_webhook_event(text,text,text,text,boolean,timestamptz)'::regprocedure::oid));--> statement-breakpoint
CREATE POLICY provider_batches_webhook_ingest_read ON provider_batches
  AS PERMISSIVE FOR SELECT TO public
  USING (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.record_mengantar_webhook_event(text,text,text,text,boolean,timestamptz)'::regprocedure::oid));--> statement-breakpoint
CREATE POLICY tenants_webhook_ingest_read ON tenants
  AS PERMISSIVE FOR SELECT TO public
  USING (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.record_mengantar_webhook_event(text,text,text,text,boolean,timestamptz)'::regprocedure::oid));--> statement-breakpoint
CREATE POLICY shipments_webhook_ingest_read ON shipments
  AS PERMISSIVE FOR SELECT TO public
  USING (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.record_mengantar_webhook_event(text,text,text,text,boolean,timestamptz)'::regprocedure::oid));--> statement-breakpoint
CREATE POLICY shipments_webhook_ingest_update ON shipments
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.record_mengantar_webhook_event(text,text,text,text,boolean,timestamptz)'::regprocedure::oid)
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.record_mengantar_webhook_event(text,text,text,text,boolean,timestamptz)'::regprocedure::oid)
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );--> statement-breakpoint
CREATE POLICY provider_order_status_observations_webhook_ingest_read ON provider_order_status_observations
  AS PERMISSIVE FOR SELECT TO public
  USING (
    CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.record_mengantar_webhook_event(text,text,text,text,boolean,timestamptz)'::regprocedure::oid)
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );--> statement-breakpoint
CREATE POLICY provider_order_status_observations_webhook_ingest_insert ON provider_order_status_observations
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.record_mengantar_webhook_event(text,text,text,text,boolean,timestamptz)'::regprocedure::oid)
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND source = 'WEBHOOK'
  );
--> statement-breakpoint
-- T-238 (owner): a label print attempt on a shipment Mengantar cancelled is recorded as
-- BLOCKED 'CANCELLED'. The 0017 policy admits only NOT_ISSUED / AWAITING_UPSTREAM_PAYMENT
-- blocks; this permissive INSERT policy adds exactly the cancelled block, same actor rules.
CREATE POLICY "print_events_cancelled_block_insert" ON print_events
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = current_setting('app.user_id', true)
    AND outcome = 'BLOCKED'
    AND reason_code = 'CANCELLED'
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = print_events.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND memberships.role = print_events.actor_role
        AND users.status = 'ACTIVE'
    )
    AND EXISTS (
      SELECT 1
      FROM provider_order_snapshots pos
      JOIN shipments shipment ON shipment.id = pos.shipment_id AND shipment.tenant_id = pos.tenant_id
      WHERE pos.id = print_events.provider_order_snapshot_id
        AND pos.tenant_id = print_events.tenant_id
        AND pos.shipment_id = print_events.shipment_id
        AND shipment.status = 'CANCELLED'
    )
  );
