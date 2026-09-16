import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const databaseUrl = process.env.MIGRATION_CHECK_DATABASE_URL;
if (!databaseUrl) throw new Error("MIGRATION_CHECK_DATABASE_URL is required.");

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationsDirectory = join(root, "drizzle");
const migrations = (await readdir(migrationsDirectory))
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort();

if (migrations.length < 2) throw new Error("Expected at least two versioned migrations.");
const destinationAuthorityIndex = migrations.findIndex((migration) =>
  migration.startsWith("0028_shipment_destination_authority"));
if (destinationAuthorityIndex < 1) {
  throw new Error("Expected the destination-authority upgrade boundary.");
}
const settlementMoneyIndex = migrations.findIndex((migration) =>
  migration.startsWith("0049_mengantar_settlement_money"));
if (settlementMoneyIndex <= destinationAuthorityIndex) {
  throw new Error("Expected the settlement-money upgrade boundary.");
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  const { rows: existingTables } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  if (existingTables.length > 0) {
    throw new Error("Migration check database must be empty.");
  }

  for (const migration of migrations.slice(0, destinationAuthorityIndex)) {
    const sql = await readFile(join(migrationsDirectory, migration), "utf8");
    await client.query("BEGIN");
    try {
      for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
        await client.query(statement);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  await client.query(`
    INSERT INTO tenants (id, name, status)
    VALUES ('00000000-0000-0000-0000-000000000901', 'Migration Fixture', 'ACTIVE')
  `);
  await client.query(`
    INSERT INTO users (id, name, email, email_verified, status)
    VALUES ('migration-fixture-user', 'Migration Fixture User', 'migration.fixture@example.test', true, 'ACTIVE')
  `);
  await client.query(`
    INSERT INTO memberships (tenant_id, user_id, role, status)
    VALUES ('00000000-0000-0000-0000-000000000901', 'migration-fixture-user', 'TENANT_ADMIN', 'ACTIVE')
  `);
  await client.query(`
    INSERT INTO outlets (id, tenant_id, name)
    VALUES ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000901', 'Migration Fixture Outlet')
  `);
  await client.query(`
    INSERT INTO shipments (id, tenant_id, outlet_id, status)
    VALUES ('00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000902', 'DRAFT')
  `);
  await client.query(`
    INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity,
      declared_value_idr, is_cod
    ) VALUES (
      '00000000-0000-0000-0000-000000000903',
      '00000000-0000-0000-0000-000000000901',
      'migration-destination-903',
      'Migration Destination 903',
      'Migration Fixture Package', 1000, 1, 100000, false
    )
  `);
  await client.query(`
    INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address)
    VALUES
      ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000903', 'SENDER', 'Fixture Sender', '+6281211111111', 'Fixture Sender Address'),
      ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000903', 'RECIPIENT', 'Fixture Recipient', '+6281222222222', 'Fixture Recipient Address')
  `);
  await client.query(`
    INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id,
      destination_area_id, weight_grams, is_cod_requested, credential_source
    ) VALUES (
      '00000000-0000-0000-0000-000000000904',
      '00000000-0000-0000-0000-000000000901',
      '00000000-0000-0000-0000-000000000903',
      '00000000-0000-0000-0000-000000000902',
      'migration-origin-902', 'migration-destination-903', 1000, false, 'platform_default'
    )
  `);
  await client.query(`
    INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency,
      shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES (
      '00000000-0000-0000-0000-000000000905',
      '00000000-0000-0000-0000-000000000901',
      '00000000-0000-0000-0000-000000000904',
      'MIGRATION REG', 'IDR', 10000, 'price', '1-2 days', false
    )
  `);
  await client.query(`
    INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier,
      credential_source, provider_account_key, idempotency_key
    ) VALUES (
      '00000000-0000-0000-0000-000000000906',
      '00000000-0000-0000-0000-000000000901',
      '00000000-0000-0000-0000-000000000902',
      'migration-pickup-902', 'MIGRATION', 'platform_default',
      repeat('a', 64), repeat('b', 64)
    )
  `);
  await client.query(`
    INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id,
      estimate_service_id, position, provider_service, currency,
      shipping_amount_idr, is_cod
    ) VALUES (
      '00000000-0000-0000-0000-000000000907',
      '00000000-0000-0000-0000-000000000901',
      '00000000-0000-0000-0000-000000000906',
      '00000000-0000-0000-0000-000000000903',
      '00000000-0000-0000-0000-000000000904',
      '00000000-0000-0000-0000-000000000905',
      0, 'MIGRATION REG', 'IDR', 10000, false
    )
  `);

  // T-157 (0045) conversion shapes: outlet 902 has a complete pickup pair and must
  // convert to exactly one default pickup point; outlet 912 keeps the legacy
  // label-less pair and must convert to none, staying unusable exactly as it was.
  await client.query(`
    UPDATE outlets SET
      default_pickup_address_id = 'migration-pickup-902',
      default_pickup_address_label = 'Migration Pickup 902',
      default_origin_area_id = 'migration-origin-902',
      default_origin_area_label = 'Migration Origin 902'
    WHERE id = '00000000-0000-0000-0000-000000000902'
  `);

  // PR-44 backfill shapes: a second shipment pair with a created_at tie (id decides), a second
  // tenant with history, and a tenant with an outlet but no shipments.
  await client.query(`UPDATE shipments SET created_at = '2026-01-01T00:00:00Z' WHERE id = '00000000-0000-0000-0000-000000000903'`);
  await client.query(`
    INSERT INTO tenants (id, name, status) VALUES
      ('00000000-0000-0000-0000-000000000911', 'Migration Fixture Two', 'ACTIVE'),
      ('00000000-0000-0000-0000-000000000921', 'Migration Fixture Empty', 'ACTIVE')
  `);
  await client.query(`
    INSERT INTO outlets (id, tenant_id, name) VALUES
      ('00000000-0000-0000-0000-000000000912', '00000000-0000-0000-0000-000000000911', 'Migration Outlet Two'),
      ('00000000-0000-0000-0000-000000000922', '00000000-0000-0000-0000-000000000921', 'Migration Outlet Empty')
  `);
  await client.query(`
    INSERT INTO shipments (id, tenant_id, outlet_id, status, created_at) VALUES
      ('00000000-0000-0000-0000-000000000909', '00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000902', 'DRAFT', '2026-01-02T00:00:00Z'),
      ('00000000-0000-0000-0000-000000000908', '00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000902', 'DRAFT', '2026-01-02T00:00:00Z'),
      ('00000000-0000-0000-0000-000000000913', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000912', 'DRAFT', '2025-12-31T00:00:00Z')
  `);

  // Outlet 912's legacy label-less pair, written *before* 0045 runs. Writing it
  // after the migration made the "an incomplete pair converts to none" guard
  // vacuous: deleting both label conditions from 0045's WHERE still left one
  // pickup point and the check still passed.
  await client.query(`
    UPDATE outlets SET
      default_pickup_address_id = 'migration-pickup-912',
      default_origin_area_id = 'migration-origin-912'
    WHERE id = '00000000-0000-0000-0000-000000000912'
  `);

  // T-175 (0048): a COD total written under the additive formula *before* the
  // formula version exists — the shape of every production row. It must come
  // through 0048 unchanged, as version 1, and still satisfy every check.
  await client.query(`
    INSERT INTO shipment_cod_totals (
      id, tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
      goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
      provider_cod_amount_idr
    ) VALUES (
      '00000000-0000-0000-0000-000000000931',
      '00000000-0000-0000-0000-000000000901',
      '00000000-0000-0000-0000-000000000903',
      '00000000-0000-0000-0000-000000000904',
      '00000000-0000-0000-0000-000000000905',
      'IDR', 100000, 10000, 3300, 363, 113663
    )
  `);

  const applyMigrations = async (slice) => {
    for (const migration of slice) {
      const sql = await readFile(join(migrationsDirectory, migration), "utf8");
      await client.query("BEGIN");
      try {
        for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
          await client.query(statement);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  };
  await applyMigrations(migrations.slice(destinationAuthorityIndex, settlementMoneyIndex));

  // T-178 (0049): settlement evidence and a revenue-classified COD fee entry
  // exactly as production holds them *before* 0049 — whole-rupiah bigint
  // amounts, a fee rounded to the sen, and a GERAICUAN_COD_SERVICE_FEE_REVENUE
  // ledger row. Both must come through the column widening and the CHECK
  // re-creation unchanged; a fixture written after 0049 would prove nothing.
  await client.query(`
    INSERT INTO provider_settlement_pulls (
      id, tenant_id, outlet_id, actor_user_id, credential_source, provider_account_key,
      period_start, period_end, matched_item_count, matched_status_count
    ) VALUES (
      '00000000-0000-0000-0000-000000000941',
      '00000000-0000-0000-0000-000000000901',
      '00000000-0000-0000-0000-000000000902',
      'migration-fixture-user', 'platform_default', repeat('a', 64),
      '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z', 2, 0
    )
  `);
  await client.query(`
    INSERT INTO provider_settlement_items (
      id, tenant_id, pull_id, shipment_id, outlet_id, item_type, provider_invoice_id,
      invoice_number, invoice_status, invoice_created_at, cnote_no, amount_idr,
      cod_amount_idr, cod_fee_idr, shipping_amount_idr
    ) VALUES
      ('00000000-0000-0000-0000-000000000942', '00000000-0000-0000-0000-000000000901',
       '00000000-0000-0000-0000-000000000941', '00000000-0000-0000-0000-000000000903',
       '00000000-0000-0000-0000-000000000902', 'SETTLEMENT', 'MIGRATIONINV1', 'MIGRATION-INV-1',
       'statusCleared', '2026-09-01T03:00:00Z', 'MIGRATION-CNOTE-1', 103663, 113663, 3785.08, 10000),
      ('00000000-0000-0000-0000-000000000943', '00000000-0000-0000-0000-000000000901',
       '00000000-0000-0000-0000-000000000941', '00000000-0000-0000-0000-000000000903',
       '00000000-0000-0000-0000-000000000902', 'CHARGE', 'MIGRATIONINV2', 'MIGRATION-INV-2',
       'statusCleared', '2026-09-01T04:00:00Z', 'MIGRATION-CNOTE-1', -999999999999, NULL, NULL, 999999999999)
  `);
  await client.query(`
    INSERT INTO ledger_entries (
      id, tenant_id, outlet_id, shipment_id, provider_batch_id, provider_order_snapshot_id,
      entry_type, financial_class, amount_idr, currency, effective_at,
      source_event, source_event_id, actor_type, actor_user_id
    ) VALUES (
      '00000000-0000-0000-0000-000000000944',
      '00000000-0000-0000-0000-000000000901',
      '00000000-0000-0000-0000-000000000902',
      '00000000-0000-0000-0000-000000000903',
      '00000000-0000-0000-0000-000000000906',
      '00000000-0000-0000-0000-000000000907',
      'GERAICUAN_COD_SERVICE_FEE_REVENUE', 'REVENUE', 3300, 'IDR', '2026-09-01T02:00:00Z',
      'PROVIDER_ORDER_ISSUED', '00000000-0000-0000-0000-000000000907', 'USER', 'migration-fixture-user'
    )
  `);
  const ledgerRowText = async () => (await client.query(
    "SELECT row_to_json(entry)::text AS row FROM ledger_entries entry WHERE id = '00000000-0000-0000-0000-000000000944'",
  )).rows.map((row) => row.row);
  const settlementRowsText = async () => (await client.query(`
    SELECT id::text, amount_idr::text, cod_amount_idr::text, cod_fee_idr::text, shipping_amount_idr::text
    FROM provider_settlement_items ORDER BY id
  `)).rows;
  const ledgerBefore = await ledgerRowText();
  const settlementBefore = await settlementRowsText();
  if (ledgerBefore.length !== 1 || settlementBefore.length !== 2) {
    throw new Error("The pre-0049 settlement and ledger fixtures were not written.");
  }

  await applyMigrations(migrations.slice(settlementMoneyIndex));

  const { rows: fixture } = await client.query(`
    SELECT
      (SELECT count(*) FROM tenants WHERE id = '00000000-0000-0000-0000-000000000901') AS tenants,
      (SELECT count(*) FROM shipments WHERE id = '00000000-0000-0000-0000-000000000903') AS shipments,
      (SELECT count(*) FROM shipment_parties WHERE shipment_id = '00000000-0000-0000-0000-000000000903') AS parties,
      (SELECT count(*) FROM shipment_parties
        WHERE shipment_id = '00000000-0000-0000-0000-000000000903'
          AND role = 'RECIPIENT'
          AND destination_area_id = 'migration-destination-903'
          AND destination_area_label = 'Migration Destination 903') AS recipient_destination,
      (SELECT count(*) FROM shipment_estimate_snapshots
        WHERE id = '00000000-0000-0000-0000-000000000904'
          AND destination_area_id = 'migration-destination-903'
          AND destination_area_label = 'Migration Destination 903') AS estimate_destination,
      (SELECT count(*) FROM provider_order_snapshots
        WHERE id = '00000000-0000-0000-0000-000000000907'
          AND destination_area_id = 'migration-destination-903'
          AND destination_area_label = 'Migration Destination 903') AS provider_order_destination,
      (SELECT mengantar_authority_version FROM outlets
        WHERE id = '00000000-0000-0000-0000-000000000902') AS mengantar_authority_version
  `);
  const { rows: contactsPolicy } = await client.query(
    "SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contacts'",
  );
  const { rows: authorityPolicies } = await client.query(`
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (tablename = 'shipment_estimate_snapshots'
          AND policyname = 'shipment_estimate_snapshots_active_tenant_insert')
        OR (tablename = 'provider_order_snapshots'
          AND policyname = 'provider_order_snapshots_active_tenant_insert')
      )
  `);
  if (
    fixture[0]?.tenants !== "1" ||
    fixture[0]?.shipments !== "1" ||
    fixture[0]?.parties !== "2" ||
    fixture[0]?.recipient_destination !== "1" ||
    fixture[0]?.estimate_destination !== "1" ||
    fixture[0]?.provider_order_destination !== "1" ||
    fixture[0]?.mengantar_authority_version !== 0 ||
    authorityPolicies.length !== 2 ||
    !contactsPolicy.some(({ policyname }) => policyname === "contacts_active_tenant")
  ) {
    throw new Error("Representative fixture or tenant isolation policy was not preserved.");
  }

  // PR-44 (0040): legacy rows are renumbered per tenant in (created_at, id) order, keep no
  // invented creator, and every prefix stays unlocked until saved or a tenant's first allocation.
  const { rows: numbered } = await client.query(`
    SELECT id::text, public_reference, tenant_number, created_by_user_id FROM shipments ORDER BY id
  `);
  const expected = {
    "00000000-0000-0000-0000-000000000903": "GC-10000",
    "00000000-0000-0000-0000-000000000908": "GC-10001",
    "00000000-0000-0000-0000-000000000909": "GC-10002",
    "00000000-0000-0000-0000-000000000913": "GC-10000",
  };
  if (
    numbered.length !== 4
    || numbered.some((row) => expected[row.id] !== row.public_reference || `GC-${row.tenant_number}` !== row.public_reference || row.created_by_user_id !== null)
  ) {
    throw new Error(`Legacy shipments were not renumbered per tenant in creation order: ${JSON.stringify(numbered)}`);
  }
  const { rows: counters } = await client.query(`
    SELECT tenant_id::text, last_number, shipment_prefix, shipment_prefix_locked_at FROM tenant_shipment_counters ORDER BY tenant_id
  `);
  if (
    JSON.stringify(counters.map((row) => [row.tenant_id.slice(-3), row.last_number, row.shipment_prefix, row.shipment_prefix_locked_at]))
      !== JSON.stringify([["901", 10002, "GC", null], ["911", 10000, "GC", null]])
  ) {
    throw new Error(`Tenant counters were not seeded from history with unlocked prefixes: ${JSON.stringify(counters)}`);
  }
  const { rows: nextReference } = await client.query(`
    INSERT INTO shipments (tenant_id, outlet_id, created_at)
    SELECT tenant_id, outlet_id, created_at FROM shipments
    WHERE id = '00000000-0000-0000-0000-000000000903'
    RETURNING public_reference, tenant_number
  `);
  const { rows: firstEver } = await client.query(`
    INSERT INTO shipments (tenant_id, outlet_id)
    VALUES ('00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000922')
    RETURNING public_reference
  `);
  const { rows: locks } = await client.query(`
    SELECT tenant_id::text, shipment_prefix_locked_at IS NOT NULL AS locked FROM tenant_shipment_counters ORDER BY tenant_id
  `);
  if (
    nextReference[0]?.public_reference !== "GC-10003"
    || firstEver[0]?.public_reference !== "GC-10000"
    || JSON.stringify(locks.map((row) => [row.tenant_id.slice(-3), row.locked])) !== JSON.stringify([["901", false], ["911", false], ["921", true]])
  ) {
    throw new Error("Counters did not continue, or a prefix was locked by anything other than a tenant's first allocation.");
  }

  // T-157 (0045): every outlet with a complete pickup pair becomes exactly one
  // default pickup point carrying the same values; an incomplete pair becomes
  // none, and no outlet loses the mirror the order path still reads.
  const { rows: pickupPoints } = await client.query(`
    SELECT outlet_id::text, pickup_address_id, pickup_address_label,
           origin_area_id, origin_area_label, is_default
    FROM outlet_pickup_points ORDER BY outlet_id
  `);
  if (
    pickupPoints.length !== 1
    || pickupPoints[0].outlet_id !== "00000000-0000-0000-0000-000000000902"
    || pickupPoints[0].pickup_address_id !== "migration-pickup-902"
    || pickupPoints[0].pickup_address_label !== "Migration Pickup 902"
    || pickupPoints[0].origin_area_id !== "migration-origin-902"
    || pickupPoints[0].origin_area_label !== "Migration Origin 902"
    || pickupPoints[0].is_default !== true
  ) {
    throw new Error(`Single-pickup outlets did not convert without loss: ${JSON.stringify(pickupPoints)}`);
  }
  const { rows: mirror } = await client.query(`
    SELECT default_pickup_address_id, default_origin_area_id FROM outlets
    WHERE id = '00000000-0000-0000-0000-000000000902'
  `);
  const { rows: draftPickup } = await client.query(`
    SELECT pickup_address_id, origin_area_id FROM shipment_drafts
    WHERE shipment_id = '00000000-0000-0000-0000-000000000903'
  `);
  if (
    mirror[0]?.default_pickup_address_id !== "migration-pickup-902"
    || mirror[0]?.default_origin_area_id !== "migration-origin-902"
    || draftPickup[0]?.pickup_address_id !== null
    || draftPickup[0]?.origin_area_id !== null
  ) {
    throw new Error("The outlet mirror changed, or a pre-0045 draft was invented a pickup point.");
  }

  // T-175 (0048): the pre-change row is version 1 with its submitted amounts
  // intact, every COD check on the table is validated against it, and the two
  // versions refuse each other's arithmetic.
  const { rows: historicalCod } = await client.query(`
    SELECT goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
           provider_cod_amount_idr, cod_formula_version
    FROM shipment_cod_totals WHERE id = '00000000-0000-0000-0000-000000000931'
  `);
  if (
    JSON.stringify(historicalCod) !== JSON.stringify([{
      goods_value_idr: 100000, shipping_amount_idr: 10000, service_fee_idr: 3300,
      vat_amount_idr: 363, provider_cod_amount_idr: 113663, cod_formula_version: 1,
    }])
  ) {
    throw new Error(`A pre-0048 COD total was rewritten or not marked version 1: ${JSON.stringify(historicalCod)}`);
  }
  const { rows: codChecks } = await client.query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'shipment_cod_totals'::regclass AND contype = 'c' AND convalidated
      AND conname IN (
        'shipment_cod_totals_formula_version_known',
        'shipment_cod_totals_service_fee_exact',
        'shipment_cod_totals_vat_exact',
        'shipment_cod_totals_provider_cod_amount_exact',
        'shipment_cod_totals_provider_cod_amount_gross_up_v2',
        'shipment_cod_totals_service_fee_split_v2'
      )
  `);
  const { rows: stillValid } = await client.query(`
    SELECT count(*)::int AS failing FROM shipment_cod_totals
    WHERE NOT (
      cod_formula_version <> 1 OR (
        service_fee_idr::bigint = (((goods_value_idr::bigint + shipping_amount_idr::bigint) * 3 + 50) / 100)
        AND vat_amount_idr::bigint = ((service_fee_idr::bigint * 11 + 50) / 100)
      )
    )
  `);
  if (codChecks.length !== 6 || stillValid[0]?.failing !== 0) {
    throw new Error(`COD checks are not all validated, or a version 1 row fails version 1: ${JSON.stringify({ codChecks, stillValid })}`);
  }
  await client.query(`
    INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
      destination_area_label, weight_grams, is_cod_requested, credential_source
    ) VALUES (
      '00000000-0000-0000-0000-000000000934',
      '00000000-0000-0000-0000-000000000901',
      '00000000-0000-0000-0000-000000000908',
      '00000000-0000-0000-0000-000000000902',
      'migration-origin-902', 'migration-destination-908', 'Migration Destination 908',
      1000, true, 'platform_default'
    )
  `);
  await client.query(`
    INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency,
      shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES (
      '00000000-0000-0000-0000-000000000935',
      '00000000-0000-0000-0000-000000000901',
      '00000000-0000-0000-0000-000000000934',
      'MIGRATION COD', 'IDR', 10000, 'price', '1-2 days', true
    )
  `);
  const insertCod = (fee, vat, cod, version) => client.query(`
    INSERT INTO shipment_cod_totals (
      tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
      goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
      provider_cod_amount_idr, cod_formula_version
    ) VALUES (
      '00000000-0000-0000-0000-000000000901',
      '00000000-0000-0000-0000-000000000908',
      '00000000-0000-0000-0000-000000000934',
      '00000000-0000-0000-0000-000000000935',
      'IDR', 100000, 10000, $1, $2, $3, $4
    )
  `, [fee, vat, cod, version]);
  const refusedByCheck = async (...args) => {
    try {
      await insertCod(...args);
    } catch (error) {
      if (error.code === "23514") return true;
      throw error;
    }
    return false;
  };
  if (
    !(await refusedByCheck(3300, 363, 113663, 2))
    || !(await refusedByCheck(3414, 376, 113790, 1))
    || !(await refusedByCheck(3414, 375, 113789, 2))
    || !(await refusedByCheck(3415, 375, 113790, 2))
  ) {
    throw new Error("A COD total was accepted under the other formula version or one rupiah off version 2.");
  }
  await insertCod(3414, 376, 113790, 2);

  // T-178 (0049): every settlement amount written before the change reads back
  // as the same value at the new scale, and the ledger row is identical.
  const settlementAfter = await settlementRowsText();
  const expectedSettlement = [
    { id: "00000000-0000-0000-0000-000000000942", amount_idr: "103663.0000", cod_amount_idr: "113663", cod_fee_idr: "3785.0800", shipping_amount_idr: "10000.0000" },
    { id: "00000000-0000-0000-0000-000000000943", amount_idr: "-999999999999.0000", cod_amount_idr: null, cod_fee_idr: null, shipping_amount_idr: "999999999999.0000" },
  ];
  if (
    JSON.stringify(settlementBefore) !== JSON.stringify([
      { id: "00000000-0000-0000-0000-000000000942", amount_idr: "103663", cod_amount_idr: "113663", cod_fee_idr: "3785.08", shipping_amount_idr: "10000" },
      { id: "00000000-0000-0000-0000-000000000943", amount_idr: "-999999999999", cod_amount_idr: null, cod_fee_idr: null, shipping_amount_idr: "999999999999" },
    ])
    || JSON.stringify(settlementAfter) !== JSON.stringify(expectedSettlement)
  ) {
    throw new Error(`Settlement evidence changed value across 0049: ${JSON.stringify({ settlementBefore, settlementAfter })}`);
  }
  const { rows: settlementColumns } = await client.query(`
    SELECT column_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_name = 'provider_settlement_items'
      AND column_name IN ('amount_idr', 'cod_fee_idr', 'shipping_amount_idr', 'cod_amount_idr')
    ORDER BY column_name
  `);
  if (JSON.stringify(settlementColumns.map((row) => [row.column_name, row.data_type, row.numeric_precision, row.numeric_scale])) !== JSON.stringify([
    ["amount_idr", "numeric", 18, 4], ["cod_amount_idr", "bigint", 64, 0], ["cod_fee_idr", "numeric", 18, 4], ["shipping_amount_idr", "numeric", 18, 4],
  ])) {
    throw new Error(`Settlement columns are not exact four-place decimals: ${JSON.stringify(settlementColumns)}`);
  }
  // A real-shaped fractional line is stored without loss, and a re-pull of the
  // same observation is still one row because the key compares by value.
  const insertFractional = (id, amount) => client.query(`
    INSERT INTO provider_settlement_items (
      id, tenant_id, pull_id, shipment_id, outlet_id, item_type, provider_invoice_id,
      invoice_number, invoice_status, invoice_created_at, cnote_no, amount_idr,
      cod_amount_idr, cod_fee_idr, shipping_amount_idr
    ) VALUES ($1, '00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000941',
      '00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000902', 'SETTLEMENT',
      'MIGRATIONINV3', 'MIGRATION-INV-3', 'statusCleared', '2026-09-01T05:00:00Z', 'MIGRATION-CNOTE-3',
      $2, 113663, '3784.9779', '13784.9779')
    ON CONFLICT ON CONSTRAINT provider_settlement_items_observation_key DO NOTHING
  `, [id, amount]);
  await insertFractional("00000000-0000-0000-0000-000000000945", "99878.0221");
  const duplicate = await insertFractional("00000000-0000-0000-0000-000000000946", "99878.02210");
  const { rows: fractional } = await client.query(`
    SELECT amount_idr::text, cod_fee_idr::text, shipping_amount_idr::text
    FROM provider_settlement_items WHERE provider_invoice_id = 'MIGRATIONINV3'
  `);
  if (
    duplicate.rowCount !== 0
    || JSON.stringify(fractional) !== JSON.stringify([{ amount_idr: "99878.0221", cod_fee_idr: "3784.9779", shipping_amount_idr: "13784.9779" }])
  ) {
    throw new Error(`A fractional settlement line was not stored exactly once: ${JSON.stringify(fractional)}`);
  }

  const ledgerAfter = await ledgerRowText();
  const { rows: ledgerChecks } = await client.query(`
    SELECT conrelid::regclass::text AS relation, conname FROM pg_constraint
    WHERE contype = 'c' AND convalidated
      AND conname IN (
        'ledger_entries_type_valid', 'ledger_entries_type_class_valid',
        'ledger_entries_source_event_valid', 'reconciliation_runs_entry_type_valid'
      )
  `);
  const { rows: immutability } = await client.query(`
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'ledger_entries'::regclass AND tgname = 'ledger_entries_immutable' AND tgenabled <> 'D'
  `);
  const { rows: runtimeGrants } = await client.query(`
    SELECT privilege_type FROM information_schema.role_table_grants
    WHERE table_name = 'ledger_entries' AND grantee = 'geraicuan_app' ORDER BY privilege_type
  `);
  if (
    JSON.stringify(ledgerAfter) !== JSON.stringify(ledgerBefore)
    || ledgerChecks.length !== 4
    || immutability.length !== 1
    || JSON.stringify(runtimeGrants.map((row) => row.privilege_type)) !== JSON.stringify(["INSERT", "SELECT"])
  ) {
    throw new Error(`The historical revenue entry, a ledger check, the immutability trigger or the grants moved: ${JSON.stringify({ ledgerBefore, ledgerAfter, ledgerChecks, immutability, runtimeGrants })}`);
  }
  const mutationRefused = async (statement) => {
    try {
      await client.query(statement);
    } catch (error) {
      return error.code === "55000";
    }
    return false;
  };
  if (
    !(await mutationRefused("UPDATE ledger_entries SET entry_type = 'MENGANTAR_COD_FEE_COST', financial_class = 'EXPENSE' WHERE id = '00000000-0000-0000-0000-000000000944'"))
    || !(await mutationRefused("DELETE FROM ledger_entries WHERE id = '00000000-0000-0000-0000-000000000944'"))
  ) {
    throw new Error("The historical revenue entry could be rewritten or deleted after 0049.");
  }
  const insertFeeEntry = (entryType, financialClass, sourceEventId) => client.query(`
    INSERT INTO ledger_entries (
      tenant_id, outlet_id, shipment_id, provider_batch_id, provider_order_snapshot_id,
      entry_type, financial_class, amount_idr, currency, effective_at,
      source_event, source_event_id, actor_type, actor_user_id
    ) VALUES (
      '00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000902',
      '00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000906',
      '00000000-0000-0000-0000-000000000907', $1, $2, 3414, 'IDR', now(),
      'PROVIDER_ORDER_ISSUED', $3, 'USER', 'migration-fixture-user'
    )
  `, [entryType, financialClass, sourceEventId]);
  const refusedLedger = async (...args) => {
    try {
      await insertFeeEntry(...args);
    } catch (error) {
      if (error.code === "23514") return true;
      throw error;
    }
    return false;
  };
  if (
    !(await refusedLedger("MENGANTAR_COD_FEE_COST", "REVENUE", "migration-fee-as-revenue"))
    || !(await refusedLedger("MENGANTAR_COD_FEE_COST", "LIABILITY", "migration-fee-as-liability"))
  ) {
    throw new Error("MENGANTAR_COD_FEE_COST was accepted outside the EXPENSE class.");
  }
  await insertFeeEntry("MENGANTAR_COD_FEE_COST", "EXPENSE", "migration-fee-cost");
  // An instance on the previous release during a deploy still ledgers its issuance.
  await insertFeeEntry("GERAICUAN_COD_SERVICE_FEE_REVENUE", "REVENUE", "migration-previous-release");

  console.log(`Migration upgrade check passed through ${migrations.at(-1)}.`);
} finally {
  await client.end();
}
