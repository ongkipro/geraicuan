-- T-157 (PR-46/PR-47): an outlet's Mengantar pickup addresses become a list.
-- Each row keeps the provider `pickup_address_id`, the origin area Mengantar
-- derives from it, and whether it is the outlet's default. `outlets.default_*`
-- stays as the denormalized mirror of the default row, so readiness, estimates
-- and order submission keep reading one authoritative pair.
CREATE TABLE "outlet_pickup_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"pickup_address_id" text NOT NULL,
	"pickup_address_label" text NOT NULL,
	"origin_area_id" text NOT NULL,
	"origin_area_label" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outlet_pickup_points_outlet_address_key" UNIQUE("tenant_id","outlet_id","pickup_address_id"),
	CONSTRAINT "outlet_pickup_points_pickup_address_id_valid" CHECK (char_length(btrim(pickup_address_id)) BETWEEN 1 AND 160),
	CONSTRAINT "outlet_pickup_points_origin_area_id_valid" CHECK (char_length(btrim(origin_area_id)) BETWEEN 1 AND 160),
	CONSTRAINT "outlet_pickup_points_pickup_label_valid" CHECK (char_length(btrim(pickup_address_label)) BETWEEN 1 AND 320),
	CONSTRAINT "outlet_pickup_points_origin_label_valid" CHECK (char_length(btrim(origin_area_label)) BETWEEN 1 AND 320)
);--> statement-breakpoint
ALTER TABLE "outlet_pickup_points" ADD CONSTRAINT "outlet_pickup_points_outlet_tenant_fkey" FOREIGN KEY ("outlet_id","tenant_id") REFERENCES "public"."outlets"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outlet_pickup_points_tenant_outlet_idx" ON "outlet_pickup_points" USING btree ("tenant_id","outlet_id");--> statement-breakpoint
-- At most one default per outlet, enforced by the database rather than by the
-- repository remembering to clear the previous default first.
CREATE UNIQUE INDEX "outlet_pickup_points_one_default_per_outlet" ON "outlet_pickup_points" USING btree ("tenant_id","outlet_id") WHERE "is_default";--> statement-breakpoint
-- Conversion: every outlet that already had a complete pickup pair becomes one
-- default pickup point. An outlet with an incomplete pair (a pre-label row, or
-- no pickup at all) converts to zero rows and stays "needs attention", which is
-- what it already was.
INSERT INTO "outlet_pickup_points" (
	"tenant_id", "outlet_id", "pickup_address_id", "pickup_address_label",
	"origin_area_id", "origin_area_label", "is_default", "created_at", "updated_at"
)
SELECT
	"tenant_id", "id", btrim("default_pickup_address_id"), btrim("default_pickup_address_label"),
	btrim("default_origin_area_id"), btrim("default_origin_area_label"), true, "updated_at", "updated_at"
FROM "outlets"
WHERE "default_pickup_address_id" IS NOT NULL
	AND "default_pickup_address_label" IS NOT NULL
	AND "default_origin_area_id" IS NOT NULL
	AND "default_origin_area_label" IS NOT NULL;--> statement-breakpoint
REVOKE ALL ON "outlet_pickup_points" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "outlet_pickup_points" TO geraicuan_app;--> statement-breakpoint
-- Identity and ownership columns stay unwritable: a pickup point can be
-- relabelled and promoted, never moved to another tenant or outlet.
GRANT UPDATE ("pickup_address_label", "origin_area_id", "origin_area_label", "is_default", "updated_at") ON "outlet_pickup_points" TO geraicuan_app;--> statement-breakpoint
ALTER TABLE "outlet_pickup_points" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outlet_pickup_points" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "outlet_pickup_points_active_tenant_select" ON "outlet_pickup_points"
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = outlet_pickup_points.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "outlet_pickup_points_active_tenant_insert" ON "outlet_pickup_points"
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = outlet_pickup_points.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "outlet_pickup_points_active_tenant_update" ON "outlet_pickup_points"
  FOR UPDATE
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = outlet_pickup_points.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );--> statement-breakpoint
CREATE POLICY "outlet_pickup_points_active_tenant_delete" ON "outlet_pickup_points"
  FOR DELETE
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = outlet_pickup_points.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
-- The pickup point chosen for one shipment, snapshotted beside the destination
-- area. NULL is a pre-T-157 draft: it falls back to the outlet default.
ALTER TABLE "shipment_drafts" ADD COLUMN "pickup_address_id" text;--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD COLUMN "origin_area_id" text;--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_pickup_point_complete" CHECK ((pickup_address_id IS NULL) = (origin_area_id IS NULL));--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_pickup_address_id_valid" CHECK (pickup_address_id IS NULL
        OR char_length(btrim(pickup_address_id)) BETWEEN 1 AND 160);--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_origin_area_id_valid" CHECK (origin_area_id IS NULL
        OR char_length(btrim(origin_area_id)) BETWEEN 1 AND 160);
