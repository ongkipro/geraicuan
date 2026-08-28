ALTER TABLE users ADD CONSTRAINT "users_status_valid" CHECK (status IN ('ACTIVE', 'SUSPENDED'));--> statement-breakpoint
DROP POLICY "memberships_current_user" ON memberships;--> statement-breakpoint
DROP POLICY "tenants_current_user" ON tenants;--> statement-breakpoint
DROP POLICY "outlets_active_tenant" ON outlets;--> statement-breakpoint
DROP POLICY "shipments_active_tenant" ON shipments;--> statement-breakpoint
CREATE POLICY "memberships_current_user" ON memberships
  FOR SELECT
  USING (
    user_id = current_setting('app.user_id', true)
    AND status = 'ACTIVE'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = memberships.user_id AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "tenants_current_user" ON tenants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      JOIN users ON users.id = memberships.user_id
      WHERE memberships.tenant_id = tenants.id
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "outlets_active_tenant" ON outlets
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = outlets.tenant_id
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
      WHERE tenants.id = outlets.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
CREATE POLICY "shipments_active_tenant" ON shipments
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipments.tenant_id
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
      WHERE tenants.id = shipments.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
