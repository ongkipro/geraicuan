CREATE TABLE "shipment_rate_limits" (
	"tenant_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"operation" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "shipment_rate_limits_tenant_actor_operation_pk" PRIMARY KEY("tenant_id","actor_id","operation"),
	CONSTRAINT "shipment_rate_limits_operation_valid" CHECK (operation IN ('estimate', 'order-submit', 'bulk-import')),
	CONSTRAINT "shipment_rate_limits_count_positive" CHECK (count > 0)
);
--> statement-breakpoint
ALTER TABLE "shipment_rate_limits" ADD CONSTRAINT "shipment_rate_limits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_rate_limits" ADD CONSTRAINT "shipment_rate_limits_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
REVOKE ALL ON shipment_rate_limits FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON shipment_rate_limits TO geraicuan_app;--> statement-breakpoint
ALTER TABLE shipment_rate_limits ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shipment_rate_limits FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "shipment_rate_limits_active_actor" ON shipment_rate_limits
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_id = NULLIF(current_setting('app.user_id', true), '')
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_rate_limits.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = shipment_rate_limits.actor_id
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_id = NULLIF(current_setting('app.user_id', true), '')
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_rate_limits.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = shipment_rate_limits.actor_id
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );