-- T-234 / PR-70: the offered pickup slots move to 08.00–17.00 WIB (starts 08:00–16:00).
-- The CHECK becomes a SUPERSET of 0054's '^(09|1[0-7]):00$': 08:00 is now allowed and
-- 09:00–17:00 stay valid, so every existing draft (which may hold 09..17) still passes and
-- the re-added constraint validates without touching a row. 17:00 is legacy: the app no
-- longer offers it, but drafts saved before T-234 keep it.
-- GeraiCUAN-side schedule only: Mengantar's documented POST /time window is 09:00–18:00
-- (unverified, spec 05 DATA-13) and no pickup field is sent to Mengantar until T-153.
-- Drop and re-add run in one migration transaction; no column, grant or policy changes.
ALTER TABLE "shipment_drafts" DROP CONSTRAINT "shipment_drafts_pickup_slot_valid";--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_pickup_slot_valid" CHECK (pickup_slot IS NULL OR pickup_slot ~ '^(0[89]|1[0-7]):00$');