import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  loadShipmentDetail,
  loadShipmentQueuePage,
} from "@/db/shipment-queue-repository";
import * as schema from "@/db/schema";
import {
  TenantContextDeniedError,
  withTenantContext,
} from "@/db/tenant-context";
import {
  parseShipmentQueueQuery,
  shipmentLifecycleActions,
  shipmentQueueHref,
  type ShipmentStatus,
} from "@/lib/shipment-queue";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;

if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required for integration tests.");
}
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}
if (new URL(appDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Application integration tests require the isolated geraicuan_test database.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-2100-0000-000000000001";
const tenantB = "00000000-0000-2100-0000-000000000002";
const outletA = "00000000-0000-2101-0000-000000000001";
const outletB = "00000000-0000-2101-0000-000000000002";
const operatorA = "shipment-queue-operator-a";
const adminA = "shipment-queue-admin-a";
const operatorB = "shipment-queue-operator-b";

function shipmentId(sequence: number) {
  return `00000000-0000-2121-0000-${String(sequence).padStart(12, "0")}`;
}

async function deleteShipmentFixtures() {
  await adminPool.query(
    "DELETE FROM provider_order_snapshots WHERE tenant_id IN ($1, $2)",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "DELETE FROM provider_batches WHERE tenant_id IN ($1, $2)",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "DELETE FROM shipment_estimate_services WHERE tenant_id IN ($1, $2)",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "DELETE FROM shipment_estimate_snapshots WHERE tenant_id IN ($1, $2)",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "DELETE FROM shipment_parties WHERE tenant_id IN ($1, $2)",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "DELETE FROM shipment_drafts WHERE tenant_id IN ($1, $2)",
    [tenantA, tenantB],
  );
  await adminPool.query("DELETE FROM shipments WHERE tenant_id IN ($1, $2)", [
    tenantA,
    tenantB,
  ]);
}

async function deleteAllFixtures() {
  await deleteShipmentFixtures();
  await adminPool.query("DELETE FROM outlets WHERE tenant_id IN ($1, $2)", [
    tenantA,
    tenantB,
  ]);
  await adminPool.query("DELETE FROM memberships WHERE tenant_id IN ($1, $2)", [
    tenantA,
    tenantB,
  ]);
  await adminPool.query("DELETE FROM tenants WHERE id IN ($1, $2)", [
    tenantA,
    tenantB,
  ]);
  await adminPool.query("DELETE FROM users WHERE id IN ($1, $2, $3)", [
    operatorA,
    adminA,
    operatorB,
  ]);
}

async function seedShipment(input: {
  sequence: number;
  status: ShipmentStatus;
  tenantId?: string;
  outletId?: string;
  updatedAt?: Date;
}) {
  const id = shipmentId(input.sequence);
  const tenantId = input.tenantId ?? tenantA;
  const outletId = input.outletId ?? outletA;
  const updatedAt =
    input.updatedAt ?? new Date(Date.UTC(2026, 7, 30, 1, input.sequence));
  const createdAt = new Date(updatedAt.getTime() - 60_000);

  await adminPool.query(
    `INSERT INTO shipments (
      id, tenant_id, outlet_id, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, tenantId, outletId, input.status, createdAt, updatedAt],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity,
      declared_value_idr, is_cod, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 1, $7, false, $8, $9
    )`,
    [
      id,
      tenantId,
      `area-${input.sequence}`,
      `Tujuan ${input.sequence}`,
      `Paket ${input.sequence}`,
      1_000 + input.sequence,
      100_000 + input.sequence,
      createdAt,
      updatedAt,
    ],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (
      tenant_id, shipment_id, role, name, phone, address, created_at
    ) VALUES
      ($1, $2, 'SENDER', $3, '081211110000', $4, $5),
      ($1, $2, 'RECIPIENT', $6, '081299990000', $7, $5)`,
    [
      tenantId,
      id,
      `Pengirim ${input.sequence}`,
      `Alamat pengirim ${input.sequence}`,
      createdAt,
      `Penerima ${input.sequence}`,
      `Alamat penerima ${input.sequence}`,
    ],
  );

  return id;
}

async function seedIssuedEvent(input: {
  sequence: number;
  resolvedAt: Date;
  tenantId?: string;
  outletId?: string;
}) {
  const tenantId = input.tenantId ?? tenantA;
  const outletId = input.outletId ?? outletA;
  const id = await seedShipment({
    sequence: input.sequence,
    status: "ISSUED",
    tenantId,
    outletId,
  });
  const suffix = String(input.sequence).padStart(12, "0");
  const snapshotId = `00000000-0000-2131-0000-${suffix}`;
  const serviceId = `00000000-0000-2132-0000-${suffix}`;
  const batchId = `00000000-0000-2133-0000-${suffix}`;
  const orderId = `00000000-0000-2134-0000-${suffix}`;

  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id,
      destination_area_id, weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'origin', 'destination', 1000, false, 'platform_default')`,
    [snapshotId, tenantId, id, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency,
      shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'JNE REG', 'IDR', 10000, 'price', 'fixture', true)`,
    [serviceId, tenantId, snapshotId],
  );
  await adminPool.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
      provider_account_key, idempotency_key, status, submission_attempted_at,
      completed_at
    ) VALUES ($1, $2, $3, 'pickup', 'JNE', 'platform_default', $4, $5,
      'COMPLETED', $6, $6)`,
    [
      batchId,
      tenantId,
      outletId,
      input.sequence.toString(16).padStart(64, "0"),
      (input.sequence + 1000).toString(16).padStart(64, "0"),
      input.resolvedAt,
    ],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id,
      estimate_service_id, position, provider_service, currency,
      shipping_amount_idr, is_cod, status, provider_order_id, is_paid,
      cnote_no, resolved_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG', 'IDR', 10000,
      false, 'ISSUED', $7, true, $8, $9)`,
    [
      orderId,
      tenantId,
      batchId,
      id,
      snapshotId,
      serviceId,
      `order-${input.sequence}`,
      `AWB-${input.sequence}`,
      input.resolvedAt,
    ],
  );
  return id;
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await deleteAllFixtures();
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'Queue Operator A', 'shipment-queue-operator-a@example.test'),
      ($2, 'Queue Admin A', 'shipment-queue-admin-a@example.test'),
      ($3, 'Queue Operator B', 'shipment-queue-operator-b@example.test')`,
    [operatorA, adminA, operatorB],
  );
  await adminPool.query(
    `INSERT INTO tenants (id, name, status) VALUES
      ($1, 'Shipment Queue Tenant A', 'ACTIVE'),
      ($2, 'Shipment Queue Tenant B', 'ACTIVE')`,
    [tenantA, tenantB],
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'OPERATOR'),
      ($1, $3, 'TENANT_ADMIN'),
      ($4, $5, 'OPERATOR')`,
    [tenantA, operatorA, adminA, tenantB, operatorB],
  );
  await adminPool.query(
    `INSERT INTO outlets (
      id, tenant_id, name, default_pickup_address_id, default_origin_area_id
    ) VALUES
      ($1, $2, 'Outlet Antrean A', 'pickup-a', 'origin-a'),
      ($3, $4, 'Outlet Antrean B', 'pickup-b', 'origin-b')`,
    [outletA, tenantA, outletB, tenantB],
  );
});

beforeEach(async () => {
  await deleteShipmentFixtures();
});

afterAll(async () => {
  await deleteAllFixtures();
  await Promise.all([appPool.end(), adminPool.end()]);
});

describe("tenant shipment lifecycle queue", () => {
  it("parses URL-addressable status and page filters with safe fallbacks", () => {
    expect(parseShipmentQueueQuery({ status: "FAILED", page: "2" })).toEqual({
      issues: [],
      page: 2,
      status: "FAILED",
    });
    expect(parseShipmentQueueQuery({ status: "ACTION_REQUIRED" })).toEqual({
      issues: [],
      page: 1,
      status: "ACTION_REQUIRED",
    });
    expect(parseShipmentQueueQuery({ status: "READY_TO_PROGRESS" })).toEqual({
      issues: [],
      page: 1,
      status: "READY_TO_PROGRESS",
    });
    expect(parseShipmentQueueQuery({ status: "ISSUED_TODAY" })).toEqual({
      issues: [],
      page: 1,
      status: "ISSUED_TODAY",
    });
    expect(
      parseShipmentQueueQuery({ status: "NOT_A_STATUS", page: "zero" }),
    ).toMatchObject({
      page: 1,
      status: "ALL",
      issues: [
        expect.stringContaining("Status"),
        expect.stringContaining("halaman"),
      ],
    });
    expect(shipmentQueueHref("DRAFT", 3)).toBe(
      "/app/pengiriman?status=DRAFT&page=3",
    );
    expect(shipmentQueueHref("ACTION_REQUIRED")).toBe(
      "/app/pengiriman?status=ACTION_REQUIRED",
    );
    expect(shipmentQueueHref("READY_TO_PROGRESS")).toBe(
      "/app/pengiriman?status=READY_TO_PROGRESS",
    );
    expect(shipmentQueueHref("ISSUED_TODAY")).toBe(
      "/app/pengiriman?status=ISSUED_TODAY",
    );
  });

  it("uses exact dashboard-supporting ready and issued-today predicates", async () => {
    const [clock] = (
      await adminPool.query<{ today_start: Date }>(
        `SELECT date_trunc('day', current_timestamp AT TIME ZONE 'Asia/Jakarta')
          AT TIME ZONE 'Asia/Jakarta' AS today_start`,
      )
    ).rows;
    const issuedTodayId = await seedIssuedEvent({
      sequence: 21,
      resolvedAt: new Date(clock.today_start.getTime() + 60_000),
    });
    await seedIssuedEvent({
      sequence: 22,
      resolvedAt: new Date(clock.today_start.getTime() - 60_000),
    });
    await seedIssuedEvent({
      sequence: 921,
      resolvedAt: new Date(clock.today_start.getTime() + 120_000),
      tenantId: tenantB,
      outletId: outletB,
    });
    const draftId = await seedShipment({ sequence: 23, status: "DRAFT" });
    const estimatedId = await seedShipment({ sequence: 24, status: "ESTIMATED" });
    await seedShipment({ sequence: 25, status: "FAILED" });

    const result = await withTenantContext(
      appDb,
      operatorA,
      tenantA,
      async (tx, context) => ({
        ready: await loadShipmentQueuePage(tx, context, {
          page: 1,
          pageSize: 20,
          status: "READY_TO_PROGRESS",
        }),
        issuedToday: await loadShipmentQueuePage(tx, context, {
          page: 1,
          pageSize: 20,
          status: "ISSUED_TODAY",
        }),
      }),
    );

    expect(new Set(result.ready.rows.map((row) => row.shipmentId))).toEqual(
      new Set([draftId, estimatedId]),
    );
    expect(result.ready.totalCount).toBe(2);
    expect(result.issuedToday.totalCount).toBe(1);
    expect(result.issuedToday.rows.map((row) => row.shipmentId)).toEqual([
      issuedTodayId,
    ]);
  });

  it("filters the combined action-required lifecycle statuses", async () => {
    await seedShipment({ sequence: 11, status: "AWAITING_UPSTREAM_PAYMENT" });
    await seedShipment({ sequence: 12, status: "SUBMISSION_UNKNOWN" });
    await seedShipment({ sequence: 13, status: "FAILED" });
    await seedShipment({ sequence: 14, status: "ISSUED" });

    const filtered = await withTenantContext(
      appDb,
      operatorA,
      tenantA,
      (tx, context) =>
        loadShipmentQueuePage(tx, context, {
          page: 1,
          pageSize: 20,
          status: "ACTION_REQUIRED",
        }),
    );

    expect(filtered.totalCount).toBe(3);
    expect(filtered.rows.map((row) => row.status).sort()).toEqual([
      "AWAITING_UPSTREAM_PAYMENT",
      "FAILED",
      "SUBMISSION_UNKNOWN",
    ]);
  });

  it("filters lifecycle status inside the server-derived tenant scope", async () => {
    const draftId = await seedShipment({ sequence: 1, status: "DRAFT" });
    await seedShipment({ sequence: 2, status: "ESTIMATED" });
    await seedShipment({ sequence: 3, status: "FAILED" });
    await seedShipment({
      sequence: 901,
      status: "DRAFT",
      tenantId: tenantB,
      outletId: outletB,
    });

    const filtered = await withTenantContext(
      appDb,
      operatorA,
      tenantA,
      (tx, context) =>
        loadShipmentQueuePage(tx, context, {
          page: 1,
          pageSize: 10,
          status: "DRAFT",
        }),
    );
    const all = await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      loadShipmentQueuePage(tx, context, {
        page: 1,
        pageSize: 10,
        status: "ALL",
      }),
    );

    expect(filtered).toMatchObject({
      page: 1,
      status: "DRAFT",
      totalCount: 1,
      totalPages: 1,
    });
    expect(filtered.rows.map((row) => row.shipmentId)).toEqual([draftId]);
    expect(all.totalCount).toBe(3);
    expect(new Set(all.rows.map((row) => row.status))).toEqual(
      new Set(["DRAFT", "ESTIMATED", "FAILED"]),
    );
  });

  it("paginates deterministically and clamps a page beyond the filtered result", async () => {
    const ids: string[] = [];
    for (let sequence = 1; sequence <= 5; sequence += 1) {
      ids.push(
        await seedShipment({
          sequence,
          status: "DRAFT",
          updatedAt: new Date(Date.UTC(2026, 7, 30, 2, sequence)),
        }),
      );
    }

    const loadPage = (page: number) =>
      withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
        loadShipmentQueuePage(tx, context, {
          page,
          pageSize: 2,
          status: "DRAFT",
        }),
      );
    const first = await loadPage(1);
    const second = await loadPage(2);
    const last = await loadPage(3);
    const clamped = await loadPage(99);

    expect(first.rows.map((row) => row.shipmentId)).toEqual([ids[4], ids[3]]);
    expect(second.rows.map((row) => row.shipmentId)).toEqual([ids[2], ids[1]]);
    expect(last.rows.map((row) => row.shipmentId)).toEqual([ids[0]]);
    expect(last).toMatchObject({ page: 3, totalCount: 5, totalPages: 3 });
    expect(clamped.page).toBe(3);
    expect(clamped.rows.map((row) => row.shipmentId)).toEqual([ids[0]]);
  });

  it("returns no cross-tenant queue or detail data and rejects a mismatched tenant context", async () => {
    const tenantAShipment = await seedShipment({ sequence: 10, status: "DRAFT" });
    const tenantBShipment = await seedShipment({
      sequence: 910,
      status: "DRAFT",
      tenantId: tenantB,
      outletId: outletB,
    });

    const tenantAResult = await withTenantContext(
      appDb,
      operatorA,
      tenantA,
      async (tx, context) => ({
        page: await loadShipmentQueuePage(tx, context, {
          page: 1,
          pageSize: 10,
          status: "ALL",
        }),
        ownDetail: await loadShipmentDetail(tx, context, tenantAShipment),
        otherDetail: await loadShipmentDetail(tx, context, tenantBShipment),
      }),
    );
    const tenantBPage = await withTenantContext(
      appDb,
      operatorB,
      tenantB,
      (tx, context) =>
        loadShipmentQueuePage(tx, context, {
          page: 1,
          pageSize: 10,
          status: "ALL",
        }),
    );

    expect(tenantAResult.page.rows.map((row) => row.shipmentId)).toEqual([
      tenantAShipment,
    ]);
    expect(tenantAResult.ownDetail?.shipmentId).toBe(tenantAShipment);
    expect(tenantAResult.otherDetail).toBeNull();
    expect(tenantBPage.rows.map((row) => row.shipmentId)).toEqual([
      tenantBShipment,
    ]);
    await expect(
      withTenantContext(appDb, operatorA, tenantB, () => Promise.resolve(null)),
    ).rejects.toBeInstanceOf(TenantContextDeniedError);
  });

  it("allows both tenant roles to inspect the queue while exposing only role-permitted next actions", async () => {
    const draftId = await seedShipment({ sequence: 20, status: "DRAFT" });
    const estimatedId = await seedShipment({ sequence: 21, status: "ESTIMATED" });
    const unpaidId = await seedShipment({
      sequence: 22,
      status: "AWAITING_UPSTREAM_PAYMENT",
    });
    const unknownId = await seedShipment({ sequence: 23, status: "SUBMISSION_UNKNOWN" });

    const loadFor = (userId: string) =>
      withTenantContext(appDb, userId, tenantA, async (tx, context) => ({
        context,
        detail: await loadShipmentDetail(tx, context, draftId),
        page: await loadShipmentQueuePage(tx, context, {
          page: 1,
          pageSize: 10,
          status: "ALL",
        }),
      }));
    const operatorResult = await loadFor(operatorA);
    const adminResult = await loadFor(adminA);

    expect(operatorResult.context.role).toBe("OPERATOR");
    expect(adminResult.context.role).toBe("TENANT_ADMIN");
    expect(operatorResult.page.totalCount).toBe(4);
    expect(adminResult.page.totalCount).toBe(4);
    expect(operatorResult.detail).toMatchObject({
      shipmentId: draftId,
      recipient: { name: "Penerima 20" },
      sender: { name: "Pengirim 20" },
      status: "DRAFT",
    });

    expect(shipmentLifecycleActions("DRAFT", "OPERATOR", draftId)).toEqual([
      expect.objectContaining({
        href: `/app/pengiriman/baru?draft=${draftId}`,
        id: "resume-draft",
        kind: "link",
      }),
    ]);
    const estimatedActions = shipmentLifecycleActions(
      "ESTIMATED",
      "OPERATOR",
      estimatedId,
    );
    expect(estimatedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "review-estimate", kind: "link" }),
        expect.objectContaining({
          href: "#konfirmasi-penerbitan-awb",
          id: "confirm-estimate",
          kind: "link",
        }),
      ]),
    );
    expect(
      shipmentLifecycleActions("AWAITING_UPSTREAM_PAYMENT", "OPERATOR", unpaidId),
    ).toEqual([]);
    const adminUnpaidActions = shipmentLifecycleActions(
      "AWAITING_UPSTREAM_PAYMENT",
      "TENANT_ADMIN",
      unpaidId,
    );
    expect(adminUnpaidActions).toEqual([
      expect.objectContaining({
        href: "#pemulihan-pembayaran",
        id: "recover-unpaid",
        kind: "link",
      }),
    ]);
    expect(shipmentLifecycleActions("SUBMISSION_UNKNOWN", "OPERATOR", unknownId)).toEqual([]);
    expect(shipmentLifecycleActions("SUBMISSION_UNKNOWN", "TENANT_ADMIN", unknownId)).toEqual([
      expect.objectContaining({
        href: "#rekonsiliasi-pengiriman",
        id: "reconcile-unknown",
        kind: "link",
      }),
    ]);
  });
});
