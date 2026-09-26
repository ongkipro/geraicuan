-- T-229 / PR-86: per-size label field choices (Pengaturan -> Informasi label).
-- Additive: one new table, no existing row touched. A tenant without a row prints
-- the defaults, which equal the label before this migration. Both roles read (every
-- label print applies the choice); only an active Tenant Admin of the current tenant
-- inserts or updates (RLS below, and the Server Action checks the role first). No
-- column holds the Mengantar pickup identity: it is never printable (PR-71).
CREATE TABLE "tenant_label_settings" (
	"tenant_id" uuid NOT NULL,
	"label_size" text NOT NULL,
	"show_sender_address" boolean DEFAULT true NOT NULL,
	"show_sender_phone" boolean DEFAULT true NOT NULL,
	"show_recipient_name" boolean DEFAULT true NOT NULL,
	"show_recipient_phone" boolean DEFAULT true NOT NULL,
	"show_recipient_address_detail" boolean DEFAULT true NOT NULL,
	"show_return_warning" boolean DEFAULT false NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_label_settings_pkey" PRIMARY KEY("tenant_id","label_size"),
	CONSTRAINT "tenant_label_settings_size_valid" CHECK (label_size IN ('10x15', '10x10')),
	CONSTRAINT "tenant_label_settings_updater_not_blank" CHECK (char_length(btrim(updated_by_user_id)) > 0)
);
--> statement-breakpoint
ALTER TABLE "tenant_label_settings" ADD CONSTRAINT "tenant_label_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
REVOKE ALL ON tenant_label_settings FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON tenant_label_settings TO geraicuan_app;
--> statement-breakpoint
-- The choices and who changed them move; the tenant and the size never do.
GRANT UPDATE (show_sender_address, show_sender_phone, show_recipient_name, show_recipient_phone, show_recipient_address_detail, show_return_warning, updated_by_user_id, updated_at) ON tenant_label_settings TO geraicuan_app;
--> statement-breakpoint
ALTER TABLE tenant_label_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant_label_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_label_settings_member_select ON tenant_label_settings
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = tenant_label_settings.tenant_id
        AND tenants.status IN ('ACTIVE', 'PROVISIONING')
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY tenant_label_settings_admin_insert ON tenant_label_settings
  FOR INSERT
  WITH CHECK (
    updated_by_user_id = current_setting('app.user_id', true)
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = tenant_label_settings.tenant_id
        AND tenants.status IN ('ACTIVE', 'PROVISIONING')
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND memberships.role = 'TENANT_ADMIN'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY tenant_label_settings_admin_update ON tenant_label_settings
  FOR UPDATE
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = tenant_label_settings.tenant_id
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
      WHERE tenants.id = tenant_label_settings.tenant_id
        AND tenants.status IN ('ACTIVE', 'PROVISIONING')
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND memberships.role = 'TENANT_ADMIN'
        AND users.status = 'ACTIVE'
    )
  );
