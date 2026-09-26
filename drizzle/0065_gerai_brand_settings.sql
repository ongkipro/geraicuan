-- T-243: Profil gerai & brand, Mitra kurir, pickup notes and the label brand switches.
-- Additive: one new table and nullable / defaulted columns; no existing row changes meaning.
-- tenant_brand_settings holds the gerai logo as validated bytes (PNG/JPEG/WebP sniffed from
-- magic bytes, <= 200 KB, <= 1000 x 1000 px, never SVG; served only by the authenticated
-- /app/brand/logo handler), the catatan resi, kategori usaha, email CS, website, the
-- default label size and the switched-off couriers. Same RLS shape as
-- tenant_label_settings (0059): both roles of the tenant read; only an active Tenant Admin
-- of the current tenant inserts or updates (the Server Actions check the role first). No
-- column holds the Mengantar pickup identity: it is never printable (PR-71). The pickup
-- notes are internal and never part of a Mengantar request.
CREATE TABLE "tenant_brand_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"business_category" text,
	"label_note" text,
	"cs_email" text,
	"website" text,
	"default_label_size" text DEFAULT '10x15' NOT NULL,
	"disabled_couriers" text[] DEFAULT '{}'::text[] NOT NULL,
	"logo_bytes" "bytea",
	"logo_mime" text,
	"logo_sha256" text,
	"logo_updated_at" timestamp with time zone,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_brand_settings_category_valid" CHECK (business_category IS NULL OR business_category IN ('FASHION', 'BEAUTY', 'FOOD', 'ELECTRONICS', 'HEALTH', 'OTHER')),
	CONSTRAINT "tenant_brand_settings_label_note_valid" CHECK (label_note IS NULL OR (char_length(label_note) BETWEEN 1 AND 60 AND label_note = btrim(label_note) AND label_note !~ '[[:cntrl:]]')),
	CONSTRAINT "tenant_brand_settings_cs_email_valid" CHECK (cs_email IS NULL OR (char_length(cs_email) <= 254 AND cs_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][a-z]{2,}$')),
	CONSTRAINT "tenant_brand_settings_website_valid" CHECK (website IS NULL OR (char_length(website) <= 200 AND website ~ '^https://[^[:space:]/@]+[.][^[:space:]/@]+')),
	CONSTRAINT "tenant_brand_settings_label_size_valid" CHECK (default_label_size IN ('10x15', '10x10')),
	CONSTRAINT "tenant_brand_settings_couriers_bounded" CHECK (cardinality(disabled_couriers) <= 32),
	CONSTRAINT "tenant_brand_settings_logo_complete" CHECK ((logo_bytes IS NULL) = (logo_mime IS NULL) AND (logo_bytes IS NULL) = (logo_sha256 IS NULL) AND (logo_bytes IS NULL) = (logo_updated_at IS NULL)),
	CONSTRAINT "tenant_brand_settings_logo_valid" CHECK (logo_bytes IS NULL OR (octet_length(logo_bytes) BETWEEN 1 AND 204800 AND logo_mime IN ('image/png', 'image/jpeg', 'image/webp') AND logo_sha256 ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "tenant_brand_settings_updater_not_blank" CHECK (char_length(btrim(updated_by_user_id)) > 0)
);
--> statement-breakpoint
ALTER TABLE "outlet_pickup_points" ADD COLUMN "pic_name" text;--> statement-breakpoint
ALTER TABLE "outlet_pickup_points" ADD COLUMN "pic_phone" text;--> statement-breakpoint
ALTER TABLE "outlet_pickup_points" ADD COLUMN "pickup_schedule" text;--> statement-breakpoint
ALTER TABLE "outlet_pickup_points" ADD COLUMN "driver_access_note" text;--> statement-breakpoint
ALTER TABLE "tenant_label_settings" ADD COLUMN "show_courier_logo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_label_settings" ADD COLUMN "show_gerai_logo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_label_settings" ADD COLUMN "show_label_note" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_brand_settings" ADD CONSTRAINT "tenant_brand_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlet_pickup_points" ADD CONSTRAINT "outlet_pickup_points_notes_valid" CHECK ((pic_name IS NULL OR char_length(btrim(pic_name)) BETWEEN 1 AND 80)
        AND (pic_phone IS NULL OR pic_phone ~ '^0[2-9][0-9]{7,11}$')
        AND (pickup_schedule IS NULL OR char_length(btrim(pickup_schedule)) BETWEEN 1 AND 120)
        AND (driver_access_note IS NULL OR char_length(btrim(driver_access_note)) BETWEEN 1 AND 240));
--> statement-breakpoint
REVOKE ALL ON tenant_brand_settings FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON tenant_brand_settings TO geraicuan_app;
--> statement-breakpoint
-- Everything moves except the tenant and the creation time.
GRANT UPDATE (business_category, label_note, cs_email, website, default_label_size, disabled_couriers, logo_bytes, logo_mime, logo_sha256, logo_updated_at, updated_by_user_id, updated_at) ON tenant_brand_settings TO geraicuan_app;
--> statement-breakpoint
GRANT UPDATE (show_courier_logo, show_gerai_logo, show_label_note) ON tenant_label_settings TO geraicuan_app;
--> statement-breakpoint
GRANT UPDATE (pic_name, pic_phone, pickup_schedule, driver_access_note) ON outlet_pickup_points TO geraicuan_app;
--> statement-breakpoint
ALTER TABLE tenant_brand_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant_brand_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_brand_settings_member_select ON tenant_brand_settings
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = tenant_brand_settings.tenant_id
        AND tenants.status IN ('ACTIVE', 'PROVISIONING')
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY tenant_brand_settings_admin_insert ON tenant_brand_settings
  FOR INSERT
  WITH CHECK (
    updated_by_user_id = current_setting('app.user_id', true)
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = tenant_brand_settings.tenant_id
        AND tenants.status IN ('ACTIVE', 'PROVISIONING')
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND memberships.role = 'TENANT_ADMIN'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY tenant_brand_settings_admin_update ON tenant_brand_settings
  FOR UPDATE
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = tenant_brand_settings.tenant_id
        AND tenants.status IN ('ACTIVE', 'PROVISIONING')
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND memberships.role = 'TENANT_ADMIN'
        AND users.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    updated_by_user_id = current_setting('app.user_id', true)
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = tenant_brand_settings.tenant_id
        AND tenants.status IN ('ACTIVE', 'PROVISIONING')
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND memberships.role = 'TENANT_ADMIN'
        AND users.status = 'ACTIVE'
    )
  );
