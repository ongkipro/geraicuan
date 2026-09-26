-- T-245 (DATA-22, D-32): Kemendagri wilayah reference for fast destination-area suggestions.
-- Additive: one new tenant-neutral table; no existing row or policy is touched. The rows are loaded
-- afterwards by `npm run wilayah:import` (owner role, one transaction), never by this migration.
-- The data only SUGGESTS: a Mengantar area id from a live provider search remains the sole
-- destination authority, and nothing tenant-owned references this table.
-- pg_trgm is a trusted extension on PostgreSQL 13+ (a database owner with CREATE may install it);
-- its availability on the production Coolify Postgres is a release gate (RELEASE.md), not assumed.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "wilayah_areas" (
	"code" text PRIMARY KEY NOT NULL,
	"level" smallint NOT NULL,
	"district_code" text NOT NULL,
	"regency_code" text NOT NULL,
	"village_name" text,
	"village_kind" text,
	"district_name" text NOT NULL,
	"regency_name" text NOT NULL,
	"regency_kind" text NOT NULL,
	"province_name" text NOT NULL,
	"postal_code" text,
	"search_text" text NOT NULL,
	"name_search" text NOT NULL,
	"district_search" text NOT NULL,
	"dataset_version" text NOT NULL,
	CONSTRAINT "wilayah_areas_level_valid" CHECK (level IN (3, 4)),
	CONSTRAINT "wilayah_areas_level_shape" CHECK ((level = 3 AND code = district_code AND village_name IS NULL AND village_kind IS NULL AND postal_code IS NULL)
        OR (level = 4 AND left(code, 8) = district_code AND village_name IS NOT NULL AND village_kind IS NOT NULL)),
	CONSTRAINT "wilayah_areas_code_valid" CHECK (code ~ '^[0-9]{2}\.[0-9]{2}\.[0-9]{2}(\.[0-9]{4})?$' AND left(district_code, 5) = regency_code),
	CONSTRAINT "wilayah_areas_village_kind_valid" CHECK (village_kind IS NULL OR village_kind IN ('KELURAHAN', 'DESA')),
	CONSTRAINT "wilayah_areas_regency_kind_valid" CHECK (regency_kind IN ('KAB', 'KOTA')),
	CONSTRAINT "wilayah_areas_postal_code_valid" CHECK (postal_code IS NULL OR postal_code ~ '^[1-9][0-9]{4}$'),
	CONSTRAINT "wilayah_areas_search_text_valid" CHECK (search_text ~ '^( [a-z0-9]+)+$' AND char_length(search_text) <= 400)
);
--> statement-breakpoint
CREATE INDEX "wilayah_areas_search_trgm_idx" ON "wilayah_areas" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "wilayah_areas_postal_idx" ON "wilayah_areas" USING btree ("postal_code") WHERE postal_code IS NOT NULL;
--> statement-breakpoint
REVOKE ALL ON wilayah_areas FROM PUBLIC;
--> statement-breakpoint
-- The runtime role reads the reference and can never write it.
GRANT SELECT ON wilayah_areas TO geraicuan_app;
--> statement-breakpoint
ALTER TABLE wilayah_areas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE wilayah_areas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Public reference data: every row is readable; there is no tenant scope to enforce (spec 06).
CREATE POLICY wilayah_areas_read ON wilayah_areas FOR SELECT USING (true);
--> statement-breakpoint
-- Only the table owner (the migration role that runs the import) writes, even under FORCE RLS;
-- any other role is refused by policy as well as by the missing grant.
CREATE POLICY wilayah_areas_owner_write ON wilayah_areas
  AS PERMISSIVE FOR ALL TO public
  USING (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid = 'public.wilayah_areas'::regclass))
  WITH CHECK (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid = 'public.wilayah_areas'::regclass));
