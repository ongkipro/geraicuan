import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import {
  enforceOrderRateLimit,
  enforceUnpaidRecoveryRateLimit,
  UnpaidRecoveryRateLimitedError,
} from "@/lib/order-rate-limit";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required for integration tests.");
}
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });
const tenantA = "00000000-0000-0000-0000-000000000d01";
const tenantB = "00000000-0000-0000-0000-000000000d02";
const adminA = "rate-limit-admin-a";
const adminB = "rate-limit-admin-b";

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await adminPool.query(
    "TRUNCATE shipment_rate_limits, memberships, tenants, users CASCADE",
  );
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'Rate Limit Admin A', 'rate-limit-admin-a@example.test'),
      ($2, 'Rate Limit Admin B', 'rate-limit-admin-b@example.test')`,
    [adminA, adminB],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'Rate Limit Tenant A', 'ACTIVE'), ($2, 'Rate Limit Tenant B', 'ACTIVE')",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($3, $4, 'TENANT_ADMIN')",
    [tenantA, adminA, tenantB, adminB],
  );
});

afterAll(async () => {
  await Promise.all([adminPool.end(), appPool.end()]);
});

describe("provider mutation rate limit", () => {
  it("shares a durable tenant-actor budget across order submission and unpaid recovery", async () => {
    const consumeRecovery = (principalId: string, tenantId: string) =>
      withTenantContext(appDb, principalId, tenantId, (tx, context) =>
        enforceUnpaidRecoveryRateLimit(tx, context),
      );

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await consumeRecovery(adminA, tenantA);
    }
    await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      enforceOrderRateLimit(tx, context),
    );
    await expect(consumeRecovery(adminA, tenantA)).rejects.toBeInstanceOf(
      UnpaidRecoveryRateLimitedError,
    );

    await expect(consumeRecovery(adminB, tenantB)).resolves.toBeUndefined();
  });
});
