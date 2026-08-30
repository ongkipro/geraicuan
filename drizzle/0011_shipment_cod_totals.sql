CREATE TABLE "shipment_cod_totals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"estimate_service_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"goods_value_idr" integer NOT NULL,
	"shipping_amount_idr" integer NOT NULL,
	"service_fee_idr" integer NOT NULL,
	"vat_amount_idr" integer NOT NULL,
	"provider_cod_amount_idr" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_cod_totals_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "shipment_cod_totals_shipment_tenant_key" UNIQUE("shipment_id","tenant_id"),
	CONSTRAINT "shipment_cod_totals_currency_idr" CHECK (currency = 'IDR'),
	CONSTRAINT "shipment_cod_totals_goods_value_idr_positive" CHECK (goods_value_idr > 0),
	CONSTRAINT "shipment_cod_totals_shipping_amount_idr_nonnegative" CHECK (shipping_amount_idr >= 0),
	CONSTRAINT "shipment_cod_totals_service_fee_idr_nonnegative" CHECK (service_fee_idr >= 0),
	CONSTRAINT "shipment_cod_totals_vat_amount_idr_nonnegative" CHECK (vat_amount_idr >= 0),
	CONSTRAINT "shipment_cod_totals_provider_cod_amount_idr_positive" CHECK (provider_cod_amount_idr > 0),
	CONSTRAINT "shipment_cod_totals_service_fee_exact" CHECK (service_fee_idr::bigint =
        (((goods_value_idr::bigint + shipping_amount_idr::bigint) * 3 + 50) / 100)),
	CONSTRAINT "shipment_cod_totals_vat_exact" CHECK (vat_amount_idr::bigint = ((service_fee_idr::bigint * 11 + 50) / 100)),
	CONSTRAINT "shipment_cod_totals_provider_cod_amount_exact" CHECK (provider_cod_amount_idr::bigint =
        goods_value_idr::bigint
        + shipping_amount_idr::bigint
        + service_fee_idr::bigint
        + vat_amount_idr::bigint)
);
--> statement-breakpoint
ALTER TABLE "shipment_estimate_snapshots" ADD CONSTRAINT "shipment_estimate_snapshots_id_shipment_tenant_key" UNIQUE("id","shipment_id","tenant_id");--> statement-breakpoint
ALTER TABLE "shipment_estimate_services" ADD CONSTRAINT "shipment_estimate_services_id_snapshot_tenant_key" UNIQUE("id","snapshot_id","tenant_id");--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_shipment_tenant_fkey" FOREIGN KEY ("shipment_id","tenant_id") REFERENCES "public"."shipments"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_snapshot_shipment_tenant_fkey" FOREIGN KEY ("snapshot_id","shipment_id","tenant_id") REFERENCES "public"."shipment_estimate_snapshots"("id","shipment_id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_service_snapshot_tenant_fkey" FOREIGN KEY ("estimate_service_id","snapshot_id","tenant_id") REFERENCES "public"."shipment_estimate_services"("id","snapshot_id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_cod_totals_tenant_snapshot_idx" ON "shipment_cod_totals" USING btree ("tenant_id","snapshot_id");--> statement-breakpoint
REVOKE ALL ON shipment_cod_totals FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON shipment_cod_totals FROM geraicuan_app;--> statement-breakpoint
GRANT SELECT, INSERT ON shipment_cod_totals TO geraicuan_app;--> statement-breakpoint
ALTER TABLE shipment_cod_totals ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shipment_cod_totals FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "shipment_cod_totals_active_tenant_select" ON shipment_cod_totals
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
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
  );--> statement-breakpoint
CREATE POLICY "shipment_cod_totals_active_tenant_insert" ON shipment_cod_totals
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM shipments
      JOIN shipment_drafts
        ON shipment_drafts.shipment_id = shipments.id
        AND shipment_drafts.tenant_id = shipments.tenant_id
      JOIN outlets
        ON outlets.id = shipments.outlet_id
        AND outlets.tenant_id = shipments.tenant_id
      JOIN shipment_estimate_snapshots
        ON shipment_estimate_snapshots.id = shipment_cod_totals.snapshot_id
        AND shipment_estimate_snapshots.shipment_id = shipments.id
        AND shipment_estimate_snapshots.tenant_id = shipments.tenant_id
        AND shipment_estimate_snapshots.outlet_id = shipments.outlet_id
      JOIN shipment_estimate_services
        ON shipment_estimate_services.id = shipment_cod_totals.estimate_service_id
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