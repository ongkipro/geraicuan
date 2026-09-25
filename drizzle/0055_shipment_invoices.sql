-- T-221 / DATA-14 (PR-76–PR-78): the immutable nota for one issued shipment.
-- One row per shipment (UNIQUE shipment_id), numbered 'INV-' || public_reference.
-- Insert-only for the runtime role: SELECT and INSERT are granted, UPDATE and
-- DELETE never are (BILL-4). RLS mirrors print_events: an ACTIVE tenant, an
-- ACTIVE member and user, and on insert the issuer is the session user and the
-- provider snapshot belongs to the shipment and carries a resi (cnote_no).
-- Additive only: a new table; no existing column, constraint, policy or grant changes.
CREATE TABLE "shipment_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"provider_order_snapshot_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by_user_id" text NOT NULL,
	"template_version" smallint DEFAULT 1 NOT NULL,
	"document" jsonb NOT NULL,
	"shipping_charge_idr" integer NOT NULL,
	"insurance_idr" integer NOT NULL,
	"total_idr" integer NOT NULL,
	"collection_mode" text NOT NULL,
	"courier_collection_idr" integer,
	"declared_value_idr" integer NOT NULL,
	CONSTRAINT "shipment_invoices_shipment_key" UNIQUE("shipment_id"),
	CONSTRAINT "shipment_invoices_tenant_number_key" UNIQUE("tenant_id","invoice_number"),
	CONSTRAINT "shipment_invoices_number_format" CHECK (invoice_number ~ '^INV-[A-Z0-9]{2,5}-[0-9]{5,}$'),
	CONSTRAINT "shipment_invoices_issuer_not_blank" CHECK (char_length(btrim(issued_by_user_id)) > 0),
	CONSTRAINT "shipment_invoices_template_version_positive" CHECK (template_version >= 1),
	CONSTRAINT "shipment_invoices_document_object" CHECK (jsonb_typeof(document) = 'object'),
	CONSTRAINT "shipment_invoices_money_nonnegative" CHECK (shipping_charge_idr >= 0 AND insurance_idr >= 0 AND declared_value_idr >= 0),
	CONSTRAINT "shipment_invoices_total_is_sum" CHECK (total_idr = shipping_charge_idr + insurance_idr),
	CONSTRAINT "shipment_invoices_collection_mode_valid" CHECK (collection_mode IN ('NON_COD', 'COD_SHIPPING_ONLY', 'COD')),
	CONSTRAINT "shipment_invoices_courier_collection_pair" CHECK ((collection_mode = 'NON_COD' AND courier_collection_idr IS NULL)
        OR (collection_mode <> 'NON_COD' AND courier_collection_idr IS NOT NULL AND courier_collection_idr > 0))
);
--> statement-breakpoint
ALTER TABLE "shipment_invoices" ADD CONSTRAINT "shipment_invoices_shipment_tenant_fkey" FOREIGN KEY ("shipment_id","tenant_id") REFERENCES "public"."shipments"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_invoices" ADD CONSTRAINT "shipment_invoices_snapshot_tenant_fkey" FOREIGN KEY ("provider_order_snapshot_id","tenant_id") REFERENCES "public"."provider_order_snapshots"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_invoices_tenant_issued_idx" ON "shipment_invoices" USING btree ("tenant_id","issued_at");
--> statement-breakpoint
REVOKE ALL ON shipment_invoices FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON shipment_invoices FROM geraicuan_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON shipment_invoices TO geraicuan_app;
--> statement-breakpoint
ALTER TABLE shipment_invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE shipment_invoices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "shipment_invoices_active_tenant" ON shipment_invoices
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_invoices.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND issued_by_user_id = current_setting('app.user_id', true)
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_invoices.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
    AND EXISTS (
      SELECT 1
      FROM provider_order_snapshots pos
      JOIN shipments shipment
        ON shipment.id = pos.shipment_id
       AND shipment.tenant_id = pos.tenant_id
      WHERE pos.id = shipment_invoices.provider_order_snapshot_id
        AND pos.tenant_id = shipment_invoices.tenant_id
        AND pos.shipment_id = shipment_invoices.shipment_id
        AND char_length(btrim(pos.cnote_no)) BETWEEN 1 AND 160
        AND shipment_invoices.invoice_number = 'INV-' || shipment.public_reference
    )
  );
