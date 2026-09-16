-- T-157 review: an outlet can hold several pickup points and the estimate is
-- taken at the chosen one's origin, but these three INSERT policies still
-- required the snapshot's origin to equal the outlet default. The application
-- moved to coalesce(shipment_drafts.origin_area_id, outlets.default_origin_area_id);
-- row-level security did not, so a COD order from a non-default pickup point was
-- refused by the database itself. Every policy already joins shipment_drafts, so
-- only the one predicate changes; nothing else about them moves.

DROP POLICY IF EXISTS "shipment_estimate_snapshots_active_tenant_insert" ON shipment_estimate_snapshots;--> statement-breakpoint
CREATE POLICY "shipment_estimate_snapshots_active_tenant_insert" ON shipment_estimate_snapshots
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM shipments
      JOIN shipment_drafts
        ON shipment_drafts.shipment_id = shipments.id
        AND shipment_drafts.tenant_id = shipments.tenant_id
      JOIN outlets
        ON outlets.id = shipments.outlet_id
        AND outlets.tenant_id = shipments.tenant_id
      WHERE shipments.id = shipment_estimate_snapshots.shipment_id
        AND shipments.tenant_id = shipment_estimate_snapshots.tenant_id
        AND shipments.outlet_id = shipment_estimate_snapshots.outlet_id
        AND shipments.status IN ('DRAFT', 'ESTIMATED')
        AND shipment_estimate_snapshots.origin_area_id = coalesce(shipment_drafts.origin_area_id, outlets.default_origin_area_id)
        AND shipment_estimate_snapshots.destination_area_id = shipment_drafts.destination_area_id
        AND shipment_estimate_snapshots.destination_area_label = shipment_drafts.destination_area_label
        AND shipment_estimate_snapshots.weight_grams = shipment_drafts.package_weight_grams
        AND shipment_estimate_snapshots.is_cod_requested = shipment_drafts.is_cod
        AND (
          (
            shipment_estimate_snapshots.credential_source = 'platform_default'
            AND NOT EXISTS (
              SELECT 1 FROM mengantar_connections
              WHERE mengantar_connections.tenant_id = shipment_estimate_snapshots.tenant_id
                AND mengantar_connections.outlet_id = shipment_estimate_snapshots.outlet_id
            )
          ) OR (
            shipment_estimate_snapshots.credential_source = 'private'
            AND EXISTS (
              SELECT 1 FROM mengantar_connections
              WHERE mengantar_connections.tenant_id = shipment_estimate_snapshots.tenant_id
                AND mengantar_connections.outlet_id = shipment_estimate_snapshots.outlet_id
                AND mengantar_connections.secret_reference =
                  'managed://mengantar/'
                  || mengantar_connections.tenant_id::text
                  || '/'
                  || mengantar_connections.outlet_id::text
            )
          )
        )
    )
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_estimate_snapshots.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "provider_order_snapshots_active_tenant_insert" ON provider_order_snapshots;--> statement-breakpoint
CREATE POLICY "provider_order_snapshots_active_tenant_insert" ON provider_order_snapshots
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND status = 'SUBMISSION_QUEUED'
    AND provider_order_id IS NULL
    AND is_paid IS NULL
    AND cnote_no IS NULL
    AND safe_response_code IS NULL
    AND resolved_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM provider_batches
      JOIN shipments
        ON shipments.id = provider_order_snapshots.shipment_id
        AND shipments.tenant_id = provider_order_snapshots.tenant_id
      JOIN outlets
        ON outlets.id = shipments.outlet_id
        AND outlets.tenant_id = shipments.tenant_id
      JOIN shipment_drafts
        ON shipment_drafts.shipment_id = shipments.id
        AND shipment_drafts.tenant_id = shipments.tenant_id
      JOIN shipment_estimate_snapshots
        ON shipment_estimate_snapshots.id = provider_order_snapshots.estimate_snapshot_id
        AND shipment_estimate_snapshots.shipment_id = shipments.id
        AND shipment_estimate_snapshots.tenant_id = shipments.tenant_id
      JOIN shipment_estimate_services
        ON shipment_estimate_services.id = provider_order_snapshots.estimate_service_id
        AND shipment_estimate_services.snapshot_id = shipment_estimate_snapshots.id
        AND shipment_estimate_services.tenant_id = shipment_estimate_snapshots.tenant_id
      JOIN shipment_parties AS recipient
        ON recipient.shipment_id = shipments.id
        AND recipient.tenant_id = shipments.tenant_id
        AND recipient.role = 'RECIPIENT'
      LEFT JOIN shipment_cod_totals
        ON shipment_cod_totals.shipment_id = shipments.id
        AND shipment_cod_totals.snapshot_id = shipment_estimate_snapshots.id
        AND shipment_cod_totals.estimate_service_id = shipment_estimate_services.id
        AND shipment_cod_totals.tenant_id = shipments.tenant_id
      WHERE provider_batches.id = provider_order_snapshots.batch_id
        AND provider_batches.tenant_id = provider_order_snapshots.tenant_id
        AND provider_batches.status = 'SUBMISSION_QUEUED'
        AND provider_batches.outlet_id = shipments.outlet_id
        AND provider_batches.pickup_address_id = outlets.default_pickup_address_id
        AND provider_batches.credential_source = shipment_estimate_snapshots.credential_source
        AND (
          (
            provider_batches.credential_source = 'platform_default'
            AND NOT EXISTS (
              SELECT 1 FROM mengantar_connections
              WHERE mengantar_connections.tenant_id = provider_order_snapshots.tenant_id
                AND mengantar_connections.outlet_id = shipments.outlet_id
            )
          ) OR (
            provider_batches.credential_source = 'private'
            AND EXISTS (
              SELECT 1 FROM mengantar_connections
              WHERE mengantar_connections.tenant_id = provider_order_snapshots.tenant_id
                AND mengantar_connections.outlet_id = shipments.outlet_id
                AND mengantar_connections.secret_reference =
                  'managed://mengantar/'
                  || mengantar_connections.tenant_id::text
                  || '/'
                  || mengantar_connections.outlet_id::text
            )
          )
        )
        AND shipments.status = 'ESTIMATED'
        AND shipment_estimate_snapshots.outlet_id = shipments.outlet_id
        AND shipment_estimate_snapshots.origin_area_id = coalesce(shipment_drafts.origin_area_id, outlets.default_origin_area_id)
        AND shipment_estimate_snapshots.destination_area_id = shipment_drafts.destination_area_id
        AND shipment_estimate_snapshots.destination_area_label = shipment_drafts.destination_area_label
        AND shipment_estimate_snapshots.weight_grams = shipment_drafts.package_weight_grams
        AND shipment_estimate_snapshots.is_cod_requested = shipment_drafts.is_cod
        AND NOT EXISTS (
          SELECT 1
          FROM shipment_estimate_snapshots AS newer_snapshot
          WHERE newer_snapshot.shipment_id = shipment_estimate_snapshots.shipment_id
            AND newer_snapshot.tenant_id = shipment_estimate_snapshots.tenant_id
            AND (
              newer_snapshot.retrieved_at > shipment_estimate_snapshots.retrieved_at
              OR (
                newer_snapshot.retrieved_at = shipment_estimate_snapshots.retrieved_at
                AND newer_snapshot.id > shipment_estimate_snapshots.id
              )
            )
        )
        AND recipient.destination_area_id = shipment_drafts.destination_area_id
        AND recipient.destination_area_label = shipment_drafts.destination_area_label
        AND provider_order_snapshots.destination_area_id = shipment_drafts.destination_area_id
        AND provider_order_snapshots.destination_area_label = shipment_drafts.destination_area_label
        AND provider_order_snapshots.provider_service = shipment_estimate_services.provider_service
        AND provider_order_snapshots.currency = shipment_estimate_services.currency
        AND provider_order_snapshots.shipping_amount_idr = shipment_estimate_services.shipping_amount_idr
        AND provider_order_snapshots.insurance_amount_idr IS NOT DISTINCT FROM shipment_estimate_services.insurance_amount_idr
        AND provider_order_snapshots.is_cod = shipment_drafts.is_cod
        AND (
          (
            shipment_drafts.is_cod = false
            AND provider_order_snapshots.provider_cod_amount_idr IS NULL
          ) OR (
            shipment_drafts.is_cod = true
            AND shipment_estimate_services.cod_eligible = true
            AND shipment_cod_totals.id IS NOT NULL
            AND provider_order_snapshots.provider_cod_amount_idr = shipment_cod_totals.provider_cod_amount_idr
          )
        )
    )
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = provider_order_snapshots.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "shipment_cod_totals_active_tenant_insert" ON shipment_cod_totals;--> statement-breakpoint
CREATE POLICY "shipment_cod_totals_active_tenant_insert" ON shipment_cod_totals
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND NOT EXISTS (
      SELECT 1
      FROM shipment_estimate_snapshots AS newer_snapshot
      WHERE newer_snapshot.shipment_id = shipment_cod_totals.shipment_id
        AND newer_snapshot.tenant_id = shipment_cod_totals.tenant_id
        AND newer_snapshot.retrieved_at > (
          SELECT snapshot.retrieved_at
          FROM shipment_estimate_snapshots AS snapshot
          WHERE snapshot.id = shipment_cod_totals.snapshot_id
            AND snapshot.tenant_id = shipment_cod_totals.tenant_id
        )
    )
    AND EXISTS (
      SELECT 1
      FROM shipments
      JOIN shipment_drafts ON shipment_drafts.shipment_id = shipments.id
        AND shipment_drafts.tenant_id = shipments.tenant_id
      JOIN outlets ON outlets.id = shipments.outlet_id
        AND outlets.tenant_id = shipments.tenant_id
      JOIN shipment_estimate_snapshots ON shipment_estimate_snapshots.id = shipment_cod_totals.snapshot_id
        AND shipment_estimate_snapshots.shipment_id = shipments.id
        AND shipment_estimate_snapshots.tenant_id = shipments.tenant_id
        AND shipment_estimate_snapshots.outlet_id = shipments.outlet_id
      JOIN shipment_estimate_services ON shipment_estimate_services.id = shipment_cod_totals.estimate_service_id
        AND shipment_estimate_services.snapshot_id = shipment_estimate_snapshots.id
        AND shipment_estimate_services.tenant_id = shipment_estimate_snapshots.tenant_id
      WHERE shipments.id = shipment_cod_totals.shipment_id
        AND shipments.tenant_id = shipment_cod_totals.tenant_id
        AND shipments.status IN ('DRAFT', 'ESTIMATED')
        AND shipment_drafts.is_cod = true
        AND shipment_drafts.declared_value_idr = shipment_cod_totals.goods_value_idr
        AND shipment_estimate_snapshots.is_cod_requested = true
        AND shipment_estimate_snapshots.origin_area_id = coalesce(shipment_drafts.origin_area_id, outlets.default_origin_area_id)
        AND shipment_estimate_snapshots.destination_area_id = shipment_drafts.destination_area_id
        AND shipment_estimate_snapshots.destination_area_label = shipment_drafts.destination_area_label
        AND shipment_estimate_snapshots.weight_grams = shipment_drafts.package_weight_grams
        AND shipment_estimate_services.cod_eligible = true
        AND shipment_estimate_services.currency = 'IDR'
        AND shipment_estimate_services.currency = shipment_cod_totals.currency
        AND shipment_estimate_services.shipping_amount_idr = shipment_cod_totals.shipping_amount_idr
    )
    AND EXISTS (
      SELECT 1 FROM tenants
      JOIN memberships ON memberships.tenant_id = tenants.id
      JOIN users ON users.id = memberships.user_id
      WHERE tenants.id = shipment_cod_totals.tenant_id
        AND tenants.status = 'ACTIVE'
        AND memberships.user_id = current_setting('app.user_id', true)
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
    )
  );
