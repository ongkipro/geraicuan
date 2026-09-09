REVOKE ALL ON shipment_rts_events FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT ON shipment_rts_events TO geraicuan_app;--> statement-breakpoint
ALTER TABLE shipment_rts_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shipment_rts_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "shipment_rts_events_active_tenant_select" ON shipment_rts_events
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_rts_events.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "shipment_rts_events_active_tenant_insert" ON shipment_rts_events
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_rts_events.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
