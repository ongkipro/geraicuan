CREATE VIEW platform_monitoring_ledger_hourly
WITH (security_barrier = true)
AS
SELECT
  ledger_row.tenant_id,
  ledger_row.outlet_id,
  date_trunc('hour', ledger_row.effective_at) AS effective_hour,
  coalesce(reversed_row.entry_type, ledger_row.entry_type) AS entry_type,
  ledger_row.financial_class,
  count(*)::bigint AS entry_count,
  sum(ledger_row.amount_idr)::bigint AS amount_idr
FROM ledger_entries ledger_row
LEFT JOIN ledger_entries reversed_row
  ON reversed_row.id = ledger_row.reverses_entry_id
  AND reversed_row.tenant_id = ledger_row.tenant_id
WHERE current_setting('app.platform_admin', true) = 'true'
GROUP BY
  ledger_row.tenant_id,
  ledger_row.outlet_id,
  date_trunc('hour', ledger_row.effective_at),
  coalesce(reversed_row.entry_type, ledger_row.entry_type),
  ledger_row.financial_class;
--> statement-breakpoint
CREATE VIEW platform_monitoring_reconciliation_latest
WITH (security_barrier = true)
AS
SELECT
  ranked.tenant_id,
  ranked.outlet_id,
  ranked.cadence,
  ranked.reconciled_entry_type,
  ranked.period_start,
  ranked.period_end,
  ranked.source_total_idr,
  ranked.ledger_total_idr,
  ranked.variance_idr,
  ranked.status,
  ranked.created_at
FROM (
  SELECT
    recon_row.tenant_id,
    recon_row.outlet_id,
    recon_row.cadence,
    recon_row.reconciled_entry_type,
    recon_row.period_start,
    recon_row.period_end,
    recon_row.source_total_idr,
    recon_row.ledger_total_idr,
    recon_row.variance_idr,
    recon_row.status,
    recon_row.created_at,
    row_number() OVER (
      PARTITION BY
        recon_row.tenant_id,
        recon_row.outlet_id,
        recon_row.cadence,
        recon_row.reconciled_entry_type,
        recon_row.period_start,
        recon_row.period_end
      ORDER BY recon_row.created_at DESC, recon_row.id DESC
    ) AS position
  FROM reconciliation_runs recon_row
  WHERE current_setting('app.platform_admin', true) = 'true'
) ranked
WHERE ranked.position = 1;
--> statement-breakpoint
REVOKE ALL ON
  platform_monitoring_ledger_hourly,
  platform_monitoring_reconciliation_latest
FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON
  platform_monitoring_ledger_hourly,
  platform_monitoring_reconciliation_latest
TO geraicuan_app;