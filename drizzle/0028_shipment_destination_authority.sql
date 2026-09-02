ALTER TABLE "provider_order_snapshots" ADD COLUMN "destination_area_id" text;--> statement-breakpoint
ALTER TABLE "provider_order_snapshots" ADD COLUMN "destination_area_label" text;--> statement-breakpoint
ALTER TABLE "shipment_estimate_snapshots" ADD COLUMN "destination_area_label" text;--> statement-breakpoint
ALTER TABLE "shipment_parties" ADD COLUMN "destination_area_id" text;--> statement-breakpoint
ALTER TABLE "shipment_parties" ADD COLUMN "destination_area_label" text;--> statement-breakpoint
UPDATE "shipment_estimate_snapshots" AS estimate
SET "destination_area_label" = draft."destination_area_label"
FROM "shipment_drafts" AS draft
WHERE estimate."shipment_id" = draft."shipment_id"
  AND estimate."tenant_id" = draft."tenant_id";--> statement-breakpoint
UPDATE "provider_order_snapshots" AS provider_order
SET
  "destination_area_id" = draft."destination_area_id",
  "destination_area_label" = draft."destination_area_label"
FROM "shipment_drafts" AS draft
WHERE provider_order."shipment_id" = draft."shipment_id"
  AND provider_order."tenant_id" = draft."tenant_id";--> statement-breakpoint
UPDATE "shipment_parties" AS party
SET
  "destination_area_id" = draft."destination_area_id",
  "destination_area_label" = draft."destination_area_label"
FROM "shipment_drafts" AS draft
WHERE party."shipment_id" = draft."shipment_id"
  AND party."tenant_id" = draft."tenant_id"
  AND party."role" = 'RECIPIENT';--> statement-breakpoint
ALTER TABLE "shipment_estimate_snapshots" ALTER COLUMN "destination_area_label" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_order_snapshots" ALTER COLUMN "destination_area_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_order_snapshots" ALTER COLUMN "destination_area_label" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_order_snapshots" ADD CONSTRAINT "provider_order_snapshots_destination_area_id_valid" CHECK (char_length(btrim(destination_area_id)) BETWEEN 1 AND 160);--> statement-breakpoint
ALTER TABLE "provider_order_snapshots" ADD CONSTRAINT "provider_order_snapshots_destination_area_label_valid" CHECK (char_length(btrim(destination_area_label)) BETWEEN 1 AND 160);--> statement-breakpoint
ALTER TABLE "shipment_estimate_snapshots" ADD CONSTRAINT "shipment_estimate_snapshots_destination_area_label_valid" CHECK (char_length(btrim(destination_area_label)) BETWEEN 1 AND 160);--> statement-breakpoint
ALTER TABLE "shipment_parties" ADD CONSTRAINT "shipment_parties_destination_area_valid" CHECK ((
          role = 'SENDER'
          AND destination_area_id IS NULL
          AND destination_area_label IS NULL
        ) OR (
          role = 'RECIPIENT'
          AND char_length(btrim(destination_area_id)) BETWEEN 1 AND 160
          AND char_length(btrim(destination_area_label)) BETWEEN 1 AND 160
        ));
--> statement-breakpoint
DROP POLICY "shipment_cod_totals_active_tenant_insert" ON shipment_cod_totals;
--> statement-breakpoint
CREATE POLICY "shipment_cod_totals_active_tenant_insert" ON shipment_cod_totals
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND NOT EXISTS (
      SELECT 1
      FROM shipment_estimate_snapshots AS newer_snapshot
      WHERE newer_snapshot.shipment_id = shipment_cod_totals.shipment_id
        AND newer_snapshot.tenant_id = shipment_cod_totals.tenant_id
        AND newer_snapshot.retrieved_at > (
          SELECT snapshot.retrieved_at
          FROM shipment_estimate_snapshots AS snapshot
          WHERE snapshot.id = shipment_cod_totals.snapshot_id
            AND snapshot.tenant_id = shipment_cod_totals.tenant_id
        )
    )
    AND EXISTS (
      SELECT 1
      FROM shipments
      JOIN shipment_drafts ON shipment_drafts.shipment_id = shipments.id
        AND shipment_drafts.tenant_id = shipments.tenant_id
      JOIN outlets ON outlets.id = shipments.outlet_id
        AND outlets.tenant_id = shipments.tenant_id
      JOIN shipment_estimate_snapshots ON shipment_estimate_snapshots.id = shipment_cod_totals.snapshot_id
        AND shipment_estimate_snapshots.shipment_id = shipments.id
        AND shipment_estimate_snapshots.tenant_id = shipments.tenant_id
        AND shipment_estimate_snapshots.outlet_id = shipments.outlet_id
      JOIN shipment_estimate_services ON shipment_estimate_services.id = shipment_cod_totals.estimate_service_id
        AND shipment_estimate_services.snapshot_id = shipment_estimate_snapshots.id
        AND shipment_estimate_services.tenant_id = shipment_estimate_snapshots.tenant_id
      WHERE shipments.id = shipment_cod_totals.shipment_id
        AND shipments.tenant_id = shipment_cod_totals.tenant_id
        AND shipments.status IN ('DRAFT', 'ESTIMATED')
        AND shipment_drafts.is_cod = true
        AND shipment_drafts.declared_value_idr = shipment_cod_totals.goods_value_idr
        AND shipment_estimate_snapshots.is_cod_requested = true
        AND shipment_estimate_snapshots.origin_area_id = outlets.default_origin_area_id
        AND shipment_estimate_snapshots.destination_area_id = shipment_drafts.destination_area_id
        AND shipment_estimate_snapshots.destination_area_label = shipment_drafts.destination_area_label
        AND shipment_estimate_snapshots.weight_grams = shipment_drafts.package_weight_grams
        AND shipment_estimate_services.cod_eligible = true
        AND shipment_estimate_services.currency = 'IDR'
        AND shipment_estimate_services.currency = shipment_cod_totals.currency
        AND shipment_estimate_services.shipping_amount_idr = shipment_cod_totals.shipping_amount_idr
    )
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_cod_totals.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
