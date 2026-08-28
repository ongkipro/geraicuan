CREATE TABLE "mengantar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"secret_reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mengantar_connections_outlet_id_unique" UNIQUE("outlet_id"),
	CONSTRAINT "mengantar_connections_outlet_tenant_key" UNIQUE("outlet_id","tenant_id"),
	CONSTRAINT "mengantar_connections_secret_reference_not_blank" CHECK (char_length(btrim(secret_reference)) > 0)
);
--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "default_pickup_address_id" text;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "default_origin_area_id" text;--> statement-breakpoint
ALTER TABLE "mengantar_connections" ADD CONSTRAINT "mengantar_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mengantar_connections" ADD CONSTRAINT "mengantar_connections_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON mengantar_connections TO geraicuan_app;--> statement-breakpoint
ALTER TABLE mengantar_connections ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE mengantar_connections FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mengantar_connections_active_tenant" ON mengantar_connections
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM memberships
      JOIN users ON users.id = memberships.user_id
      JOIN tenants ON tenants.id = memberships.tenant_id
      WHERE memberships.tenant_id = mengantar_connections.tenant_id
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
        AND tenants.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM memberships
      JOIN users ON users.id = memberships.user_id
      JOIN tenants ON tenants.id = memberships.tenant_id
      WHERE memberships.tenant_id = mengantar_connections.tenant_id
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
        AND tenants.status = 'ACTIVE'
    )
    AND EXISTS (
      SELECT 1 FROM outlets
      WHERE outlets.id = mengantar_connections.outlet_id
        AND outlets.tenant_id = mengantar_connections.tenant_id
    )
  );