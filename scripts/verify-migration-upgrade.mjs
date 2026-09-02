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
    for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
      await client.query(statement);
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

  for (const migration of migrations.slice(destinationAuthorityIndex)) {
    const sql = await readFile(join(migrationsDirectory, migration), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
      await client.query(statement);
    }
  }

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

  console.log(`Migration upgrade check passed through ${migrations.at(-1)}.`);
} finally {
  await client.end();
}
