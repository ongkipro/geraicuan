import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AnalyticsExportLimitError,
  AnalyticsFilterDeniedError,
  countTenantShipments,
  loadAnalyticsFilterOptions,
  loadCourierPerformance,
  loadShipmentExport,
  loadShipmentKpiComparison,
  loadShipmentKpis,
  loadShipmentPage,
  loadShipmentTrend,
} from "@/db/analytics-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { parseAnalyticsRange } from "@/lib/analytics-range";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
}
if (
  new URL(adminDatabaseUrl).pathname !== "/geraicuan_test" ||
  new URL(appDatabaseUrl).pathname !== "/geraicuan_test"
) {
  throw new Error("Analytics integration tests require geraicuan_test.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-0000-0000-000000001701";
const tenantB = "00000000-0000-0000-0000-000000001702";
const outletA = "00000000-0000-0000-0000-000000001711";
const outletB = "00000000-0000-0000-0000-000000001712";
const exactStart = "00000000-0000-0000-0000-000000001721";
const awaiting = "00000000-0000-0000-0000-000000001722";
const failed = "00000000-0000-0000-0000-000000001723";
const exactEnd = "00000000-0000-0000-0000-000000001724";
const tenantBShipment = "00000000-0000-0000-0000-000000001725";
const createdBeforeIssuedInside = "00000000-0000-0000-0000-000000001726";
const createdInsideIssuedAfter = "00000000-0000-0000-0000-000000001727";
const userA = "analytics-user-a";
const userB = "analytics-user-b";
const tenantIds = [tenantA, tenantB];

function orderIds(sequence: number) {
  const suffix = String(sequence).padStart(12, "0");
  return {
    snapshot: `00000000-0000-0000-0037-${suffix}`,
    service: `00000000-0000-0000-0038-${suffix}`,
    batch: `00000000-0000-0000-0039-${suffix}`,
    order: `00000000-0000-0000-0040-${suffix}`,
  };
}

async function clean() {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    for (const table of [
      "ledger_entries",
      "provider_order_snapshots",
      "provider_batches",
      "shipment_cod_totals",
      "shipment_estimate_services",
      "shipment_estimate_snapshots",
      "shipments",
      "outlets",
      "memberships",
    ]) {
      await client.query(
        `DELETE FROM ${table} WHERE tenant_id = ANY($1::uuid[])`,
        [tenantIds],
      );
    }
    await client.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [
      tenantIds,
    ]);
    await client.query("DELETE FROM users WHERE id = ANY($1::text[])", [
      [userA, userB],
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedIssued(input: {
  sequence: number;
  shipmentId: string;
  tenantId: string;
  outletId: string;
  resolvedAt: string;
  isCod: boolean;
  shipping: number;
  courier?: string;
}) {
  const ids = orderIds(input.sequence);
  const principal = 100_000;
  const serviceFee = 3_300;
  const vat = 363;
  const providerCod = input.isCod
    ? principal + input.shipping + serviceFee + vat
    : null;

  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots
      (id, tenant_id, shipment_id, outlet_id, origin_area_id,
       destination_area_id, destination_area_label, weight_grams, is_cod_requested, credential_source)
     VALUES ($1,$2,$3,$4,'origin','destination','Destination',1000,$5,'platform_default')`,
    [ids.snapshot, input.tenantId, input.shipmentId, input.outletId, input.isCod],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services
      (id, tenant_id, snapshot_id, provider_service, currency,
       shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible)
     VALUES ($1,$2,$3,'JNE REG','IDR',$4,'price','fixture',true)`,
    [ids.service, input.tenantId, ids.snapshot, input.shipping],
  );
  if (input.isCod) {
    await adminPool.query(
      `INSERT INTO shipment_cod_totals
        (tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
         goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
         provider_cod_amount_idr)
       VALUES ($1,$2,$3,$4,'IDR',$5,$6,$7,$8,$9)`,
      [
        input.tenantId,
        input.shipmentId,
        ids.snapshot,
        ids.service,
        principal,
        input.shipping,
        serviceFee,
        vat,
        providerCod,
      ],
    );
  }
  await adminPool.query(
    `INSERT INTO provider_batches
      (id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
       provider_account_key, idempotency_key, status, submission_attempted_at,
       completed_at)
     VALUES ($1,$2,$3,'pickup',$7,'platform_default',$4,$5,'COMPLETED',$6,$6)`,
    [
      ids.batch,
      input.tenantId,
      input.outletId,
      input.sequence.toString(16).padStart(64, "0"),
      (input.sequence + 100).toString(16).padStart(64, "0"),
      input.resolvedAt,
      input.courier ?? "JNE",
    ],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots
      (id, tenant_id, batch_id, shipment_id, estimate_snapshot_id,
       estimate_service_id, position, provider_service, destination_area_id, destination_area_label, currency,
       shipping_amount_idr, is_cod, provider_cod_amount_idr, status,
       provider_order_id, is_paid, cnote_no, resolved_at)
     VALUES ($1,$2,$3,$4,$5,$6,0,'JNE REG','destination','Destination','IDR',$7,$8,$9,'ISSUED',$10,true,$11,$12)`,
    [
      ids.order,
      input.tenantId,
      ids.batch,
      input.shipmentId,
      ids.snapshot,
      ids.service,
      input.shipping,
      input.isCod,
      providerCod,
      `order-${input.sequence}`,
      `AWB-${input.sequence}`,
      input.resolvedAt,
    ],
  );
  await adminPool.query("UPDATE shipments SET status='ISSUED' WHERE id=$1", [
    input.shipmentId,
  ]);

  const entries: Array<[string, string, number]> = [
    ["MENGANTAR_SHIPPING_COST", "EXPENSE", input.shipping],
  ];
  if (input.isCod) {
    entries.push(
      ["COD_PRINCIPAL_COLLECTABLE", "LIABILITY", principal],
      ["GERAICUAN_COD_SERVICE_FEE_REVENUE", "REVENUE", serviceFee],
      ["COD_SERVICE_FEE_VAT_PAYABLE", "LIABILITY", vat],
    );
  }
  for (const [entryType, financialClass, amount] of entries) {
    await adminPool.query(
      `INSERT INTO ledger_entries
        (tenant_id, outlet_id, shipment_id, provider_batch_id,
         provider_order_snapshot_id, entry_type, financial_class, amount_idr,
         currency, effective_at, source_event, source_event_id, actor_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'IDR',$9,
         'PROVIDER_ORDER_ISSUED',$5::uuid::text,'SYSTEM')`,
      [
        input.tenantId,
        input.outletId,
        input.shipmentId,
        ids.batch,
        ids.order,
        entryType,
        financialClass,
        amount,
        input.resolvedAt,
      ],
    );
  }
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await clean();
  await adminPool.query(
    `INSERT INTO users (id,name,email) VALUES
      ($1,'Analytics A','analytics-a@example.test'),
      ($2,'Analytics B','analytics-b@example.test')`,
    [userA, userB],
  );
  await adminPool.query(
    `INSERT INTO tenants (id,name,status) VALUES
      ($1,'Analytics Tenant A','ACTIVE'),($2,'Analytics Tenant B','ACTIVE')`,
    [tenantA, tenantB],
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id,user_id,role) VALUES
      ($1,$2,'TENANT_ADMIN'),($3,$4,'TENANT_ADMIN')`,
    [tenantA, userA, tenantB, userB],
  );
  await adminPool.query(
    `INSERT INTO outlets (id,tenant_id,name) VALUES
      ($1,$2,'Outlet A'),($3,$4,'Outlet B')`,
    [outletA, tenantA, outletB, tenantB],
  );
  await adminPool.query(
    `INSERT INTO shipments (id,tenant_id,outlet_id,status,created_at) VALUES
      ($1,$2,$3,'DRAFT','2026-08-29T17:00:00Z'),
      ($4,$2,$3,'AWAITING_UPSTREAM_PAYMENT','2026-08-30T16:30:00Z'),
      ($5,$2,$3,'FAILED','2026-08-30T17:30:00Z'),
      ($6,$2,$3,'DRAFT','2026-08-31T17:00:00Z'),
      ($7,$8,$9,'DRAFT','2026-08-30T12:00:00Z'),
      ($10,$2,$3,'DRAFT','2026-08-29T12:00:00Z'),
      ($11,$2,$3,'DRAFT','2026-08-30T19:00:00Z')`,
    [
      exactStart,
      tenantA,
      outletA,
      awaiting,
      failed,
      exactEnd,
      tenantBShipment,
      tenantB,
      outletB,
      createdBeforeIssuedInside,
      createdInsideIssuedAfter,
    ],
  );
  await seedIssued({
    sequence: 1,
    shipmentId: createdBeforeIssuedInside,
    tenantId: tenantA,
    outletId: outletA,
    resolvedAt: "2026-08-30T16:30:00Z",
    isCod: true,
    shipping: 10_000,
  });
  await seedIssued({
    sequence: 2,
    shipmentId: exactStart,
    tenantId: tenantA,
    outletId: outletA,
    resolvedAt: "2026-08-30T17:30:00Z",
    isCod: false,
    shipping: 8_000,
    courier: "J&T",
  });
  await seedIssued({
    sequence: 3,
    shipmentId: createdInsideIssuedAfter,
    tenantId: tenantA,
    outletId: outletA,
    resolvedAt: "2026-08-31T18:00:00Z",
    isCod: false,
    shipping: 9_000,
  });
  await seedIssued({
    sequence: 4,
    shipmentId: tenantBShipment,
    tenantId: tenantB,
    outletId: outletB,
    resolvedAt: "2026-08-30T12:30:00Z",
    isCod: false,
    shipping: 7_000,
    courier: "SICEPAT",
  });
});

afterAll(async () => {
  try {
    await clean();
  } finally {
    await Promise.all([adminPool.end(), appPool.end()]);
  }
});

function range(timezone: "Asia/Jakarta" | "Asia/Jayapura") {
  return parseAnalyticsRange(
    {
      rentang: "kustom",
      dari: "2026-08-30",
      sampai: "2026-08-31",
      tz: timezone,
    },
    new Date("2026-08-31T04:00:00Z"),
  );
}

describe("tenant shipment analytics repository", () => {
  it.each(["Asia/Jakarta", "Asia/Jayapura"] as const)(
    "uses authoritative event and ledger time in %s",
    async (timezone) => {
      const selected = range(timezone);
      const result = await withTenantContext(
        appDb,
        userA,
        tenantA,
        async (tx, context) => ({
          kpis: await loadShipmentKpis(tx, context, selected),
          trend: await loadShipmentTrend(tx, context, selected),
          page: await loadShipmentPage(tx, context, selected, {
            limit: 50,
            offset: 0,
          }),
        }),
      );

      expect(result.kpis).toEqual({
        createdCount: 4,
        issuedCount: 2,
        resolvedSubmissionCount: 2,
        providerShippingIdr: 18_000,
        codServiceFeeIdr: 3_300,
        codVatIdr: 363,
        codPrincipalIdr: 100_000,
        cogsIdr: 0,
        netMarginIdr: 78_337,
      });
      expect(result.trend.generatedAt).toBeInstanceOf(Date);
      expect(result.trend.points.reduce((sum, row) => sum + row.createdCount, 0)).toBe(4);
      expect(result.trend.points.reduce((sum, row) => sum + row.issuedCount, 0)).toBe(2);
      expect(result.page.rows.map((row) => row.shipmentId)).toEqual([
        createdInsideIssuedAfter,
        failed,
        awaiting,
        exactStart,
      ]);
    },
  );

  it("buckets created and issued events independently", async () => {
    const jakarta = await withTenantContext(appDb, userA, tenantA, (tx, context) =>
      loadShipmentTrend(tx, context, range("Asia/Jakarta")),
    );
    const jayapura = await withTenantContext(appDb, userA, tenantA, (tx, context) =>
      loadShipmentTrend(tx, context, range("Asia/Jayapura")),
    );
    expect(jakarta.generatedAt).toBeInstanceOf(Date);
    expect(jakarta.points).toEqual([
      { key: "2026-08-30", createdCount: 2, issuedCount: 1 },
      { key: "2026-08-31", createdCount: 2, issuedCount: 1 },
    ]);
    expect(jayapura.generatedAt).toBeInstanceOf(Date);
    expect(jayapura.points).toEqual([
      { key: "2026-08-30", createdCount: 1, issuedCount: 0 },
      { key: "2026-08-31", createdCount: 3, issuedCount: 2 },
    ]);
  });

  it("uses the selected event basis for supporting rows", async () => {
    const selected = range("Asia/Jakarta");
    const result = await withTenantContext(
      appDb,
      userA,
      tenantA,
      async (tx, context) => ({
        created: await loadShipmentPage(
          tx,
          context,
          selected,
          { limit: 50, offset: 0 },
        ),
        issued: await loadShipmentPage(
          tx,
          context,
          selected,
          { limit: 50, offset: 0 },
          undefined,
          "issued",
        ),
        exceptions: await loadShipmentPage(
          tx,
          context,
          selected,
          { limit: 50, offset: 0 },
          undefined,
          "exceptions",
        ),
      }),
    );

    expect(result.created.totalCount).toBe(4);
    expect(result.issued).toMatchObject({
      totalCount: 2,
      rows: [
        { shipmentId: exactStart },
        { shipmentId: createdBeforeIssuedInside },
      ],
    });
    expect(result.exceptions).toMatchObject({
      totalCount: 2,
      rows: [
        { shipmentId: failed },
        { shipmentId: awaiting },
      ],
    });
  });

  it("keeps current backlog out of historical comparison", async () => {
    const selected = range("Asia/Jakarta");
    const previous = parseAnalyticsRange(
      {
        rentang: "kustom",
        dari: "2026-08-28",
        sampai: "2026-08-29",
        tz: "Asia/Jakarta",
      },
      new Date("2026-08-31T04:00:00Z"),
    );
    const result = await withTenantContext(appDb, userA, tenantA, (tx, context) =>
      loadShipmentKpiComparison(tx, context, selected, previous),
    );
    expect(result.current).toMatchObject({ createdCount: 4, issuedCount: 2 });
    expect(result.previous).toMatchObject({ createdCount: 1, issuedCount: 0 });
    expect(result.current).not.toHaveProperty("awaitingPaymentCount");
    expect(result.backlogSnapshot).toMatchObject({
      awaitingPaymentCount: 1,
      needsActionCount: 1,
    });
    expect(result.backlogSnapshot.asOf).toBeInstanceOf(Date);
  });

  it("keeps issued events and ledger amounts tenant scoped", async () => {
    const result = await withTenantContext(
      appDb,
      userB,
      tenantB,
      async (tx, context) => ({
        kpis: await loadShipmentKpis(tx, context, range("Asia/Jakarta")),
        count: await countTenantShipments(tx, context),
      }),
    );
    expect(result).toEqual({
      kpis: {
        createdCount: 1,
        issuedCount: 1,
        resolvedSubmissionCount: 1,
        providerShippingIdr: 7_000,
        codServiceFeeIdr: 0,
        codVatIdr: 0,
        codPrincipalIdr: 0,
        cogsIdr: 0,
        netMarginIdr: -7_000,
      },
      count: 1,
    });
  });

  it("shares outlet, courier, and lifecycle predicates across every analytics read model", async () => {
    const selected = range("Asia/Jakarta");
    const previous = parseAnalyticsRange(
      {
        rentang: "kustom",
        dari: "2026-08-28",
        sampai: "2026-08-29",
        tz: "Asia/Jakarta",
      },
      new Date("2026-08-31T04:00:00Z"),
    );
    const filters = {
      outletId: outletA,
      courier: "JNE",
      lifecycleStatus: "ISSUED" as const,
    };

    const result = await withTenantContext(
      appDb,
      userA,
      tenantA,
      async (tx, context) => ({
        options: await loadAnalyticsFilterOptions(tx, context),
        comparison: await loadShipmentKpiComparison(
          tx,
          context,
          selected,
          previous,
          filters,
        ),
        trend: await loadShipmentTrend(tx, context, selected, filters),
        page: await loadShipmentPage(
          tx,
          context,
          selected,
          { limit: 1, offset: 0 },
          filters,
        ),
        exported: await loadShipmentExport(
          tx,
          context,
          selected,
          filters,
        ),
      }),
    );

    expect(result.options).toEqual({
      outlets: [{ id: outletA, name: "Outlet A" }],
      couriers: ["J&T", "JNE"],
    });
    expect(result.comparison.current).toEqual({
      createdCount: 1,
      issuedCount: 1,
      resolvedSubmissionCount: 1,
      providerShippingIdr: 10_000,
      codServiceFeeIdr: 3_300,
      codVatIdr: 363,
      codPrincipalIdr: 100_000,
      cogsIdr: 0,
      netMarginIdr: 86_337,
    });
    expect(result.comparison.previous).toMatchObject({
      createdCount: 1,
      issuedCount: 0,
    });
    expect(result.trend.points.reduce((sum, row) => sum + row.createdCount, 0)).toBe(1);
    expect(result.trend.points.reduce((sum, row) => sum + row.issuedCount, 0)).toBe(1);
    expect(result.page).toMatchObject({
      totalCount: 1,
      rows: [{ shipmentId: createdInsideIssuedAfter }],
    });
    expect(result.exported).toMatchObject({
      totalCount: 1,
      rows: [{ shipmentId: createdInsideIssuedAfter }],
    });

    await expect(
      withTenantContext(appDb, userA, tenantA, (tx, context) =>
        loadShipmentExport(
          tx,
          context,
          selected,
          { ...filters, courier: null },
          1,
        ),
      ),
    ).rejects.toBeInstanceOf(AnalyticsExportLimitError);

    await expect(
      withTenantContext(appDb, userA, tenantA, (tx, context) =>
        loadShipmentKpis(tx, context, selected, {
          outletId: outletA,
          courier: "J&T",
          lifecycleStatus: "FAILED",
        }),
      ),
    ).resolves.toEqual({
      createdCount: 0,
      issuedCount: 0,
      resolvedSubmissionCount: 0,
      providerShippingIdr: 0,
      codServiceFeeIdr: 0,
      codVatIdr: 0,
      codPrincipalIdr: 0,
      cogsIdr: 0,
      netMarginIdr: 0,
    });
  });

  it("sums the ledger-effective cohort's COGS, not the created cohort's, and subtracts it from net margin", async () => {
    // The shared fixture leaves every cogs_amount_idr null, which cannot tell a
    // correct aggregation apart from one that reads the wrong column or cohort.
    //
    // `failed` and `awaiting` were created inside the selected range but never
    // submitted to the provider, so they carry no ledger entry at all: their
    // COGS must NOT reach the total, in either cohort.
    await adminPool.query(
      "UPDATE shipments SET cogs_amount_idr = $2 WHERE id = $1",
      [failed, 20_000],
    );
    await adminPool.query(
      "UPDATE shipments SET cogs_amount_idr = $2 WHERE id = $1",
      [awaiting, 5_000],
    );
    // Created before the selected range, but its ledger entries (from
    // `seedIssued`'s resolvedAt) are effective inside it — the exact
    // creation/issuance straddle netMarginIdr must not mismatch on. Its COGS
    // must reach the total precisely because it shares the same
    // ledger-effective cohort as the other four financial terms.
    await adminPool.query(
      "UPDATE shipments SET cogs_amount_idr = $2 WHERE id = $1",
      [createdBeforeIssuedInside, 999_000],
    );
    // Another tenant entirely.
    await adminPool.query(
      "UPDATE shipments SET cogs_amount_idr = $2 WHERE id = $1",
      [tenantBShipment, 777_000],
    );

    try {
      const kpis = await withTenantContext(appDb, userA, tenantA, (tx, context) =>
        loadShipmentKpis(tx, context, range("Asia/Jakarta")),
      );

      expect(kpis.cogsIdr).toBe(999_000);
      // 100_000 principal - 18_000 shipping - 3_300 fee - 363 VAT - 999_000 COGS.
      expect(kpis.netMarginIdr).toBe(-920_663);
      expect(kpis.createdCount).toBe(4);
    } finally {
      await adminPool.query(
        "UPDATE shipments SET cogs_amount_idr = NULL WHERE id = ANY($1)",
        [[failed, awaiting, createdBeforeIssuedInside, tenantBShipment]],
      );
    }
  });

  it("reports courier issuance rates with an explicit resolved denominator", async () => {
    const result = await withTenantContext(appDb, userA, tenantA, (tx, context) =>
      loadCourierPerformance(tx, context, range("Asia/Jakarta")),
    );

    expect(result).toEqual([
      { courier: "J&T", issuedCount: 1, resolvedSubmissionCount: 1 },
      { courier: "JNE", issuedCount: 1, resolvedSubmissionCount: 1 },
    ]);
  });

  it("rejects another tenant's outlet before querying analytics", async () => {
    await expect(
      withTenantContext(appDb, userA, tenantA, (tx, context) =>
        loadShipmentKpis(tx, context, range("Asia/Jakarta"), {
          outletId: outletB,
          courier: null,
          lifecycleStatus: null,
        }),
      ),
    ).rejects.toBeInstanceOf(AnalyticsFilterDeniedError);

    await expect(
      withTenantContext(appDb, userA, tenantA, (tx, context) =>
        loadShipmentKpis(tx, context, range("Asia/Jakarta"), {
          outletId: null,
          courier: "SICEPAT",
          lifecycleStatus: null,
        }),
      ),
    ).rejects.toBeInstanceOf(AnalyticsFilterDeniedError);
  });
});
