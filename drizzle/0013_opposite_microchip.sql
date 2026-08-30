CREATE TABLE "provider_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"pickup_address_id" text NOT NULL,
	"courier" text NOT NULL,
	"credential_source" text NOT NULL,
	"provider_account_key" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'SUBMISSION_QUEUED' NOT NULL,
	"safe_error_code" text,
	"submission_attempted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_batches_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "provider_batches_tenant_idempotency_key" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "provider_batches_pickup_address_id_valid" CHECK (char_length(btrim(pickup_address_id)) BETWEEN 1 AND 160),
	CONSTRAINT "provider_batches_courier_valid" CHECK (char_length(btrim(courier)) BETWEEN 1 AND 80),
	CONSTRAINT "provider_batches_credential_source_valid" CHECK (credential_source IN ('private', 'platform_default')),
	CONSTRAINT "provider_batches_account_key_sha256" CHECK (provider_account_key ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "provider_batches_idempotency_key_sha256" CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "provider_batches_status_valid" CHECK (status IN (
        'SUBMISSION_QUEUED',
        'SUBMITTING',
        'SUBMISSION_UNKNOWN',
        'COMPLETED',
        'FAILED'
      )),
	CONSTRAINT "provider_batches_attempt_state_valid" CHECK ((status = 'SUBMISSION_QUEUED' AND submission_attempted_at IS NULL)
        OR (status <> 'SUBMISSION_QUEUED' AND submission_attempted_at IS NOT NULL)),
	CONSTRAINT "provider_batches_completion_state_valid" CHECK ((status IN ('COMPLETED', 'FAILED') AND completed_at IS NOT NULL)
        OR (status NOT IN ('COMPLETED', 'FAILED') AND completed_at IS NULL)),
	CONSTRAINT "provider_batches_safe_error_code_valid" CHECK (safe_error_code IS NULL
        OR char_length(btrim(safe_error_code)) BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "provider_order_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"estimate_snapshot_id" uuid NOT NULL,
	"estimate_service_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"provider_service" text NOT NULL,
	"currency" text NOT NULL,
	"shipping_amount_idr" integer NOT NULL,
	"insurance_amount_idr" integer,
	"is_cod" boolean NOT NULL,
	"provider_cod_amount_idr" integer,
	"status" text DEFAULT 'SUBMISSION_QUEUED' NOT NULL,
	"provider_order_id" text,
	"is_paid" boolean,
	"cnote_no" text,
	"safe_response_code" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_order_snapshots_batch_position_key" UNIQUE("batch_id","position"),
	CONSTRAINT "provider_order_snapshots_shipment_key" UNIQUE("shipment_id"),
	CONSTRAINT "provider_order_snapshots_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "provider_order_snapshots_position_nonnegative" CHECK (position >= 0),
	CONSTRAINT "provider_order_snapshots_provider_service_valid" CHECK (char_length(btrim(provider_service)) BETWEEN 1 AND 80),
	CONSTRAINT "provider_order_snapshots_currency_idr" CHECK (currency = 'IDR'),
	CONSTRAINT "provider_order_snapshots_shipping_amount_nonnegative" CHECK (shipping_amount_idr >= 0),
	CONSTRAINT "provider_order_snapshots_insurance_amount_nonnegative" CHECK (insurance_amount_idr IS NULL OR insurance_amount_idr >= 0),
	CONSTRAINT "provider_order_snapshots_cod_amount_valid" CHECK ((is_cod AND provider_cod_amount_idr > 0)
        OR (NOT is_cod AND provider_cod_amount_idr IS NULL)),
	CONSTRAINT "provider_order_snapshots_status_valid" CHECK (status IN (
        'SUBMISSION_QUEUED',
        'SUBMISSION_UNKNOWN',
        'ISSUED',
        'AWAITING_UPSTREAM_PAYMENT',
        'FAILED'
      )),
	CONSTRAINT "provider_order_snapshots_cnote_authority" CHECK ((status = 'ISSUED' AND char_length(btrim(cnote_no)) > 0)
        OR (status <> 'ISSUED' AND cnote_no IS NULL)),
	CONSTRAINT "provider_order_snapshots_unpaid_state_valid" CHECK (status <> 'AWAITING_UPSTREAM_PAYMENT'
        OR (NOT is_cod AND is_paid = false AND cnote_no IS NULL)),
	CONSTRAINT "provider_order_snapshots_resolved_state_valid" CHECK ((status = 'SUBMISSION_QUEUED' AND resolved_at IS NULL)
        OR (status <> 'SUBMISSION_QUEUED' AND resolved_at IS NOT NULL)),
	CONSTRAINT "provider_order_snapshots_provider_order_id_valid" CHECK (provider_order_id IS NULL
        OR char_length(btrim(provider_order_id)) BETWEEN 1 AND 160),
	CONSTRAINT "provider_order_snapshots_safe_response_code_valid" CHECK (safe_response_code IS NULL
        OR char_length(btrim(safe_response_code)) BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "provider_batches" ADD CONSTRAINT "provider_batches_outlet_tenant_fkey" FOREIGN KEY ("outlet_id","tenant_id") REFERENCES "public"."outlets"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_order_snapshots" ADD CONSTRAINT "provider_order_snapshots_batch_tenant_fkey" FOREIGN KEY ("batch_id","tenant_id") REFERENCES "public"."provider_batches"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_order_snapshots" ADD CONSTRAINT "provider_order_snapshots_shipment_tenant_fkey" FOREIGN KEY ("shipment_id","tenant_id") REFERENCES "public"."shipments"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_order_snapshots" ADD CONSTRAINT "provider_order_snapshots_estimate_shipment_tenant_fkey" FOREIGN KEY ("estimate_snapshot_id","shipment_id","tenant_id") REFERENCES "public"."shipment_estimate_snapshots"("id","shipment_id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_order_snapshots" ADD CONSTRAINT "provider_order_snapshots_service_estimate_tenant_fkey" FOREIGN KEY ("estimate_service_id","estimate_snapshot_id","tenant_id") REFERENCES "public"."shipment_estimate_services"("id","snapshot_id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_batches_tenant_outlet_created_idx" ON "provider_batches" USING btree ("tenant_id","outlet_id","created_at");--> statement-breakpoint
CREATE INDEX "provider_batches_account_status_created_idx" ON "provider_batches" USING btree ("provider_account_key","status","created_at");--> statement-breakpoint
CREATE INDEX "provider_order_snapshots_tenant_batch_idx" ON "provider_order_snapshots" USING btree ("tenant_id","batch_id");--> statement-breakpoint
CREATE INDEX "provider_order_snapshots_tenant_status_idx" ON "provider_order_snapshots" USING btree ("tenant_id","status");
--> statement-breakpoint
REVOKE ALL ON provider_batches, provider_order_snapshots FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON provider_batches, provider_order_snapshots FROM geraicuan_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON provider_batches TO geraicuan_app;
--> statement-breakpoint
GRANT UPDATE (status, safe_error_code, submission_attempted_at, completed_at, updated_at)
  ON provider_batches TO geraicuan_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON provider_order_snapshots TO geraicuan_app;
--> statement-breakpoint
GRANT UPDATE (status, provider_order_id, is_paid, cnote_no, safe_response_code, resolved_at)
  ON provider_order_snapshots TO geraicuan_app;
--> statement-breakpoint
ALTER TABLE provider_batches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE provider_batches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE provider_order_snapshots ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE provider_order_snapshots FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "provider_batches_active_tenant_select" ON provider_batches
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_batches.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY "provider_batches_active_tenant_insert" ON provider_batches
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM outlets
      JOIN tenants ON tenants.id = outlets.tenant_id
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE outlets.id = provider_batches.outlet_id
        AND outlets.tenant_id = provider_batches.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY "provider_batches_active_tenant_update" ON provider_batches
  FOR UPDATE
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_batches.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_batches.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY "provider_order_snapshots_active_tenant_select" ON provider_order_snapshots
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_order_snapshots.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY "provider_order_snapshots_active_tenant_insert" ON provider_order_snapshots
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM provider_batches
      JOIN shipments
        ON shipments.id = provider_order_snapshots.shipment_id
        AND shipments.tenant_id = provider_order_snapshots.tenant_id
      JOIN tenants ON tenants.id = provider_order_snapshots.tenant_id
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE provider_batches.id = provider_order_snapshots.batch_id
        AND provider_batches.tenant_id = provider_order_snapshots.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY "provider_order_snapshots_active_tenant_update" ON provider_order_snapshots
  FOR UPDATE
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_order_snapshots.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_order_snapshots.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );