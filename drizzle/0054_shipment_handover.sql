-- T-211 / PR-70: handover type (Penjemputan terjadwal / Drop di outlet) and, for a
-- pickup, the WIB date and one-hour slot start (09:00–17:00, i.e. 09.00–18.00).
-- Stored and shown only: nothing here is sent to Mengantar until T-153 verifies
-- the order contract.
-- Additive only: three nullable columns and CHECK constraints every existing row
-- satisfies (all three start NULL). No column, constraint, policy or grant is
-- dropped, so RLS and every existing rule hold unchanged. The table-level
-- INSERT/SELECT grants (0008) already cover new columns; the application never
-- UPDATEs these, so 0035/0042's column-scoped UPDATE grant is left alone.
ALTER TABLE "shipment_drafts" ADD COLUMN "handover_type" text;--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD COLUMN "pickup_date" date;--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD COLUMN "pickup_slot" text;--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_handover_type_known" CHECK (handover_type IS NULL OR handover_type IN ('PICKUP', 'DROP_OFF'));--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_pickup_slot_valid" CHECK (pickup_slot IS NULL OR pickup_slot ~ '^(09|1[0-7]):00$');--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_pickup_schedule_complete" CHECK ((handover_type = 'PICKUP' AND pickup_date IS NOT NULL AND pickup_slot IS NOT NULL)
        OR (handover_type IS DISTINCT FROM 'PICKUP' AND pickup_date IS NULL AND pickup_slot IS NULL));
