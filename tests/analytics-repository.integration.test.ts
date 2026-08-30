import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  countTenantShipments,
  loadShipmentKpis,
  loadShipmentPage,
  loadShipmentTrend,
} from "@/db/analytics-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { parseAnalyticsRange } from "@/lib/analytics-range";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;

if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error(
    "DATABASE_URL and APP_DATABASE_URL are required for integration tests.",
  );
}

if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-0000-0000-000000001701";
const tenantB = "00000000-0000-0000-0000-000000001702";
const outletA = "00000000-0000-0000-0000-000000001711";
const outletB = "00000000-0000-0000-0000-000000001712";
const exactStartShipment = "00000000-0000-0000-0000-000000001721";
const beforeWibMidnightShipment = "00000000-0000-0000-0000-000000001722";
const afterWibMidnightShipment = "00000000-0000-0000-0000-000000001723";
const exactEndShipment = "00000000-0000-0000-0000-000000001724";
const tenantBShipment = "00000000-0000-0000-0000-000000001725";
const userA = "analytics-user-a";
const userB = "analytics-user-b";
const tenantIds = [tenantA, tenantB];
const userIds = [userA, userB];
const rangeNow = new Date("2026-08-31T04:00:00.000Z");

async function cleanFixture() {
  await adminPool.query(
    "DELETE FROM shipments WHERE tenant_id = ANY($1::uuid[])",
    [tenantIds],
  );
  await adminPool.query(
    "DELETE FROM outlets WHERE tenant_id = ANY($1::uuid[])",
    [tenantIds],
  );
  await adminPool.query(
    "DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])",
    [tenantIds],
  );
  await adminPool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [
    tenantIds,
  ]);
  await adminPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [
    userIds,
  ]);
}

beforeAll(async () => {
  await cleanFixture();
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6)",
    [
      userA,
      "Analytics User A",
      "analytics-a@example.test",
      userB,
      "Analytics User B",
      "analytics-b@example.test",
    ],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, $2, 'ACTIVE'), ($3, $4, 'ACTIVE')",
    [tenantA, "Analytics Tenant A", tenantB, "Analytics Tenant B"],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($3, $4, 'TENANT_ADMIN')",
    [tenantA, userA, tenantB, userB],
  );
  await adminPool.query(
    "INSERT INTO outlets (id, tenant_id, name) VALUES ($1, $2, $3), ($4, $5, $6)",
    [outletA, tenantA, "Outlet Analitik A", outletB, tenantB, "Outlet Analitik B"],
  );
  await adminPool.query(
    `INSERT INTO shipments (id, tenant_id, outlet_id, status, created_at)
     VALUES
       ($1, $2, $3, 'ISSUED', $4),
       ($5, $2, $3, 'DRAFT', $6),
       ($7, $2, $3, 'ISSUED', $8),
       ($9, $2, $3, 'ISSUED', $10),
       ($11, $12, $13, 'ISSUED', $14)`,
    [
      exactStartShipment,
      tenantA,
      outletA,
      "2026-08-29T17:00:00.000Z",
      beforeWibMidnightShipment,
      "2026-08-30T16:30:00.000Z",
      afterWibMidnightShipment,
      "2026-08-30T17:30:00.000Z",
      exactEndShipment,
      "2026-08-31T17:00:00.000Z",
      tenantBShipment,
      tenantB,
      outletB,
      "2026-08-30T12:00:00.000Z",
    ],
  );
});

afterAll(async () => {
  try {
    await cleanFixture();
  } finally {
    await Promise.all([adminPool.end(), appPool.end()]);
  }
});

function customRange(timezone: "Asia/Jakarta" | "Asia/Jayapura") {
  return parseAnalyticsRange(
    {
      rentang: "kustom",
      dari: "2026-08-30",
      sampai: "2026-08-31",
      tz: timezone,
    },
    rangeNow,
  );
}

describe("tenant shipment analytics repository", () => {
  it.each(["Asia/Jakarta", "Asia/Jayapura"] as const)(
    "binds KPI, trend, and table to the same %s range",
    async (timezone) => {
      const range = customRange(timezone);
      const result = await withTenantContext(
        appDb,
        userA,
        tenantA,
        async (tx, context) => {
          const kpis = await loadShipmentKpis(tx, context, range);
          const trend = await loadShipmentTrend(tx, context, range);
          const shipmentPage = await loadShipmentPage(tx, context, range, {
            limit: 50,
            offset: 0,
          });
          return { kpis, trend, shipmentPage };
        },
      );

      const trendCreated = result.trend.reduce(
        (sum, point) => sum + point.createdCount,
        0,
      );
      const trendIssued = result.trend.reduce(
        (sum, point) => sum + point.issuedCount,
        0,
      );

      expect(result.kpis.createdCount).toBe(3);
      expect(result.kpis.issuedCount).toBe(2);
      expect(trendCreated).toBe(result.kpis.createdCount);
      expect(trendIssued).toBe(result.kpis.issuedCount);
      expect(result.shipmentPage.totalCount).toBe(
        result.kpis.createdCount,
      );
      expect(result.shipmentPage.rows.map(({ shipmentId }) => shipmentId)).toEqual([
        afterWibMidnightShipment,
        beforeWibMidnightShipment,
        exactStartShipment,
      ]);
      expect(
        result.shipmentPage.rows.some(
          ({ shipmentId }) => shipmentId === exactEndShipment,
        ),
      ).toBe(false);
      expect(
        result.shipmentPage.rows.some(
          ({ shipmentId }) => shipmentId === tenantBShipment,
        ),
      ).toBe(false);
    },
  );

  it("assigns midnight-straddling rows to buckets in the selected timezone", async () => {
    const [jakarta, jayapura] = await Promise.all([
      withTenantContext(appDb, userA, tenantA, (tx, context) =>
        loadShipmentTrend(tx, context, customRange("Asia/Jakarta")),
      ),
      withTenantContext(appDb, userA, tenantA, (tx, context) =>
        loadShipmentTrend(tx, context, customRange("Asia/Jayapura")),
      ),
    ]);

    expect(jakarta).toEqual([
      { key: "2026-08-30", createdCount: 2, issuedCount: 1 },
      { key: "2026-08-31", createdCount: 1, issuedCount: 1 },
    ]);
    expect(jayapura).toEqual([
      { key: "2026-08-30", createdCount: 1, issuedCount: 1 },
      { key: "2026-08-31", createdCount: 2, issuedCount: 1 },
    ]);
  });

  it("derives tenant scope from context for every aggregate and row read", async () => {
    const range = customRange("Asia/Jakarta");
    const tenantAResult = await withTenantContext(
      appDb,
      userA,
      tenantA,
      async (tx, context) => ({
        kpis: await loadShipmentKpis(tx, context, range),
        trend: await loadShipmentTrend(tx, context, range),
        page: await loadShipmentPage(tx, context, range, {
          limit: 50,
          offset: 0,
        }),
        allTimeCount: await countTenantShipments(tx, context),
      }),
    );
    const tenantBResult = await withTenantContext(
      appDb,
      userB,
      tenantB,
      async (tx, context) => ({
        kpis: await loadShipmentKpis(tx, context, range),
        trend: await loadShipmentTrend(tx, context, range),
        page: await loadShipmentPage(tx, context, range, {
          limit: 50,
          offset: 0,
        }),
        allTimeCount: await countTenantShipments(tx, context),
      }),
    );

    expect(tenantAResult).toMatchObject({
      kpis: { createdCount: 3, issuedCount: 2 },
      page: { totalCount: 3 },
      allTimeCount: 4,
    });
    expect(
      tenantAResult.trend.reduce(
        (sum, point) => sum + point.createdCount,
        0,
      ),
    ).toBe(3);
    expect(tenantBResult).toMatchObject({
      kpis: { createdCount: 1, issuedCount: 1 },
      trend: [{ key: "2026-08-30", createdCount: 1, issuedCount: 1 }],
      page: {
        totalCount: 1,
        rows: [{ shipmentId: tenantBShipment }],
      },
      allTimeCount: 1,
    });
  });
});
