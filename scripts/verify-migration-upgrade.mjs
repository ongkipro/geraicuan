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

  for (const migration of migrations.slice(0, -1)) {
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
    INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address)
    VALUES
      ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000903', 'SENDER', 'Fixture Sender', '+6281211111111', 'Fixture Sender Address'),
      ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000903', 'RECIPIENT', 'Fixture Recipient', '+6281222222222', 'Fixture Recipient Address')
  `);

  const latestMigration = await readFile(join(migrationsDirectory, migrations.at(-1)), "utf8");
  for (const statement of latestMigration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
    await client.query(statement);
  }

  const { rows: fixture } = await client.query(`
    SELECT
      (SELECT count(*) FROM tenants WHERE id = '00000000-0000-0000-0000-000000000901') AS tenants,
      (SELECT count(*) FROM shipments WHERE id = '00000000-0000-0000-0000-000000000903') AS shipments,
      (SELECT count(*) FROM shipment_parties WHERE shipment_id = '00000000-0000-0000-0000-000000000903') AS parties
  `);
  const { rows: contactsPolicy } = await client.query(
    "SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contacts'",
  );
  if (
    fixture[0]?.tenants !== "1" ||
    fixture[0]?.shipments !== "1" ||
    fixture[0]?.parties !== "2" ||
    !contactsPolicy.some(({ policyname }) => policyname === "contacts_active_tenant")
  ) {
    throw new Error("Representative fixture or tenant isolation policy was not preserved.");
  }

  console.log(`Migration upgrade check passed through ${migrations.at(-1)}.`);
} finally {
  await client.end();
}
