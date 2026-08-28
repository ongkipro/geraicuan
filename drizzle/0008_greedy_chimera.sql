CREATE TABLE "shipment_drafts" (
	"shipment_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"destination_area_id" text NOT NULL,
	"destination_area_label" text NOT NULL,
	"package_content" text NOT NULL,
	"package_weight_grams" integer NOT NULL,
	"package_quantity" integer NOT NULL,
	"package_length_cm" integer,
	"package_width_cm" integer,
	"package_height_cm" integer,
	"declared_value_idr" integer NOT NULL,
	"is_cod" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_drafts_destination_area_id_valid" CHECK (char_length(btrim(destination_area_id)) BETWEEN 1 AND 160),
	CONSTRAINT "shipment_drafts_destination_area_label_not_blank" CHECK (char_length(btrim(destination_area_label)) > 0),
	CONSTRAINT "shipment_drafts_package_content_not_blank" CHECK (char_length(btrim(package_content)) > 0),
	CONSTRAINT "shipment_drafts_package_weight_grams_positive" CHECK (package_weight_grams > 0),
	CONSTRAINT "shipment_drafts_package_quantity_positive" CHECK (package_quantity > 0),
	CONSTRAINT "shipment_drafts_package_dimensions_valid" CHECK ((package_length_cm IS NULL AND package_width_cm IS NULL AND package_height_cm IS NULL)
        OR (package_length_cm > 0 AND package_width_cm > 0 AND package_height_cm > 0)),
	CONSTRAINT "shipment_drafts_declared_value_idr_nonnegative" CHECK (declared_value_idr >= 0),
	CONSTRAINT "shipment_drafts_cod_declared_value_positive" CHECK (NOT is_cod OR declared_value_idr > 0)
);
--> statement-breakpoint
CREATE TABLE "shipment_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_parties_shipment_role_key" UNIQUE("shipment_id","role"),
	CONSTRAINT "shipment_parties_role_valid" CHECK (role IN ('SENDER', 'RECIPIENT')),
	CONSTRAINT "shipment_parties_name_not_blank" CHECK (char_length(btrim(name)) > 0),
	CONSTRAINT "shipment_parties_phone_not_blank" CHECK (char_length(btrim(phone)) > 0),
	CONSTRAINT "shipment_parties_address_not_blank" CHECK (char_length(btrim(address)) > 0)
);
--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD CONSTRAINT "shipment_drafts_shipment_tenant_fkey" FOREIGN KEY ("shipment_id","tenant_id") REFERENCES "public"."shipments"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_parties" ADD CONSTRAINT "shipment_parties_shipment_tenant_fkey" FOREIGN KEY ("shipment_id","tenant_id") REFERENCES "public"."shipments"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_drafts_tenant_idx" ON "shipment_drafts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "shipment_parties_tenant_shipment_idx" ON "shipment_parties" USING btree ("tenant_id","shipment_id");
--> statement-breakpoint
REVOKE ALL ON shipment_drafts, shipment_parties FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON shipment_drafts TO geraicuan_app;--> statement-breakpoint
GRANT SELECT, INSERT ON shipment_parties TO geraicuan_app;--> statement-breakpoint
ALTER TABLE shipment_drafts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shipment_drafts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shipment_parties ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shipment_parties FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "shipment_drafts_active_tenant" ON shipment_drafts
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_drafts.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_drafts.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "shipment_parties_active_tenant_select" ON shipment_parties
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_parties.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "shipment_parties_active_tenant_insert" ON shipment_parties
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_parties.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );