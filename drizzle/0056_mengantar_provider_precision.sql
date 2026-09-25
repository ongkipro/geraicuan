-- T-223 / DATA-13 (PR-84): Mengantar provider precision.
-- provider_order_snapshots.provider_batch_id: Mengantar `batch`, the id that
-- POST /order/pay-unpaid takes as `batch_id` (it is not the order id). NULL on
-- rows accepted before this migration; unpaid recovery fails closed on those.
-- The runtime role's column-scoped UPDATE grant gains this one column, the way
-- 0013 granted provider_order_id/cnote_no/is_paid; nothing else is widened.
-- provider_order_status_observations.last_history_desc/last_history_at/pod_code:
-- `lastHistory.desc`, `lastHistory.date` (WIB -> timestamptz) and `pod_code`.
-- The table stays append-only: the existing table-level INSERT grant covers
-- the new columns and no UPDATE is granted.
-- Additive only: nullable columns and one column grant; no data is rewritten.
ALTER TABLE "provider_order_snapshots" ADD COLUMN "provider_batch_id" text;--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD COLUMN "last_history_desc" text;--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD COLUMN "last_history_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD COLUMN "pod_code" text;--> statement-breakpoint
GRANT UPDATE (provider_batch_id) ON provider_order_snapshots TO geraicuan_app;
