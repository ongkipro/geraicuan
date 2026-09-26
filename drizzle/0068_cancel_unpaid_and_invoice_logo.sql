-- T-247 (review fixes 2026-09-26). Additive; no applied migration is edited.
-- (M1) Mengantar may cancel an order that is still unpaid: AWAITING_UPSTREAM_PAYMENT -> CANCELLED
-- joins the webhook's transition decision, mirroring ALLOWED_TRANSITIONS in
-- src/lib/provider-delivery-status.ts (the webhook parity test compares every pair).
-- (L3) An issued invoice keeps the logo it was issued with: tenant_logo_versions holds every
-- logo a gerai saved, keyed by (tenant_id, sha256), never updated or deleted by the runtime
-- role; shipment_invoices.logo_sha256 records the version at issuance (NULL = no logo then, or
-- an invoice issued before this migration, which renders no logo). Same RLS shape as
-- tenant_brand_settings (0065): active members of the tenant read, an active Tenant Admin inserts.
CREATE TABLE "tenant_logo_versions" (
	"tenant_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"mime" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_logo_versions_pkey" PRIMARY KEY("tenant_id","sha256"),
	CONSTRAINT "tenant_logo_versions_valid" CHECK (sha256 ~ '^[0-9a-f]{64}$' AND octet_length(bytes) BETWEEN 1 AND 204800 AND mime IN ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "tenant_logo_versions_creator_not_blank" CHECK (char_length(btrim(created_by_user_id)) > 0)
);
--> statement-breakpoint
ALTER TABLE "shipment_invoices" ADD COLUMN "logo_sha256" text;--> statement-breakpoint
ALTER TABLE "tenant_logo_versions" ADD CONSTRAINT "tenant_logo_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_invoices" ADD CONSTRAINT "shipment_invoices_logo_version_fkey" FOREIGN KEY ("tenant_id","logo_sha256") REFERENCES "public"."tenant_logo_versions"("tenant_id","sha256") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Logos already saved become their first version, so an invoice issued from now on can point at them.
INSERT INTO "tenant_logo_versions" (tenant_id, sha256, bytes, mime, created_by_user_id, created_at)
SELECT tenant_id, logo_sha256, logo_bytes, logo_mime, updated_by_user_id, logo_updated_at
FROM "tenant_brand_settings"
WHERE logo_bytes IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
REVOKE ALL ON tenant_logo_versions FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON tenant_logo_versions TO geraicuan_app;
--> statement-breakpoint
ALTER TABLE tenant_logo_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant_logo_versions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_logo_versions_member_select ON tenant_logo_versions
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = tenant_logo_versions.tenant_id
        AND tenants.status IN ('ACTIVE', 'PROVISIONING')
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY tenant_logo_versions_admin_insert ON tenant_logo_versions
  FOR INSERT
  WITH CHECK (
    created_by_user_id = current_setting('app.user_id', true)
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = tenant_logo_versions.tenant_id
        AND tenants.status IN ('ACTIVE', 'PROVISIONING')
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND memberships.role = 'TENANT_ADMIN'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
-- M1: identical to 0063 plus ('AWAITING_UPSTREAM_PAYMENT', 'CANCELLED'). CREATE OR REPLACE keeps
-- the owner and the privileges (0063 revoked it from PUBLIC; only the owner-run webhook function calls it).
CREATE OR REPLACE FUNCTION public.provider_delivery_outcome(current_status text, mapped_status text, recognised boolean)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN NOT recognised THEN 'UNRECOGNISED'
    WHEN mapped_status IS NULL THEN 'NO_LIFECYCLE_STATE'
    WHEN mapped_status = current_status THEN 'UNCHANGED'
    -- A return report behind where the return already stands says nothing new.
    WHEN array_position(ARRAY['RTS_QUEUED', 'RTS_IN_TRANSIT', 'RTS_RECEIVED'], mapped_status)
      <= array_position(ARRAY['RTS_QUEUED', 'RTS_IN_TRANSIT', 'RTS_RECEIVED'], current_status) THEN 'UNCHANGED'
    WHEN (current_status, mapped_status) IN (
      ('ISSUED', 'IN_TRANSIT'), ('ISSUED', 'PROBLEM'), ('ISSUED', 'DELIVERED'), ('ISSUED', 'RTS_QUEUED'), ('ISSUED', 'RTS_IN_TRANSIT'),
      ('ISSUED', 'CANCELLED'), ('IN_TRANSIT', 'CANCELLED'), ('PROBLEM', 'CANCELLED'), ('AWAITING_UPSTREAM_PAYMENT', 'CANCELLED'),
      ('AWAITING_UPSTREAM_PAYMENT', 'IN_TRANSIT'), ('AWAITING_UPSTREAM_PAYMENT', 'PROBLEM'), ('AWAITING_UPSTREAM_PAYMENT', 'DELIVERED'),
      ('AWAITING_UPSTREAM_PAYMENT', 'RTS_QUEUED'), ('AWAITING_UPSTREAM_PAYMENT', 'RTS_IN_TRANSIT'),
      ('IN_TRANSIT', 'PROBLEM'), ('IN_TRANSIT', 'DELIVERED'), ('IN_TRANSIT', 'RTS_QUEUED'), ('IN_TRANSIT', 'RTS_IN_TRANSIT'),
      ('PROBLEM', 'DELIVERED'), ('PROBLEM', 'RTS_QUEUED'), ('PROBLEM', 'RTS_IN_TRANSIT'),
      ('RTS_QUEUED', 'RTS_IN_TRANSIT'), ('RTS_QUEUED', 'RTS_RECEIVED'),
      ('RTS_IN_TRANSIT', 'RTS_RECEIVED')
    ) THEN 'APPLIED'
    ELSE 'REFUSED'
  END
$$;
