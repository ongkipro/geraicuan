-- T-175 / PR-9: a COD amount that never under-collects Mengantar's own fee.
--
-- Evidence (tests/fixtures/mengantar-cod-identities.json, 100 real COD orders):
-- Mengantar's COD_FEE is exactly 0.0333 × COD_AMOUNT, and the price it deducts
-- on a stored order already contains that fee. The additive formula 0011
-- enforced (COD = goods + shipping + round(3%) + round(11% of that)) is about
-- 1.0333 × (goods + shipping), so the seller netted 0.99889 × (goods + shipping)
-- minus the courier's special shipping — short of the goods value on every COD
-- shipment with no courier discount.
--
-- Formula version 2: COD = ceil((goods + shipping) × 10000 / 9667), the markup
-- split fee = round_half_up(markup × 100 / 111) and VAT = markup − fee.
--
-- History is not rewritten. Every existing row records the COD amount that was
-- actually submitted to Mengantar, so it becomes version 1 and keeps version 1's
-- checks with their expressions unchanged, now scoped to version 1 rows. The
-- column default stays 1 so a writer that names no version (an instance still
-- running the previous release during a deploy) keeps writing, and is checked
-- against, the rule it actually submits; the application names version 2
-- explicitly. Adding the CHECKs validates every existing row, so this migration
-- fails rather than succeeds over a row that no version describes.
--
-- No policy or grant moves: the INSERT policy (0046) checks tenancy, the
-- estimate and the shipping amount, never the fee arithmetic, and the order
-- snapshot policy (0046) compares provider_cod_amount_idr to this row's value
-- whatever formula produced it. DATA-11 records why a formula the application
-- computes must move in the database in the same change.
ALTER TABLE "shipment_cod_totals" ADD COLUMN "cod_formula_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_formula_version_known" CHECK (cod_formula_version IN (1, 2));--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" DROP CONSTRAINT "shipment_cod_totals_service_fee_exact";--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_service_fee_exact" CHECK (cod_formula_version <> 1 OR service_fee_idr::bigint =
        (((goods_value_idr::bigint + shipping_amount_idr::bigint) * 3 + 50) / 100));--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" DROP CONSTRAINT "shipment_cod_totals_vat_exact";--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_vat_exact" CHECK (cod_formula_version <> 1 OR vat_amount_idr::bigint = ((service_fee_idr::bigint * 11 + 50) / 100));--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_provider_cod_amount_gross_up_v2" CHECK (cod_formula_version <> 2 OR provider_cod_amount_idr::bigint =
        (((goods_value_idr::bigint + shipping_amount_idr::bigint) * 10000 + 9666) / 9667));--> statement-breakpoint
ALTER TABLE "shipment_cod_totals" ADD CONSTRAINT "shipment_cod_totals_service_fee_split_v2" CHECK (cod_formula_version <> 2 OR service_fee_idr::bigint =
        (((provider_cod_amount_idr::bigint - goods_value_idr::bigint - shipping_amount_idr::bigint) * 100 + 55) / 111));
