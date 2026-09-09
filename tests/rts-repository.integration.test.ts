import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadRtsShipmentsPage } from "@/db/rts-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import type { ShipmentStatus } from "@/lib/shipment-queue";
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

const tenantA = "00000000-0000-2700-0000-000000000001";
const tenantB = "00000000-0000-2700-0000-000000000002";
const outletA = "00000000-0000-2701-0000-000000000001";
const outletB = "00000000-0000-2701-0000-000000000002";
const operatorA = "rts-operator-a";
const operatorB = "rts-operator-b";

function shipmentId(sequence: number) {
  return `00000000-0000-2721-0000-${String(sequence).padStart(12, "0")}`;
}

async function deleteShipmentFixtures() {
  for (const table of [
    "shipment_rts_events",
    "shipment_parties",
    "shipment_drafts",
    "shipments",
  ]) {
    await adminPool.query(
      `DELETE FROM ${table} WHERE tenant_id IN ($1, $2)`,
      [tenantA, tenantB],
    );
  }
}

async function deleteAllFixtures() {
  await deleteShipmentFixtures();
  await adminPool.query("DELETE FROM outlets WHERE tenant_id IN ($1, $2)", [tenantA, tenantB]);
  await adminPool.query("DELETE FROM memberships WHERE tenant_id IN ($1, $2)", [tenantA, tenantB]);
  await adminPool.query("DELETE FROM tenants WHERE id IN ($1, $2)", [tenantA, tenantB]);
  await adminPool.query("DELETE FROM users WHERE id IN ($1, $2)", [operatorA, operatorB]);
}

async function seedShipment(input: {
  sequence: number;
  status: ShipmentStatus;
  tenantId?: string;
  outletId?: string;
}) {
  const id = shipmentId(input.sequence);
  const tenantId = input.tenantId ?? tenantA;
  const outletId = input.outletId ?? outletA;
  const updatedAt = new Date(Date.UTC(2026, 7, 30, 1, input.sequence));
  const createdAt = new Date(updatedAt.getTime() - 60_000);

  await adminPool.query(
    `INSERT INTO shipments (id, tenant_id, outlet_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, tenantId, outletId, input.status, createdAt, updatedAt],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity,
      declared_value_idr, is_cod, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 1, $7, true, $8, $9)`,
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

async function seedRtsEvent(input: {
  shipmentId: string;
  status: "RTS_QUEUED" | "RTS_IN_TRANSIT" | "RTS_RECEIVED";
  notes: string;
  createdAt: Date;
  tenantId?: string;
}) {
  await adminPool.query(
    `INSERT INTO shipment_rts_events (tenant_id, shipment_id, status, notes, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.tenantId ?? tenantA, input.shipmentId, input.status, input.notes, input.createdAt],
  );
}

function loadPage(
  userId: string,
  tenantId: string,
  input: Parameters<typeof loadRtsShipmentsPage>[2],
) {
  return withTenantContext(appDb, userId, tenantId, (tx, context) =>
    loadRtsShipmentsPage(tx, context, input),
  );
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await deleteAllFixtures();
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'RTS Operator A', 'rts-operator-a@example.test'),
      ($2, 'RTS Operator B', 'rts-operator-b@example.test')`,
    [operatorA, operatorB],
  );
  await adminPool.query(
    `INSERT INTO tenants (id, name, status) VALUES
      ($1, 'RTS Tenant A', 'ACTIVE'),
      ($2, 'RTS Tenant B', 'ACTIVE')`,
    [tenantA, tenantB],
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'OPERATOR'),
      ($3, $4, 'OPERATOR')`,
    [tenantA, operatorA, tenantB, operatorB],
  );
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
     VALUES ($1, $2, 'Outlet Retur A', 'pickup-a', 'origin-a'),
            ($3, $4, 'Outlet Retur B', 'pickup-b', 'origin-b')`,
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

describe("tenant RTS repository", () => {
  it("returns one row per shipment and the latest event when a shipment has many events", async () => {
    const id = await seedShipment({ sequence: 1, status: "RTS_IN_TRANSIT" });
    await seedRtsEvent({
      createdAt: new Date(Date.UTC(2026, 7, 30, 2, 0)),
      notes: "Kurir menjemput paket retur",
      shipmentId: id,
      status: "RTS_QUEUED",
    });
    await seedRtsEvent({
      createdAt: new Date(Date.UTC(2026, 7, 30, 6, 0)),
      notes: "Paket retur dalam perjalanan ke outlet",
      shipmentId: id,
      status: "RTS_IN_TRANSIT",
    });

    const page = await loadPage(operatorA, tenantA, {
      page: 1,
      pageSize: 20,
      status: "ALL",
    });

    expect(page.rows).toHaveLength(1);
    expect(page.totalCount).toBe(1);
    expect(page.rows[0]).toMatchObject({
      latestEventNotes: "Paket retur dalam perjalanan ke outlet",
      shipmentId: id,
      status: "RTS_IN_TRANSIT",
    });
    // The queue is an index view, so it must carry a masked number and never
    // the recipient's real one anywhere in the payload.
    expect(page.rows[0]?.recipientPhoneMasked).toBe("•••• 0000");
    expect(JSON.stringify(page)).not.toContain("081299990000");
    expect(page.rows[0]?.latestEventAt).toEqual(new Date(Date.UTC(2026, 7, 30, 6, 0)));
  });

  it("resolves both latest-event columns from the same row when timestamps tie", async () => {
    // The repository reads the latest event through a single JSON subquery, so
    // the note and its timestamp cannot come from different rows. This pins the
    // tie behaviour to `created_at desc, id desc` so the row it picks stays
    // stable rather than depending on PostgreSQL's incidental ordering.
    const id = await seedShipment({ sequence: 12, status: "RTS_RECEIVED" });
    const tie = new Date(Date.UTC(2026, 7, 30, 8, 0));
    await seedRtsEvent({
      createdAt: tie,
      notes: "Catatan kejadian pertama pada detik yang sama",
      shipmentId: id,
      status: "RTS_IN_TRANSIT",
    });
    await seedRtsEvent({
      createdAt: tie,
      notes: "Catatan kejadian kedua pada detik yang sama",
      shipmentId: id,
      status: "RTS_RECEIVED",
    });

    const [{ id: winningId, notes: winningNotes }] = (
      await adminPool.query(
        `SELECT id, notes FROM shipment_rts_events
         WHERE shipment_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [id],
      )
    ).rows;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const page = await loadPage(operatorA, tenantA, {
        page: 1,
        pageSize: 20,
        status: "ALL",
      });
      const row = page.rows.find((candidate) => candidate.shipmentId === id);
      expect(row?.latestEventNotes, `attempt ${attempt}`).toBe(winningNotes);
      expect(row?.latestEventAt, `attempt ${attempt}`).toEqual(tie);
    }
    expect(winningId).toBeTruthy();
  });

  it("counts every RTS and problem status in the summary and honours the status filter", async () => {
    await seedShipment({ sequence: 2, status: "RTS_QUEUED" });
    await seedShipment({ sequence: 3, status: "RTS_IN_TRANSIT" });
    await seedShipment({ sequence: 4, status: "RTS_RECEIVED" });
    await seedShipment({ sequence: 5, status: "PROBLEM" });
    await seedShipment({ sequence: 6, status: "ISSUED" });

    const all = await loadPage(operatorA, tenantA, { page: 1, pageSize: 20, status: "ALL" });
    expect(all.summary).toEqual({
      inTransitCount: 1,
      problemCount: 1,
      queuedCount: 1,
      receivedCount: 1,
      totalRtsCount: 4,
    });
    expect(all.rows).toHaveLength(4);

    const queued = await loadPage(operatorA, tenantA, {
      page: 1,
      pageSize: 20,
      status: "RTS_QUEUED",
    });
    expect(queued.totalCount).toBe(1);
    expect(queued.rows.map((row) => row.status)).toEqual(["RTS_QUEUED"]);
    expect(queued.summary.totalRtsCount).toBe(4);
  });

  it("clamps an out-of-range page request onto the last available page", async () => {
    await seedShipment({ sequence: 7, status: "RTS_QUEUED" });
    await seedShipment({ sequence: 8, status: "RTS_QUEUED" });
    await seedShipment({ sequence: 9, status: "RTS_QUEUED" });

    const page = await loadPage(operatorA, tenantA, { page: 99, pageSize: 2, status: "ALL" });

    expect(page.totalPages).toBe(2);
    expect(page.page).toBe(2);
    expect(page.rows).toHaveLength(1);
  });

  it("never exposes another tenant's RTS shipments or events", async () => {
    const foreign = await seedShipment({
      outletId: outletB,
      sequence: 10,
      status: "RTS_RECEIVED",
      tenantId: tenantB,
    });
    await seedRtsEvent({
      createdAt: new Date(Date.UTC(2026, 7, 30, 3, 0)),
      notes: "Catatan tenant lain",
      shipmentId: foreign,
      status: "RTS_RECEIVED",
      tenantId: tenantB,
    });
    await seedShipment({ sequence: 11, status: "RTS_QUEUED" });

    const page = await loadPage(operatorA, tenantA, { page: 1, pageSize: 20, status: "ALL" });

    expect(page.rows.map((row) => row.shipmentId)).toEqual([shipmentId(11)]);
    expect(page.summary.totalRtsCount).toBe(1);
    expect(JSON.stringify(page)).not.toContain("Catatan tenant lain");
  });

  it("reports an empty first page without rows when the tenant has no returns", async () => {
    const page = await loadPage(operatorA, tenantA, { page: 3, pageSize: 20, status: "ALL" });

    expect(page).toMatchObject({
      page: 1,
      rows: [],
      totalCount: 0,
      totalPages: 1,
    });
    expect(page.summary.totalRtsCount).toBe(0);
  });
});
