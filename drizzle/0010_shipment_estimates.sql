CREATE TABLE "shipment_estimate_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"provider_service" text NOT NULL,
	"currency" text NOT NULL,
	"shipping_amount_idr" integer NOT NULL,
	"shipping_source_field" text NOT NULL,
	"insurance_amount_idr" integer,
	"insurance_source_field" text,
	"delivery_estimate" text NOT NULL,
	"cod_eligible" boolean NOT NULL,
	CONSTRAINT "shipment_estimate_services_snapshot_provider_key" UNIQUE("snapshot_id","provider_service"),
	CONSTRAINT "shipment_estimate_services_provider_service_valid" CHECK (char_length(btrim(provider_service)) BETWEEN 1 AND 80),
	CONSTRAINT "shipment_estimate_services_currency_idr" CHECK (currency = 'IDR'),
	CONSTRAINT "shipment_estimate_services_shipping_amount_idr_nonnegative" CHECK (shipping_amount_idr >= 0),
	CONSTRAINT "shipment_estimate_services_shipping_source_price" CHECK (shipping_source_field = 'price'),
	CONSTRAINT "shipment_estimate_services_insurance_pair" CHECK ((insurance_amount_idr IS NULL AND insurance_source_field IS NULL)
        OR (
          insurance_amount_idr >= 0
          AND char_length(btrim(insurance_source_field)) BETWEEN 1 AND 80
        )),
	CONSTRAINT "shipment_estimate_services_delivery_estimate_valid" CHECK (char_length(btrim(delivery_estimate)) BETWEEN 1 AND 160)
);
--> statement-breakpoint
CREATE TABLE "shipment_estimate_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"origin_area_id" text NOT NULL,
	"destination_area_id" text NOT NULL,
	"weight_grams" integer NOT NULL,
	"is_cod_requested" boolean NOT NULL,
	"credential_source" text NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_estimate_snapshots_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "shipment_estimate_snapshots_origin_area_id_valid" CHECK (char_length(btrim(origin_area_id)) BETWEEN 1 AND 160),
	CONSTRAINT "shipment_estimate_snapshots_destination_area_id_valid" CHECK (char_length(btrim(destination_area_id)) BETWEEN 1 AND 160),
	CONSTRAINT "shipment_estimate_snapshots_weight_grams_positive" CHECK (weight_grams > 0),
	CONSTRAINT "shipment_estimate_snapshots_credential_source_valid" CHECK (credential_source IN ('private', 'platform_default'))
);
--> statement-breakpoint
ALTER TABLE "shipment_estimate_services" ADD CONSTRAINT "shipment_estimate_services_snapshot_tenant_fkey" FOREIGN KEY ("snapshot_id","tenant_id") REFERENCES "public"."shipment_estimate_snapshots"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_estimate_snapshots" ADD CONSTRAINT "shipment_estimate_snapshots_shipment_tenant_fkey" FOREIGN KEY ("shipment_id","tenant_id") REFERENCES "public"."shipments"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_estimate_snapshots" ADD CONSTRAINT "shipment_estimate_snapshots_outlet_tenant_fkey" FOREIGN KEY ("outlet_id","tenant_id") REFERENCES "public"."outlets"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_estimate_services_tenant_snapshot_idx" ON "shipment_estimate_services" USING btree ("tenant_id","snapshot_id");--> statement-breakpoint
CREATE INDEX "shipment_estimate_snapshots_tenant_shipment_retrieved_idx" ON "shipment_estimate_snapshots" USING btree ("tenant_id","shipment_id","retrieved_at");
--> statement-breakpoint
REVOKE ALL ON shipment_estimate_snapshots, shipment_estimate_services FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT ON shipment_estimate_snapshots, shipment_estimate_services TO geraicuan_app;--> statement-breakpoint
ALTER TABLE shipment_estimate_snapshots ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shipment_estimate_snapshots FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shipment_estimate_services ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shipment_estimate_services FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "shipment_estimate_snapshots_active_tenant_select" ON shipment_estimate_snapshots
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_estimate_snapshots.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "shipment_estimate_snapshots_active_tenant_insert" ON shipment_estimate_snapshots
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM shipments
      WHERE shipments.id = shipment_estimate_snapshots.shipment_id
        AND shipments.tenant_id = shipment_estimate_snapshots.tenant_id
    )
    AND EXISTS (
      SELECT 1 FROM outlets
      WHERE outlets.id = shipment_estimate_snapshots.outlet_id
        AND outlets.tenant_id = shipment_estimate_snapshots.tenant_id
    )
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_estimate_snapshots.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "shipment_estimate_services_active_tenant_select" ON shipment_estimate_services
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_estimate_services.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "shipment_estimate_services_active_tenant_insert" ON shipment_estimate_services
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM shipment_estimate_snapshots
      WHERE shipment_estimate_snapshots.id = shipment_estimate_services.snapshot_id
        AND shipment_estimate_snapshots.tenant_id = shipment_estimate_services.tenant_id
    )
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_estimate_services.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );