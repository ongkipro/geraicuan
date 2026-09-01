import type { Pool } from "pg";

export async function ensureIntegrationRuntimeRole(
  adminPool: Pool,
  appDatabaseUrl: string | undefined,
) {
  if (!appDatabaseUrl) {
    throw new Error("APP_DATABASE_URL is required for integration tests.");
  }

  const target = new URL(appDatabaseUrl);
  if (
    target.hostname !== "127.0.0.1"
    || target.pathname !== "/geraicuan_test"
    || target.username !== "geraicuan_test_runtime"
  ) {
    throw new Error("Integration runtime role setup requires the isolated localhost database.");
  }

  await adminPool.query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'geraicuan_test_runtime') THEN CREATE ROLE geraicuan_test_runtime LOGIN INHERIT IN ROLE geraicuan_app; END IF; END $$",
  );
  const passwordStatement = await adminPool.query<{ statement: string }>(
    "SELECT format('ALTER ROLE geraicuan_test_runtime LOGIN INHERIT PASSWORD %L', $1::text) AS statement",
    [decodeURIComponent(target.password)],
  );
  await adminPool.query(passwordStatement.rows[0].statement);
  await adminPool.query("GRANT geraicuan_app TO geraicuan_test_runtime");
}
