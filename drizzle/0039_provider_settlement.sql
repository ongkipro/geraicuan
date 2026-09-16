CREATE TABLE "provider_order_status_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pull_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"cnote_no" text NOT NULL,
	"provider_status" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_order_status_observations_pull_shipment_key" UNIQUE("pull_id","shipment_id")
);
--> statement-breakpoint
CREATE TABLE "provider_settlement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pull_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"provider_invoice_id" text NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_status" text NOT NULL,
	"invoice_created_at" timestamp with time zone NOT NULL,
	"cnote_no" text NOT NULL,
	"amount_idr" bigint NOT NULL,
	"cod_amount_idr" bigint,
	"cod_fee_idr" numeric(16, 2),
	"shipping_amount_idr" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_settlement_items_observation_key" UNIQUE("tenant_id","provider_invoice_id","item_type","cnote_no","invoice_status","amount_idr"),
	CONSTRAINT "provider_settlement_items_type_valid" CHECK (item_type IN ('SETTLEMENT', 'CHARGE', 'REFUND')),
	CONSTRAINT "provider_settlement_items_amounts_valid" CHECK ((cod_amount_idr IS NULL OR cod_amount_idr >= 0) AND (cod_fee_idr IS NULL OR cod_fee_idr >= 0) AND (shipping_amount_idr IS NULL OR shipping_amount_idr >= 0))
);
--> statement-breakpoint
CREATE TABLE "provider_settlement_pulls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"credential_source" text NOT NULL,
	"provider_account_key" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"invoice_count" integer,
	"order_count" integer,
	"matched_item_count" integer NOT NULL,
	"matched_status_count" integer NOT NULL,
	"unmatched_awb_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_settlement_pulls_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "provider_settlement_pulls_credential_source_valid" CHECK (credential_source IN ('private', 'platform_default')),
	CONSTRAINT "provider_settlement_pulls_account_key_valid" CHECK (provider_account_key ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "provider_settlement_pulls_period_valid" CHECK (period_end > period_start),
	CONSTRAINT "provider_settlement_pulls_counts_valid" CHECK ((invoice_count IS NULL OR invoice_count >= 0) AND (order_count IS NULL OR order_count >= 0) AND matched_item_count >= 0 AND matched_status_count >= 0 AND (unmatched_awb_count IS NULL OR unmatched_awb_count >= 0)),
	CONSTRAINT "provider_settlement_pulls_shared_account_count_hidden" CHECK (credential_source = 'private' OR (invoice_count IS NULL AND order_count IS NULL AND unmatched_awb_count IS NULL))
);
--> statement-breakpoint
ALTER TABLE "shipment_rate_limits" DROP CONSTRAINT "shipment_rate_limits_operation_valid";--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD CONSTRAINT "provider_order_status_observations_pull_tenant_fkey" FOREIGN KEY ("pull_id","tenant_id") REFERENCES "public"."provider_settlement_pulls"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD CONSTRAINT "provider_order_status_observations_shipment_outlet_tenant_fkey" FOREIGN KEY ("shipment_id","outlet_id","tenant_id") REFERENCES "public"."shipments"("id","outlet_id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_settlement_items" ADD CONSTRAINT "provider_settlement_items_pull_tenant_fkey" FOREIGN KEY ("pull_id","tenant_id") REFERENCES "public"."provider_settlement_pulls"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_settlement_items" ADD CONSTRAINT "provider_settlement_items_shipment_outlet_tenant_fkey" FOREIGN KEY ("shipment_id","outlet_id","tenant_id") REFERENCES "public"."shipments"("id","outlet_id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_settlement_pulls" ADD CONSTRAINT "provider_settlement_pulls_outlet_tenant_fkey" FOREIGN KEY ("outlet_id","tenant_id") REFERENCES "public"."outlets"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_order_status_observations_tenant_shipment_idx" ON "provider_order_status_observations" USING btree ("tenant_id","shipment_id","observed_at");--> statement-breakpoint
CREATE INDEX "provider_settlement_items_tenant_shipment_idx" ON "provider_settlement_items" USING btree ("tenant_id","shipment_id");--> statement-breakpoint
CREATE INDEX "provider_settlement_pulls_tenant_outlet_created_idx" ON "provider_settlement_pulls" USING btree ("tenant_id","outlet_id","created_at");--> statement-breakpoint
ALTER TABLE "shipment_rate_limits" ADD CONSTRAINT "shipment_rate_limits_operation_valid" CHECK (operation IN ('estimate', 'location-search', 'order-submit', 'bulk-import', 'settlement-pull'));--> statement-breakpoint
-- T-146 isolation: append-only provider evidence, Tenant Admin only. RLS is defense in depth; the repository also checks the role.
REVOKE ALL ON provider_settlement_pulls FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT ON provider_settlement_pulls TO geraicuan_app;--> statement-breakpoint
ALTER TABLE provider_settlement_pulls ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE provider_settlement_pulls FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "provider_settlement_pulls_tenant_admin_select" ON provider_settlement_pulls
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_settlement_pulls.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "provider_settlement_pulls_tenant_admin_insert" ON provider_settlement_pulls
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = current_setting('app.user_id', true)
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_settlement_pulls.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
REVOKE ALL ON provider_settlement_items FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT ON provider_settlement_items TO geraicuan_app;--> statement-breakpoint
ALTER TABLE provider_settlement_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE provider_settlement_items FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "provider_settlement_items_tenant_admin_select" ON provider_settlement_items
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_settlement_items.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "provider_settlement_items_tenant_admin_insert" ON provider_settlement_items
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_settlement_items.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
REVOKE ALL ON provider_order_status_observations FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT ON provider_order_status_observations TO geraicuan_app;--> statement-breakpoint
ALTER TABLE provider_order_status_observations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE provider_order_status_observations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "provider_order_status_observations_tenant_admin_select" ON provider_order_status_observations
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_order_status_observations.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "provider_order_status_observations_tenant_admin_insert" ON provider_order_status_observations
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_order_status_observations.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
