CREATE TABLE "provider_unpaid_recoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"provider_order_snapshot_id" uuid NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"status" text DEFAULT 'PAYMENT_QUEUED' NOT NULL,
	"safe_response_code" text,
	"attempted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_unpaid_recoveries_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "provider_unpaid_recoveries_order_snapshot_key" UNIQUE("provider_order_snapshot_id"),
	CONSTRAINT "provider_unpaid_recoveries_status_valid" CHECK (status IN ('PAYMENT_QUEUED', 'PAYING', 'PAYMENT_UNKNOWN', 'COMPLETED')),
	CONSTRAINT "provider_unpaid_recoveries_attempt_state_valid" CHECK ((status = 'PAYMENT_QUEUED' AND attempted_at IS NULL)
        OR (status <> 'PAYMENT_QUEUED' AND attempted_at IS NOT NULL)),
	CONSTRAINT "provider_unpaid_recoveries_completion_state_valid" CHECK ((status IN ('PAYMENT_UNKNOWN', 'COMPLETED') AND completed_at IS NOT NULL)
        OR (status NOT IN ('PAYMENT_UNKNOWN', 'COMPLETED') AND completed_at IS NULL)),
	CONSTRAINT "provider_unpaid_recoveries_response_state_valid" CHECK ((status IN ('PAYMENT_QUEUED', 'PAYING') AND safe_response_code IS NULL)
        OR (
          status = 'PAYMENT_UNKNOWN'
          AND char_length(btrim(safe_response_code)) BETWEEN 1 AND 80
        )
        OR (status = 'COMPLETED' AND safe_response_code = 'PAY_UNPAID_ACCEPTED'))
);
--> statement-breakpoint
ALTER TABLE "provider_order_snapshots" ADD CONSTRAINT "provider_order_snapshots_id_batch_tenant_key" UNIQUE("id","batch_id","tenant_id");--> statement-breakpoint
ALTER TABLE "provider_unpaid_recoveries" ADD CONSTRAINT "provider_unpaid_recoveries_order_batch_tenant_fkey" FOREIGN KEY ("provider_order_snapshot_id","batch_id","tenant_id") REFERENCES "public"."provider_order_snapshots"("id","batch_id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_unpaid_recoveries" ADD CONSTRAINT "provider_unpaid_recoveries_requester_tenant_fkey" FOREIGN KEY ("tenant_id","requested_by_user_id") REFERENCES "public"."memberships"("tenant_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_unpaid_recoveries_tenant_batch_status_idx" ON "provider_unpaid_recoveries" USING btree ("tenant_id","batch_id","status");
--> statement-breakpoint
REVOKE ALL ON provider_unpaid_recoveries FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON provider_unpaid_recoveries FROM geraicuan_app;
--> statement-breakpoint
GRANT SELECT ON provider_unpaid_recoveries TO geraicuan_app;
--> statement-breakpoint
GRANT INSERT ON provider_unpaid_recoveries TO geraicuan_app;
--> statement-breakpoint
GRANT UPDATE (status, safe_response_code, attempted_at, completed_at, updated_at)
  ON provider_unpaid_recoveries TO geraicuan_app;
--> statement-breakpoint
ALTER TABLE provider_unpaid_recoveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE provider_unpaid_recoveries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "provider_unpaid_recoveries_tenant_admin_select"
  ON provider_unpaid_recoveries
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_unpaid_recoveries.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY "provider_unpaid_recoveries_tenant_admin_insert"
  ON provider_unpaid_recoveries
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND requested_by_user_id = current_setting('app.user_id', true)
    AND EXISTS (
      SELECT 1
      FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_unpaid_recoveries.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY "provider_unpaid_recoveries_tenant_admin_update"
  ON provider_unpaid_recoveries
  FOR UPDATE
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_unpaid_recoveries.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_unpaid_recoveries.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );