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
const codOngkirIndex = migrations.findIndex((migration) =>
  migration.startsWith("0050_cod_ongkir_payment_method"));
if (codOngkirIndex <= settlementMoneyIndex) {
  throw new Error("Expected the COD Ongkir upgrade boundary.");
}
const signUpIndex = migrations.findIndex((migration) =>
  migration.startsWith("0051_self_service_sign_up"));
if (signUpIndex <= codOngkirIndex) {
  throw new Error("Expected the self-service sign-up upgrade boundary.");
}
const signUpHardeningIndex = migrations.findIndex((migration) =>
  migration.startsWith("0052_sign_up_security_hardening"));
if (signUpHardeningIndex !== signUpIndex + 1) {
  throw new Error("Expected the sign-up security hardening upgrade boundary right after 0051.");
}
const emailReleaseIndex = migrations.findIndex((migration) =>
  migration.startsWith("0053_rejected_registration_email_release"));
if (emailReleaseIndex !== signUpHardeningIndex + 1) {
  throw new Error("Expected the rejected-registration email release boundary right after 0052.");
}

const contactIndex = migrations.findIndex((migration) =>
  migration.startsWith("0058_tenant_contact_whatsapp"));
if (contactIndex <= emailReleaseIndex) {
  throw new Error("Expected the tenant contact upgrade boundary after 0053.");
}

const prefixRuleIndex = migrations.findIndex((migration) =>
  migration.startsWith("0060_shipment_prefix_three_chars"));
if (prefixRuleIndex <= contactIndex) {
  throw new Error("Expected the three-character prefix upgrade boundary after 0058.");
}

const pickupWindowIndex = migrations.findIndex((migration) =>
  migration.startsWith("0061_pickup_window_eight"));
if (pickupWindowIndex <= prefixRuleIndex) {
  throw new Error("Expected the 08:00 pickup window upgrade boundary after 0060.");
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

  await applyMigrations(migrations.slice(settlementMoneyIndex, codOngkirIndex));

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

  // T-186 (0050): the COD totals production holds *before* 0050 — a version 1
  // additive row (931) and a version 2 gross-up row (908) — and a COD draft
  // beside a non-COD one, all written before the migration runs. Every one must
  // come through with its values and version intact, a NULL basis, and the
  // drafts still what `is_cod` said.
  await client.query(`
    INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod
    ) VALUES (
      '00000000-0000-0000-0000-000000000908', '00000000-0000-0000-0000-000000000901',
      'migration-destination-908', 'Migration Destination 908', 'Migration COD Package', 1000, 1, 100000, true
    )
  `);
  const codRowsText = async () => (await client.query(`
    SELECT id::text, shipment_id::text, goods_value_idr, shipping_amount_idr, service_fee_idr,
           vat_amount_idr, provider_cod_amount_idr, cod_formula_version, created_at::text
    FROM shipment_cod_totals ORDER BY id
  `)).rows;
  const codRowsBefore = await codRowsText();
  if (
    codRowsBefore.length !== 2
    || JSON.stringify(codRowsBefore.map((row) => row.cod_formula_version).sort()) !== JSON.stringify([1, 2])
  ) {
    throw new Error(`The pre-0050 version 1 and version 2 COD totals were not written: ${JSON.stringify(codRowsBefore)}`);
  }

  await applyMigrations(migrations.slice(codOngkirIndex, signUpIndex));

  const { rows: basisAfter } = await client.query(
    "SELECT count(*)::int AS rows, count(cod_shipping_basis_idr)::int AS with_basis FROM shipment_cod_totals",
  );
  const { rows: draftMethods } = await client.query(`
    SELECT shipment_id::text, is_cod, cod_shipping_only FROM shipment_drafts ORDER BY shipment_id
  `);
  if (
    JSON.stringify(await codRowsText()) !== JSON.stringify(codRowsBefore)
    || basisAfter[0]?.rows !== 2
    || basisAfter[0]?.with_basis !== 0
    || JSON.stringify(draftMethods) !== JSON.stringify([
      { shipment_id: "00000000-0000-0000-0000-000000000903", is_cod: false, cod_shipping_only: false },
      { shipment_id: "00000000-0000-0000-0000-000000000908", is_cod: true, cod_shipping_only: false },
    ])
  ) {
    throw new Error(`A COD total or a draft changed across 0050: ${JSON.stringify({ basisAfter, draftMethods })}`);
  }
  const { rows: codOngkirChecks } = await client.query(`
    SELECT conname FROM pg_constraint
    WHERE contype = 'c' AND convalidated
      AND conname IN (
        'shipment_cod_totals_formula_version_known',
        'shipment_cod_totals_provider_cod_amount_exact',
        'shipment_cod_totals_service_fee_exact',
        'shipment_cod_totals_vat_exact',
        'shipment_cod_totals_provider_cod_amount_gross_up_v2',
        'shipment_cod_totals_service_fee_split_v2',
        'shipment_cod_totals_shipping_basis_v3',
        'shipment_cod_totals_cod_ongkir_break_even_v3',
        'shipment_cod_totals_cod_ongkir_fee_v3',
        'shipment_cod_totals_cod_ongkir_fee_split_v3',
        'shipment_drafts_cod_shipping_only_requires_cod'
      )
  `);
  const { rows: codOngkirPolicy } = await client.query(`
    SELECT with_check FROM pg_policies
    WHERE tablename = 'shipment_cod_totals' AND policyname = 'shipment_cod_totals_active_tenant_insert'
  `);
  const policyText = codOngkirPolicy[0]?.with_check ?? "";
  if (
    codOngkirChecks.length !== 11
    || !policyText.includes("cod_shipping_only")
    || !policyText.includes("special_price_idr")
    || !policyText.includes("cod_shipping_basis_idr")
    // 0046's origin rule must survive the re-creation.
    || !policyText.includes("default_origin_area_id")
  ) {
    throw new Error(`0050 checks are not all validated, or the COD totals INSERT policy did not move with them: ${JSON.stringify({ codOngkirChecks, policyText })}`);
  }
  // Version 3 on a new shipment: break-even on the special price Mengantar
  // deducts (9 800 → 10 138), one rupiah below refused, a missing basis refused,
  // a basis on version 2 refused, a COD Ongkir draft that is not COD refused.
  await client.query(`
    INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod, cod_shipping_only
    ) VALUES (
      '00000000-0000-0000-0000-000000000909', '00000000-0000-0000-0000-000000000901',
      'migration-destination-909', 'Migration Destination 909', 'Migration Paid Package', 1000, 1, 250000, true, true
    )
  `);
  await client.query(`
    INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
      destination_area_label, weight_grams, is_cod_requested, credential_source
    ) VALUES (
      '00000000-0000-0000-0000-000000000951', '00000000-0000-0000-0000-000000000901',
      '00000000-0000-0000-0000-000000000909', '00000000-0000-0000-0000-000000000902',
      'migration-origin-902', 'migration-destination-909', 'Migration Destination 909', 1000, true, 'platform_default'
    )
  `);
  await client.query(`
    INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
      shipping_source_field, delivery_estimate, cod_eligible, normal_price_idr, special_price_idr
    ) VALUES (
      '00000000-0000-0000-0000-000000000952', '00000000-0000-0000-0000-000000000901',
      '00000000-0000-0000-0000-000000000951', 'MIGRATION ONGKIR', 'IDR', 12000, 'price', '1-2 days', true, 12000, 9800
    )
  `);
  const insertCodOngkir = (fee, vat, cod, version, basis) => client.query(`
    INSERT INTO shipment_cod_totals (
      tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
      goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
      provider_cod_amount_idr, cod_formula_version, cod_shipping_basis_idr
    ) VALUES (
      '00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000909',
      '00000000-0000-0000-0000-000000000951', '00000000-0000-0000-0000-000000000952',
      'IDR', 250000, 12000, $1, $2, $3, $4, $5
    )
  `, [fee, vat, cod, version, basis]);
  const refusedCodOngkir = async (...args) => {
    try {
      await insertCodOngkir(...args);
    } catch (error) {
      if (error.code === "23514") return true;
      throw error;
    }
    return false;
  };
  const refusedDraft = async () => {
    try {
      await client.query(`
        INSERT INTO shipment_drafts (
          shipment_id, tenant_id, destination_area_id, destination_area_label,
          package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod, cod_shipping_only
        ) VALUES (
          '00000000-0000-0000-0000-000000000913', '00000000-0000-0000-0000-000000000911',
          'migration-destination-913', 'Migration Destination 913', 'Migration Package', 1000, 1, 1000, false, true
        )
      `);
    } catch (error) {
      if (error.code === "23514") return true;
      throw error;
    }
    return false;
  };
  // 10 138 × 333 / 10 000 = 337.6 → 338 = 305 fee + 33 VAT; 10 137 → 338 = 305 + 33.
  if (
    !(await refusedCodOngkir(305, 33, 10137, 3, 9800))
    || !(await refusedCodOngkir(305, 33, 10138, 3, null))
    || !(await refusedCodOngkir(304, 34, 10138, 3, 9800))
    || !(await refusedCodOngkir(305, 34, 10138, 3, 9800))
    || !(await refusedCodOngkir(3414, 376, 113790, 2, 10000))
    || !(await refusedDraft())
  ) {
    throw new Error("0050 accepted a COD Ongkir charge below break-even, a wrong fee, a missing basis, a basis on version 2, or a non-COD COD Ongkir draft.");
  }
  await insertCodOngkir(305, 33, 10138, 3, 9800);

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


  // T-181/T-182/T-183 (0051): the tenants, users, memberships and audit rows
  // that exist before self-service sign-up, in every shape that matters — an
  // ACTIVE, a SUSPENDED and a legacy PROVISIONING tenant, verified and
  // unverified users, a platform role, and lifecycle, member and credential
  // audit events — are written first, and must come through unchanged and
  // still valid.
  await client.query(`
    INSERT INTO tenants (id, name, status) VALUES
      ('00000000-0000-0000-0000-000000000961', 'Migration Legacy Provisioning', 'PROVISIONING'),
      ('00000000-0000-0000-0000-000000000962', 'Migration Suspended', 'SUSPENDED')
  `);
  await client.query(`
    INSERT INTO users (id, name, email, email_verified, status) VALUES
      ('migration-unverified-user', 'Migration Unverified', 'migration.unverified@example.test', false, 'ACTIVE'),
      ('migration-provisioning-admin', 'Migration Provisioning Admin', 'migration.provisioning@example.test', true, 'ACTIVE'),
      ('migration-platform-admin', 'Migration Platform Admin', 'migration.platform@example.test', true, 'ACTIVE'),
      ('migration-suspended-user', 'Migration Suspended User', 'migration.suspended@example.test', true, 'SUSPENDED'),
      ('migration-unverified-platform-admin', 'Migration Unverified Platform Admin', 'migration.unverified.platform@example.test', false, 'ACTIVE'),
      ('migration-unverified-no-access', 'Migration Unverified No Access', 'migration.unverified.none@example.test', false, 'ACTIVE'),
      ('migration-unverified-suspended-member', 'Migration Unverified Suspended Member', 'migration.unverified.suspended@example.test', false, 'ACTIVE')
  `);
  await client.query(`
    INSERT INTO memberships (tenant_id, user_id, role, status) VALUES
      ('00000000-0000-0000-0000-000000000961', 'migration-provisioning-admin', 'TENANT_ADMIN', 'ACTIVE'),
      ('00000000-0000-0000-0000-000000000962', 'migration-unverified-user', 'OPERATOR', 'ACTIVE'),
      ('00000000-0000-0000-0000-000000000911', 'migration-suspended-user', 'OPERATOR', 'SUSPENDED'),
      ('00000000-0000-0000-0000-000000000901', 'migration-unverified-suspended-member', 'OPERATOR', 'SUSPENDED')
  `);
  await client.query("INSERT INTO platform_roles (user_id) VALUES ('migration-platform-admin'), ('migration-unverified-platform-admin')");
  await client.query(`
    INSERT INTO audit_events (id, actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, from_status, to_status, metadata) VALUES
      ('00000000-0000-0000-0000-000000000971', 'migration-platform-admin', 'SUPER_ADMIN', '00000000-0000-0000-0000-000000000962', 'TENANT_CREATED', 'TENANT', '00000000-0000-0000-0000-000000000962', 'SUCCESS', NULL, 'ACTIVE', '{"attemptId":"00000000-0000-4000-8000-000000000971","fingerprint":"f"}'),
      ('00000000-0000-0000-0000-000000000972', 'migration-platform-admin', 'SUPER_ADMIN', '00000000-0000-0000-0000-000000000962', 'TENANT_SUSPENDED', 'TENANT', '00000000-0000-0000-0000-000000000962', 'SUCCESS', 'ACTIVE', 'SUSPENDED', '{"attemptId":"00000000-0000-4000-8000-000000000972","fingerprint":"f"}'),
      ('00000000-0000-0000-0000-000000000973', 'migration-fixture-user', 'TENANT_MEMBER', '00000000-0000-0000-0000-000000000901', 'MENGANTAR_CREDENTIAL_CREATED', 'OUTLET', '00000000-0000-0000-0000-000000000902', 'SUCCESS', NULL, NULL, '{"connectionSource":"private","credentialChange":"created"}'),
      ('00000000-0000-0000-0000-000000000974', 'migration-provisioning-admin', 'TENANT_MEMBER', '00000000-0000-0000-0000-000000000961', 'MEMBER_INVITED', 'MEMBERSHIP', 'UNRESOLVED_MEMBER', 'DENIED', NULL, NULL, '{"attemptId":"00000000-0000-4000-8000-000000000974"}')
  `);
  const identitySnapshot = async () => {
    const tables = {};
    for (const [table, order] of [["tenants", "id"], ["users", "id"], ["memberships", "id"], ["platform_roles", "user_id"], ["audit_events", "id"]]) {
      const { rows } = await client.query(`SELECT to_jsonb(t) - 'mengantar_credential_policy' - 'contact_whatsapp' AS row FROM ${table} t ORDER BY ${order}`);
      tables[table] = rows.map((row) => row.row);
    }
    return tables;
  };
  const identityBefore = await identitySnapshot();
  const expectedCounts = { tenants: 5, users: 8, memberships: 5, platform_roles: 2, audit_events: 4 };
  for (const [table, count] of Object.entries(expectedCounts)) {
    // A guard that compares two empty lists proves nothing.
    if (identityBefore[table].length < count) {
      throw new Error(`Pre-0051 fixtures missing for ${table}: ${identityBefore[table].length} < ${count}`);
    }
  }

  await applyMigrations(migrations.slice(signUpIndex, signUpHardeningIndex));

  const identityAfter = await identitySnapshot();
  if (JSON.stringify(identityAfter) !== JSON.stringify(identityBefore)) {
    throw new Error(`An existing tenant, user, membership, platform role or audit row changed across 0051: ${JSON.stringify({ identityBefore, identityAfter })}`);
  }
  const { rows: tenantPolicies } = await client.query(`
    SELECT count(*)::int AS tenants,
      count(*) FILTER (WHERE mengantar_credential_policy = 'PLATFORM_DEFAULT_ALLOWED' AND contact_whatsapp IS NULL)::int AS unchanged
    FROM tenants
  `);
  if (tenantPolicies[0].tenants < 5 || tenantPolicies[0].unchanged !== tenantPolicies[0].tenants) {
    throw new Error(`An existing tenant did not keep the platform-default credential policy: ${JSON.stringify(tenantPolicies)}`);
  }
  const { rows: signUpChecks } = await client.query(`
    SELECT conname FROM pg_constraint
    WHERE contype = 'c' AND convalidated
      AND conname IN ('audit_events_action_valid', 'tenants_mengantar_credential_policy_valid', 'tenants_contact_whatsapp_valid', 'public_auth_rate_limits_key_valid', 'public_auth_rate_limits_count_positive', 'tenants_status_valid', 'memberships_role_valid')
  `);
  if (signUpChecks.length !== 7) {
    throw new Error(`0051 checks are not all validated against the existing rows: ${JSON.stringify(signUpChecks)}`);
  }
  // Exactly the setup policies accept PROVISIONING; every policy on a table that
  // ships still requires ACTIVE and names no PROVISIONING.
  const MOVED = [
    "outlets_active_tenant",
    "outlet_pickup_points_active_tenant_select", "outlet_pickup_points_active_tenant_insert",
    "outlet_pickup_points_active_tenant_update", "outlet_pickup_points_active_tenant_delete",
    "mengantar_connections_active_tenant_select", "mengantar_connections_tenant_admin_insert",
    "mengantar_connections_tenant_admin_update", "mengantar_connections_tenant_admin_delete",
    "managed_secret_payloads_active_tenant_select", "managed_secret_payloads_tenant_admin_insert",
    "mengantar_credential_rate_limits_tenant_admin", "audit_events_mengantar_credential_guard",
  ];
  const { rows: policies } = await client.query(`
    SELECT tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS text FROM pg_policies
  `);
  const provisioningPolicies = policies.filter((policy) => policy.text.includes("PROVISIONING")).map((policy) => policy.policyname).sort();
  const expectedProvisioning = [...MOVED, "tenants_self_registration_insert", "tenants_registration_review_update"].sort();
  const SHIPPING_TABLES = [
    "shipments", "shipment_drafts", "shipment_parties", "shipment_estimate_snapshots", "shipment_estimate_services",
    "shipment_cod_totals", "provider_batches", "provider_order_snapshots", "provider_unpaid_recoveries",
    "provider_settlement_pulls", "provider_settlement_items", "provider_order_status_observations",
    "ledger_entries", "reconciliation_runs", "print_events", "shipment_rts_events", "shipment_rate_limits",
    "contacts", "contact_addresses",
  ];
  const shippingPolicies = policies.filter((policy) =>
    SHIPPING_TABLES.includes(policy.tablename) && !policy.policyname.endsWith("_credential_policy"));
  if (
    JSON.stringify(provisioningPolicies) !== JSON.stringify(expectedProvisioning)
    || shippingPolicies.length < 30
    || !shippingPolicies.every((policy) => /status = 'ACTIVE'::text/.test(policy.text) && !policy.text.includes("PROVISIONING"))
  ) {
    throw new Error(`0051 moved a policy it should not have, or missed one: ${JSON.stringify({ provisioningPolicies, expectedProvisioning, shippingPolicies: shippingPolicies.length })}`);
  }
  const { rows: allocation } = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'allocate_shipment_reference'");
  if (!allocation[0]?.prosrc.includes("t.status = 'ACTIVE'") || allocation[0].prosrc.includes("PROVISIONING")) {
    throw new Error("Shipment number allocation no longer requires an ACTIVE tenant.");
  }
  // The runtime role: cannot move a tenant out of PROVISIONING even with the
  // platform-admin setting, cannot write the self-registration audit action,
  // cannot write users; can register a store, which is PROVISIONING and
  // PRIVATE_ONLY with its admin, outlet and audit event.
  const asRuntime = async (work) => {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE geraicuan_app");
      return await work();
    } catch (error) {
      return { code: error.code, message: error.message };
    } finally {
      await client.query("ROLLBACK");
    }
  };
  const legacyTransition = await asRuntime(async () => {
    await client.query("SELECT set_config('app.platform_admin', 'true', true)");
    await client.query("UPDATE tenants SET status = 'ACTIVE' WHERE id = '00000000-0000-0000-0000-000000000961'");
    return { code: "accepted" };
  });
  const forgedAudit = await asRuntime(async () => {
    await client.query(`INSERT INTO audit_events (actor_role, tenant_id, action, target_type, target_id, outcome)
      VALUES ('TENANT_MEMBER', '00000000-0000-0000-0000-000000000901', 'TENANT_SELF_REGISTERED', 'TENANT', '00000000-0000-0000-0000-000000000901', 'SUCCESS')`);
    return { code: "accepted" };
  });
  const verifyUser = await asRuntime(async () => {
    await client.query("UPDATE users SET email_verified = true WHERE id = 'migration-unverified-user'");
    const { rows } = await client.query("SELECT email_verified FROM users WHERE id = 'migration-unverified-user'");
    return { code: rows[0]?.email_verified === true ? "verified" : "unchanged" };
  });
  const renameUser = await asRuntime(async () => {
    await client.query("UPDATE users SET name = 'x' WHERE id = 'migration-unverified-user'");
    return { code: "accepted" };
  });
  const registration = await asRuntime(async () => {
    const { rows } = await client.query(`SELECT register_tenant_self_service('migration.signup@example.test', 'Pemilik Migrasi', repeat('h', 64), 'Toko Migrasi', '081234567890') AS tenant_id`);
    await client.query("RESET ROLE");
    const { rows: created } = await client.query(`
      SELECT t.status, t.mengantar_credential_policy, m.role, u.email_verified,
        (SELECT count(*)::int FROM outlets o WHERE o.tenant_id = t.id) AS outlets,
        (SELECT count(*)::int FROM audit_events e WHERE e.tenant_id = t.id AND e.action = 'TENANT_SELF_REGISTERED') AS audits
      FROM tenants t JOIN memberships m ON m.tenant_id = t.id JOIN users u ON u.id = m.user_id WHERE t.id = $1`, [rows[0].tenant_id]);
    return { code: "registered", created };
  });
  if (
    legacyTransition.code !== "42501"
    || forgedAudit.code !== "42501"
    || verifyUser.code !== "verified"
    || renameUser.code !== "42501"
    || registration.code !== "registered"
    || JSON.stringify(registration.created) !== JSON.stringify([{ status: "PROVISIONING", mengantar_credential_policy: "PRIVATE_ONLY", role: "TENANT_ADMIN", email_verified: false, outlets: 1, audits: 1 }])
  ) {
    throw new Error(`0051 guards did not hold for the runtime role: ${JSON.stringify({ legacyTransition, forgedAudit, verifyUser, renameUser, registration })}`);
  }
  if (JSON.stringify(await identitySnapshot()) !== JSON.stringify(identityBefore)) {
    throw new Error("The 0051 guard probes left a change behind.");
  }

  // Security review follow-up (0052). A store registered while 0051 was the
  // latest migration — the developer database's shape — must stay unverified;
  // every pre-0051 account with an ACTIVE membership or a platform role is
  // verified (M1), and nothing else about any row moves.
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE geraicuan_app");
  const { rows: selfRegistered } = await client.query(`
    SELECT register_tenant_self_service('migration.between@example.test', 'Pemilik Antara', repeat('h', 64), 'Toko Antara', '081234567891') AS tenant_id`);
  await client.query("COMMIT");
  if (!selfRegistered[0]?.tenant_id) throw new Error("The between-migrations store was not registered.");
  const withoutVerification = (snapshot) => ({
    ...snapshot,
    users: snapshot.users.map((row) => {
      const rest = { ...row };
      delete rest.email_verified;
      delete rest.updated_at;
      return rest;
    }),
  });
  const verificationById = async () => Object.fromEntries((await client.query(
    "SELECT id, email_verified FROM users ORDER BY id",
  )).rows.map((row) => [row.id, row.email_verified]));
  const beforeHardening = await identitySnapshot();
  const verificationBefore = await verificationById();
  const selfRegisteredUser = (await client.query(
    "SELECT id FROM users WHERE email = 'migration.between@example.test'",
  )).rows[0]?.id;
  if (
    verificationBefore["migration-unverified-user"] !== false
    || verificationBefore["migration-unverified-platform-admin"] !== false
    || verificationBefore[selfRegisteredUser] !== false
  ) {
    throw new Error(`Pre-0052 unverified fixtures are missing: ${JSON.stringify(verificationBefore)}`);
  }

  await applyMigrations(migrations.slice(signUpHardeningIndex, emailReleaseIndex));

  const verificationAfter = await verificationById();
  const expectedVerification = {
    ...verificationBefore,
    "migration-unverified-user": true,
    "migration-unverified-platform-admin": true,
  };
  if (
    JSON.stringify(verificationAfter) !== JSON.stringify(expectedVerification)
    || verificationAfter["migration-unverified-no-access"] !== false
    || verificationAfter["migration-unverified-suspended-member"] !== false
    || verificationAfter[selfRegisteredUser] !== false
    || JSON.stringify(withoutVerification(await identitySnapshot())) !== JSON.stringify(withoutVerification(beforeHardening))
  ) {
    throw new Error(`0052 did not verify exactly the pre-sign-up accounts with access, or changed another row: ${JSON.stringify({ verificationBefore, verificationAfter })}`);
  }
  const unverifyOperator = await asRuntime(async () => {
    await client.query("UPDATE users SET email_verified = false WHERE id = 'migration-fixture-user'");
    return { code: "accepted" };
  });
  const verifySelfRegistered = await asRuntime(async () => {
    const { rowCount } = await client.query("UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1", [selfRegisteredUser]);
    return { code: rowCount === 1 ? "verified" : "unchanged" };
  });
  const queueFor = (userId) => asRuntime(async () => {
    await client.query("SELECT set_config('app.platform_admin', 'true', true), set_config('app.user_id', $1, true)", [userId]);
    const { rows } = await client.query("SELECT count(*)::int AS n FROM platform_registration_queue");
    return { code: String(rows[0].n) };
  });
  const forgedQueue = await queueFor("migration-fixture-user");
  const superAdminQueue = await queueFor("migration-platform-admin");
  const formatCharacterName = await asRuntime(async () => {
    await client.query("SELECT register_tenant_self_service('migration.bidi@example.test', 'Pemilik \u202Eisarg', repeat('h', 64), 'Toko Bidi', '081234567892')");
    return { code: "registered" };
  });
  if (
    unverifyOperator.code !== "42501"
    || verifySelfRegistered.code !== "verified"
    || forgedQueue.code !== "0"
    || superAdminQueue.code !== "2"
    || formatCharacterName.code !== "22023"
  ) {
    throw new Error(`0052 guards did not hold for the runtime role: ${JSON.stringify({ unverifyOperator, verifySelfRegistered, forgedQueue, superAdminQueue, formatCharacterName })}`);
  }
  if (JSON.stringify(await verificationById()) !== JSON.stringify(verificationAfter)) {
    throw new Error("The 0052 guard probes left a change behind.");
  }

  // T-198 (0053). Rejections made while 0052 was the latest migration: only the
  // never-verified owner of a rejected registration, with no platform role and
  // no store that is not ARCHIVED, has its address released; a verified owner,
  // an owner holding a platform role, a legacy archived store's unverified
  // admin and a pending registration are untouched.
  const committedAsRuntime = async (work) => {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE geraicuan_app");
      const result = await work();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  };
  const registerStore = async (email, whatsapp) => {
    const { rows } = await client.query(
      "SELECT register_tenant_self_service($1, 'Pemilik Ditolak', repeat('h', 64), 'Toko Ditolak', $2) AS tenant_id",
      [email, whatsapp],
    );
    return rows[0].tenant_id;
  };
  const rejectStore = async (tenantId) => {
    await client.query("SELECT set_config('app.user_id', 'migration-platform-admin', true)");
    await client.query("SELECT * FROM review_tenant_registration($1, 'REJECT', 'Data tidak valid', gen_random_uuid())", [tenantId]);
  };
  const rejectedFixtures = {};
  for (const [key, email, whatsapp] of [
    ["unverified", "migration.rejected.unverified@example.test", "081234567893"],
    ["verified", "migration.rejected.verified@example.test", "081234567894"],
    ["platformRole", "migration.rejected.role@example.test", "081234567895"],
  ]) {
    const tenantId = await committedAsRuntime(() => registerStore(email, whatsapp));
    const userId = (await client.query("SELECT id FROM users WHERE email = $1", [email])).rows[0].id;
    if (key === "verified") await client.query("UPDATE users SET email_verified = true WHERE id = $1", [userId]);
    if (key === "platformRole") await client.query("INSERT INTO platform_roles (user_id) VALUES ($1)", [userId]);
    await committedAsRuntime(() => rejectStore(tenantId));
    rejectedFixtures[key] = { email, tenantId, userId };
  }
  await client.query(`
    INSERT INTO tenants (id, name, status) VALUES ('00000000-0000-0000-0000-000000000981', 'Migration Archived Legacy', 'ACTIVE')
  `);
  await client.query("UPDATE tenants SET status = 'ARCHIVED' WHERE id = '00000000-0000-0000-0000-000000000981'");
  await client.query(`
    INSERT INTO users (id, name, email, email_verified, status)
    VALUES ('migration-archived-unverified', 'Migration Archived Unverified', 'migration.archived.unverified@example.test', false, 'ACTIVE')
  `);
  await client.query(`
    INSERT INTO memberships (tenant_id, user_id, role, status)
    VALUES ('00000000-0000-0000-0000-000000000981', 'migration-archived-unverified', 'TENANT_ADMIN', 'ACTIVE')
  `);
  const beforeRelease = await identitySnapshot();
  const rejectedUnverifiedBefore = beforeRelease.users.find((row) => row.id === rejectedFixtures.unverified.userId);
  if (
    !rejectedUnverifiedBefore
    || rejectedUnverifiedBefore.email !== rejectedFixtures.unverified.email
    || rejectedUnverifiedBefore.email_verified !== false
    || beforeRelease.tenants.filter((row) => Object.values(rejectedFixtures).some((fixture) => fixture.tenantId === row.id) && row.status === "ARCHIVED").length !== 3
    || beforeRelease.users.find((row) => row.email === "migration.between@example.test")?.email_verified !== false
  ) {
    throw new Error(`Pre-0053 rejected-registration fixtures are missing: ${JSON.stringify(rejectedUnverifiedBefore)}`);
  }

  await applyMigrations(migrations.slice(emailReleaseIndex, contactIndex));

  const afterRelease = await identitySnapshot();
  const releasedAfter = afterRelease.users.find((row) => row.id === rejectedFixtures.unverified.userId);
  const expectedRelease = {
    ...beforeRelease,
    users: beforeRelease.users.map((row) => row.id === rejectedFixtures.unverified.userId
      ? { ...row, email: `released+${row.id}@registration.invalid`, status: "SUSPENDED", updated_at: releasedAfter?.updated_at }
      : row),
  };
  if (JSON.stringify(afterRelease) !== JSON.stringify(expectedRelease)) {
    throw new Error(`0053 released an address it should not have, or changed another row: ${JSON.stringify({ before: beforeRelease.users, after: afterRelease.users })}`);
  }
  // After 0053: a rejection releases a never-verified address inside the review
  // itself, the released address registers a new account and store, a verified
  // owner keeps theirs, and the review can read an owner's platform role.
  const releaseProbe = await asRuntime(async () => {
    const tenantId = await registerStore("migration.release.probe@example.test", "081234567896");
    const { rows: [owner] } = await client.query("SELECT id FROM users WHERE email = 'migration.release.probe@example.test'");
    await rejectStore(tenantId);
    const { rows: [released] } = await client.query("SELECT email, status FROM users WHERE id = $1", [owner.id]);
    // The audit row is not the runtime role's to read.
    await client.query("RESET ROLE");
    const { rows: [audit] } = await client.query(
      "SELECT metadata ->> 'ownerEmailReleased' AS released FROM audit_events WHERE tenant_id = $1 AND action = 'TENANT_REGISTRATION_REJECTED'",
      [tenantId],
    );
    await client.query("SET LOCAL ROLE geraicuan_app");
    const again = await registerStore("migration.release.probe@example.test", "081234567896");
    const { rows: [fresh] } = await client.query("SELECT id FROM users WHERE email = 'migration.release.probe@example.test'");
    return {
      code: released.email === `released+${owner.id}@registration.invalid` && released.status === "SUSPENDED"
        && audit.released === "true" && again && again !== tenantId && fresh.id !== owner.id
        ? "released" : JSON.stringify({ released, audit, again, fresh }),
    };
  });
  const verifiedProbe = await asRuntime(async () => {
    const tenantId = await registerStore("migration.keep.probe@example.test", "081234567897");
    await client.query("RESET ROLE");
    await client.query("UPDATE users SET email_verified = true WHERE email = 'migration.keep.probe@example.test'");
    await client.query("SET LOCAL ROLE geraicuan_app");
    await rejectStore(tenantId);
    const { rows } = await client.query("SELECT status FROM users WHERE email = 'migration.keep.probe@example.test'");
    return { code: rows[0]?.status === "ACTIVE" ? "kept" : JSON.stringify(rows) };
  });
  const { rows: reviewPolicy } = await client.query(
    "SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'platform_roles' AND policyname = 'platform_roles_registration_review_read' AND cmd = 'SELECT'",
  );
  if (releaseProbe.code !== "released" || verifiedProbe.code !== "kept" || reviewPolicy[0].n !== 1) {
    throw new Error(`0053 did not hold for the runtime role: ${JSON.stringify({ releaseProbe, verifiedProbe, reviewPolicy })}`);
  }
  if (JSON.stringify(await identitySnapshot()) !== JSON.stringify(afterRelease)) {
    throw new Error("The 0053 probes left a change behind.");
  }

  // 0057 (T-232): every pre-existing draft passes the new CHECKs (validated, all
  // NULL) and the table-level INSERT/SELECT grants reach the new column.
  const { rows: [vehicle] } = await client.query(`
    SELECT count(*)::int AS drafts, count(pickup_vehicle)::int AS with_vehicle,
      (SELECT count(*)::int FROM pg_constraint WHERE conrelid = 'shipment_drafts'::regclass AND convalidated
        AND conname IN ('shipment_drafts_pickup_vehicle_known', 'shipment_drafts_pickup_vehicle_pickup_only')) AS validated,
      (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.column_privileges
        WHERE table_name = 'shipment_drafts' AND column_name = 'pickup_vehicle' AND grantee = 'geraicuan_app') AS privileges
    FROM shipment_drafts
  `);
  if (vehicle.drafts < 1 || vehicle.with_vehicle !== 0 || vehicle.validated !== 2 || vehicle.privileges !== "INSERT,SELECT") {
    throw new Error(`0057 pickup_vehicle did not upgrade cleanly: ${JSON.stringify(vehicle)}`);
  }

  // 0058 (T-233) and 0059 (T-229): additive. Every tenant row (WhatsApp included) and
  // every audit row is unchanged; the WhatsApp is writable only through the definer
  // function, for an active Tenant Admin of the context tenant; the label settings table
  // starts empty (defaults) with forced RLS and the exact column grants.
  const fullTenants = async () => (await client.query("SELECT to_jsonb(t) AS row FROM tenants t ORDER BY id")).rows;
  const auditRows = async () => (await client.query("SELECT to_jsonb(a) AS row FROM audit_events a ORDER BY id")).rows;
  const tenantsBefore058 = await fullTenants();
  const auditBefore058 = await auditRows();
  if (tenantsBefore058.length < 5 || auditBefore058.length < 4) throw new Error("Pre-0058 fixtures missing.");
  await applyMigrations(migrations.slice(contactIndex, prefixRuleIndex));
  if (JSON.stringify(await fullTenants()) !== JSON.stringify(tenantsBefore058)
    || JSON.stringify(await auditRows()) !== JSON.stringify(auditBefore058)) {
    throw new Error("0058/0059 changed an existing tenant or audit row.");
  }
  const { rows: [admin058] } = await client.query(`
    SELECT m.user_id, m.tenant_id FROM memberships m JOIN users u ON u.id = m.user_id JOIN tenants t ON t.id = m.tenant_id
    WHERE m.role = 'TENANT_ADMIN' AND m.status = 'ACTIVE' AND u.status = 'ACTIVE' AND t.status = 'ACTIVE' ORDER BY m.id LIMIT 1`);
  if (!admin058) throw new Error("No active Tenant Admin fixture for the 0058 probe.");
  const inContext = async (userId, tenantId, statement) => asRuntime(async () => {
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)", [userId, tenantId]);
    await client.query(statement);
    return { code: "accepted" };
  });
  const contactSaved = await asRuntime(async () => {
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)", [admin058.user_id, admin058.tenant_id]);
    await client.query("SELECT public.set_tenant_contact_whatsapp('081355556666')");
    const { rows: [row] } = await client.query("SELECT contact_whatsapp FROM tenants WHERE id = $1", [admin058.tenant_id]);
    return { code: row?.contact_whatsapp === "081355556666" ? "saved" : JSON.stringify(row) };
  });
  const contactInvalid = await inContext(admin058.user_id, admin058.tenant_id, "SELECT public.set_tenant_contact_whatsapp('12345')");
  const contactDirect = await inContext(admin058.user_id, admin058.tenant_id, "UPDATE tenants SET contact_whatsapp = '081355556666'");
  const { rows: [labelTable] } = await client.query(`
    SELECT (SELECT count(*)::int FROM tenant_label_settings) AS rows,
      (SELECT relforcerowsecurity FROM pg_class WHERE relname = 'tenant_label_settings') AS forced,
      (SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.column_privileges
        WHERE table_name = 'tenant_label_settings' AND grantee = 'geraicuan_app' AND privilege_type = 'UPDATE') AS updatable
  `);
  if (
    contactSaved.code !== "saved" || contactInvalid.code !== "22023" || contactDirect.code !== "42501"
    || labelTable.rows !== 0 || labelTable.forced !== true
    || labelTable.updatable !== "show_recipient_address_detail,show_recipient_name,show_recipient_phone,show_return_warning,show_sender_address,show_sender_phone,updated_at,updated_by_user_id"
  ) {
    throw new Error(`0058/0059 did not upgrade cleanly: ${JSON.stringify({ contactSaved, contactInvalid, contactDirect, labelTable })}`);
  }
  if (JSON.stringify(await fullTenants()) !== JSON.stringify(tenantsBefore058)) {
    throw new Error("The 0058 probes left a change behind.");
  }

  // 0060 (T-225, D-21): new or changed prefixes are 2-3 characters, but a prefix stored
  // before it (here a 5-character one, valid under 0040's 2-5 CHECK) is left as it was and
  // keeps allocating: a NOT VALID CHECK would have refused every later update of the row.
  await client.query("UPDATE tenant_shipment_counters SET shipment_prefix = 'LEGAC' WHERE tenant_id = '00000000-0000-0000-0000-000000000901'");
  const countersBefore060 = (await client.query("SELECT to_jsonb(c) AS row FROM tenant_shipment_counters c ORDER BY tenant_id")).rows;
  await applyMigrations(migrations.slice(prefixRuleIndex, pickupWindowIndex));
  if (JSON.stringify((await client.query("SELECT to_jsonb(c) AS row FROM tenant_shipment_counters c ORDER BY tenant_id")).rows) !== JSON.stringify(countersBefore060)) {
    throw new Error("0060 changed an existing counter row.");
  }
  const asOwner = async (statement) => {
    await client.query("BEGIN");
    try {
      const { rows } = await client.query(statement);
      return { code: "accepted", rows };
    } catch (error) {
      return { code: error.code };
    } finally {
      await client.query("ROLLBACK");
    }
  };
  const legacyAllocation = await asOwner(
    "UPDATE tenant_shipment_counters SET last_number = last_number + 1 WHERE tenant_id = '00000000-0000-0000-0000-000000000901' RETURNING shipment_prefix, last_number",
  );
  const legacyRewrite = await asOwner("UPDATE tenant_shipment_counters SET shipment_prefix = 'LEGAD' WHERE tenant_id = '00000000-0000-0000-0000-000000000901'");
  const fourCharacters = await asOwner("UPDATE tenant_shipment_counters SET shipment_prefix = 'ABCD' WHERE tenant_id = '00000000-0000-0000-0000-000000000911'");
  const threeCharacters = await asOwner("UPDATE tenant_shipment_counters SET shipment_prefix = 'A29' WHERE tenant_id = '00000000-0000-0000-0000-000000000911'");
  const registeredWithPrefix = await asRuntime(async () => {
    const { rows: [row] } = await client.query(
      "SELECT register_tenant_self_service_with_prefix('migration.prefix.probe@example.test', 'Pemilik Awalan', repeat('h', 64), 'Toko Awalan', '081234567870', 'PHI') AS tenant_id",
    );
    await client.query("RESET ROLE");
    const { rows: [counter] } = await client.query(
      "SELECT shipment_prefix, shipment_prefix_locked_at, last_number FROM tenant_shipment_counters WHERE tenant_id = $1", [row.tenant_id]);
    return { code: counter?.shipment_prefix === "PHI" && counter.shipment_prefix_locked_at === null && counter.last_number === null ? "stored" : JSON.stringify(counter) };
  });
  const registeredLongPrefix = await asRuntime(async () => {
    await client.query("SELECT register_tenant_self_service_with_prefix('migration.prefix.long@example.test', 'Pemilik Awalan', repeat('h', 64), 'Toko Awalan', '081234567871', 'PHIX')");
    return { code: "accepted" };
  });
  if (
    legacyAllocation.code !== "accepted" || legacyAllocation.rows[0]?.shipment_prefix !== "LEGAC"
    || legacyRewrite.code !== "22023" || fourCharacters.code !== "22023" || threeCharacters.code !== "accepted"
    || registeredWithPrefix.code !== "stored" || registeredLongPrefix.code !== "22023"
  ) {
    throw new Error(`0060 did not upgrade cleanly: ${JSON.stringify({ legacyAllocation, legacyRewrite, fourCharacters, threeCharacters, registeredWithPrefix, registeredLongPrefix })}`);
  }

  // 0061 (T-234): the pickup-slot CHECK becomes a superset (08:00 added). A draft holding
  // the legacy 17:00 start, valid under 0054, is untouched, still updatable, and the
  // re-added constraint is validated; 08:00 is accepted, 07:00 and 18:00 are refused.
  await client.query(`
    UPDATE shipment_drafts SET handover_type = 'PICKUP', pickup_date = '2026-09-26', pickup_slot = '17:00'
    WHERE shipment_id = '00000000-0000-0000-0000-000000000903'`);
  const draftsSnapshot = async () => (await client.query("SELECT to_jsonb(d) AS row FROM shipment_drafts d ORDER BY shipment_id")).rows;
  const draftsBefore061 = await draftsSnapshot();
  await applyMigrations(migrations.slice(pickupWindowIndex));
  if (JSON.stringify(await draftsSnapshot()) !== JSON.stringify(draftsBefore061)) {
    throw new Error("0061 changed an existing draft row.");
  }
  const { rows: [slotCheck] } = await client.query(`
    SELECT convalidated, pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid = 'shipment_drafts'::regclass AND conname = 'shipment_drafts_pickup_slot_valid'`);
  const setSlot = (slot) => asOwner(
    `UPDATE shipment_drafts SET pickup_slot = '${slot}' WHERE shipment_id = '00000000-0000-0000-0000-000000000903'`);
  const legacyTouch = await asOwner(
    "UPDATE shipment_drafts SET pickup_date = '2026-09-27' WHERE shipment_id = '00000000-0000-0000-0000-000000000903' AND pickup_slot = '17:00' RETURNING pickup_slot");
  const [eight, nine, seven, eighteen] = [await setSlot("08:00"), await setSlot("09:00"), await setSlot("07:00"), await setSlot("18:00")];
  if (
    slotCheck?.convalidated !== true || !slotCheck.definition.includes("^(0[89]|1[0-7]):00$")
    || legacyTouch.code !== "accepted" || legacyTouch.rows[0]?.pickup_slot !== "17:00"
    || eight.code !== "accepted" || nine.code !== "accepted" || seven.code !== "23514" || eighteen.code !== "23514"
  ) {
    throw new Error(`0061 did not upgrade cleanly: ${JSON.stringify({ slotCheck, legacyTouch, eight, nine, seven, eighteen })}`);
  }
  if (JSON.stringify(await draftsSnapshot()) !== JSON.stringify(draftsBefore061)) {
    throw new Error("The 0061 probes left a change behind.");
  }

  console.log(`Migration upgrade check passed through ${migrations.at(-1)}.`);
} finally {
  await client.end();
}
