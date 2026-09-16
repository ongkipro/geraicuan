-- PR-47 / T-152: Mengantar field parity in shipment creation.
-- Additive only: new nullable columns plus one boolean with a default, and
-- CHECK constraints that are satisfied by every existing row (all new columns
-- start NULL / false). No column, constraint, policy or grant is dropped, so
-- RLS and every existing constraint keep holding unchanged. Table-level
-- INSERT/SELECT grants already cover new columns; the application never UPDATEs
-- shipment_drafts, so 0035's column-scoped UPDATE grant is left alone.
ALTER TABLE "shipment_drafts" ADD COLUMN "shipping_instruction" text;--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD COLUMN "dropshipper_name" text;--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD COLUMN "dropshipper_phone" text;--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD COLUMN "is_hazardous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD COLUMN "recipient_address_landmark" text;--> statement-breakpoint
-- NULL means "never re-checked against the outlet's Mengantar account". Every
-- pre-0041 draft is therefore explicitly unverified, which is what the order
-- payload guard refuses rather than trusting a stored area id verbatim.
ALTER TABLE "shipment_drafts" ADD COLUMN "destination_area_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_estimate_services" ADD COLUMN "normal_price_idr" integer;--> statement-breakpoint
ALTER TABLE "shipment_estimate_services" ADD COLUMN "special_price_idr" integer;--> statement-breakpoint
ALTER TABLE "shipment_estimate_services" ADD COLUMN "cod_fee_idr" integer;--> statement-breakpoint
ALTER TABLE "shipment_estimate_services" ADD COLUMN "discount_idr" integer;--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_shipping_instruction_valid" CHECK (shipping_instruction IS NULL
        OR char_length(btrim(shipping_instruction)) BETWEEN 1 AND 500);--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_recipient_address_landmark_valid" CHECK (recipient_address_landmark IS NULL
        OR char_length(btrim(recipient_address_landmark)) BETWEEN 1 AND 160);--> statement-breakpoint
-- Both NOT NULL tests are load-bearing: a CHECK whose expression evaluates to
-- NULL passes, so a half-filled pair would slip through a constraint that only
-- compared lengths and patterns.
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_dropshipper_pair_valid" CHECK ((dropshipper_name IS NULL AND dropshipper_phone IS NULL)
        OR (
          dropshipper_name IS NOT NULL
          AND dropshipper_phone IS NOT NULL
          AND char_length(btrim(dropshipper_name)) BETWEEN 1 AND 120
          AND dropshipper_phone ~ '^0[2-9][0-9]{7,11}$'
        ));--> statement-breakpoint
ALTER TABLE "shipment_estimate_services" ADD CONSTRAINT "shipment_estimate_services_provider_money_nonnegative" CHECK ((normal_price_idr IS NULL OR normal_price_idr >= 0)
        AND (special_price_idr IS NULL OR special_price_idr >= 0)
        AND (cod_fee_idr IS NULL OR cod_fee_idr >= 0)
        AND (discount_idr IS NULL OR discount_idr >= 0));--> statement-breakpoint
ALTER TABLE "shipment_estimate_services" ADD CONSTRAINT "shipment_estimate_services_special_not_above_normal" CHECK (special_price_idr IS NULL
        OR normal_price_idr IS NULL
        OR special_price_idr <= normal_price_idr);
