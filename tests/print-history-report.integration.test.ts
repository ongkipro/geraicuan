import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadPrintHistoryPage } from "@/db/label-print-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { parseAnalyticsRange } from "@/lib/analytics-range";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

// PR-55 Riwayat cetak resi. Spec 19 RPT-PRN-EVENTS and RPT-PRN-REPRINTS: the
// page reads `print_events` as recorded — outcome, reason code, actor role and
// sequence — and states the reprint count explicitly, because a reprint is an
// audit-relevant act.

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
if (!adminUrl || !appUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
}
if (new URL(adminUrl).pathname !== "/geraicuan_test") {
  throw new Error("Print history tests require geraicuan_test.");
}

const admin = new Pool({ connectionString: adminUrl });
const app = new Pool({ connectionString: appUrl });
let capturedStatements: string[] = [];
const appDb = drizzle({
  client: app,
  schema,
  logger: { logQuery: (query) => { capturedStatements.push(query); } },
});

const tenantA = "00000000-0000-5600-0000-000000000001";
const tenantB = "00000000-0000-5600-0000-000000000002";
const outletA1 = "00000000-0000-5601-0000-000000000001";
const outletA2 = "00000000-0000-5601-0000-000000000002";
const outletB = "00000000-0000-5601-0000-000000000003";
const adminA = "print-history-admin-a";
const operatorA = "print-history-operator-a";
const adminB = "print-history-admin-b";

const now = new Date("2026-09-12T05:00:00.000Z");
const range = parseAnalyticsRange(
  { rentang: "kustom", dari: "2026-09-01", sampai: "2026-09-10", tz: "Asia/Jakarta" },
  now,
);

function uuid(prefix: string, sequence: number) {
  return `00000000-0000-${prefix}-0000-${String(sequence).padStart(12, "0")}`;
}

type PrintFixture = {
  outcome: "PRINTED" | "BLOCKED";
  printedAt: string;
  reasonCode?: string;
  role?: "TENANT_ADMIN" | "OPERATOR";
  sequence: number | null;
};

type ShipmentFixture = {
  outletId?: string;
  prints: PrintFixture[];
  sequence: number;
  tenantId?: string;
};

const shipmentFixtures: ShipmentFixture[] = [
  // Printed three times inside the period, then blocked once: two reprints.
  {
    prints: [
      { outcome: "PRINTED", printedAt: "2026-09-02T03:00:00Z", role: "TENANT_ADMIN", sequence: 1 },
      { outcome: "PRINTED", printedAt: "2026-09-03T03:00:00Z", role: "OPERATOR", sequence: 2 },
      { outcome: "PRINTED", printedAt: "2026-09-04T03:00:00Z", role: "OPERATOR", sequence: 3 },
      { outcome: "BLOCKED", printedAt: "2026-09-05T03:00:00Z", reasonCode: "NOT_ISSUED", role: "OPERATOR", sequence: null },
    ],
    sequence: 1,
  },
  // Printed once: no reprint at all.
  {
    prints: [
      { outcome: "PRINTED", printedAt: "2026-09-06T03:00:00Z", role: "TENANT_ADMIN", sequence: 1 },
    ],
    sequence: 2,
  },
  // Blocked only: never printed, so never reprinted.
  {
    outletId: outletA2,
    prints: [
      { outcome: "BLOCKED", printedAt: "2026-09-07T03:00:00Z", reasonCode: "AWAITING_UPSTREAM_PAYMENT", role: "OPERATOR", sequence: null },
    ],
    sequence: 3,
  },
  // Printed before the period: outside every assertion about the window.
  {
    prints: [
      { outcome: "PRINTED", printedAt: "2026-08-20T03:00:00Z", role: "TENANT_ADMIN", sequence: 1 },
    ],
    sequence: 4,
  },
  // The other tenant's own record.
  {
    outletId: outletB,
    prints: [
      { outcome: "PRINTED", printedAt: "2026-09-03T03:00:00Z", role: "TENANT_ADMIN", sequence: 1 },
    ],
    sequence: 5,
    tenantId: tenantB,
  },
];

async function seed(fixture: ShipmentFixture) {
  const tenantId = fixture.tenantId ?? tenantA;
  const outletId = fixture.outletId ?? (tenantId === tenantB ? outletB : outletA1);
  const shipmentId = uuid("5621", fixture.sequence);
  const snapshotId = uuid("5631", fixture.sequence);
  const serviceId = uuid("5632", fixture.sequence);
  const batchId = uuid("5633", fixture.sequence);
  const orderId = uuid("5634", fixture.sequence);
  const createdAt = "2026-09-01T03:00:00Z";

  await admin.query(
    `INSERT INTO shipments (id, tenant_id, outlet_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'ISSUED', $4, $4)`,
    [shipmentId, tenantId, outletId, createdAt],
  );
  await admin.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity,
      declared_value_idr, is_cod, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, 'Paket', 1000, 1, 100000, false, $5, $5)`,
    [shipmentId, tenantId, `area-${fixture.sequence}`, `Kecamatan ${fixture.sequence}, Kota ${fixture.sequence}`, createdAt],
  );
  await admin.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id,
      destination_area_id, destination_area_label, weight_grams,
      is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'origin', $5, $6, 1000, false, 'platform_default')`,
    [snapshotId, tenantId, shipmentId, outletId, `area-${fixture.sequence}`, `Kecamatan ${fixture.sequence}, Kota ${fixture.sequence}`],
  );
  await admin.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency,
      shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'JNE REG', 'IDR', 10000, 'price', 'fixture', true)`,
    [serviceId, tenantId, snapshotId],
  );
  await admin.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
      provider_account_key, idempotency_key, status, submission_attempted_at, completed_at
    ) VALUES ($1, $2, $3, 'pickup', 'JNE', 'platform_default', $4, $5, 'COMPLETED', $6, $6)`,
    [
      batchId,
      tenantId,
      outletId,
      fixture.sequence.toString(16).padStart(64, "0"),
      (fixture.sequence + 5_600).toString(16).padStart(64, "0"),
      createdAt,
    ],
  );
  await admin.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id,
      estimate_service_id, position, provider_service, destination_area_id,
      destination_area_label, currency, shipping_amount_idr, is_cod, status,
      provider_order_id, is_paid, cnote_no, resolved_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG', $7, $8, 'IDR', 10000, false,
      'ISSUED', $9, true, $10, $11)`,
    [
      orderId,
      tenantId,
      batchId,
      shipmentId,
      snapshotId,
      serviceId,
      `area-${fixture.sequence}`,
      `Kecamatan ${fixture.sequence}, Kota ${fixture.sequence}`,
      `order-${fixture.sequence}`,
      `AWB-${fixture.sequence}`,
      createdAt,
    ],
  );

  let index = 0;
  for (const print of fixture.prints) {
    index += 1;
    await admin.query(
      `INSERT INTO print_events (
        id, tenant_id, shipment_id, provider_order_snapshot_id, sequence,
        outcome, reason_code, awb_snapshot, actor_user_id, actor_role, printed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        uuid("5641", fixture.sequence * 10 + index),
        tenantId,
        shipmentId,
        orderId,
        print.sequence,
        print.outcome,
        print.reasonCode ?? null,
        print.outcome === "PRINTED" ? `AWB-${fixture.sequence}` : null,
        tenantId === tenantB ? adminB : adminA,
        print.role ?? "TENANT_ADMIN",
        print.printedAt,
      ],
    );
  }
  return shipmentId;
}

async function clean() {
  for (const table of [
    "print_events",
    "provider_order_snapshots",
    "provider_batches",
    "shipment_estimate_services",
    "shipment_estimate_snapshots",
    "shipment_parties",
    "shipment_drafts",
    "shipments",
    "outlets",
    "memberships",
  ]) {
    await admin.query(`DELETE FROM ${table} WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
  }
  await admin.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [[tenantA, tenantB]]);
  await admin.query("DELETE FROM users WHERE id = ANY($1::text[])", [[adminA, operatorA, adminB]]);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(admin, appUrl);
  await clean();
  await admin.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'Print History Admin A', 'print-history-admin-a@example.test'),
      ($2, 'Print History Operator A', 'print-history-operator-a@example.test'),
      ($3, 'Print History Admin B', 'print-history-admin-b@example.test')`,
    [adminA, operatorA, adminB],
  );
  await admin.query(
    `INSERT INTO tenants (id, name, status) VALUES
      ($1, 'Print History Tenant A', 'ACTIVE'), ($2, 'Print History Tenant B', 'ACTIVE')`,
    [tenantA, tenantB],
  );
  await admin.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR'), ($4, $5, 'TENANT_ADMIN')`,
    [tenantA, adminA, operatorA, tenantB, adminB],
  );
  await admin.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id) VALUES
      ($1, $2, 'Outlet Cetak A1', 'pickup-a1', 'origin-a1'),
      ($3, $2, 'Outlet Cetak A2', 'pickup-a2', 'origin-a2'),
      ($4, $5, 'Outlet Cetak B', 'pickup-b', 'origin-b')`,
    [outletA1, tenantA, outletA2, outletB, tenantB],
  );
  for (const fixture of shipmentFixtures) await seed(fixture);
});

afterAll(async () => {
  await clean();
  await Promise.all([app.end(), admin.end()]);
});

function readHistory(
  input: Partial<Parameters<typeof loadPrintHistoryPage>[2]> = {},
  userId = adminA,
  tenantId = tenantA,
) {
  return withTenantContext(appDb, userId, tenantId, (tx, context) =>
    loadPrintHistoryPage(tx, context, { range, ...input }));
}

describe("print history report", () => {
  it("counts a reprint from the shipment's own recorded print sequences", async () => {
    const history = await readHistory();
    const byShipment = new Map(
      history.rows.map((row) => [row.publicReference, row.reprintCount]),
    );

    // Three successful prints, highest recorded sequence 3, so two reprints —
    // and the blocked attempt on the same shipment reports the same number.
    const thricePrinted = history.rows.filter((row) => row.sequence === 3)[0];
    expect(thricePrinted?.reprintCount).toBe(2);
    expect(
      history.rows
        .filter((row) => row.publicReference === thricePrinted?.publicReference)
        .map((row) => row.reprintCount),
    ).toEqual([2, 2, 2, 2]);

    // Printed once: a first print is not a reprint.
    const oncePrinted = history.rows.find(
      (row) => row.outcome === "PRINTED"
        && row.publicReference !== thricePrinted?.publicReference,
    );
    expect(oncePrinted?.reprintCount).toBe(0);

    // Blocked only: never printed, so never reprinted.
    const blockedOnly = history.rows.find(
      (row) => row.reasonCode === "AWAITING_UPSTREAM_PAYMENT",
    );
    expect(blockedOnly?.reprintCount).toBe(0);
    expect(blockedOnly?.sequence).toBeNull();
    expect([...byShipment.values()].every((count) => count >= 0)).toBe(true);
  });

  it("carries the outcome, reason code, actor role and outlet the record stores", async () => {
    const history = await readHistory();

    expect(history.totalCount).toBe(6);
    expect(history.rows).toHaveLength(6);
    expect(new Set(history.rows.map((row) => row.outcome)))
      .toEqual(new Set(["PRINTED", "BLOCKED"]));
    expect(new Set(history.rows.map((row) => row.actorRole)))
      .toEqual(new Set(["TENANT_ADMIN", "OPERATOR"]));
    expect(history.rows.filter((row) => row.outcome === "BLOCKED").map((row) => row.reasonCode).sort())
      .toEqual(["AWAITING_UPSTREAM_PAYMENT", "NOT_ISSUED"]);
    expect(history.rows.every((row) => row.reasonCode === null || row.outcome === "BLOCKED")).toBe(true);
    // Newest first.
    expect(history.rows.map((row) => row.printedAt.toISOString()))
      .toEqual([...history.rows.map((row) => row.printedAt.toISOString())].sort().reverse());
    expect(new Set(history.rows.map((row) => row.outletName)))
      .toEqual(new Set(["Outlet Cetak A1", "Outlet Cetak A2"]));
  });

  it("filters events by the printed-at window and by the outlet scope", async () => {
    // Six events fall inside 1–10 September; the 20 August print does not.
    const narrow = await readHistory();
    expect(narrow.totalCount).toBe(6);
    expect(narrow.rows.map((row) => row.printedAt.toISOString()))
      .not.toContain("2026-08-20T03:00:00.000Z");

    const wider = await readHistory({
      range: parseAnalyticsRange(
        { rentang: "kustom", dari: "2026-08-01", sampai: "2026-09-10", tz: "Asia/Jakarta" },
        now,
      ),
    });
    expect(wider.totalCount).toBe(7);

    const byOutlet = await readHistory({ outletId: outletA2 });
    expect(byOutlet.totalCount).toBe(1);
    expect(byOutlet.rows.map((row) => row.outletName)).toEqual(["Outlet Cetak A2"]);
  });

  it("returns no other tenant's print events", async () => {
    const history = await readHistory();
    expect(history.rows.map((row) => row.outletName)).not.toContain("Outlet Cetak B");

    const otherTenant = await readHistory({}, adminB, tenantB);
    expect(otherTenant.totalCount).toBe(1);
    expect(otherTenant.rows.map((row) => row.outletName)).toEqual(["Outlet Cetak B"]);
  });

  // The assertion above also passes with the application's own tenant predicate
  // deleted, because row-level security hides the foreign rows underneath.
  // AGENTS.md forbids RLS being the only control, so bind the predicate itself.
  it("filters print events by tenant in SQL rather than relying on row-level security", async () => {
    capturedStatements = [];
    await readHistory();

    const reads = capturedStatements.filter((statement) => /\bfrom\s+"?print_events"?/i.test(statement));
    expect(reads.length, "the report issues its count and row selects").toBeGreaterThanOrEqual(2);
    for (const statement of reads) {
      expect(statement, statement).toMatch(/"print_events"\."tenant_id"\s*=\s*\$\d/i);
    }
  });

  it("refuses the print history to a role other than Tenant Admin", async () => {
    await expect(readHistory({}, operatorA)).rejects.toThrow(/TENANT_ADMIN/);
  });
});
