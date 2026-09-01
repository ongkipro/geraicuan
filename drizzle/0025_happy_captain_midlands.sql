CREATE TABLE "managed_secret_payloads" (
	"reference" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"purpose" text DEFAULT 'MENGANTAR_API_KEY' NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"authentication_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "managed_secret_payloads_outlet_purpose_key" UNIQUE("tenant_id","outlet_id","purpose"),
	CONSTRAINT "managed_secret_payloads_purpose_valid" CHECK (purpose = 'MENGANTAR_API_KEY'),
	CONSTRAINT "managed_secret_payloads_envelope_not_blank" CHECK (char_length(btrim(reference)) > 0
        AND char_length(btrim(ciphertext)) > 0
        AND char_length(btrim(nonce)) > 0
        AND char_length(btrim(authentication_tag)) > 0),
	CONSTRAINT "managed_secret_payloads_key_version_valid" CHECK (key_version = 1)
);
--> statement-breakpoint
CREATE TABLE "mengantar_credential_rate_limits" (
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "mengantar_credential_rate_limits_tenant_outlet_actor_pk" PRIMARY KEY("tenant_id","outlet_id","actor_id"),
	CONSTRAINT "mengantar_credential_rate_limits_count_positive" CHECK (count > 0)
);
--> statement-breakpoint
ALTER TABLE "managed_secret_payloads" ADD CONSTRAINT "managed_secret_payloads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_secret_payloads" ADD CONSTRAINT "managed_secret_payloads_outlet_tenant_fkey" FOREIGN KEY ("outlet_id","tenant_id") REFERENCES "public"."outlets"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mengantar_credential_rate_limits" ADD CONSTRAINT "mengantar_credential_rate_limits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mengantar_credential_rate_limits" ADD CONSTRAINT "mengantar_credential_rate_limits_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mengantar_credential_rate_limits" ADD CONSTRAINT "mengantar_credential_rate_limits_outlet_tenant_fkey" FOREIGN KEY ("outlet_id","tenant_id") REFERENCES "public"."outlets"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_valid";--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_valid" CHECK (action IN (
  'TENANT_CREATED',
  'TENANT_SUSPENDED',
  'TENANT_REACTIVATED',
  'PLATFORM_MONITORING_VIEWED',
  'MEMBER_INVITED',
  'MEMBER_ROLE_CHANGED',
  'MEMBER_DEACTIVATED',
  'OUTLET_SETTINGS_CHANGED',
  'MENGANTAR_CREDENTIAL_CREATED',
  'MENGANTAR_CREDENTIAL_REPLACED',
  'MENGANTAR_PLATFORM_DEFAULT_RESTORED'
));--> statement-breakpoint
REVOKE ALL ON managed_secret_payloads, mengantar_credential_rate_limits FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON managed_secret_payloads TO geraicuan_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON mengantar_credential_rate_limits TO geraicuan_app;--> statement-breakpoint
GRANT DELETE ON mengantar_connections TO geraicuan_app;--> statement-breakpoint
ALTER TABLE managed_secret_payloads ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE managed_secret_payloads FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE mengantar_credential_rate_limits ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE mengantar_credential_rate_limits FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY "mengantar_connections_active_tenant" ON mengantar_connections;--> statement-breakpoint
CREATE POLICY "mengantar_connections_active_tenant_select" ON mengantar_connections
  FOR SELECT
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
  );--> statement-breakpoint
CREATE POLICY "mengantar_connections_tenant_admin_insert" ON mengantar_connections
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM memberships
      JOIN users ON users.id = memberships.user_id
      JOIN tenants ON tenants.id = memberships.tenant_id
      WHERE memberships.tenant_id = mengantar_connections.tenant_id
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
        AND tenants.status = 'ACTIVE'
    )
    AND EXISTS (
      SELECT 1 FROM outlets
      WHERE outlets.id = mengantar_connections.outlet_id
        AND outlets.tenant_id = mengantar_connections.tenant_id
    )
  );--> statement-breakpoint
CREATE POLICY "mengantar_connections_tenant_admin_update" ON mengantar_connections
  FOR UPDATE
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM memberships
      JOIN users ON users.id = memberships.user_id
      JOIN tenants ON tenants.id = memberships.tenant_id
      WHERE memberships.tenant_id = mengantar_connections.tenant_id
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
        AND tenants.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM outlets
      WHERE outlets.id = mengantar_connections.outlet_id
        AND outlets.tenant_id = mengantar_connections.tenant_id
    )
  );--> statement-breakpoint
CREATE POLICY "mengantar_connections_tenant_admin_delete" ON mengantar_connections
  FOR DELETE
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM memberships
      JOIN users ON users.id = memberships.user_id
      JOIN tenants ON tenants.id = memberships.tenant_id
      WHERE memberships.tenant_id = mengantar_connections.tenant_id
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
        AND tenants.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "managed_secret_payloads_active_tenant_select" ON managed_secret_payloads
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM memberships
      JOIN users ON users.id = memberships.user_id
      JOIN tenants ON tenants.id = memberships.tenant_id
      WHERE memberships.tenant_id = managed_secret_payloads.tenant_id
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
        AND tenants.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "managed_secret_payloads_tenant_admin_insert" ON managed_secret_payloads
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM memberships
      JOIN users ON users.id = memberships.user_id
      JOIN tenants ON tenants.id = memberships.tenant_id
      WHERE memberships.tenant_id = managed_secret_payloads.tenant_id
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
        AND tenants.status = 'ACTIVE'
    )
    AND EXISTS (
      SELECT 1 FROM outlets
      WHERE outlets.id = managed_secret_payloads.outlet_id
        AND outlets.tenant_id = managed_secret_payloads.tenant_id
    )
  );--> statement-breakpoint
CREATE POLICY "managed_secret_payloads_tenant_admin_update" ON managed_secret_payloads
  FOR UPDATE
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.tenant_id = managed_secret_payloads.tenant_id
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM outlets
      WHERE outlets.id = managed_secret_payloads.outlet_id
        AND outlets.tenant_id = managed_secret_payloads.tenant_id
    )
  );--> statement-breakpoint
CREATE POLICY "managed_secret_payloads_tenant_admin_delete" ON managed_secret_payloads
  FOR DELETE
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.tenant_id = managed_secret_payloads.tenant_id
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "mengantar_credential_rate_limits_tenant_admin" ON mengantar_credential_rate_limits
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_id = current_setting('app.user_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships
      JOIN users ON users.id = memberships.user_id
      JOIN tenants ON tenants.id = memberships.tenant_id
      WHERE memberships.tenant_id = mengantar_credential_rate_limits.tenant_id
        AND memberships.user_id = mengantar_credential_rate_limits.actor_id
        AND memberships.role = 'TENANT_ADMIN'
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
        AND tenants.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_id = current_setting('app.user_id', true)
    AND EXISTS (
      SELECT 1 FROM outlets
      WHERE outlets.id = mengantar_credential_rate_limits.outlet_id
        AND outlets.tenant_id = mengantar_credential_rate_limits.tenant_id
    )
  );--> statement-breakpoint
CREATE POLICY "audit_events_mengantar_credential_guard" ON audit_events
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    action NOT IN (
      'MENGANTAR_CREDENTIAL_CREATED',
      'MENGANTAR_CREDENTIAL_REPLACED',
      'MENGANTAR_PLATFORM_DEFAULT_RESTORED'
    )
    OR (
      actor_role = 'TENANT_MEMBER'
      AND outcome = 'SUCCESS'
      AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      AND target_type = 'OUTLET'
      AND EXISTS (
        SELECT 1
        FROM memberships
        JOIN users ON users.id = memberships.user_id
        JOIN tenants ON tenants.id = memberships.tenant_id
        JOIN outlets ON outlets.tenant_id = memberships.tenant_id
        WHERE memberships.tenant_id = audit_events.tenant_id
          AND memberships.user_id = current_setting('app.user_id', true)
          AND memberships.role = 'TENANT_ADMIN'
          AND memberships.status = 'ACTIVE'
          AND users.status = 'ACTIVE'
          AND tenants.status = 'ACTIVE'
          AND outlets.id::text = audit_events.target_id
      )
      AND (
        (
          action = 'MENGANTAR_CREDENTIAL_CREATED'
          AND metadata = '{"connectionSource":"private","credentialChange":"created"}'::jsonb
        )
        OR (
          action = 'MENGANTAR_CREDENTIAL_REPLACED'
          AND metadata = '{"connectionSource":"private","credentialChange":"replaced"}'::jsonb
        )
        OR (
          action = 'MENGANTAR_PLATFORM_DEFAULT_RESTORED'
          AND metadata = '{"connectionSource":"platform_default","credentialChange":"removed"}'::jsonb
        )
      )
    )
  );
