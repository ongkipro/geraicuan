CREATE TABLE "contact_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"destination_area_id" text,
	"destination_area_label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_addresses_contact_label_key" UNIQUE("contact_id","label"),
	CONSTRAINT "contact_addresses_label_not_blank" CHECK (char_length(btrim(label)) > 0),
	CONSTRAINT "contact_addresses_address_not_blank" CHECK (char_length(btrim(address)) > 0),
	CONSTRAINT "contact_addresses_area_pair" CHECK ((destination_area_id IS NULL AND destination_area_label IS NULL)
        OR (
          char_length(btrim(destination_area_id)) BETWEEN 1 AND 160
          AND char_length(btrim(destination_area_label)) BETWEEN 1 AND 160
        ))
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"is_recipient" boolean DEFAULT true NOT NULL,
	"is_sender" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "contacts_name_not_blank" CHECK (char_length(btrim(name)) > 0),
	CONSTRAINT "contacts_phone_not_blank" CHECK (char_length(btrim(phone)) > 0),
	CONSTRAINT "contacts_has_role" CHECK (is_sender OR is_recipient)
);
--> statement-breakpoint
ALTER TABLE "contact_addresses" ADD CONSTRAINT "contact_addresses_contact_tenant_fkey" FOREIGN KEY ("contact_id","tenant_id") REFERENCES "public"."contacts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_addresses_tenant_contact_idx" ON "contact_addresses" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE INDEX "contacts_tenant_archived_name_idx" ON "contacts" USING btree ("tenant_id","archived_at","name");
--> statement-breakpoint
REVOKE ALL ON contacts, contact_addresses FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON contacts, contact_addresses TO geraicuan_app;--> statement-breakpoint
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE contact_addresses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE contact_addresses FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contacts_active_tenant" ON contacts
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = contacts.tenant_id
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
      WHERE tenants.id = contacts.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "contact_addresses_active_tenant" ON contact_addresses
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = contact_addresses.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = contact_addresses.contact_id
        AND contacts.tenant_id = contact_addresses.tenant_id
    )
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = contact_addresses.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );