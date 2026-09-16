-- T-178 / PR-43, PR-9: COD settlement money that matches what Mengantar does.
--
-- Evidence (tests/fixtures/mengantar-cod-identities.json → settlement, 600 real
-- reconciliation invoices / 2,866 COD subItems): subItem.amount =
-- COD_AMOUNT − estimatedSpecialPrice on all 2,866, and estimatedSpecialPrice is
-- the discounted shipping plus COD_FEE = COD_AMOUNT × 0.0333, unrounded. So
-- 1,016 subItems carry a fractional amount and 202 invoices contain one.
--
-- 1. Settlement evidence columns become exact decimals. `amount_idr` and
--    `shipping_amount_idr` were bigint, so the pull could not store the
--    provider's own figure; `cod_fee_idr` was numeric(16,2), which rounded the
--    fee to the sen. 333 basis points of a whole rupiah is exact at four
--    decimal places, so all three become numeric(18,4). Widening bigint and
--    numeric(16,2) to numeric(18,4) is value-preserving for every stored row
--    (the application capped them at Rp 1 000 000 000 000; numeric(18,4) holds
--    fourteen integer digits), and the observation key keeps its meaning
--    because numeric equality is by value. No row is updated or deleted.
--
-- 2. The ledger gains MENGANTAR_COD_FEE_COST (EXPENSE). New COD issuances post
--    shipment_cod_totals.service_fee_idr under it, because Mengantar deducts
--    that fee at settlement and GeraiCUAN never receives it.
--    GERAICUAN_COD_SERVICE_FEE_REVENUE stays valid in every check: ledger
--    entries are append-only (trigger ledger_entries_immutable, INSERT/SELECT
--    grants only, both untouched here), historical entries keep their type, an
--    ADJUSTMENT may still reverse one, and an instance still running the
--    previous release during a deploy appends it inside the same transaction
--    that records the AWB — refusing it there would roll the AWB record back.
--    Each CHECK is re-created with its 0015 expression plus the new type only;
--    adding them validates every existing row.
--
-- No policy moves: ledger_entries_active_tenant_insert restricts only
-- ADJUSTMENT, RECONCILIATION and COD_REMITTANCE to Tenant Admins, so the new
-- issuance type follows the same rule as the types it sits beside, and no
-- policy on provider_settlement_items reads an amount.
ALTER TABLE "provider_settlement_items" ALTER COLUMN "amount_idr" SET DATA TYPE numeric(18, 4) USING "amount_idr"::numeric(18, 4);--> statement-breakpoint
ALTER TABLE "provider_settlement_items" ALTER COLUMN "cod_fee_idr" SET DATA TYPE numeric(18, 4) USING "cod_fee_idr"::numeric(18, 4);--> statement-breakpoint
ALTER TABLE "provider_settlement_items" ALTER COLUMN "shipping_amount_idr" SET DATA TYPE numeric(18, 4) USING "shipping_amount_idr"::numeric(18, 4);--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_type_valid";--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_type_valid" CHECK (entry_type IN (
        'COD_PRINCIPAL_COLLECTABLE',
        'MENGANTAR_SHIPPING_COST',
        'MENGANTAR_INSURANCE_COST',
        'MENGANTAR_COD_FEE_COST',
        'GERAICUAN_COD_SERVICE_FEE_REVENUE',
        'COD_SERVICE_FEE_VAT_PAYABLE',
        'NON_COD_UPSTREAM_PAYMENT',
        'COD_REMITTANCE',
        'ADJUSTMENT',
        'RECONCILIATION'
      ));--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_type_class_valid";--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_type_class_valid" CHECK ((entry_type IN (
          'COD_PRINCIPAL_COLLECTABLE',
          'COD_SERVICE_FEE_VAT_PAYABLE',
          'COD_REMITTANCE'
        ) AND financial_class = 'LIABILITY')
        OR (entry_type IN (
          'MENGANTAR_SHIPPING_COST',
          'MENGANTAR_INSURANCE_COST',
          'MENGANTAR_COD_FEE_COST'
        ) AND financial_class = 'EXPENSE')
        OR (
          entry_type = 'GERAICUAN_COD_SERVICE_FEE_REVENUE'
          AND financial_class = 'REVENUE'
        )
        OR (
          entry_type IN ('NON_COD_UPSTREAM_PAYMENT', 'RECONCILIATION')
          AND financial_class = 'MEMO'
        )
        OR entry_type = 'ADJUSTMENT');--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_source_event_valid";--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_event_valid" CHECK ((
          source_event = 'PROVIDER_ORDER_ISSUED'
          AND entry_type IN (
            'COD_PRINCIPAL_COLLECTABLE',
            'MENGANTAR_SHIPPING_COST',
            'MENGANTAR_INSURANCE_COST',
            'MENGANTAR_COD_FEE_COST',
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
        ));--> statement-breakpoint
ALTER TABLE "reconciliation_runs" DROP CONSTRAINT "reconciliation_runs_entry_type_valid";--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_entry_type_valid" CHECK (reconciled_entry_type IN (
        'COD_PRINCIPAL_COLLECTABLE',
        'MENGANTAR_SHIPPING_COST',
        'MENGANTAR_INSURANCE_COST',
        'MENGANTAR_COD_FEE_COST',
        'GERAICUAN_COD_SERVICE_FEE_REVENUE',
        'COD_SERVICE_FEE_VAT_PAYABLE',
        'NON_COD_UPSTREAM_PAYMENT',
        'COD_REMITTANCE'
      ));
