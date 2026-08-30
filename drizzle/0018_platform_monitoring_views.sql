ALTER TABLE audit_events DROP CONSTRAINT audit_events_action_valid;
--> statement-breakpoint
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_action_valid
  CHECK (
    action IN (
      'TENANT_CREATED',
      'TENANT_SUSPENDED',
      'TENANT_REACTIVATED',
      'PLATFORM_MONITORING_VIEWED'
    )
  );
--> statement-breakpoint
ALTER TABLE audit_events DROP CONSTRAINT audit_events_target_type_valid;
--> statement-breakpoint
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_target_type_valid
  CHECK (target_type IN ('TENANT', 'PLATFORM'));
--> statement-breakpoint
CREATE VIEW platform_monitoring_tenant
WITH (security_barrier = true)
AS
SELECT
  id,
  name,
  status,
  created_at,
  updated_at
FROM tenants
WHERE current_setting('app.platform_admin', true) = 'true';
--> statement-breakpoint
CREATE VIEW platform_monitoring_outlet
WITH (security_barrier = true)
AS
SELECT
  id,
  tenant_id,
  name,
  default_pickup_address_id IS NOT NULL AS has_pickup,
  default_origin_area_id IS NOT NULL AS has_origin,
  created_at,
  updated_at
FROM outlets
WHERE current_setting('app.platform_admin', true) = 'true';
--> statement-breakpoint
CREATE VIEW platform_monitoring_membership
WITH (security_barrier = true)
AS
SELECT
  tenant_id,
  user_id,
  role,
  status
FROM memberships
WHERE current_setting('app.platform_admin', true) = 'true';
--> statement-breakpoint
CREATE VIEW platform_monitoring_shipment
WITH (security_barrier = true)
AS
SELECT
  id,
  tenant_id,
  outlet_id,
  status,
  created_at,
  updated_at
FROM shipments
WHERE current_setting('app.platform_admin', true) = 'true';
--> statement-breakpoint
CREATE VIEW platform_monitoring_estimate
WITH (security_barrier = true)
AS
SELECT
  id,
  tenant_id,
  outlet_id,
  shipment_id,
  retrieved_at AS created_at
FROM shipment_estimate_snapshots
WHERE current_setting('app.platform_admin', true) = 'true';
--> statement-breakpoint
CREATE VIEW platform_monitoring_provider_batch
WITH (security_barrier = true)
AS
SELECT
  id,
  tenant_id,
  outlet_id,
  courier,
  credential_source,
  status,
  safe_error_code,
  submission_attempted_at,
  completed_at,
  created_at,
  updated_at,
  dense_rank() OVER (ORDER BY provider_account_key) AS provider_account_bucket
FROM provider_batches
WHERE current_setting('app.platform_admin', true) = 'true';
--> statement-breakpoint
CREATE VIEW platform_monitoring_provider_order
WITH (security_barrier = true)
AS
SELECT
  id,
  tenant_id,
  batch_id,
  shipment_id,
  status,
  is_cod,
  is_paid,
  safe_response_code,
  resolved_at,
  created_at
FROM provider_order_snapshots
WHERE current_setting('app.platform_admin', true) = 'true';
--> statement-breakpoint
CREATE VIEW platform_monitoring_unpaid_recovery
WITH (security_barrier = true)
AS
SELECT
  id,
  tenant_id,
  batch_id,
  provider_order_snapshot_id,
  status,
  safe_response_code,
  attempted_at,
  completed_at,
  created_at
FROM provider_unpaid_recoveries
WHERE current_setting('app.platform_admin', true) = 'true';
--> statement-breakpoint
CREATE VIEW platform_monitoring_connection_health
WITH (security_barrier = true)
AS
SELECT
  tenant_id,
  outlet_id,
  created_at,
  updated_at
FROM mengantar_connections
WHERE current_setting('app.platform_admin', true) = 'true';
--> statement-breakpoint
CREATE VIEW platform_monitoring_audit_event
WITH (security_barrier = true)
AS
SELECT
  id,
  actor_id,
  actor_role,
  tenant_id,
  action,
  target_type,
  target_id,
  outcome,
  from_status,
  to_status,
  created_at
FROM audit_events
WHERE current_setting('app.platform_admin', true) = 'true';
--> statement-breakpoint
REVOKE ALL ON
  platform_monitoring_tenant,
  platform_monitoring_outlet,
  platform_monitoring_membership,
  platform_monitoring_shipment,
  platform_monitoring_estimate,
  platform_monitoring_provider_batch,
  platform_monitoring_provider_order,
  platform_monitoring_unpaid_recovery,
  platform_monitoring_connection_health,
  platform_monitoring_audit_event
FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON
  platform_monitoring_tenant,
  platform_monitoring_outlet,
  platform_monitoring_membership,
  platform_monitoring_shipment,
  platform_monitoring_estimate,
  platform_monitoring_provider_batch,
  platform_monitoring_provider_order,
  platform_monitoring_unpaid_recovery,
  platform_monitoring_connection_health,
  platform_monitoring_audit_event
TO geraicuan_app;