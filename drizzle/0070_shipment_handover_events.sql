-- T-267 (DATA-24, D-36): "Tandai sudah diserahkan". Additive only: one new append-only
-- tenant table, two new audit actions and one new audit target type (every existing row still
-- passes both CHECKs), one partial unique index on audit_events, and policies. No existing row
-- is read, changed or deleted; no existing grant or policy is altered.
--
-- shipment_handover_events: the current handover state of a shipment is its event with the
-- highest sequence. The INSERT policy is the database's own copy of the application's rules:
--   * the tenant is the context tenant, the actor is the context user with that role, active,
--     in an ACTIVE gerai (as print_events, 0017);
--   * the shipment is still ISSUED (Mengantar has not reported the pickup scan, the order is
--     not cancelled); a HANDED_OVER additionally needs the ISSUED order with its cnote_no and
--     at least one PRINTED print event.
-- A BEFORE INSERT trigger (every role) keeps the per-shipment order: sequence = 1 + the highest,
-- kinds alternate (HANDED_OVER only when not handed over, UNDONE only when handed over); with the
-- UNIQUE (shipment_id, sequence) a concurrent duplicate fails instead of landing twice.
-- The runtime role gets SELECT and INSERT only: no UPDATE, no DELETE (append-only).
CREATE TABLE "shipment_handover_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"method" text,
	"note" text,
	"actor_user_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_handover_events_shipment_sequence_key" UNIQUE("shipment_id","sequence"),
	CONSTRAINT "shipment_handover_events_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "shipment_handover_events_sequence_positive" CHECK (sequence > 0),
	CONSTRAINT "shipment_handover_events_kind_valid" CHECK (kind IN ('HANDED_OVER', 'UNDONE')),
	CONSTRAINT "shipment_handover_events_actor_role_valid" CHECK (actor_role IN ('TENANT_ADMIN', 'OPERATOR')),
	CONSTRAINT "shipment_handover_events_shape_valid" CHECK ((
        kind = 'HANDED_OVER'
        AND method IN ('PICKUP', 'DROP_OFF')
        AND (note IS NULL OR (char_length(note) BETWEEN 1 AND 160 AND note = btrim(note)))
      ) OR (
        kind = 'UNDONE' AND method IS NULL AND note IS NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_target_type_valid";--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_valid";--> statement-breakpoint
ALTER TABLE "shipment_handover_events" ADD CONSTRAINT "shipment_handover_events_shipment_tenant_fkey" FOREIGN KEY ("shipment_id","tenant_id") REFERENCES "public"."shipments"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_handover_events_tenant_shipment_idx" ON "shipment_handover_events" USING btree ("tenant_id","shipment_id","sequence");--> statement-breakpoint
CREATE INDEX "shipment_handover_events_tenant_created_idx" ON "shipment_handover_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_shipment_handover_event_key" ON "audit_events" USING btree (("metadata" ->> 'eventId')) WHERE "audit_events"."action" IN ('SHIPMENT_HANDOVER_RECORDED', 'SHIPMENT_HANDOVER_UNDONE');--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_type_valid" CHECK (target_type IN ('TENANT', 'PLATFORM', 'MEMBERSHIP', 'OUTLET', 'SHIPMENT'));--> statement-breakpoint
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
        'SHIPMENT_HANDOVER_UNDONE'
      ));--> statement-breakpoint
REVOKE ALL ON shipment_handover_events FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON shipment_handover_events FROM geraicuan_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON shipment_handover_events TO geraicuan_app;
--> statement-breakpoint
ALTER TABLE shipment_handover_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE shipment_handover_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "shipment_handover_events_active_tenant_read" ON shipment_handover_events
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_handover_events.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY "shipment_handover_events_active_tenant_insert" ON shipment_handover_events
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = current_setting('app.user_id', true)
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_handover_events.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND memberships.role = shipment_handover_events.actor_role
        AND users.status = 'ACTIVE'
    )
    AND EXISTS (
      SELECT 1 FROM shipments shipment
      WHERE shipment.id = shipment_handover_events.shipment_id
        AND shipment.tenant_id = shipment_handover_events.tenant_id
        AND shipment.status = 'ISSUED'
    )
    AND (
      kind = 'UNDONE'
      OR EXISTS (
        SELECT 1 FROM provider_order_snapshots pos
        WHERE pos.shipment_id = shipment_handover_events.shipment_id
          AND pos.tenant_id = shipment_handover_events.tenant_id
          AND pos.status = 'ISSUED'
          AND char_length(btrim(pos.cnote_no)) BETWEEN 1 AND 160
          AND EXISTS (
            SELECT 1 FROM print_events printed
            WHERE printed.tenant_id = pos.tenant_id
              AND printed.shipment_id = pos.shipment_id
              AND printed.outcome = 'PRINTED'
          )
      )
    )
  );
--> statement-breakpoint
-- The per-shipment order, for every role (a policy cannot read its own table: 42P17). A BEFORE
-- INSERT trigger, invoker's rights, so the runtime role reads only its own tenant's events:
-- sequence = 1 + the shipment's highest, kinds alternate. UNIQUE (shipment_id, sequence) turns a
-- concurrent duplicate into a 23505 instead of a second row.
CREATE FUNCTION public.shipment_handover_events_enforce_order() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  latest_sequence integer;
  latest_kind text;
BEGIN
  SELECT e.sequence, e.kind INTO latest_sequence, latest_kind
  FROM public.shipment_handover_events e
  WHERE e.tenant_id = NEW.tenant_id AND e.shipment_id = NEW.shipment_id
  ORDER BY e.sequence DESC
  LIMIT 1;
  IF NEW.sequence IS DISTINCT FROM coalesce(latest_sequence, 0) + 1 THEN
    RAISE EXCEPTION 'Handover event sequence is out of order.' USING ERRCODE = '23514';
  END IF;
  IF (NEW.kind = 'HANDED_OVER') IS DISTINCT FROM (coalesce(latest_kind, 'UNDONE') = 'UNDONE') THEN
    RAISE EXCEPTION 'Handover event kind does not follow the current state.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shipment_handover_events_enforce_order() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER shipment_handover_events_enforce_order
  BEFORE INSERT ON shipment_handover_events
  FOR EACH ROW EXECUTE FUNCTION public.shipment_handover_events_enforce_order();
--> statement-breakpoint
-- The handover audit rows: only a gerai member of the context tenant, naming the shipment, and
-- only for a handover event that exists with the same tenant, shipment, actor and kind. The
-- runtime role cannot write one for an event it did not record, and the partial unique index
-- above allows one row per event.
CREATE POLICY audit_events_shipment_handover_guard ON audit_events
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    action NOT IN ('SHIPMENT_HANDOVER_RECORDED', 'SHIPMENT_HANDOVER_UNDONE')
    OR (
      outcome = 'SUCCESS'
      AND actor_role = 'TENANT_MEMBER'
      AND target_type = 'SHIPMENT'
      AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM shipment_handover_events event
        WHERE event.id::text = audit_events.metadata ->> 'eventId'
          AND event.tenant_id = audit_events.tenant_id
          AND event.shipment_id::text = audit_events.target_id
          AND event.actor_user_id = audit_events.actor_id
          AND event.kind = CASE audit_events.action WHEN 'SHIPMENT_HANDOVER_RECORDED' THEN 'HANDED_OVER' ELSE 'UNDONE' END
      )
    )
  );
