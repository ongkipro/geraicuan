CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_tenant_user_key" UNIQUE("tenant_id","user_id"),
	CONSTRAINT "memberships_role_valid" CHECK (role IN ('TENANT_ADMIN', 'OPERATOR'))
);
--> statement-breakpoint
CREATE TABLE "outlets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outlets_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "outlets_name_not_blank" CHECK (char_length(btrim(name)) > 0)
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "shipments_status_valid" CHECK (status IN (
        'DRAFT',
        'ESTIMATED',
        'SUBMISSION_QUEUED',
        'SUBMISSION_UNKNOWN',
        'ISSUED',
        'AWAITING_UPSTREAM_PAYMENT',
        'FAILED'
      ))
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'PROVISIONING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_name_not_blank" CHECK (char_length(btrim(name)) > 0),
	CONSTRAINT "tenants_status_valid" CHECK (status IN ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_outlet_tenant_fkey" FOREIGN KEY ("outlet_id","tenant_id") REFERENCES "public"."outlets"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_user_tenant_idx" ON "memberships" USING btree ("user_id","tenant_id");--> statement-breakpoint
CREATE INDEX "outlets_tenant_idx" ON "outlets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "shipments_tenant_outlet_idx" ON "shipments" USING btree ("tenant_id","outlet_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'geraicuan_app') THEN
    CREATE ROLE geraicuan_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint
REVOKE ALL ON tenants, memberships, outlets, shipments FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO geraicuan_app;--> statement-breakpoint
GRANT SELECT ON tenants, memberships TO geraicuan_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON outlets, shipments TO geraicuan_app;--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outlets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outlets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shipments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "memberships_current_user" ON "memberships"
  FOR SELECT
  USING ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "tenants_current_user" ON "tenants"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.tenant_id = tenants.id
        AND memberships.user_id = current_setting('app.user_id', true)
    )
  );--> statement-breakpoint
CREATE POLICY "outlets_active_tenant" ON "outlets"
  USING (
    "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM tenants
      WHERE tenants.id = outlets.tenant_id
        AND tenants.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM tenants
      WHERE tenants.id = outlets.tenant_id
        AND tenants.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "shipments_active_tenant" ON "shipments"
  USING (
    "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM tenants
      WHERE tenants.id = shipments.tenant_id
        AND tenants.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM tenants
      WHERE tenants.id = shipments.tenant_id
        AND tenants.status = 'ACTIVE'
    )
  );