import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AnalyticsFilterDeniedError,
  codDisbursementEstimateExpression,
  loadAnalyticsFilterOptions,
  loadCourierPerformance,
  mengantarCodFeeExpression,
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

function range() {
  return parseAnalyticsRange(
    {
      rentang: "kustom",
      dari: "2026-08-30",
      sampai: "2026-08-31",
      tz: "Asia/Jakarta",
    },
    new Date("2026-08-31T04:00:00Z"),
  );
}

// T-278: the KPI, trend, page and export loaders this file used to cover had no
// caller after T-204 removed Analitik and were deleted; Laporan pengiriman reads
// `shipment-report-repository` plus the courier performance and filter reads below.
describe("tenant shipment analytics repository", () => {
  it("lists only the tenant's own outlets and couriers as filter options", async () => {
    const options = await withTenantContext(appDb, userA, tenantA, loadAnalyticsFilterOptions);
    expect(options).toEqual({
      outlets: [{ id: outletA, name: "Outlet A" }],
      couriers: ["J&T", "JNE"],
    });
  });

  it("reports courier issuance rates with an explicit resolved denominator", async () => {
    const result = await withTenantContext(appDb, userA, tenantA, (tx, context) =>
      loadCourierPerformance(tx, context, range()),
    );

    expect(result).toEqual([
      { courier: "J&T", issuedCount: 1, resolvedSubmissionCount: 1 },
      { courier: "JNE", issuedCount: 1, resolvedSubmissionCount: 1 },
    ]);
  });

  it("rejects another tenant's outlet or courier before querying analytics", async () => {
    for (const filters of [
      { outletId: outletB, courier: null, lifecycleStatus: null },
      { outletId: null, courier: "SICEPAT", lifecycleStatus: null },
    ]) {
      await expect(
        withTenantContext(appDb, userA, tenantA, (tx, context) =>
          loadCourierPerformance(tx, context, range(), filters),
        ),
      ).rejects.toBeInstanceOf(AnalyticsFilterDeniedError);
    }
  });

  // Spec 19 RPT-SHP-COD-FEE-IDR / FIN-COD-DISBURSEMENT-EST: the SQL the Laporan
  // rows, totals and Pencairan COD share. M-0: half-up to a whole rupiah, once.
  it("computes Mengantar's COD fee half-up and the disbursement estimate from it (T-90)", async () => {
    const read = () => withTenantContext(appDb, userA, tenantA, async (tx) => {
      const [row] = await tx
        .select({ fee: mengantarCodFeeExpression, estimate: codDisbursementEstimateExpression })
        .from(schema.shipmentCodTotals)
        .innerJoin(
          schema.providerOrderSnapshots,
          and(
            eq(schema.providerOrderSnapshots.shipmentId, schema.shipmentCodTotals.shipmentId),
            eq(schema.providerOrderSnapshots.tenantId, schema.shipmentCodTotals.tenantId),
          ),
        )
        .where(eq(schema.shipmentCodTotals.shipmentId, createdBeforeIssuedInside));
      return { estimate: Number(row!.estimate), fee: Number(row!.fee) };
    });
    // A row stored under the old additive formula: COD 113 663; the fee is
    // 3.33% of the COD amount (3 785.08 → 3 785), not the stored 3 300 + 363.
    expect(await read()).toEqual({ estimate: 113_663 - 10_000 - 3_785, fee: 3_785 });

    // Exactly half a rupiah — COD an odd multiple of 5 000: 5 000 → 166,5, 105 000 → 3 496,5,
    // 115 000 → 3 829,5 — rounds up; floor or half-even would differ on at least one. The
    // expression is evaluated over literal amounts under the table's own name, because the
    // stored rows' COD-formula CHECKs admit none of these amounts.
    const boundary = await withTenantContext(appDb, userA, tenantA, (tx) => tx.execute<{ cod: number; fee: string }>(sql`
      SELECT shipment_cod_totals.provider_cod_amount_idr AS cod, ${mengantarCodFeeExpression} AS fee
      FROM (VALUES (5000), (105000), (115000), (114999)) AS shipment_cod_totals(provider_cod_amount_idr)
      ORDER BY 1`));
    expect(boundary.rows.map((row) => [Number(row.cod), Number(row.fee)])).toEqual([
      [5_000, 167],
      [105_000, 3_497],
      [114_999, 3_829],
      [115_000, 3_830],
    ]);
  });
});
