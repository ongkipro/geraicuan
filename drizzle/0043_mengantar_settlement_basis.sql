-- T-146 money-semantics correction (owner decision 2026-09-16): the ledger's
-- MENGANTAR_SHIPPING_COST entry was written from `price` (the buyer's normal
-- rate) when Mengantar actually settles COD shipments against
-- `estimatedSpecialPrice` (falling back to `estimatedPrice`), verified
-- against 554 real invoice subItems. The buyer is unaffected: `price` stays
-- the basis of shipment_cod_totals and everything derived from it.
--
-- Additive only: one new nullable column carrying the provider-charged
-- amount at issuance time, populated going forward by order-batch-repository.
-- NULL on every snapshot created before this migration — those orders were
-- already ledgered under the old (overstated) basis, and the ledger is
-- append-only, so their MENGANTAR_SHIPPING_COST entries are not rewritten. A
-- report spanning this boundary must treat entries before 2026-09-16 as using
-- the old basis (see docs/spec/19-METRICS-ANALYTICS-CONTRACT.md).
ALTER TABLE "provider_order_snapshots" ADD COLUMN "provider_charged_shipping_idr" integer;--> statement-breakpoint
ALTER TABLE "provider_order_snapshots" ADD CONSTRAINT "provider_order_snapshots_provider_charged_shipping_nonnegative" CHECK (provider_charged_shipping_idr IS NULL OR provider_charged_shipping_idr >= 0);
