import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadContactDirectoryPage } from "@/db/contact-repository";
import { loadLabelIndexPage } from "@/db/label-print-repository";
import * as schema from "@/db/schema";
import { loadShipmentQueuePage } from "@/db/shipment-queue-repository";
import { withTenantContext } from "@/db/tenant-context";
import { loadRtsShipmentsPage } from "@/db/rts-repository";
import { parseAnalyticsRange } from "@/lib/analytics-range";
import { SHIPMENT_QUEUE_SUMMARY_ENTRIES } from "@/lib/shipment-queue";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

/**
 * T-162 / PR-52. Every panel count is bound to the filter it applies: the
 * number an entry prints must equal the number of rows choosing that entry
 * returns, in the same tenant scope.
 *
 * The cross-tenant assertions alone are not enough. Row-level security hides a
 * foreign tenant's rows underneath the application, so a deleted `tenant_id`
 * predicate still reads empty and a naive cross-tenant test stays green.
 * AGENTS.md forbids RLS being the only control, so the emitted SQL is asserted
 * directly at the end of this file — the same pattern
 * `dashboard-outcome-parity` uses and for the same reason.
 */

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
if (!adminUrl || !appUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
}
if (new URL(adminUrl).pathname !== "/geraicuan_test") {
  throw new Error("State summary panel tests require geraicuan_test.");
}

const admin = new Pool({ connectionString: adminUrl });
const app = new Pool({ connectionString: appUrl });
let capturedStatements: string[] = [];
const appDb = drizzle({
  client: app,
  schema,
  logger: { logQuery: (query) => { capturedStatements.push(query); } },
});

const tenantA = "00000000-0000-3720-0000-000000000001";
const tenantB = "00000000-0000-3720-0000-000000000002";
const outletA = "00000000-0000-3721-0000-000000000001";
const outletB = "00000000-0000-3721-0000-000000000002";
const adminA = "state-summary-admin-a";
const adminB = "state-summary-admin-b";

function uuid(prefix: string, sequence: number) {
  return `00000000-0000-${prefix}-0000-${String(sequence).padStart(12, "0")}`;
}

type ShipmentFixture = {
  /** WIB creation instant; defaults to 5 September 2026. */
  createdAt?: string;
  /** Number of successful print events recorded against this shipment. */
  prints?: number;
  sequence: number;
  status: (typeof schema.shipmentStatuses)[number];
  tenantId?: string;
};

// One shipment per panel cohort, plus two the panel deliberately leaves out of
// every entry but "Semua kiriman" (SUBMISSION_QUEUED and RTS_RECEIVED), so the
// "ALL" count cannot be reconstructed by summing the other five.
const shipmentFixtures: ShipmentFixture[] = [
  { sequence: 1, status: "DRAFT" },
  { sequence: 2, status: "ESTIMATED" },
  { prints: 2, sequence: 3, status: "ISSUED" },
  { sequence: 4, status: "ISSUED" },
  { sequence: 5, status: "IN_TRANSIT" },
  { sequence: 6, status: "DELIVERED" },
  { sequence: 7, status: "SUBMISSION_UNKNOWN" },
  { sequence: 8, status: "PROBLEM" },
  { sequence: 9, status: "FAILED" },
  { sequence: 10, status: "AWAITING_UPSTREAM_PAYMENT" },
  { sequence: 11, status: "SUBMISSION_QUEUED" },
  { sequence: 12, status: "RTS_RECEIVED" },
  // T-163: outside every range the range tests below ask for, so a count that
  // ignores the period cannot pass them.
  { createdAt: "2026-06-01T03:00:00Z", sequence: 13, status: "DELIVERED" },
  { createdAt: "2026-06-01T03:00:00Z", prints: 1, sequence: 14, status: "ISSUED" },
  { prints: 1, sequence: 20, status: "ISSUED", tenantId: tenantB },
  { sequence: 21, status: "DRAFT", tenantId: tenantB },
];

type ContactFixture = {
  archived?: boolean;
  isRecipient?: boolean;
  isSender?: boolean;
  sequence: number;
  tenantId?: string;
};

const contactFixtures: ContactFixture[] = [
  { isRecipient: true, isSender: false, sequence: 1 },
  { isRecipient: true, isSender: true, sequence: 2 },
  { isRecipient: false, isSender: true, sequence: 3 },
  { archived: true, isRecipient: true, isSender: false, sequence: 4 },
  { archived: true, isRecipient: false, isSender: true, sequence: 5 },
  { isRecipient: true, isSender: true, sequence: 20, tenantId: tenantB },
];

async function clean() {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    for (const table of [
      "print_events",
      "provider_order_snapshots",
      "provider_batches",
      "shipment_estimate_services",
      "shipment_estimate_snapshots",
      "shipment_parties",
      "shipment_drafts",
      "shipments",
      "contact_addresses",
      "contacts",
      "outlets",
      "memberships",
    ]) {
      await client.query(`DELETE FROM ${table} WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    }
    await client.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await client.query("DELETE FROM users WHERE id = ANY($1::text[])", [[adminA, adminB]]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedShipment(fixture: ShipmentFixture) {
  const tenantId = fixture.tenantId ?? tenantA;
  const outletId = fixture.tenantId === tenantB ? outletB : outletA;
  const shipmentId = uuid("3730", fixture.sequence);
  const createdAt = fixture.createdAt ?? "2026-09-05T03:00:00Z";

  await admin.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)",
    [shipmentId, tenantId, outletId, fixture.status, createdAt],
  );
  await admin.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity,
      declared_value_idr, is_cod, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,'Panel fixture',1000,1,100000,false,$5,$5)`,
    [shipmentId, tenantId, `area-${fixture.sequence}`, `Tujuan ${fixture.sequence}`, createdAt],
  );
  for (const role of ["SENDER", "RECIPIENT"] as const) {
    await admin.query(
      `INSERT INTO shipment_parties (id, tenant_id, shipment_id, role, name, phone, address)
       VALUES ($1,$2,$3,$4,$5,'081234567890','Jl. Panel 1')`,
      [uuid(role === "SENDER" ? "3731" : "3732", fixture.sequence), tenantId, shipmentId, role, `${role} ${fixture.sequence}`],
    );
  }

  const issued = fixture.status === "ISSUED";
  const unpaid = fixture.status === "AWAITING_UPSTREAM_PAYMENT";
  if (!issued && !unpaid) return;

  const snapshotId = uuid("3733", fixture.sequence);
  const serviceId = uuid("3734", fixture.sequence);
  const batchId = uuid("3735", fixture.sequence);
  const orderId = uuid("3736", fixture.sequence);

  await admin.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
      destination_area_label, weight_grams, is_cod_requested, credential_source
    ) VALUES ($1,$2,$3,$4,'origin',$5,$6,1000,false,'platform_default')`,
    [snapshotId, tenantId, shipmentId, outletId, `area-${fixture.sequence}`, `Tujuan ${fixture.sequence}`],
  );
  await admin.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
      shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1,$2,$3,'JNE REG','IDR',10000,'price','fixture',true)`,
    [serviceId, tenantId, snapshotId],
  );
  await admin.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
      provider_account_key, idempotency_key, status, submission_attempted_at, completed_at, created_at
    ) VALUES ($1,$2,$3,'pickup','JNE','platform_default',$4,$5,'COMPLETED',$6,$6,$6)`,
    [
      batchId,
      tenantId,
      outletId,
      (3720 + fixture.sequence).toString(16).padStart(64, "0"),
      (4720 + fixture.sequence).toString(16).padStart(64, "0"),
      createdAt,
    ],
  );
  await admin.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id,
      position, provider_service, destination_area_id, destination_area_label, currency,
      shipping_amount_idr, is_cod, provider_cod_amount_idr, status, provider_order_id,
      is_paid, cnote_no, resolved_at, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,0,'JNE REG',$7,$8,'IDR',10000,false,null,$9,$10,$11,$12,$13,$13)`,
    [
      orderId,
      tenantId,
      batchId,
      shipmentId,
      snapshotId,
      serviceId,
      `area-${fixture.sequence}`,
      `Tujuan ${fixture.sequence}`,
      issued ? "ISSUED" : "AWAITING_UPSTREAM_PAYMENT",
      `order-${fixture.sequence}`,
      issued,
      issued ? `PANEL-AWB-${fixture.sequence}` : null,
      createdAt,
    ],
  );

  for (let index = 0; index < (fixture.prints ?? 0); index += 1) {
    await admin.query(
      `INSERT INTO print_events (
        id, tenant_id, shipment_id, provider_order_snapshot_id, sequence, outcome,
        awb_snapshot, actor_user_id, actor_role, printed_at
      ) VALUES ($1,$2,$3,$4,$5,'PRINTED',$6,$7,'TENANT_ADMIN',$8)`,
      [
        uuid("3737", fixture.sequence * 10 + index),
        tenantId,
        shipmentId,
        orderId,
        index + 1,
        `PANEL-AWB-${fixture.sequence}`,
        tenantId === tenantB ? adminB : adminA,
        createdAt,
      ],
    );
  }
}

async function seedContact(fixture: ContactFixture) {
  const tenantId = fixture.tenantId ?? tenantA;
  const contactId = uuid("3740", fixture.sequence);
  await admin.query(
    `INSERT INTO contacts (id, tenant_id, name, phone, is_recipient, is_sender, archived_at)
     VALUES ($1,$2,$3,'081234567890',$4,$5,$6)`,
    [
      contactId,
      tenantId,
      `Kontak ${fixture.sequence}`,
      fixture.isRecipient ?? true,
      fixture.isSender ?? true,
      fixture.archived ? "2026-09-06T03:00:00Z" : null,
    ],
  );
  await admin.query(
    `INSERT INTO contact_addresses (id, tenant_id, contact_id, label, address, is_primary)
     VALUES ($1,$2,$3,'Utama','Jl. Kontak 1',true)`,
    [uuid("3741", fixture.sequence), tenantId, contactId],
  );
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(admin, appUrl);
  await clean();
  await admin.query(
    `INSERT INTO users (id,name,email,status) VALUES
      ($1,'Panel Admin A','state-summary-admin-a@example.test','ACTIVE'),
      ($2,'Panel Admin B','state-summary-admin-b@example.test','ACTIVE')`,
    [adminA, adminB],
  );
  await admin.query(
    `INSERT INTO tenants (id,name,status) VALUES ($1,'Panel Tenant A','ACTIVE'),($2,'Panel Tenant B','ACTIVE')`,
    [tenantA, tenantB],
  );
  await admin.query(
    `INSERT INTO memberships (tenant_id,user_id,role) VALUES ($1,$2,'TENANT_ADMIN'),($3,$4,'TENANT_ADMIN')`,
    [tenantA, adminA, tenantB, adminB],
  );
  await admin.query(
    `INSERT INTO outlets (id,tenant_id,name) VALUES ($1,$2,'Outlet A'),($3,$4,'Outlet B')`,
    [outletA, tenantA, outletB, tenantB],
  );
  for (const fixture of shipmentFixtures) await seedShipment(fixture);
  for (const fixture of contactFixtures) await seedContact(fixture);
});

afterAll(async () => {
  await clean();
  await Promise.all([app.end(), admin.end()]);
});

describe("Histori kiriman panel counts", () => {
  it("prints the number of rows its own filter returns", async () => {
    const page = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadShipmentQueuePage(tx, context, { page: 1, pageSize: 20, status: "ALL" }),
    );

    for (const entry of SHIPMENT_QUEUE_SUMMARY_ENTRIES) {
      const filtered = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
        loadShipmentQueuePage(tx, context, { page: 1, pageSize: 20, status: entry.value }),
      );
      expect(page.summary[entry.metricId], entry.metricId).toBe(filtered.totalCount);
    }
  });

  it("counts the cohort the PR-52 entries name, not a convenient sum", async () => {
    const page = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadShipmentQueuePage(tx, context, { page: 1, pageSize: 20, status: "ALL" }),
    );

    // Bound to the fixtures, so widening or narrowing an entry's status list is
    // a failure rather than a silently agreeing tautology.
    expect(page.summary).toEqual({
      "QUE-ALL": 14,
      "QUE-NEEDS-AWB": 2,
      "QUE-AWAITING-PICKUP": 3,
      "QUE-IN-TRANSIT": 1,
      "QUE-DELIVERED": 2,
      "QUE-ATTENTION": 4,
    });
    // Two shipments belong to no entry but "Semua kiriman".
    const named =
      page.summary["QUE-NEEDS-AWB"] +
      page.summary["QUE-AWAITING-PICKUP"] +
      page.summary["QUE-IN-TRANSIT"] +
      page.summary["QUE-DELIVERED"] +
      page.summary["QUE-ATTENTION"];
    expect(page.summary["QUE-ALL"] - named).toBe(2);
  });

  it("counts only the reading tenant's shipments", async () => {
    const other = await withTenantContext(appDb, adminB, tenantB, (tx, context) =>
      loadShipmentQueuePage(tx, context, { page: 1, pageSize: 20, status: "ALL" }),
    );
    expect(other.summary["QUE-ALL"]).toBe(2);
    expect(other.summary["QUE-AWAITING-PICKUP"]).toBe(1);
    expect(other.summary["QUE-ATTENTION"]).toBe(0);
  });
});

describe("Cetak resi panel counts", () => {
  it("splits the issued list by print state and matches each filtered list", async () => {
    const all = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadLabelIndexPage(tx, context, { status: "issued", printState: "semua" }),
    );
    expect(all.summary).toEqual({ "LBL-ALL": 3, "LBL-PRINTED": 2, "LBL-UNPRINTED": 1 });

    for (const [printState, metricId] of [
      ["semua", "LBL-ALL"],
      ["belum", "LBL-UNPRINTED"],
      ["sudah", "LBL-PRINTED"],
    ] as const) {
      const filtered = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
        loadLabelIndexPage(tx, context, { status: "issued", printState }),
      );
      expect(filtered.rows, printState).toHaveLength(all.summary[metricId]);
    }

    // A shipment printed twice is still one "Sudah dicetak" row.
    const printed = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadLabelIndexPage(tx, context, { status: "issued", printState: "sudah" }),
    );
    expect(printed.rows.map((row) => row.printCount).sort()).toEqual([1, 2]);
  });

  it("counts only the reading tenant's labels", async () => {
    const other = await withTenantContext(appDb, adminB, tenantB, (tx, context) =>
      loadLabelIndexPage(tx, context, { status: "issued", printState: "semua" }),
    );
    expect(other.summary).toEqual({ "LBL-ALL": 1, "LBL-PRINTED": 1, "LBL-UNPRINTED": 0 });
  });
});

describe("Kontak panel counts", () => {
  it("prints the number of rows its own filter returns, per peran view", async () => {
    for (const role of ["all", "sender", "recipient"] as const) {
      const page = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
        loadContactDirectoryPage(tx, context, { query: "", role, status: "all" }),
      );
      for (const status of ["all", "active", "archived"] as const) {
        const filtered = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
          loadContactDirectoryPage(tx, context, { query: "", role, status }),
        );
        expect(page.summary[status], `${role}/${status}`).toBe(filtered.rows.length);
      }
    }
  });

  it("keeps the counts inside the peran view they sit under", async () => {
    const semua = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadContactDirectoryPage(tx, context, { query: "", role: "all", status: "all" }),
    );
    const pengirim = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadContactDirectoryPage(tx, context, { query: "", role: "sender", status: "all" }),
    );
    expect(semua.summary).toEqual({ active: 3, all: 5, archived: 2 });
    // Contact 2 holds both roles, so it is counted in both views.
    expect(pengirim.summary).toEqual({ active: 2, all: 3, archived: 1 });
  });

  it("counts only the reading tenant's contacts", async () => {
    const other = await withTenantContext(appDb, adminB, tenantB, (tx, context) =>
      loadContactDirectoryPage(tx, context, { query: "", role: "all", status: "all" }),
    );
    expect(other.summary).toEqual({ active: 1, all: 1, archived: 0 });
  });
});

describe("panel reads carry their own tenant predicate", () => {
  it("filters by tenant in SQL rather than relying on row-level security", async () => {
    capturedStatements = [];
    await withTenantContext(appDb, adminA, tenantA, async (tx, context) => {
      await loadShipmentQueuePage(tx, context, { page: 1, pageSize: 20, status: "ALL" });
      await loadLabelIndexPage(tx, context, { status: "issued", printState: "semua" });
      await loadContactDirectoryPage(tx, context, { query: "", role: "all", status: "all" });
    });

    // The context guard's own role probe is not a tenant read; every statement
    // that reads a tenant-owned table must carry that table's own predicate.
    const reads = capturedStatements.filter((statement) =>
      /\bfrom\s+"?(shipments|contacts|contact_addresses)"?/i.test(statement),
    );
    expect(reads.length, "each panel issues at least one select").toBeGreaterThanOrEqual(5);
    for (const statement of reads) {
      expect(statement, statement).toMatch(
        /"(?:shipments|contacts|contact_addresses)"\."tenant_id"\s*=\s*\$\d/i,
      );
    }
  });
});

/**
 * T-163 / PR-53: the range control is only honest if the rows and the PR-52
 * counts beside them answer to the same window. Two fixtures were created in
 * June and the rest in September, so a count that ignores the period cannot
 * pass these.
 */
describe("list pages respect the PR-53 range", () => {
  const now = new Date("2026-09-20T05:00:00.000Z");
  const september = parseAnalyticsRange(
    { rentang: "kustom", dari: "2026-09-01", sampai: "2026-09-10", tz: "Asia/Jakarta" },
    now,
  );
  const june = parseAnalyticsRange(
    { rentang: "kustom", dari: "2026-06-01", sampai: "2026-06-30", tz: "Asia/Jakarta" },
    now,
  );

  it("filters the shipment queue rows and its counts by the same created window", async () => {
    const inSeptember = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadShipmentQueuePage(tx, context, { page: 1, pageSize: 50, range: september, status: "ALL" }),
    );
    expect(inSeptember.totalCount).toBe(12);
    expect(inSeptember.rows).toHaveLength(12);
    expect(inSeptember.summary["QUE-ALL"]).toBe(12);
    expect(inSeptember.summary["QUE-DELIVERED"]).toBe(1);
    expect(inSeptember.summary["QUE-AWAITING-PICKUP"]).toBe(2);

    const inJune = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadShipmentQueuePage(tx, context, { page: 1, pageSize: 50, range: june, status: "ALL" }),
    );
    expect(inJune.totalCount).toBe(2);
    expect(inJune.summary["QUE-ALL"]).toBe(2);
    expect(inJune.summary["QUE-DELIVERED"]).toBe(1);
    expect(inJune.summary["QUE-AWAITING-PICKUP"]).toBe(1);

    // Still true inside a range: every entry equals the rows its filter returns.
    for (const entry of SHIPMENT_QUEUE_SUMMARY_ENTRIES) {
      const filtered = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
        loadShipmentQueuePage(tx, context, { page: 1, pageSize: 50, range: june, status: entry.value }),
      );
      expect(inJune.summary[entry.metricId], entry.metricId).toBe(filtered.totalCount);
    }
  });

  it("filters the RTS queue rows and its counts by the same created window", async () => {
    const inSeptember = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadRtsShipmentsPage(tx, context, { page: 1, pageSize: 50, range: september, status: "ALL" }),
    );
    expect(inSeptember.summary).toEqual({
      inTransitCount: 0,
      problemCount: 1,
      queuedCount: 0,
      receivedCount: 1,
      totalRtsCount: 2,
    });
    expect(inSeptember.rows).toHaveLength(2);

    const inJune = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadRtsShipmentsPage(tx, context, { page: 1, pageSize: 50, range: june, status: "ALL" }),
    );
    expect(inJune.summary.totalRtsCount).toBe(0);
    expect(inJune.rows).toHaveLength(0);
  });

  it("filters Cetak resi rows and its counts on the issued basis", async () => {
    const inSeptember = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadLabelIndexPage(tx, context, { status: "issued", printState: "semua", range: september }),
    );
    expect(inSeptember.summary).toEqual({ "LBL-ALL": 2, "LBL-PRINTED": 1, "LBL-UNPRINTED": 1 });
    expect(inSeptember.rows).toHaveLength(2);

    const inJune = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadLabelIndexPage(tx, context, { status: "issued", printState: "semua", range: june }),
    );
    expect(inJune.summary).toEqual({ "LBL-ALL": 1, "LBL-PRINTED": 1, "LBL-UNPRINTED": 0 });
    expect(inJune.rows).toHaveLength(1);

    for (const [printState, metricId] of [
      ["semua", "LBL-ALL"],
      ["belum", "LBL-UNPRINTED"],
      ["sudah", "LBL-PRINTED"],
    ] as const) {
      const filtered = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
        loadLabelIndexPage(tx, context, { status: "issued", printState, range: september }),
      );
      expect(filtered.rows, printState).toHaveLength(inSeptember.summary[metricId]);
    }
  });
});
