// T-290 (D-42): a confirmed cancellation — the app's confirmed deletion or a status pull —
// reverses the shipment's issuance ledger entries with append-only ADJUSTMENTs in the same
// transaction, so FIN-COD-PRINCIPAL, FIN-PROVIDER-COST and CRR-SHIPPING-IDR stop counting a
// cancelled parcel and the reconciliation still matches. Round-3 residuals: (a) a deletion a
// pull recorded first is still audited once; (c) a refused inferred cancel never becomes the
// "latest provider status". Real database, runtime role, RLS on; no provider call.
import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  appendLedgerAdjustment,
  appendLedgerReversalsForCancelledShipments,
  LedgerDeniedError,
  reconcileLedgerPeriod,
  summarizeLedger,
} from "@/db/ledger-repository";
import { completeProviderOrder } from "@/db/order-batch-repository";
import { loadOwnerMoney } from "@/db/owner-money-repository";
import { withPlatformContext } from "@/db/platform-context";
import { readPlatformTenantFinanceSummary } from "@/db/platform-tenant-repository";
import { listProviderSettlementReview, recordProviderSettlementPull } from "@/db/provider-settlement-repository";
import * as schema from "@/db/schema";
import { loadShipmentCancelTarget, recordShipmentCancelled } from "@/db/shipment-cancellation-repository";
import { loadTenantDashboardCourierRecap } from "@/db/tenant-dashboard-repository";
import { withTenantContext } from "@/db/tenant-context";
import { parseAnalyticsRange } from "@/lib/analytics-range";
import type { ProviderOrderStatus } from "@/lib/mengantar-settlement";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
if (!adminUrl || !appUrl) throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
if (new URL(adminUrl).pathname !== "/geraicuan_test") throw new Error("T-290 tests require geraicuan_test.");

const adminPool = new Pool({ connectionString: adminUrl });
const appPool = new Pool({ connectionString: appUrl });
const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-0290-0000-0000000000a1";
const tenantB = "00000000-0000-0290-0000-0000000000b1";
const outletA = "00000000-0000-0290-0001-0000000000a1";
const outletB = "00000000-0000-0290-0001-0000000000b1";
const adminA = "t290-admin-a";
const adminB = "t290-admin-b";
const operatorA = "t290-operator-a";
const superAdmin = "t290-super-admin";
const accountKey = "e".repeat(64);
const now = new Date();
const range = parseAnalyticsRange({ rentang: "7-hari", tz: "Asia/Jakarta" }, now);
const pullPeriod = { start: new Date(now.getTime() - 86_400_000), end: new Date(now.getTime() + 3_600_000) };

const REVERSED = ["COD_PRINCIPAL_COLLECTABLE", "MENGANTAR_COD_FEE_COST", "MENGANTAR_SHIPPING_COST"];

let sequence = 0;

/** One COD shipment issued through the real path, so its issuance ledger is the real one. */
async function seedIssued(tenant: "a" | "b" = "a", isCod = true) {
  sequence += 1;
  const tenantId = tenant === "a" ? tenantA : tenantB;
  const outletId = tenant === "a" ? outletA : outletB;
  const suffix = `${tenant}${String(sequence).padStart(11, "0")}`;
  const ids = {
    shipmentId: `00000000-0000-0290-0010-${suffix}`,
    snapshotId: `00000000-0000-0290-0011-${suffix}`,
    serviceId: `00000000-0000-0290-0012-${suffix}`,
    batchId: `00000000-0000-0290-0013-${suffix}`,
    orderId: `00000000-0000-0290-0014-${suffix}`,
  };
  const cnoteNo = `SANITIZED-T290-${tenant.toUpperCase()}${sequence}`;
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, 'SUBMISSION_QUEUED')",
    [ids.shipmentId, tenantId, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (shipment_id, tenant_id, destination_area_id, destination_area_label, package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod)
     VALUES ($1, $2, 'fixture-area', 'Fixture area', 'Sanitized parcel', 1000, 1, 100000, $3)`,
    [ids.shipmentId, tenantId, isCod],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
     VALUES ($1, $2, 'RECIPIENT', 'Penerima Uji', '081100000290', 'Alamat uji', 'fixture-area', 'Fixture area')`,
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
  if (isCod) await adminPool.query(
    `INSERT INTO shipment_cod_totals (tenant_id, shipment_id, snapshot_id, estimate_service_id, currency, goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr, provider_cod_amount_idr)
     VALUES ($1, $2, $3, $4, 'IDR', 100000, 10000, 3300, 363, 113663)`,
    [tenantId, ids.shipmentId, ids.snapshotId, ids.serviceId],
  );
  await adminPool.query(
    `INSERT INTO provider_batches (id, tenant_id, outlet_id, pickup_address_id, courier, credential_source, provider_account_key, idempotency_key, status, submission_attempted_at)
     VALUES ($1, $2, $3, 'fixture-pickup', 'JNE', 'platform_default', $4, $5, 'SUBMITTING', now())`,
    [ids.batchId, tenantId, outletId, accountKey, `290${suffix}`.padStart(64, "0")],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id, position, provider_service, destination_area_id, destination_area_label, currency, shipping_amount_idr, is_cod, provider_cod_amount_idr)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG', 'fixture-area', 'Fixture area', 'IDR', 10000, $7, $8)`,
    [ids.orderId, tenantId, ids.batchId, ids.shipmentId, ids.snapshotId, ids.serviceId, isCod, isCod ? 113663 : null],
  );
  await withTenantContext(appDb, tenant === "a" ? adminA : adminB, tenantId, (tx, context) =>
    completeProviderOrder(tx, context, ids.batchId, {
      shipmentId: ids.shipmentId,
      providerOrderId: `provider-${ids.orderId}`,
      isPaid: true,
      cnoteNo,
    }));
  return { ...ids, cnoteNo };
}

const asA = <T>(work: Parameters<typeof withTenantContext<T>>[3]) => withTenantContext(appDb, adminA, tenantA, work);

function pull(orderStatuses: ProviderOrderStatus[]) {
  return asA((tx, context) => recordProviderSettlementPull(tx, context, {
    outletId: outletA,
    credentialSource: "platform_default",
    providerAccountKey: accountKey,
    period: pullPeriod,
    snapshot: { invoiceCount: 0, orderCount: orderStatuses.length, items: [], refunds: [], orderStatuses },
  }));
}

const appCancel = (shipmentId: string) =>
  asA((tx, context) => recordShipmentCancelled(tx, context, shipmentId, { courier: "JNE" }));

type LedgerRow = {
  id: string;
  entry_type: string;
  financial_class: string;
  amount_idr: string;
  effective_at: Date;
  reverses_entry_id: string | null;
  source_event: string;
  source_event_id: string;
  actor_user_id: string;
  provider_batch_id: string;
};

async function ledgerOf(shipmentId: string) {
  return (await adminPool.query<LedgerRow>(
    `SELECT id, entry_type, financial_class, amount_idr, effective_at, reverses_entry_id, source_event, source_event_id,
       actor_user_id, provider_batch_id
     FROM ledger_entries WHERE shipment_id = $1 ORDER BY created_at, id`,
    [shipmentId],
  )).rows;
}

/** Every entry of the shipment, adjustments filed under the type they reverse, summed. */
async function netByType(shipmentId: string) {
  const rows = await ledgerOf(shipmentId);
  const typeOf = new Map(rows.map((row) => [row.id, row.entry_type]));
  const net: Record<string, number> = {};
  for (const row of rows) {
    const type = row.reverses_entry_id ? typeOf.get(row.reverses_entry_id)! : row.entry_type;
    net[type] = (net[type] ?? 0) + Number(row.amount_idr);
  }
  return net;
}

/** Each reversible entry has exactly one ADJUSTMENT with the negated amount, class, batch and time. */
async function expectFullyReversed(shipmentId: string, manualIds: readonly string[] = []) {
  const rows = await ledgerOf(shipmentId);
  const originals = rows.filter((row) => row.entry_type !== "ADJUSTMENT");
  const adjustments = rows.filter((row) => row.entry_type === "ADJUSTMENT");
  expect(originals.map((row) => row.entry_type).sort()).toEqual(REVERSED);
  expect(adjustments).toHaveLength(originals.length);
  for (const original of originals) {
    const reversal = adjustments.filter((row) => row.reverses_entry_id === original.id);
    expect(reversal).toHaveLength(1);
    expect(reversal[0]).toMatchObject({
      amount_idr: String(-Number(original.amount_idr)),
      financial_class: original.financial_class,
      provider_batch_id: original.provider_batch_id,
      source_event: "MANUAL_ADJUSTMENT",
      source_event_id: original.id,
      actor_user_id: adminA,
    });
    // A manual adjustment is dated when it was made; a cancellation reversal at its original.
    if (!manualIds.includes(reversal[0]!.id)) {
      expect(reversal[0]!.effective_at.getTime()).toBe(original.effective_at.getTime());
    }
  }
  expect(Object.values(await netByType(shipmentId)).every((amount) => amount === 0)).toBe(true);
}

async function cancelAudits() {
  return (await adminPool.query(
    "SELECT actor_id, target_id, metadata FROM audit_events WHERE action = 'SHIPMENT_CANCELLED' AND tenant_id = $1",
    [tenantA],
  )).rows;
}

async function statusOf(shipmentId: string) {
  return (await adminPool.query<{ status: string }>("SELECT status FROM shipments WHERE id = $1", [shipmentId])).rows[0]?.status;
}

async function reconcile() {
  const result = await asA((tx, context) => reconcileLedgerPeriod(tx, context, {
    outletId: outletA,
    cadence: "DAILY",
    periodStart: pullPeriod.start,
    periodEnd: pullPeriod.end,
    attemptId: randomUUID(),
  }));
  return Object.fromEntries(result.reconciliations.map(({ run }) => [run.reconciledEntryType, run.varianceIdr]));
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appUrl);
});

beforeEach(async () => {
  await adminPool.query("DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
  await adminPool.query(
    `TRUNCATE shipment_rate_limits, provider_order_status_observations, provider_order_history_events, provider_settlement_items,
      provider_settlement_pulls, ledger_entries, reconciliation_runs, provider_unpaid_recoveries, provider_order_snapshots,
      provider_batches, shipment_cod_totals, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties,
      shipment_drafts, shipments, outlets, memberships, platform_roles, tenants, users CASCADE`,
  );
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES ($1, 'Admin A', 't290-a@example.test'), ($2, 'Admin B', 't290-b@example.test'),
       ($3, 'Operator A', 't290-op@example.test'), ($4, 'Super', 't290-super@example.test')`,
    [adminA, adminB, operatorA, superAdmin],
  );
  await adminPool.query("INSERT INTO platform_roles (user_id) VALUES ($1)", [superAdmin]);
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'T290 A', 'ACTIVE'), ($2, 'T290 B', 'ACTIVE')",
    [tenantA, tenantB],
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR'), ($4, $5, 'TENANT_ADMIN')`,
    [tenantA, adminA, operatorA, tenantB, adminB],
  );
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
     VALUES ($1, $2, 'Outlet A', 'fixture-pickup', 'fixture-origin'), ($3, $4, 'Outlet B', 'fixture-pickup', 'fixture-origin')`,
    [outletA, tenantA, outletB, tenantB],
  );
}, 30_000);

afterAll(async () => {
  await adminPool.query("DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
  await Promise.all([appPool.end(), adminPool.end()]);
});

describe("T-290 reversal on the app's confirmed deletion", () => {
  it("reverses principal, shipping and COD fee in the cancel transaction, audited once, and every reader nets to zero", async () => {
    const live = await seedIssued();
    const cancelled = await seedIssued();
    expect(await appCancel(cancelled.shipmentId)).toBe("CANCELLED");

    expect(await statusOf(cancelled.shipmentId)).toBe("CANCELLED");
    await expectFullyReversed(cancelled.shipmentId);
    expect(await cancelAudits()).toEqual([
      { actor_id: adminA, target_id: cancelled.shipmentId, metadata: { courier: "JNE", fromStatus: "ISSUED" } },
    ]);
    // The live shipment next to it is untouched.
    expect((await ledgerOf(live.shipmentId)).filter((row) => row.entry_type === "ADJUSTMENT")).toEqual([]);

    // Readers count only the live parcel: 100 000 principal, 10 000 shipping + 3 785 COD fee.
    const summary = await asA((tx, context) => summarizeLedger(tx, context, { start: pullPeriod.start, end: pullPeriod.end }));
    expect(summary.codPrincipalLiabilityIdr).toBe(100000);
    expect(summary.providerCostIdr).toBe(13785);
    const platform = await withPlatformContext(appDb, superAdmin, (tx) => readPlatformTenantFinanceSummary(tx, {
      range, scope: { kind: "tenant", tenantId: tenantA }, outletId: null, courier: null, status: null, outcome: null, query: null, page: 1,
    }));
    expect(platform.ledger.codPrincipalLiabilityIdr).toBe(100000);
    expect(platform.ledger.providerCostIdr).toBe(13785);
    const recap = await asA((tx, context) => loadTenantDashboardCourierRecap(tx, context, range));
    expect(recap.rows.find((row) => row.courier === "JNE")?.shippingCostIdr).toBe(10000);

    // The reconciliation leaves the cancelled order out of the source too: every type matches.
    expect(Object.values(await reconcile()).every((variance) => variance === 0)).toBe(true);
  });

  it("appends nothing and audits nothing more on a second CANCELLED decision", async () => {
    const shipment = await seedIssued();
    await appCancel(shipment.shipmentId);
    const before = await ledgerOf(shipment.shipmentId);
    expect(await appCancel(shipment.shipmentId)).toBe("ALREADY_CANCELLED");
    await pull([{ cnoteNo: shipment.cnoteNo, status: "CANCELED" }]);
    expect(await ledgerOf(shipment.shipmentId)).toEqual(before);
    expect(await cancelAudits()).toHaveLength(1);
    expect(await asA((tx, context) => appendLedgerReversalsForCancelledShipments(tx, context, [shipment.shipmentId]))).toBe(0);
  });

  it("keeps an earlier manual reversal and reverses only the rest", async () => {
    const shipment = await seedIssued();
    const shipping = (await ledgerOf(shipment.shipmentId)).find((row) => row.entry_type === "MENGANTAR_SHIPPING_COST")!;
    const manualId = randomUUID();
    await asA((tx, context) => appendLedgerAdjustment(tx, context, shipping.id, manualId));
    await appCancel(shipment.shipmentId);
    await expectFullyReversed(shipment.shipmentId, [manualId]);
  });
});

describe("T-290 reversal on a status pull", () => {
  it("reverses a pull-applied CANCELLED (reported and inferred) once, and a delivered shipment in the same pull not at all", async () => {
    const reported = await seedIssued();
    const inferred = await seedIssued();
    const delivered = await seedIssued();
    const result = await pull([
      { cnoteNo: reported.cnoteNo, status: "CANCELED" },
      { cnoteNo: inferred.cnoteNo, status: "PENDING PICKUP", deletedBeforePickup: true },
      { cnoteNo: delivered.cnoteNo, status: "DELIVERED" },
    ]);
    expect(result.appliedTransitionCount).toBe(3);
    await expectFullyReversed(reported.shipmentId);
    await expectFullyReversed(inferred.shipmentId);
    expect((await ledgerOf(delivered.shipmentId)).filter((row) => row.entry_type === "ADJUSTMENT")).toEqual([]);

    const before = await adminPool.query("SELECT count(*)::int AS n FROM ledger_entries WHERE tenant_id = $1", [tenantA]);
    await pull([{ cnoteNo: reported.cnoteNo, status: "CANCELED" }, { cnoteNo: inferred.cnoteNo, status: "CANCELED" }]);
    expect((await adminPool.query("SELECT count(*)::int AS n FROM ledger_entries WHERE tenant_id = $1", [tenantA])).rows[0])
      .toEqual(before.rows[0]);
  });

  it("catches up a webhook cancel (no ledger of its own) on the next pull; the reconciliation shows it until then", async () => {
    const shipment = await seedIssued();
    // As record_mengantar_webhook_event applies it: status only, one APPLIED WEBHOOK observation.
    await adminPool.query("UPDATE shipments SET status = 'CANCELLED' WHERE id = $1", [shipment.shipmentId]);
    await adminPool.query(
      `INSERT INTO provider_order_status_observations (tenant_id, shipment_id, outlet_id, cnote_no, provider_status, source, provider_event_at, from_status, mapped_status, transition_outcome)
       VALUES ($1, $2, $3, $4, 'CANCELED', 'WEBHOOK', now(), 'ISSUED', 'CANCELLED', 'APPLIED')`,
      [tenantA, shipment.shipmentId, outletA, shipment.cnoteNo],
    );
    expect((await reconcile()).MENGANTAR_SHIPPING_COST).toBe(-10000);
    await pull([{ cnoteNo: shipment.cnoteNo, status: "CANCELED" }]);
    await expectFullyReversed(shipment.shipmentId);
    expect(Object.values(await reconcile()).every((variance) => variance === 0)).toBe(true);
  });

  it("audits the app's deletion once when a pull recorded CANCELLED first, without a second reversal (round 3 a)", async () => {
    const shipment = await seedIssued();
    await pull([{ cnoteNo: shipment.cnoteNo, status: "PENDING PICKUP", deletedBeforePickup: true }]);
    const afterPull = await ledgerOf(shipment.shipmentId);
    expect(await appCancel(shipment.shipmentId)).toBe("ALREADY_CANCELLED");
    expect(await cancelAudits()).toEqual([
      { actor_id: adminA, target_id: shipment.shipmentId, metadata: { courier: "JNE", fromStatus: "ISSUED" } },
    ]);
    expect(await ledgerOf(shipment.shipmentId)).toEqual(afterPull);
  });
});

describe("T-290 scope of the reversal", () => {
  it("does not reverse a cancelled prepaid (non-COD) order: its wallet charge stays booked and the reconciliation still matches (review)", async () => {
    const prepaid = await seedIssued("a", false);
    const booked = await ledgerOf(prepaid.shipmentId);
    expect(booked.some((row) => row.entry_type === "MENGANTAR_SHIPPING_COST")).toBe(true);
    expect(await appCancel(prepaid.shipmentId)).toBe("CANCELLED");
    expect(await ledgerOf(prepaid.shipmentId)).toEqual(booked);
    expect(Object.values(await reconcile()).every((variance) => variance === 0)).toBe(true);
  });

  it("never touches another tenant's ledger and refuses an Operator", async () => {
    const own = await seedIssued("a");
    const other = await seedIssued("b");
    await adminPool.query("UPDATE shipments SET status = 'CANCELLED' WHERE id = $1", [other.shipmentId]);
    const otherBefore = await ledgerOf(other.shipmentId);

    // Tenant A naming B's cancelled shipment appends nothing; A's own cancel leaves B alone.
    expect(await asA((tx, context) => appendLedgerReversalsForCancelledShipments(tx, context, [other.shipmentId]))).toBe(0);
    await appCancel(own.shipmentId);
    expect(await ledgerOf(other.shipmentId)).toEqual(otherBefore);
    // A live shipment of the context tenant is not reversed either.
    const live = await seedIssued("a");
    expect(await asA((tx, context) => appendLedgerReversalsForCancelledShipments(tx, context, [live.shipmentId]))).toBe(0);

    await expect(withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      appendLedgerReversalsForCancelledShipments(tx, context, [own.shipmentId]))).rejects.toBeInstanceOf(LedgerDeniedError);
  });
});

describe("T-290 latest provider status after a refused inferred cancel (round 3 c)", () => {
  it("keeps the newer real status as latest on the cancel rules, Pencairan review and owner money", async () => {
    const shipment = await seedIssued();
    await pull([{ cnoteNo: shipment.cnoteNo, status: "PICKED UP" }]);
    expect(await statusOf(shipment.shipmentId)).toBe("IN_TRANSIT");
    // The deleted record's stale status, refused because the parcel is past pickup.
    await pull([{ cnoteNo: shipment.cnoteNo, status: "PENDING PICKUP", deletedBeforePickup: true }]);
    const stored = await adminPool.query(
      "SELECT provider_status, transition_outcome FROM provider_order_status_observations WHERE shipment_id = $1 ORDER BY observed_at, id",
      [shipment.shipmentId],
    );
    expect(stored.rows).toEqual([
      { provider_status: "PICKED UP", transition_outcome: "APPLIED" },
      { provider_status: "PENDING PICKUP", transition_outcome: "REFUSED" },
    ]);
    expect(await statusOf(shipment.shipmentId)).toBe("IN_TRANSIT");

    const target = await asA((tx, context) => loadShipmentCancelTarget(tx, context, shipment.shipmentId));
    expect(target?.latestProviderStatus).toBe("PICKED UP");
    const review = await asA((tx, context) => listProviderSettlementReview(tx, context));
    expect(review.rows.find((row) => row.cnoteNo === shipment.cnoteNo)?.latestProviderStatus).toBe("PICKED UP");
    const money = await asA((tx, context) => loadOwnerMoney(tx, context, range));
    expect(money.rows.find((row) => row.cnoteNo === shipment.cnoteNo)?.latestProviderStatus).toBe("PICKED UP");
    // No ledger write for a refused decision.
    expect((await ledgerOf(shipment.shipmentId)).filter((row) => row.entry_type === "ADJUSTMENT")).toEqual([]);
  });

  it("still shows a provider value that itself says CANCELED as latest, even when refused", async () => {
    const shipment = await seedIssued();
    await pull([{ cnoteNo: shipment.cnoteNo, status: "DELIVERED" }]);
    await pull([{ cnoteNo: shipment.cnoteNo, status: "CANCELED" }]);
    const target = await asA((tx, context) => loadShipmentCancelTarget(tx, context, shipment.shipmentId));
    expect(target?.latestProviderStatus).toBe("CANCELED");
    expect(await statusOf(shipment.shipmentId)).toBe("DELIVERED");
  });
});
