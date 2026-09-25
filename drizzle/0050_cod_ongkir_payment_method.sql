-- T-186 / PR-64 / D-12: three payment methods — Non-COD, COD, COD Ongkir.
--
-- COD Ongkir: the goods were paid for outside GeraiCUAN, so the courier
-- collects only a shipping charge. Mengantar keeps the shipping it deducts
-- (special price, else normal price, else `price` — the basis
-- provider_order_snapshots.provider_charged_shipping_idr records) plus exactly
-- 0.0333 × the COD amount (tests/fixtures/mengantar-cod-identities.json). The
-- charge may go up from break-even, never below it:
--
--   charge × 9667 ≥ shipping deducted × 10000
--
-- Drafts. `cod_shipping_only` defaults to false, so every existing draft, and
-- every writer on the previous release during a deploy, stays NON_COD or COD
-- exactly as `is_cod` already says. It can only be true on a COD draft.
--
-- COD totals, formula version 3. The row records what the courier collects
-- (provider_cod_amount_idr = the charge) and the shipping basis it was checked
-- against (cod_shipping_basis_idr, NULL on every version 1 and 2 row). Goods
-- are not part of a version 3 COD amount: the goods + shipping + fee + VAT
-- identity is scoped to versions 1 and 2, and no version 3 check reads
-- goods_value_idr (still recorded, still > 0, still bound to the draft's
-- declared value by the INSERT policy, because it is the goods value the order
-- declares). service_fee_idr + vat_amount_idr is Mengantar's fee on the charge,
-- round_half_up(charge × 333 / 10000), split 100/111 like version 2.
--
-- History is not rewritten: no row is updated. Adding each CHECK validates every
-- existing row, and each new rule is scoped to version 3, so version 1 and 2
-- rows (basis NULL) stay valid under the rules they were written with.
--
-- Row-level security moves with the rule (DATA-11): the INSERT policy on
-- shipment_cod_totals now requires version 3 exactly for a COD Ongkir draft and
-- binds the basis to the selected estimate service. An instance still on the
-- previous release that confirms a COD Ongkir draft computes a version 2
-- goods-inclusive COD, and the database refuses it rather than collecting goods
-- the buyer already paid for. The estimate and order snapshot policies need no
-- change: a COD Ongkir draft is `is_cod`, and the order policy already requires
-- provider_cod_amount_idr to equal this row's amount.
ALTER TABLE "shipment_drafts" ADD COLUMN "cod_shipping_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_cod_shipping_only_requires_cod" CHECK (NOT cod_shipping_only OR is_cod);--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD COLUMN "cod_shipping_basis_idr" integer;--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" DROP CONSTRAINT "shipment_cod_totals_formula_version_known";--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_formula_version_known" CHECK (cod_formula_version IN (1, 2, 3));--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" DROP CONSTRAINT "shipment_cod_totals_provider_cod_amount_exact";--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_provider_cod_amount_exact" CHECK (cod_formula_version = 3 OR provider_cod_amount_idr::bigint =
        goods_value_idr::bigint
        + shipping_amount_idr::bigint
        + service_fee_idr::bigint
        + vat_amount_idr::bigint);--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_shipping_basis_v3" CHECK ((cod_formula_version = 3) = (cod_shipping_basis_idr IS NOT NULL)
        AND (cod_shipping_basis_idr IS NULL OR cod_shipping_basis_idr >= 0));--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_cod_ongkir_break_even_v3" CHECK (cod_formula_version <> 3 OR (
        cod_shipping_basis_idr IS NOT NULL
        AND provider_cod_amount_idr::bigint * 9667 >= cod_shipping_basis_idr::bigint * 10000
      ));--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_cod_ongkir_fee_v3" CHECK (cod_formula_version <> 3 OR service_fee_idr::bigint + vat_amount_idr::bigint =
        ((provider_cod_amount_idr::bigint * 333 + 5000) / 10000));--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_cod_ongkir_fee_split_v3" CHECK (cod_formula_version <> 3 OR service_fee_idr::bigint =
        (((service_fee_idr::bigint + vat_amount_idr::bigint) * 100 + 55) / 111));--> statement-breakpoint
DROP POLICY IF EXISTS "shipment_cod_totals_active_tenant_insert" ON shipment_cod_totals;--> statement-breakpoint
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
        AND shipment_drafts.cod_shipping_only = (shipment_cod_totals.cod_formula_version = 3)
        AND (
          shipment_cod_totals.cod_formula_version <> 3
          OR shipment_cod_totals.cod_shipping_basis_idr = coalesce(
            shipment_estimate_services.special_price_idr,
            shipment_estimate_services.normal_price_idr,
            shipment_estimate_services.shipping_amount_idr
          )
        )
        AND shipment_estimate_snapshots.is_cod_requested = true
        AND shipment_estimate_snapshots.origin_area_id = coalesce(shipment_drafts.origin_area_id, outlets.default_origin_area_id)
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
