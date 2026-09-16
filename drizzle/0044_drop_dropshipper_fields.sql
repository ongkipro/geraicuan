-- T-170: the dropshipper pair leaves the product (owner decision 2026-09-16), so the
-- columns leave the schema with it rather than lingering as unused state. Destructive by
-- design and approved as such; no data depended on them (the fields shipped 2026-09-16
-- and no provider order was ever created with a real transport).
ALTER TABLE "shipment_drafts" DROP CONSTRAINT IF EXISTS "shipment_drafts_dropshipper_pair_valid";--> statement-breakpoint
ALTER TABLE "shipment_drafts" DROP COLUMN IF EXISTS "dropshipper_name";--> statement-breakpoint
ALTER TABLE "shipment_drafts" DROP COLUMN IF EXISTS "dropshipper_phone";
