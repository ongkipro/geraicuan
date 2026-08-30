CREATE TABLE "print_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"provider_order_snapshot_id" uuid NOT NULL,
	"sequence" integer,
	"outcome" text NOT NULL,
	"reason_code" text,
	"awb_snapshot" text,
	"actor_user_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"printed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_events_shipment_sequence_key" UNIQUE("shipment_id","sequence"),
	CONSTRAINT "print_events_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "print_events_outcome_valid" CHECK (outcome IN ('PRINTED', 'BLOCKED')),
	CONSTRAINT "print_events_printed_state_valid" CHECK ((
        outcome = 'PRINTED'
        AND sequence > 0
        AND char_length(btrim(awb_snapshot)) BETWEEN 1 AND 160
        AND reason_code IS NULL
      ) OR (
        outcome = 'BLOCKED'
        AND sequence IS NULL
        AND awb_snapshot IS NULL
        AND char_length(btrim(reason_code)) BETWEEN 1 AND 40
      ))
);
--> statement-breakpoint
ALTER TABLE "print_events" ADD CONSTRAINT "print_events_shipment_tenant_fkey" FOREIGN KEY ("shipment_id","tenant_id") REFERENCES "public"."shipments"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_events" ADD CONSTRAINT "print_events_snapshot_tenant_fkey" FOREIGN KEY ("provider_order_snapshot_id","tenant_id") REFERENCES "public"."provider_order_snapshots"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "print_events_tenant_shipment_idx" ON "print_events" USING btree ("tenant_id","shipment_id","sequence");--> statement-breakpoint
CREATE INDEX "print_events_tenant_printed_idx" ON "print_events" USING btree ("tenant_id","printed_at");
--> statement-breakpoint
REVOKE ALL ON print_events FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON print_events FROM geraicuan_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON print_events TO geraicuan_app;
--> statement-breakpoint
ALTER TABLE print_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE print_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "print_events_active_tenant" ON print_events
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = print_events.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = current_setting('app.user_id', true)
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
      JOIN shipments shipment
        ON shipment.id = pos.shipment_id
       AND shipment.tenant_id = pos.tenant_id
      WHERE pos.id = print_events.provider_order_snapshot_id
        AND pos.tenant_id = print_events.tenant_id
        AND pos.shipment_id = print_events.shipment_id
        AND (
          (
            print_events.outcome = 'PRINTED'
            AND pos.status = 'ISSUED'
            AND shipment.status = 'ISSUED'
            AND char_length(btrim(pos.cnote_no)) BETWEEN 1 AND 160
            AND btrim(pos.cnote_no) = btrim(print_events.awb_snapshot)
          )
          OR (
            print_events.outcome = 'BLOCKED'
            AND (
              (
                print_events.reason_code = 'AWAITING_UPSTREAM_PAYMENT'
                AND pos.status = 'AWAITING_UPSTREAM_PAYMENT'
                AND shipment.status = 'AWAITING_UPSTREAM_PAYMENT'
                AND pos.cnote_no IS NULL
              )
              OR (
                print_events.reason_code = 'NOT_ISSUED'
                AND NOT (
                  pos.status = 'ISSUED'
                  AND shipment.status = 'ISSUED'
                  AND char_length(btrim(pos.cnote_no)) BETWEEN 1 AND 160
                )
              )
            )
          )
        )
    )
  );