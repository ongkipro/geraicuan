import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import {
  enforceLocationSearchRateLimit,
  LocationSearchConcurrencyError,
  LocationSearchRateLimitedError,
  withLocationSearchConcurrencyGuard,
} from "@/lib/location-search-rate-limit";
import {
  MengantarConfigurationError,
  resolveMengantarAccountCredentials,
} from "@/lib/mengantar-credentials";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required for integration tests.");
}
if (
  new URL(adminDatabaseUrl).hostname !== "127.0.0.1"
  || new URL(adminDatabaseUrl).pathname !== "/geraicuan_test"
) {
  throw new Error("Integration tests require the isolated localhost geraicuan_test database.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });
const tenantA = "00000000-0000-4000-8000-000000000551";
const tenantB = "00000000-0000-4000-8000-000000000552";
const actorA = "location-rate-actor-a";
const actorA2 = "location-rate-actor-a2";
const actorB = "location-rate-actor-b";
const outletA = "00000000-0000-4000-8000-000000000553";
const outletB = "00000000-0000-4000-8000-000000000554";
const fixtureTenants = [tenantA, tenantB];
const fixtureActors = [actorA, actorA2, actorB];

async function removeFixtures() {
  await adminPool.query(
    "DELETE FROM shipment_rate_limits WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenants],
  );
  await adminPool.query("DELETE FROM outlets WHERE tenant_id = ANY($1::uuid[])", [fixtureTenants]);
  await adminPool.query(
    "DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenants],
  );
  await adminPool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [fixtureTenants]);
  await adminPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [fixtureActors]);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await removeFixtures();
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'Location Actor A', 'location-rate-a@example.test'),
      ($2, 'Location Actor A2', 'location-rate-a2@example.test'),
      ($3, 'Location Actor B', 'location-rate-b@example.test')`,
    fixtureActors,
  );
  await adminPool.query(
    `INSERT INTO tenants (id, name, status) VALUES
      ($1, 'Location Tenant A', 'ACTIVE'),
      ($2, 'Location Tenant B', 'ACTIVE')`,
    fixtureTenants,
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'OPERATOR'),
      ($1, $3, 'TENANT_ADMIN'),
      ($4, $5, 'OPERATOR')`,
    [tenantA, actorA, actorA2, tenantB, actorB],
  );
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name) VALUES
      ($1, $2, 'Location Outlet A'),
      ($3, $4, 'Location Outlet B')`,
    [outletA, tenantA, outletB, tenantB],
  );
});

afterAll(async () => {
  await removeFixtures();
  await Promise.all([adminPool.end(), appPool.end()]);
});

describe("Mengantar location-search resource controls", () => {
  it("denies resolving another tenant's outlet before any provider call", async () => {
    await expect(withTenantContext(appDb, actorA, tenantA, (tx, context) =>
      resolveMengantarAccountCredentials(tx, context, outletB)))
      .rejects.toBeInstanceOf(MengantarConfigurationError);
  });

  it("persists an atomic 40-attempt tenant-actor budget with isolated actors and tenants", async () => {
    const consume = (actorId: string, tenantId: string) =>
      withTenantContext(appDb, actorId, tenantId, (tx, context) =>
        enforceLocationSearchRateLimit(tx, context));

    for (let attempt = 0; attempt < 40; attempt += 1) {
      await consume(actorA, tenantA);
    }
    await expect(consume(actorA, tenantA)).rejects.toBeInstanceOf(
      LocationSearchRateLimitedError,
    );
    await expect(consume(actorA2, tenantA)).resolves.toBeUndefined();
    await expect(consume(actorB, tenantB)).resolves.toBeUndefined();

    const persisted = await adminPool.query<{ actor_id: string; count: number }>(
      `SELECT actor_id, count
       FROM shipment_rate_limits
       WHERE tenant_id = $1 AND operation = 'location-search'
       ORDER BY actor_id`,
      [tenantA],
    );
    expect(persisted.rows).toEqual([
      { actor_id: actorA, count: 40 },
      { actor_id: actorA2, count: 1 },
    ]);
  });

  it("rejects a concurrent same-actor search immediately and releases the session lock", async () => {
    let enterFirst!: () => void;
    let releaseFirst!: () => void;
    const entered = new Promise<void>((resolve) => { enterFirst = resolve; });
    const released = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const context = { tenantId: tenantA, userId: actorA };

    const first = withLocationSearchConcurrencyGuard(appPool, context, async () => {
      enterFirst();
      await released;
      return "first";
    });
    await entered;

    await expect(withLocationSearchConcurrencyGuard(
      appPool,
      context,
      async () => "second",
    )).rejects.toBeInstanceOf(LocationSearchConcurrencyError);

    releaseFirst();
    await expect(first).resolves.toBe("first");
    await expect(withLocationSearchConcurrencyGuard(
      appPool,
      context,
      async () => "after-release",
    )).resolves.toBe("after-release");
  });
});
