-- T-232 / PR-90 / D-19: pickup vehicle (Mengantar app "Volume": Motor / Mobil / Truk)
-- for a scheduled pickup. Stored and shown only: nothing here is sent to Mengantar
-- until T-153 verifies the order-contract key (DATA-13: app UI only, API key unknown).
-- Additive only: one nullable column and two CHECK constraints every existing row
-- satisfies (the column starts NULL, and NULL passes both). No column, constraint,
-- policy or grant is dropped, so RLS and every existing rule hold unchanged. The
-- table-level INSERT/SELECT grants (0008) already cover new columns; the application
-- never UPDATEs it, so 0035/0042's column-scoped UPDATE grant is left alone.
ALTER TABLE "shipment_drafts" ADD COLUMN "pickup_vehicle" text;--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_pickup_vehicle_known" CHECK (pickup_vehicle IS NULL OR pickup_vehicle IN ('MOTOR', 'MOBIL', 'TRUK'));--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_pickup_vehicle_pickup_only" CHECK (pickup_vehicle IS NULL OR handover_type = 'PICKUP');