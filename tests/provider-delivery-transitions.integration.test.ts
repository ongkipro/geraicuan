import { readFileSync } from "node:fs";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { completeProviderOrder } from "@/db/order-batch-repository";
import { recordProviderSettlementPull } from "@/db/provider-settlement-repository";
import { loadRtsShipmentsPage } from "@/db/rts-repository";
import * as schema from "@/db/schema";
import { loadTenantDashboardOutcomeSummary } from "@/db/tenant-dashboard-repository";
import { PROVIDER_DELIVERY_TRANSITION_OUTCOMES } from "@/lib/provider-delivery-status";
import { withTenantContext } from "@/db/tenant-context";
import { parseAnalyticsRange } from "@/lib/analytics-range";
import type { ProviderSettlementSnapshot } from "@/lib/mengantar-settlement";
import {
  decideProviderDeliveryTransition,
  PROVIDER_DELIVERY_STATUS_MAP,
} from "@/lib/provider-delivery-status";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

// T-169 / PR-57. `shipments.status` was never written with a delivery state by
// any code path: the webhook is closed and nothing polled, so the RTS queue and
// the dashboard outcome were fed by the demo seed alone. These tests drive a
// shipment through each status the provider was actually observed to report
// (tests/fixtures/mengantar-order-contract.shape.json, captured 2026-09-16) and
// bind idempotence, the refusal to move backwards, the refusal to invent a
// state, and the tenant/outlet scope of the write.

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
if (!adminUrl || !appUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
}
if (new URL(adminUrl).pathname !== "/geraicuan_test") {
  throw new Error("Provider delivery transition tests require geraicuan_test.");
}

const adminPool = new Pool({ connectionString: adminUrl });
const appPool = new Pool({ connectionString: appUrl });
let capturedStatements: string[] = [];
const appDb = drizzle({
  client: appPool,
  schema,
  logger: { logQuery: (query) => { capturedStatements.push(query); } },
});

const tenantA = "00000000-0000-5700-0000-000000000001";
const tenantB = "00000000-0000-5700-0000-000000000002";
const outletA = "00000000-0000-5701-0000-000000000001";
const outletA2 = "00000000-0000-5701-0000-000000000002";
const outletB = "00000000-0000-5701-0000-000000000003";
const adminA = "delivery-transition-admin-a";
const adminB = "delivery-transition-admin-b";
const accountKey = "c".repeat(64);
const period = { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-10-01T00:00:00Z") };
const range = parseAnalyticsRange(
  { rentang: "kustom", dari: "2026-09-01", sampai: "2026-09-30", tz: "Asia/Jakarta" },
  new Date("2026-09-30T05:00:00.000Z"),
);

function statusSnapshot(orderStatuses: { cnoteNo: string; status: string }[]): ProviderSettlementSnapshot {
  // Only the `GET /order` half of a pull: no invoice moves money here, and the
  // ledger must not change because a parcel was delivered.
  return { invoiceCount: 0, orderCount: orderStatuses.length, items: [], refunds: [], orderStatuses };
}

function pull(
  orderStatuses: { cnoteNo: string; status: string }[],
  actor = adminA,
  tenantId = tenantA,
  outletId = outletA,
) {
  return withTenantContext(appDb, actor, tenantId, (tx, context) =>
    recordProviderSettlementPull(tx, context, {
      outletId,
      credentialSource: "platform_default",
      providerAccountKey: accountKey,
      period,
      snapshot: statusSnapshot(orderStatuses),
    }));
}

let sequence = 0;

/** Seeds one shipment that reached ISSUED through the real issuance path. */
async function seedIssuedShipment(input: {
  cnoteNo: string;
  outletId?: string;
  tenantId?: string;
}) {
  sequence += 1;
  const tenantId = input.tenantId ?? tenantA;
  const outletId = input.outletId ?? outletA;
  const suffix = String(sequence).padStart(12, "0");
  const ids = {
    shipmentId: `00000000-0000-5710-0000-${suffix}`,
    snapshotId: `00000000-0000-5711-0000-${suffix}`,
    serviceId: `00000000-0000-5712-0000-${suffix}`,
    batchId: `00000000-0000-5713-0000-${suffix}`,
    orderId: `00000000-0000-5714-0000-${suffix}`,
  };
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status, created_at) VALUES ($1, $2, $3, 'SUBMISSION_QUEUED', '2026-09-05T03:00:00Z')",
    [ids.shipmentId, tenantId, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (shipment_id, tenant_id, destination_area_id, destination_area_label, package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod)
     VALUES ($1, $2, 'fixture-area', 'Fixture area', 'Sanitized parcel', 1000, 1, 100000, true)`,
    [ids.shipmentId, tenantId],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
     VALUES ($1, $2, 'RECIPIENT', 'Penerima Uji', '081100000000', 'Alamat uji', 'fixture-area', 'Fixture area')`,
    [tenantId, ids.shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id, destination_area_label, weight_grams, is_cod_requested, credential_source)
     VALUES ($1, $2, $3, $4, 'fixture-origin', 'fixture-area', 'Fixture area', 1000, true, 'platform_default')`,
    [ids.snapshotId, tenantId, ids.shipmentId, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible)
     VALUES ($1, $2, $3, 'JNE REG', 'IDR', 10000, 'price', 'fixture', true)`,
    [ids.serviceId, tenantId, ids.snapshotId],
  );
  await adminPool.query(
    `INSERT INTO shipment_cod_totals (tenant_id, shipment_id, snapshot_id, estimate_service_id, currency, goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr, provider_cod_amount_idr)
     VALUES ($1, $2, $3, $4, 'IDR', 100000, 10000, 3300, 363, 113663)`,
    [tenantId, ids.shipmentId, ids.snapshotId, ids.serviceId],
  );
  await adminPool.query(
    `INSERT INTO provider_batches (id, tenant_id, outlet_id, pickup_address_id, courier, credential_source, provider_account_key, idempotency_key, status, submission_attempted_at)
     VALUES ($1, $2, $3, 'fixture-pickup', 'JNE', 'platform_default', $4, $5, 'SUBMITTING', now())`,
    [ids.batchId, tenantId, outletId, accountKey, suffix.padStart(64, "0")],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id, position, provider_service, destination_area_id, destination_area_label, currency, shipping_amount_idr, is_cod, provider_cod_amount_idr)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG', 'fixture-area', 'Fixture area', 'IDR', 10000, true, 113663)`,
    [ids.orderId, tenantId, ids.batchId, ids.shipmentId, ids.snapshotId, ids.serviceId],
  );
  await withTenantContext(appDb, tenantId === tenantA ? adminA : adminB, tenantId, (tx, context) =>
    completeProviderOrder(tx, context, ids.batchId, {
      shipmentId: ids.shipmentId,
      providerOrderId: `provider-${ids.orderId}`,
      isPaid: true,
      cnoteNo: input.cnoteNo,
    }));
  return ids.shipmentId;
}

async function statusOf(shipmentId: string) {
  const { rows } = await adminPool.query<{ status: string; updated_at: Date }>(
    "SELECT status, updated_at FROM shipments WHERE id = $1",
    [shipmentId],
  );
  return rows[0];
}

async function observationsOf(shipmentId: string) {
  const { rows } = await adminPool.query<{
    provider_status: string;
    from_status: string | null;
    mapped_status: string | null;
    transition_outcome: string | null;
  }>(
    `SELECT provider_status, from_status, mapped_status, transition_outcome
     FROM provider_order_status_observations WHERE shipment_id = $1 ORDER BY observed_at, id`,
    [shipmentId],
  );
  return rows;
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appUrl);
});

beforeEach(async () => {
  capturedStatements = [];
  await adminPool.query(
    `TRUNCATE shipment_rate_limits, provider_order_status_observations, provider_settlement_items, provider_settlement_pulls,
      ledger_entries, reconciliation_runs, provider_unpaid_recoveries, provider_order_snapshots, provider_batches,
      shipment_cod_totals, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties,
      shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE`,
  );
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, 'Admin A', 'delivery-a@example.test'), ($2, 'Admin B', 'delivery-b@example.test')",
    [adminA, adminB],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'Delivery A', 'ACTIVE'), ($2, 'Delivery B', 'ACTIVE')",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($3, $4, 'TENANT_ADMIN')",
    [tenantA, adminA, tenantB, adminB],
  );
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
     VALUES ($1, $2, 'Outlet A', 'fixture-pickup', 'fixture-origin'),
            ($3, $2, 'Outlet A2', 'fixture-pickup', 'fixture-origin'),
            ($4, $5, 'Outlet B', 'fixture-pickup-b', 'fixture-origin-b')`,
    [outletA, tenantA, outletA2, outletB, tenantB],
  );
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("provider delivery status mapping", () => {
  it("maps only the statuses the provider was observed to report", () => {
    expect(decideProviderDeliveryTransition("DELIVERED", "ISSUED")).toMatchObject({
      mappedStatus: "DELIVERED",
      outcome: "APPLIED",
    });
    expect(decideProviderDeliveryTransition("DELIVERY PROBLEM", "ISSUED")).toMatchObject({
      mappedStatus: "PROBLEM",
      outcome: "APPLIED",
    });
    // The provider's single RTS value does not say how far the return has got,
    // so the least advanced return state is the only honest claim.
    expect(decideProviderDeliveryTransition("RTS", "ISSUED")).toMatchObject({
      mappedStatus: "RTS_QUEUED",
      outcome: "APPLIED",
    });
    // Recognised, but it reports the position ISSUED already records, and
    // completing an issuance from here would bypass reconciliation's ledger.
    expect(decideProviderDeliveryTransition("PENDING PICKUP", "SUBMISSION_UNKNOWN")).toMatchObject({
      mappedStatus: null,
      outcome: "NO_LIFECYCLE_STATE",
    });
  });

  it("refuses to guess a state for a provider value outside the observed vocabulary", () => {
    for (const unknown of ["UNDELIVERED", "ON PROCESS", "RETURNED TO SHIPPER", ""]) {
      expect(decideProviderDeliveryTransition(unknown, "ISSUED"), unknown).toMatchObject({
        mappedStatus: null,
        outcome: "UNRECOGNISED",
      });
    }
  });

  it("invents no in-transit state, because the capture contained none", () => {
    // 96 of 100 sampled orders were RTS and the list endpoint would not page
    // further, so no in-transit value was ever seen. Adding one here without a
    // capture would put a state on a shipment no provider record reported.
    expect(Object.values(PROVIDER_DELIVERY_STATUS_MAP)).not.toContain("IN_TRANSIT");
  });

  it("normalizes only case and inner spacing", () => {
    expect(decideProviderDeliveryTransition("  delivery   problem ", "ISSUED").normalizedStatus)
      .toBe("DELIVERY PROBLEM");
    expect(decideProviderDeliveryTransition("delivered", "ISSUED").outcome).toBe("APPLIED");
  });

  it("never moves a shipment backwards", () => {
    expect(decideProviderDeliveryTransition("RTS", "DELIVERED").outcome).toBe("REFUSED");
    expect(decideProviderDeliveryTransition("DELIVERED", "RTS_QUEUED").outcome).toBe("REFUSED");
    expect(decideProviderDeliveryTransition("DELIVERED", "DRAFT").outcome).toBe("REFUSED");
    expect(decideProviderDeliveryTransition("DELIVERED", "SUBMISSION_UNKNOWN").outcome).toBe("REFUSED");
    expect(decideProviderDeliveryTransition("DELIVERED", "FAILED").outcome).toBe("REFUSED");
    expect(decideProviderDeliveryTransition("DELIVERED", "DELIVERED").outcome).toBe("UNCHANGED");
    // A delivery problem may still resolve either way.
    expect(decideProviderDeliveryTransition("DELIVERED", "PROBLEM").outcome).toBe("APPLIED");
    expect(decideProviderDeliveryTransition("RTS", "PROBLEM").outcome).toBe("APPLIED");
  });
});

describe("ingesting provider delivery states", () => {
  it("moves each issued shipment to the state Mengantar reported", async () => {
    const delivered = await seedIssuedShipment({ cnoteNo: "AWB-DELIVERED-1" });
    const problem = await seedIssuedShipment({ cnoteNo: "AWB-PROBLEM-1" });
    const returned = await seedIssuedShipment({ cnoteNo: "AWB-RTS-1" });

    const result = await pull([
      { cnoteNo: "AWB-DELIVERED-1", status: "DELIVERED" },
      { cnoteNo: "AWB-PROBLEM-1", status: "DELIVERY PROBLEM" },
      { cnoteNo: "AWB-RTS-1", status: "RTS" },
    ]);

    expect(result).toMatchObject({
      matchedStatusCount: 3,
      appliedTransitionCount: 3,
      refusedTransitionCount: 0,
      unrecognisedStatuses: [],
    });
    expect((await statusOf(delivered)).status).toBe("DELIVERED");
    expect((await statusOf(problem)).status).toBe("PROBLEM");
    expect((await statusOf(returned)).status).toBe("RTS_QUEUED");
    expect(await observationsOf(delivered)).toEqual([
      { provider_status: "DELIVERED", from_status: "ISSUED", mapped_status: "DELIVERED", transition_outcome: "APPLIED" },
    ]);
  });

  it("records an unrecognised provider status and leaves the shipment where it was", async () => {
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-UNKNOWN-1" });

    const result = await pull([{ cnoteNo: "AWB-UNKNOWN-1", status: "UNDELIVERED" }]);

    expect(result.appliedTransitionCount).toBe(0);
    // Surfaced to the operator who ran the pull, not swallowed.
    expect(result.unrecognisedStatuses).toEqual(["UNDELIVERED"]);
    expect((await statusOf(shipment)).status).toBe("ISSUED");
    expect(await observationsOf(shipment)).toEqual([
      { provider_status: "UNDELIVERED", from_status: "ISSUED", mapped_status: null, transition_outcome: "UNRECOGNISED" },
    ]);
  });

  it("records a pre-transit report without completing an issuance", async () => {
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-PENDING-1" });

    await pull([{ cnoteNo: "AWB-PENDING-1", status: "PENDING PICKUP" }]);

    expect((await statusOf(shipment)).status).toBe("ISSUED");
    expect(await observationsOf(shipment)).toEqual([
      { provider_status: "PENDING PICKUP", from_status: "ISSUED", mapped_status: null, transition_outcome: "NO_LIFECYCLE_STATE" },
    ]);
  });

  it("is idempotent when the same provider status is pulled again", async () => {
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-DELIVERED-2" });
    const first = await pull([{ cnoteNo: "AWB-DELIVERED-2", status: "DELIVERED" }]);
    const afterFirst = await statusOf(shipment);
    await adminPool.query("UPDATE provider_settlement_pulls SET created_at = created_at - interval '2 minutes'");
    await adminPool.query("UPDATE shipment_rate_limits SET last_request = 0");

    const second = await pull([{ cnoteNo: "AWB-DELIVERED-2", status: "DELIVERED" }]);

    expect(first.appliedTransitionCount).toBe(1);
    expect(second.appliedTransitionCount).toBe(0);
    const afterSecond = await statusOf(shipment);
    expect(afterSecond.status).toBe("DELIVERED");
    // The second pull wrote no row, so the lifecycle timestamp did not move.
    expect(afterSecond.updated_at.getTime()).toBe(afterFirst.updated_at.getTime());
    expect((await observationsOf(shipment)).map((row) => row.transition_outcome))
      .toEqual(["APPLIED", "UNCHANGED"]);
  });

  it("never moves a delivered shipment back into the return queue", async () => {
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-DELIVERED-3" });
    await pull([{ cnoteNo: "AWB-DELIVERED-3", status: "DELIVERED" }]);
    await adminPool.query("UPDATE shipment_rate_limits SET last_request = 0");

    const second = await pull([{ cnoteNo: "AWB-DELIVERED-3", status: "RTS" }]);

    expect(second.refusedTransitionCount).toBe(1);
    expect((await statusOf(shipment)).status).toBe("DELIVERED");
    expect((await observationsOf(shipment)).at(-1)).toEqual({
      provider_status: "RTS",
      from_status: "DELIVERED",
      mapped_status: "RTS_QUEUED",
      transition_outcome: "REFUSED",
    });
  });

  it("refuses to settle an unreconciled submission from a delivery report", async () => {
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-UNKNOWN-2" });
    await adminPool.query("UPDATE shipments SET status = 'SUBMISSION_UNKNOWN' WHERE id = $1", [shipment]);

    const result = await pull([{ cnoteNo: "AWB-UNKNOWN-2", status: "DELIVERED" }]);

    expect(result.refusedTransitionCount).toBe(1);
    expect((await statusOf(shipment)).status).toBe("SUBMISSION_UNKNOWN");
  });

  it("feeds the dashboard outcome and the RTS queue from provider observations, not seed data", async () => {
    await seedIssuedShipment({ cnoteNo: "AWB-DELIVERED-4" });
    await seedIssuedShipment({ cnoteNo: "AWB-RTS-2" });
    await seedIssuedShipment({ cnoteNo: "AWB-PROBLEM-2" });

    const before = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadTenantDashboardOutcomeSummary(tx, context, range));
    const rtsBefore = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadRtsShipmentsPage(tx, context, { page: 1, pageSize: 20, range, status: "ALL" }));
    expect(before.delivered.totalCount).toBe(0);
    expect(before.returned.totalCount).toBe(0);
    expect(rtsBefore.summary.totalRtsCount).toBe(0);
    // Nothing has been pulled yet, so the surface has no provider basis to state.
    expect(rtsBefore.basis).toEqual({ lastObservedAt: null, observationVisible: true });

    await pull([
      { cnoteNo: "AWB-DELIVERED-4", status: "DELIVERED" },
      { cnoteNo: "AWB-RTS-2", status: "RTS" },
      { cnoteNo: "AWB-PROBLEM-2", status: "DELIVERY PROBLEM" },
    ]);

    const after = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadTenantDashboardOutcomeSummary(tx, context, range));
    const rtsAfter = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadRtsShipmentsPage(tx, context, { page: 1, pageSize: 20, range, status: "ALL" }));

    expect(after.delivered.totalCount).toBe(1);
    expect(after.returned.totalCount).toBe(1);
    expect(after.inProgress.totalCount).toBe(1);
    expect(rtsAfter.summary).toMatchObject({ queuedCount: 1, problemCount: 1, totalRtsCount: 2 });
    expect(rtsAfter.rows.map((row) => row.status).sort()).toEqual(["PROBLEM", "RTS_QUEUED"]);
    expect(after.basis.lastObservedAt).toBeInstanceOf(Date);
    expect(rtsAfter.basis.lastObservedAt).toBeInstanceOf(Date);
  });
});

describe("delivery transitions stay inside the actor's tenant and outlet", () => {
  it("leaves another tenant's shipment untouched even on the shared platform account", async () => {
    const mine = await seedIssuedShipment({ cnoteNo: "AWB-SHARED-1" });
    const theirs = await seedIssuedShipment({
      cnoteNo: "AWB-SHARED-2",
      outletId: outletB,
      tenantId: tenantB,
    });

    const result = await pull([
      { cnoteNo: "AWB-SHARED-1", status: "DELIVERED" },
      { cnoteNo: "AWB-SHARED-2", status: "DELIVERED" },
    ]);

    expect(result.matchedStatusCount).toBe(1);
    expect((await statusOf(mine)).status).toBe("DELIVERED");
    expect((await statusOf(theirs)).status).toBe("ISSUED");
    expect(await observationsOf(theirs)).toEqual([]);
  });

  // Review B7 pattern: the cross-tenant assertion above also passes with the
  // application's own predicate deleted, because row-level security hides the
  // foreign row underneath. AGENTS.md forbids RLS being the only control, so
  // bind the predicate itself — on the lifecycle write, not only on a read.
  /**
   * The outcome vocabulary lives twice: as a TypeScript constant the decision
   * returns, and as a literal list inside 0047's CHECK constraint. Adding a
   * sixth outcome to the constant typechecks and then aborts a settlement pull
   * mid-transaction on a constraint violation — rolling back the matched
   * settlement items with it. Bind the two lists to each other.
   */
  it("keeps the transition-outcome vocabulary and the database constraint in step", () => {
    const migration = readFileSync(
      join(process.cwd(), "drizzle/0047_provider_delivery_transitions.sql"),
      "utf8",
    );
    const clause = migration.match(/transition_outcome\s+IN\s*\(([^)]*)\)/i);
    expect(clause, "0047 must constrain transition_outcome to a literal list").toBeTruthy();
    const constrained = [...clause![1].matchAll(/'([^']+)'/g)].map((match) => match[1]);

    expect([...constrained].sort()).toEqual([...PROVIDER_DELIVERY_TRANSITION_OUTCOMES].sort());
  });

  it("filters the lifecycle write by tenant in SQL rather than relying on row-level security", async () => {
    const delivered = await seedIssuedShipment({ cnoteNo: "AWB-SCOPE-1" });
    const returned = await seedIssuedShipment({ cnoteNo: "AWB-SCOPE-2", outletId: outletA2 });
    capturedStatements = [];

    await pull([
      { cnoteNo: "AWB-SCOPE-1", status: "DELIVERED" },
      { cnoteNo: "AWB-SCOPE-2", status: "RTS" },
    ]);

    // The pull's scope is the tenant, not one outlet: the provider reported on
    // both shipments through one account, so both move. An earlier version also
    // filtered the write by `outlet_id` and asserted that predicate's SQL text —
    // a tautology, because the id came from the same shipment row the predicate
    // then matched. The behaviour is what binds it now.
    expect((await statusOf(delivered)).status, "the shipment the provider reported delivered").toBe("DELIVERED");
    expect((await statusOf(returned)).status, "a shipment in the tenant's other outlet").toBe("RTS_QUEUED");

    const updates = capturedStatements.filter((statement) => /^update\s+"shipments"/i.test(statement.trim()));
    // One write per target state, whichever outlets the shipments sit in.
    expect(updates.length, "each target state issues its own scoped update").toBe(2);
    for (const statement of updates) {
      expect(statement, statement).toMatch(/"shipments"\."tenant_id"\s*=\s*\$\d/i);
    }

    const lockingReads = capturedStatements.filter((statement) => /for update/i.test(statement));
    expect(lockingReads.length, "the current status is read under a lock").toBeGreaterThanOrEqual(1);
    for (const statement of lockingReads) {
      expect(statement, statement).toMatch(/"shipments"\."tenant_id"\s*=\s*\$\d/i);
    }
  });
});
