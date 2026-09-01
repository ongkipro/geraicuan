ALTER TABLE "outlets" ADD COLUMN "default_pickup_address_label" text;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "default_origin_area_label" text;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_pickup_label_not_blank" CHECK (default_pickup_address_label IS NULL OR char_length(btrim(default_pickup_address_label)) > 0);--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_origin_label_not_blank" CHECK (default_origin_area_label IS NULL OR char_length(btrim(default_origin_area_label)) > 0);--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_location_labels_complete" CHECK ((default_pickup_address_label IS NULL) = (default_origin_area_label IS NULL));