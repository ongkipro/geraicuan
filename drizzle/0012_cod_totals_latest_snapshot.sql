DROP POLICY "shipment_cod_totals_active_tenant_insert" ON shipment_cod_totals;
--> statement-breakpoint
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
        AND shipment_estimate_snapshots.origin_area_id = outlets.default_origin_area_id
        AND shipment_estimate_snapshots.destination_area_id = shipment_drafts.destination_area_id
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
