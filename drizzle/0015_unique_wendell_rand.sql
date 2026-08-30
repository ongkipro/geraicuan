CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"shipment_id" uuid,
	"provider_batch_id" uuid,
	"provider_order_snapshot_id" uuid,
	"reconciliation_run_id" uuid,
	"entry_type" text NOT NULL,
	"financial_class" text NOT NULL,
	"amount_idr" bigint NOT NULL,
	"currency" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"source_event" text NOT NULL,
	"source_event_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" text,
	"reverses_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "ledger_entries_source_event_type_key" UNIQUE("tenant_id","source_event","source_event_id","entry_type"),
	CONSTRAINT "ledger_entries_type_valid" CHECK (entry_type IN (
        'COD_PRINCIPAL_COLLECTABLE',
        'MENGANTAR_SHIPPING_COST',
        'MENGANTAR_INSURANCE_COST',
        'GERAICUAN_COD_SERVICE_FEE_REVENUE',
        'COD_SERVICE_FEE_VAT_PAYABLE',
        'NON_COD_UPSTREAM_PAYMENT',
        'COD_REMITTANCE',
        'ADJUSTMENT',
        'RECONCILIATION'
      )),
	CONSTRAINT "ledger_entries_financial_class_valid" CHECK (financial_class IN ('LIABILITY', 'EXPENSE', 'REVENUE', 'MEMO')),
	CONSTRAINT "ledger_entries_type_class_valid" CHECK ((entry_type IN (
          'COD_PRINCIPAL_COLLECTABLE',
          'COD_SERVICE_FEE_VAT_PAYABLE',
          'COD_REMITTANCE'
        ) AND financial_class = 'LIABILITY')
        OR (entry_type IN (
          'MENGANTAR_SHIPPING_COST',
          'MENGANTAR_INSURANCE_COST'
        ) AND financial_class = 'EXPENSE')
        OR (
          entry_type = 'GERAICUAN_COD_SERVICE_FEE_REVENUE'
          AND financial_class = 'REVENUE'
        )
        OR (
          entry_type IN ('NON_COD_UPSTREAM_PAYMENT', 'RECONCILIATION')
          AND financial_class = 'MEMO'
        )
        OR entry_type = 'ADJUSTMENT'),
	CONSTRAINT "ledger_entries_amount_valid" CHECK ((entry_type IN ('COD_REMITTANCE', 'ADJUSTMENT', 'RECONCILIATION'))
        OR amount_idr >= 0),
	CONSTRAINT "ledger_entries_currency_idr" CHECK (currency = 'IDR'),
	CONSTRAINT "ledger_entries_source_event_valid" CHECK ((
          source_event = 'PROVIDER_ORDER_ISSUED'
          AND entry_type IN (
            'COD_PRINCIPAL_COLLECTABLE',
            'MENGANTAR_SHIPPING_COST',
            'MENGANTAR_INSURANCE_COST',
            'GERAICUAN_COD_SERVICE_FEE_REVENUE',
            'COD_SERVICE_FEE_VAT_PAYABLE'
          )
        )
        OR (
          source_event = 'UNPAID_RECOVERY_COMPLETED'
          AND entry_type IN (
            'MENGANTAR_SHIPPING_COST',
            'MENGANTAR_INSURANCE_COST',
            'NON_COD_UPSTREAM_PAYMENT'
          )
        )
        OR (
          source_event = 'COD_REMITTANCE_CONFIRMED'
          AND entry_type = 'COD_REMITTANCE'
        )
        OR (
          source_event = 'MANUAL_ADJUSTMENT'
          AND entry_type = 'ADJUSTMENT'
        )
        OR (
          source_event = 'RECONCILIATION_CLOSED'
          AND entry_type = 'RECONCILIATION'
        )),
	CONSTRAINT "ledger_entries_source_event_id_valid" CHECK (char_length(btrim(source_event_id)) BETWEEN 1 AND 160),
	CONSTRAINT "ledger_entries_actor_valid" CHECK ((actor_type = 'USER' AND actor_user_id IS NOT NULL)
        OR (actor_type = 'SYSTEM' AND actor_user_id IS NULL)),
	CONSTRAINT "ledger_entries_source_link_valid" CHECK ((
          entry_type = 'RECONCILIATION'
          AND reconciliation_run_id IS NOT NULL
          AND shipment_id IS NULL
          AND provider_batch_id IS NULL
          AND provider_order_snapshot_id IS NULL
          AND reverses_entry_id IS NULL
        )
        OR (
          entry_type = 'ADJUSTMENT'
          AND reconciliation_run_id IS NULL
          AND shipment_id IS NOT NULL
          AND provider_batch_id IS NOT NULL
          AND provider_order_snapshot_id IS NOT NULL
          AND reverses_entry_id IS NOT NULL
        )
        OR (
          entry_type NOT IN ('ADJUSTMENT', 'RECONCILIATION')
          AND reconciliation_run_id IS NULL
          AND shipment_id IS NOT NULL
          AND provider_batch_id IS NOT NULL
          AND provider_order_snapshot_id IS NOT NULL
          AND reverses_entry_id IS NULL
        ))
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"cadence" text NOT NULL,
	"reconciled_entry_type" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"currency" text NOT NULL,
	"source_total_idr" bigint NOT NULL,
	"ledger_total_idr" bigint NOT NULL,
	"variance_idr" bigint NOT NULL,
	"status" text NOT NULL,
	"source_event_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_runs_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "reconciliation_runs_tenant_source_event_key" UNIQUE("tenant_id","source_event_id"),
	CONSTRAINT "reconciliation_runs_cadence_valid" CHECK (cadence IN ('DAILY', 'MONTHLY')),
	CONSTRAINT "reconciliation_runs_entry_type_valid" CHECK (reconciled_entry_type IN (
        'COD_PRINCIPAL_COLLECTABLE',
        'MENGANTAR_SHIPPING_COST',
        'MENGANTAR_INSURANCE_COST',
        'GERAICUAN_COD_SERVICE_FEE_REVENUE',
        'COD_SERVICE_FEE_VAT_PAYABLE',
        'NON_COD_UPSTREAM_PAYMENT',
        'COD_REMITTANCE'
      )),
	CONSTRAINT "reconciliation_runs_period_valid" CHECK (period_end > period_start),
	CONSTRAINT "reconciliation_runs_currency_idr" CHECK (currency = 'IDR'),
	CONSTRAINT "reconciliation_runs_totals_nonnegative" CHECK (source_total_idr >= 0 AND ledger_total_idr >= 0),
	CONSTRAINT "reconciliation_runs_variance_exact" CHECK (variance_idr = source_total_idr - ledger_total_idr),
	CONSTRAINT "reconciliation_runs_status_valid" CHECK ((variance_idr = 0 AND status = 'MATCHED')
        OR (variance_idr <> 0 AND status = 'VARIANCE')),
	CONSTRAINT "reconciliation_runs_source_event_id_valid" CHECK (char_length(btrim(source_event_id)) BETWEEN 1 AND 160)
);
--> statement-breakpoint
ALTER TABLE "provider_batches" ADD CONSTRAINT "provider_batches_id_outlet_tenant_key" UNIQUE("id","outlet_id","tenant_id");--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_id_outlet_tenant_key" UNIQUE("id","outlet_id","tenant_id");
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_shipment_outlet_tenant_fkey" FOREIGN KEY ("shipment_id","outlet_id","tenant_id") REFERENCES "public"."shipments"("id","outlet_id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_batch_outlet_tenant_fkey" FOREIGN KEY ("provider_batch_id","outlet_id","tenant_id") REFERENCES "public"."provider_batches"("id","outlet_id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_batch_tenant_fkey" FOREIGN KEY ("provider_order_snapshot_id","provider_batch_id","tenant_id") REFERENCES "public"."provider_order_snapshots"("id","batch_id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reconciliation_tenant_fkey" FOREIGN KEY ("reconciliation_run_id","tenant_id") REFERENCES "public"."reconciliation_runs"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_actor_tenant_fkey" FOREIGN KEY ("tenant_id","actor_user_id") REFERENCES "public"."memberships"("tenant_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reversal_tenant_fkey" FOREIGN KEY ("reverses_entry_id","tenant_id") REFERENCES "public"."ledger_entries"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_outlet_tenant_fkey" FOREIGN KEY ("outlet_id","tenant_id") REFERENCES "public"."outlets"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_actor_tenant_fkey" FOREIGN KEY ("tenant_id","actor_user_id") REFERENCES "public"."memberships"("tenant_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_entries_tenant_outlet_effective_idx" ON "ledger_entries" USING btree ("tenant_id","outlet_id","effective_at","id");--> statement-breakpoint
CREATE INDEX "ledger_entries_tenant_shipment_effective_idx" ON "ledger_entries" USING btree ("tenant_id","shipment_id","effective_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_tenant_class_effective_idx" ON "ledger_entries" USING btree ("tenant_id","financial_class","effective_at");--> statement-breakpoint
CREATE INDEX "reconciliation_runs_tenant_outlet_period_idx" ON "reconciliation_runs" USING btree ("tenant_id","outlet_id","period_start","period_end");--> statement-breakpoint
REVOKE ALL ON ledger_entries, reconciliation_runs FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ledger_entries, reconciliation_runs FROM geraicuan_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON ledger_entries, reconciliation_runs TO geraicuan_app;
--> statement-breakpoint
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reconciliation_runs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ledger_entries_tenant_admin_select"
  ON ledger_entries
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = ledger_entries.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY "ledger_entries_active_tenant_insert"
  ON ledger_entries
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_type = 'USER'
    AND actor_user_id = current_setting('app.user_id', true)
    AND EXISTS (
      SELECT 1
      FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = ledger_entries.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
        AND (
          ledger_entries.entry_type NOT IN (
            'ADJUSTMENT',
            'RECONCILIATION',
            'COD_REMITTANCE'
          )
          OR memberships.role = 'TENANT_ADMIN'
        )
    )
  );
--> statement-breakpoint
CREATE POLICY "reconciliation_runs_tenant_admin_select"
  ON reconciliation_runs
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = reconciliation_runs.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY "reconciliation_runs_tenant_admin_insert"
  ON reconciliation_runs
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = current_setting('app.user_id', true)
    AND EXISTS (
      SELECT 1
      FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = reconciliation_runs.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE FUNCTION prevent_immutable_operational_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% records are immutable', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_immutable_operational_record_mutation();
--> statement-breakpoint
CREATE TRIGGER reconciliation_runs_immutable
  BEFORE UPDATE OR DELETE ON reconciliation_runs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_immutable_operational_record_mutation();