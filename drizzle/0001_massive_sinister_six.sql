CREATE TABLE "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" text NOT NULL,
  "tenant_id" uuid,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "outcome" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "audit_events_target_type_valid" CHECK (target_type = 'TENANT'),
  CONSTRAINT "audit_events_action_valid" CHECK (action IN ('TENANT_CREATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED'))
);
--> statement-breakpoint
CREATE TABLE "platform_roles" (
  "user_id" text PRIMARY KEY NOT NULL,
  "role" text DEFAULT 'SUPER_ADMIN' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_roles_role_valid" CHECK (role = 'SUPER_ADMIN')
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD CONSTRAINT "platform_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_actor_created_idx" ON "audit_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_created_idx" ON "audit_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
GRANT SELECT ON platform_roles TO geraicuan_app;--> statement-breakpoint
GRANT INSERT, UPDATE ON tenants TO geraicuan_app;--> statement-breakpoint
GRANT INSERT ON audit_events TO geraicuan_app;--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE platform_roles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE platform_roles FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "platform_roles_self_read" ON platform_roles FOR SELECT
  USING (user_id = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "tenants_platform_admin_write" ON tenants FOR INSERT
  WITH CHECK (current_setting('app.platform_admin', true) = 'true');--> statement-breakpoint
CREATE POLICY "tenants_platform_admin_update" ON tenants FOR UPDATE
  USING (current_setting('app.platform_admin', true) = 'true')
  WITH CHECK (current_setting('app.platform_admin', true) = 'true');--> statement-breakpoint
--> statement-breakpoint
CREATE POLICY "tenants_platform_admin_read" ON tenants FOR SELECT
  USING (current_setting('app.platform_admin', true) = 'true');
--> statement-breakpoint
CREATE POLICY "audit_events_append" ON audit_events FOR INSERT
  WITH CHECK (
    actor_id IS NOT DISTINCT FROM NULLIF(current_setting('app.user_id', true), '')
  );
