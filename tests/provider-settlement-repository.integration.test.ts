import { readFileSync } from "node:fs";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { completeProviderOrder } from "@/db/order-batch-repository";
import {
  claimProviderSettlementPull,
  classifyProviderSettlement,
  listProviderSettlementReview,
  ProviderSettlementDeniedError,
  ProviderSettlementThrottledError,
  recordProviderSettlementPull,
} from "@/db/provider-settlement-repository";
import {
  loadOwnerMoney,
  OwnerMoneyDeniedError,
  ownerMarginUnits,
  ownerPayoutState,
  summarizeOwnerMoney,
  type OwnerMoneyRow,
} from "@/db/owner-money-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import {
  normalizeMengantarInvoicePage,
  normalizeMengantarOrderPage,
  type ProviderSettlementSnapshot,
} from "@/lib/mengantar-settlement";
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

const tenantA = "00000000-0000-0000-0000-000000004601";
const tenantB = "00000000-0000-0000-0000-000000004602";
const outletA = "00000000-0000-0000-0000-000000004611";
const outletB = "00000000-0000-0000-0000-000000004612";
const adminA = "settlement-admin-a";
const operatorA = "settlement-operator-a";
const adminB = "settlement-admin-b";
const platformKey = "a".repeat(64);
const privateKey = "b".repeat(64);
const period = { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-10-01T00:00:00Z") };

const invoices = JSON.parse(readFileSync("tests/fixtures/mengantar-invoices.sanitized.json", "utf8"));
const orders = JSON.parse(readFileSync("tests/fixtures/mengantar-orders.sanitized.json", "utf8"));

function fixtureSnapshot(): ProviderSettlementSnapshot {
  const settlement = normalizeMengantarInvoicePage(invoices.reconciliation, "SETTLEMENT");
  const payment = normalizeMengantarInvoicePage(invoices.payment, "CHARGE");
  const refund = normalizeMengantarInvoicePage(invoices.refund, "REFUND");
  return {
    invoiceCount: 5,
    orderCount: 5,
    items: [...settlement.items, ...payment.items],
    refunds: refund.refunds,
    orderStatuses: normalizeMengantarOrderPage(orders.list).orders,
  };
}

let sequence = 0;
async function seedIssuedCodOrder(tenantId: string, outletId: string, cnoteNo: string, accountKey = platformKey, insuranceAmountIdr: number | null = null) {
  sequence += 1;
  const suffix = String(sequence).padStart(12, "0");
  const ids = {
    shipmentId: `00000000-0000-0000-0046-${suffix}`,
    snapshotId: `00000000-0000-0000-0047-${suffix}`,
    serviceId: `00000000-0000-0000-0048-${suffix}`,
    batchId: `00000000-0000-0000-0049-${suffix}`,
    orderId: `00000000-0000-0000-0050-${suffix}`,
  };
  await adminPool.query("INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, 'SUBMISSION_QUEUED')", [ids.shipmentId, tenantId, outletId]);
  await adminPool.query(
    `INSERT INTO shipment_drafts (shipment_id, tenant_id, destination_area_id, destination_area_label, package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod)
     VALUES ($1, $2, 'fixture-area', 'Fixture area', 'Sanitized parcel', 1000, 1, 100000, true)`,
    [ids.shipmentId, tenantId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id, destination_area_label, weight_grams, is_cod_requested, credential_source)
     VALUES ($1, $2, $3, $4, 'fixture-origin', 'fixture-area', 'Fixture area', 1000, true, 'platform_default')`,
    [ids.snapshotId, tenantId, ids.shipmentId, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr, insurance_amount_idr, shipping_source_field, insurance_source_field, delivery_estimate, cod_eligible)
     VALUES ($1, $2, $3, 'JNE REG', 'IDR', 10000, $4, 'price', $5, 'fixture', true)`,
    [ids.serviceId, tenantId, ids.snapshotId, insuranceAmountIdr, insuranceAmountIdr === null ? null : "insurance_fee"],
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
    `INSERT INTO provider_order_snapshots (id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id, position, provider_service, destination_area_id, destination_area_label, currency, shipping_amount_idr, insurance_amount_idr, is_cod, provider_cod_amount_idr)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG', 'fixture-area', 'Fixture area', 'IDR', 10000, $7, true, 113663)`,
    [ids.orderId, tenantId, ids.batchId, ids.shipmentId, ids.snapshotId, ids.serviceId, insuranceAmountIdr],
  );
  const user = tenantId === tenantA ? adminA : adminB;
  await withTenantContext(appDb, user, tenantId, (tx, context) =>
    completeProviderOrder(tx, context, ids.batchId, { shipmentId: ids.shipmentId, providerOrderId: `provider-${ids.orderId}`, isPaid: true, cnoteNo }));
  return ids.shipmentId;
}

const asAdminA = <T>(work: Parameters<typeof withTenantContext<T>>[3]) => withTenantContext(appDb, adminA, tenantA, work);

function record(snapshot = fixtureSnapshot(), overrides: Partial<{ credentialSource: "private" | "platform_default"; providerAccountKey: string }> = {}) {
  return asAdminA((tx, context) => recordProviderSettlementPull(tx, context, {
    outletId: outletA,
    credentialSource: "platform_default",
    providerAccountKey: platformKey,
    period,
    snapshot,
    ...overrides,
  }));
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await adminPool.query(
    `TRUNCATE shipment_rate_limits, provider_order_status_observations, provider_settlement_items, provider_settlement_pulls,
      ledger_entries, reconciliation_runs, provider_unpaid_recoveries, provider_order_snapshots, provider_batches,
      shipment_cod_totals, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties,
      shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE`,
  );
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES ($1, 'Admin A', 'settle-a@example.test'), ($2, 'Operator A', 'settle-op@example.test'), ($3, 'Admin B', 'settle-b@example.test')`,
    [adminA, operatorA, adminB],
  );
  await adminPool.query("INSERT INTO tenants (id, name, status) VALUES ($1, 'Settlement A', 'ACTIVE'), ($2, 'Settlement B', 'ACTIVE')", [tenantA, tenantB]);
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR'), ($4, $5, 'TENANT_ADMIN')",
    [tenantA, adminA, operatorA, tenantB, adminB],
  );
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
     VALUES ($1, $2, 'Outlet A', 'fixture-pickup', 'fixture-origin'), ($3, $4, 'Outlet B', 'fixture-pickup-b', 'fixture-origin-b')`,
    [outletA, tenantA, outletB, tenantB],
  );
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("provider settlement reconciliation", () => {
  it("classifies each tenant AWB against the ledger expectation from provider evidence", async () => {
    const matched = await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0001");
    const mismatch = await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0002");
    const returned = await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0003");
    const refunded = await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0004");
    const deliveredUnpaid = await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0005");
    const undelivered = await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0006");

    const result = await record();
    // Shared platform account: account-wide totals are withheld, only this tenant's matches are counted.
    expect(result).toMatchObject({ invoiceCount: null, orderCount: null, matchedItemCount: 4, newItemCount: 4, matchedStatusCount: 3, unmatchedAwbCount: null });

    const review = await asAdminA((tx, context) => listProviderSettlementReview(tx, context));
    const byShipment = new Map(review.rows.map((row) => [row.shipmentId, row]));
    // Ledger expectation: provider COD amount 113663 − ledger shipping cost 10000 − Mengantar's fee 113663 × 0.0333 = 3784.9779.
    expect(byShipment.get(matched)).toMatchObject({ settledIdr: 99878.0221, expectedPayoutIdr: 99878.0221, varianceIdr: 0, providerShippingIdr: 13784.9779, settlementClass: "MATCHED" });
    expect(byShipment.get(mismatch)).toMatchObject({ settledIdr: 97878.0221, varianceIdr: -2000, providerShippingIdr: 15784.9779, settlementClass: "AMOUNT_MISMATCH" });
    expect(byShipment.get(returned)).toMatchObject({ chargeIdr: -9000, latestProviderStatus: "RTS", settledIdr: null, settlementClass: "RETURN_CHARGE" });
    expect(byShipment.get(refunded)).toMatchObject({ refundIdr: -40000, settlementClass: "REFUND" });
    expect(byShipment.get(deliveredUnpaid)).toMatchObject({ latestProviderStatus: "DELIVERED", settledIdr: null, settlementClass: "DELIVERED_UNPAID" });
    expect(byShipment.get(undelivered)).toMatchObject({ latestProviderStatus: "UNDELIVERED", settlementClass: "IN_PROGRESS" });
    expect(review.latestPull).toMatchObject({ invoiceCount: null, orderCount: null, matchedItemCount: 4, matchedStatusCount: 3, unmatchedAwbCount: null, outletName: "Outlet A" });
  });

  it("re-pulling the same invoices adds no settlement and does not double the payout", async () => {
    const shipment = await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0001");
    await record();
    await adminPool.query("UPDATE provider_settlement_pulls SET created_at = created_at - interval '2 minutes'");
    const second = await record();
    expect(second).toMatchObject({ matchedItemCount: 1, newItemCount: 0 });
    const review = await asAdminA((tx, context) => listProviderSettlementReview(tx, context));
    expect(review.rows.find((row) => row.shipmentId === shipment)).toMatchObject({ settledIdr: 99878.0221, varianceIdr: 0 });
    const { rows } = await adminPool.query("SELECT count(*)::int AS n, max(amount_idr)::text AS amount FROM provider_settlement_items");
    expect(rows[0]).toEqual({ n: 1, amount: "99878.0221" });
  });

  it("matches only AWBs issued through the same Mengantar account", async () => {
    const otherAccount = await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0001", privateKey);
    const result = await record();
    expect(result.matchedItemCount).toBe(0);
    const review = await asAdminA((tx, context) => listProviderSettlementReview(tx, context));
    expect(review.rows.some((row) => row.shipmentId === otherAccount)).toBe(false);

    // A private account may report its own unmatched AWBs; the shared platform account never does.
    const privatePull = await asAdminA((tx, context) => recordProviderSettlementPull(tx, context, {
      outletId: outletA, credentialSource: "private", providerAccountKey: privateKey, period, snapshot: fixtureSnapshot(),
    }));
    expect(privatePull).toMatchObject({ matchedItemCount: 1, invoiceCount: 5, orderCount: 5 });
    // Provider AWBs: 0001, 0002, EXTERNAL-0009, 0003, 0005, 0006 → five are not ours.
    expect(privatePull.unmatchedAwbCount).toBe(5);
    await expect(adminPool.query(
      `INSERT INTO provider_settlement_pulls (tenant_id, outlet_id, actor_user_id, credential_source, provider_account_key, period_start, period_end, invoice_count, order_count, matched_item_count, matched_status_count, unmatched_awb_count)
       VALUES ($1, $2, $3, 'platform_default', $4, now(), now() + interval '1 day', NULL, NULL, 0, 0, 3)`,
      [tenantA, outletA, adminA, platformKey],
    )).rejects.toThrow(/provider_settlement_pulls_shared_account_count_hidden/);
    await expect(adminPool.query(
      `INSERT INTO provider_settlement_pulls (tenant_id, outlet_id, actor_user_id, credential_source, provider_account_key, period_start, period_end, invoice_count, order_count, matched_item_count, matched_status_count, unmatched_awb_count)
       VALUES ($1, $2, $3, 'platform_default', $4, now(), now() + interval '1 day', 12, NULL, 0, 0, NULL)`,
      [tenantA, outletA, adminA, platformKey],
    )).rejects.toThrow(/provider_settlement_pulls_shared_account_count_hidden/);
  });

  it("does not attribute a refund whose description names several of our AWBs", async () => {
    await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0004");
    await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0005");
    const snapshot = fixtureSnapshot();
    snapshot.items = [];
    snapshot.orderStatuses = [];
    snapshot.refunds = [{ ...snapshot.refunds[0], referenceTokens: ["SANITIZED-CNOTE-0004", "SANITIZED-CNOTE-0005"] }];
    expect((await record(snapshot)).matchedItemCount).toBe(0);
  });

  it("keeps settlement evidence inside the tenant and away from operators", async () => {
    await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0001");
    await record();

    const tenantBView = await withTenantContext(appDb, adminB, tenantB, (tx, context) => listProviderSettlementReview(tx, context));
    expect(tenantBView).toMatchObject({ rows: [], latestPull: null });
    const directB = await withTenantContext(appDb, adminB, tenantB, (tx) => tx.select().from(schema.providerSettlementItems));
    expect(directB).toEqual([]);

    await expect(withTenantContext(appDb, operatorA, tenantA, (tx, context) => listProviderSettlementReview(tx, context)))
      .rejects.toThrow(ProviderSettlementDeniedError);
    // Row-level security holds even if the repository role check were bypassed.
    const operatorRows = await withTenantContext(appDb, operatorA, tenantA, (tx) => tx.select().from(schema.providerSettlementPulls));
    expect(operatorRows).toEqual([]);
    const operatorInsert = await withTenantContext(appDb, operatorA, tenantA, (tx, context) => tx.insert(schema.providerSettlementPulls).values({
      tenantId: context.tenantId, outletId: outletA, actorUserId: operatorA, credentialSource: "platform_default",
      providerAccountKey: platformKey, periodStart: period.start, periodEnd: period.end,
      matchedItemCount: 0, matchedStatusCount: 0,
    })).catch((error: unknown) => error);
    expect(String((operatorInsert as { cause?: unknown })?.cause ?? operatorInsert)).toMatch(/row-level security policy/);
    const adminUpdate = await withTenantContext(appDb, adminA, tenantA, (tx) => tx.update(schema.providerSettlementItems).set({ amountIdr: "1" }))
      .catch((error: unknown) => error);
    expect(String((adminUpdate as { cause?: unknown })?.cause ?? adminUpdate)).toMatch(/permission denied/);
  });

  it("T-223: stores lastHistory desc/time and pod_code on the status observation, NULL when unreadable", async () => {
    const delivered = await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0005");
    const returned = await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0003");
    const contract = JSON.parse(readFileSync("tests/fixtures/mengantar-order-contract.shape.json", "utf8"));
    const list = structuredClone(orders.list);
    list.data[0].lastHistory = contract.fields.lastHistory.shape;
    list.data[0].pod_code = contract.fields.pod_code.shape;
    list.data[1].lastHistory = { date: "not-a-date" };
    const snapshot = { ...fixtureSnapshot(), orderStatuses: normalizeMengantarOrderPage(list).orders };

    await record(snapshot);
    const { rows } = await adminPool.query(
      `SELECT shipment_id, last_history_desc, last_history_at, pod_code
         FROM provider_order_status_observations ORDER BY provider_status`,
    );
    expect(rows).toEqual([
      {
        shipment_id: delivered,
        last_history_desc: contract.fields.lastHistory.shape.desc,
        last_history_at: new Date("2026-09-05T09:16:00.000Z"),
        pod_code: "D02",
      },
      { shipment_id: returned, last_history_desc: null, last_history_at: null, pod_code: null },
    ]);
  });

  it("stores no receiver, goods or pickup columns", async () => {
    const { rows } = await adminPool.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_name IN ('provider_settlement_pulls', 'provider_settlement_items', 'provider_order_status_observations')
         AND column_name ~* '(receiver|recipient|phone|address|goods|pickup|name|email)'`,
    );
    expect(rows).toEqual([]);
  });

  it("claims the pull slot before provider I/O so a failed or parallel pull still throttles", async () => {
    const now = Date.now();
    // No pull row is recorded here: the claim alone must block the next attempt.
    await asAdminA((tx, context) => claimProviderSettlementPull(tx, context, outletA, now));
    await expect(asAdminA((tx, context) => claimProviderSettlementPull(tx, context, outletA, now + 1_000)))
      .rejects.toThrow(ProviderSettlementThrottledError);
    const parallel = await Promise.allSettled([1, 2, 3].map((offset) =>
      asAdminA((tx, context) => claimProviderSettlementPull(tx, context, outletA, now + 61_000 + offset))));
    expect(parallel.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    await expect(asAdminA((tx, context) => claimProviderSettlementPull(tx, context, outletB, now + 200_000)))
      .rejects.toThrow(ProviderSettlementDeniedError);
    const { rows } = await adminPool.query("SELECT count(*)::int AS n FROM provider_settlement_pulls");
    expect(rows[0].n).toBe(0);
  });

  it("lets a later cleared observation of the same invoice line supersede a pending one", async () => {
    const shipment = await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0001");
    const pending = fixtureSnapshot();
    pending.items = pending.items.filter((item) => item.cnoteNo === "SANITIZED-CNOTE-0001").map((item) => ({ ...item, invoiceStatus: "statusPending" }));
    pending.refunds = [];
    pending.orderStatuses = [{ cnoteNo: "SANITIZED-CNOTE-0001", status: "DELIVERED" }];
    await record(pending);
    let review = await asAdminA((tx, context) => listProviderSettlementReview(tx, context));
    expect(review.rows.find((row) => row.shipmentId === shipment)).toMatchObject({ settledIdr: null, settlementClass: "DELIVERED_UNPAID" });

    const cleared = { ...pending, items: pending.items.map((item) => ({ ...item, invoiceStatus: "statusCleared" })) };
    expect(await record(cleared)).toMatchObject({ newItemCount: 1 });
    review = await asAdminA((tx, context) => listProviderSettlementReview(tx, context));
    expect(review.rows.find((row) => row.shipmentId === shipment)).toMatchObject({ settledIdr: 99878.0221, varianceIdr: 0, settlementClass: "MATCHED" });
  });

  it("reads the latest cleared amount per invoice line, ignores uncleared charges and excludes insurance from the expectation", async () => {
    const shipment = await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0001", platformKey, 500);
    const base = fixtureSnapshot();
    const settlement = base.items.find((item) => item.cnoteNo === "SANITIZED-CNOTE-0001")!;
    const first = { ...base, refunds: [], orderStatuses: [], items: [
      settlement,
      { ...settlement, itemType: "CHARGE" as const, providerInvoiceId: "SANITIZEDCHARGE01", invoiceNumber: "SANITIZED-INV-C1", invoiceStatus: "statusExpired", amountIdr: "-9000.0000", codAmountIdr: 0, shippingAmountIdr: "9000.0000" },
    ] };
    await record(first);
    // Same cleared invoice line later corrected by the provider: the correction supersedes, never adds.
    await record({ ...first, items: [{ ...settlement, amountIdr: "99000.0000", shippingAmountIdr: "14663.0000" }] });
    const review = await asAdminA((tx, context) => listProviderSettlementReview(tx, context));
    // Expected payout stays 113663 − shipping 10000 − fee 3784.9779 even though ledger also holds 500 insurance.
    expect(review.rows.find((row) => row.shipmentId === shipment)).toMatchObject({
      settledIdr: 99000, expectedPayoutIdr: 99878.0221, varianceIdr: -878.0221, chargeIdr: 0, settlementClass: "AMOUNT_MISMATCH",
    });
  });

  it("never treats UNDELIVERED as delivered or a settled AWB with a later claim as matched", () => {
    expect(classifyProviderSettlement({ isCod: true, settledIdr: 103663, varianceIdr: 0, chargeIdr: 0, refundIdr: -40000, latestProviderStatus: "DELIVERED" })).toBe("REFUND");
    expect(classifyProviderSettlement({ isCod: true, settledIdr: 103663, varianceIdr: 0, chargeIdr: -9000, refundIdr: 0, latestProviderStatus: "RTS" })).toBe("RETURN_CHARGE");
    expect(classifyProviderSettlement({ isCod: true, settledIdr: 103663, varianceIdr: -1, chargeIdr: -9000, refundIdr: 0, latestProviderStatus: "RTS" })).toBe("AMOUNT_MISMATCH");
    // T-178: half a sen is the precision the settlement identities were proven to; past it, even by a sen, is a mismatch.
    const settled = { isCod: true, settledIdr: 99878.0221, chargeIdr: 0, refundIdr: 0, latestProviderStatus: "DELIVERED" };
    expect(classifyProviderSettlement({ ...settled, varianceIdr: 0.005 })).toBe("MATCHED");
    expect(classifyProviderSettlement({ ...settled, varianceIdr: -0.005 })).toBe("MATCHED");
    expect(classifyProviderSettlement({ ...settled, varianceIdr: -0.0051 })).toBe("AMOUNT_MISMATCH");
    expect(classifyProviderSettlement({ ...settled, varianceIdr: -0.01 })).toBe("AMOUNT_MISMATCH");
    expect(classifyProviderSettlement({ ...settled, varianceIdr: null })).toBe("AMOUNT_MISMATCH");
    const base = { isCod: true, settledIdr: null, varianceIdr: null, chargeIdr: 0, refundIdr: 0 };
    expect(classifyProviderSettlement({ ...base, latestProviderStatus: "UNDELIVERED" })).toBe("IN_PROGRESS");
    expect(classifyProviderSettlement({ ...base, latestProviderStatus: "DELIVERED" })).toBe("DELIVERED_UNPAID");
    expect(classifyProviderSettlement({ ...base, isCod: false, latestProviderStatus: "DELIVERED" })).toBe("IN_PROGRESS");
  });
});

describe("T-275 owner money from Mengantar's own invoices (D-41)", () => {
  const wide = { startInclusive: new Date("2020-01-01T00:00:00Z"), endExclusive: new Date("2100-01-01T00:00:00Z") };

  it("proves the margin from the sanitized live invoices and estimates the rest", async () => {
    const ids = {
      matched: await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0001"),
      mismatch: await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0002"),
      returned: await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0003"),
      refunded: await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0004"),
      deliveredUnpaid: await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0005"),
      undelivered: await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0006"),
    };
    await record();
    const money = await asAdminA((tx, context) => loadOwnerMoney(tx, context, wide));
    const row = (id: string) => money.rows.find((candidate) => candidate.shipmentId === id)!;
    const margin = (id: string) => ownerMarginUnits(row(id));

    // Paid out: Mengantar's subItem 99 878.0221 (COD 113 663 − estimatedSpecialPrice 13 784.9779)
    // less Nilai barang 100 000. The fixture's COD is a formula-version-1 amount, which left the
    // seller short — the margin shows it, to the ten-thousandth.
    expect(margin(ids.matched)).toEqual({ basis: "PROVEN", units: BigInt(-1_219_779) });
    expect(ownerPayoutState(row(ids.matched))).toBe("SUDAH_CAIR");
    expect(margin(ids.mismatch)).toEqual({ basis: "PROVEN", units: BigInt(-21_219_779) });
    expect(ownerPayoutState(row(ids.mismatch))).toBe("PERLU_DICEK");
    // "Payment for returned order": the cleared −9 000 is the whole margin; the goods came back.
    expect(margin(ids.returned)).toEqual({ basis: "PROVEN", units: BigInt(-90_000_000) });
    expect(ownerPayoutState(row(ids.returned))).toBe("RETUR");
    // A claim refund is never margin; the resi is flagged and its margin stays the estimate.
    expect(ownerPayoutState(row(ids.refunded))).toBe("PERLU_DICEK");
    // Estimate: 113 663 − 10 000 − round(113 663 × 0.0333) 3 785 − 100 000 = −122.
    for (const id of [ids.refunded, ids.deliveredUnpaid, ids.undelivered]) {
      expect(margin(id)).toEqual({ basis: "ESTIMATE", units: BigInt(-1_220_000) });
    }
    expect(ownerPayoutState(row(ids.deliveredUnpaid))).toBe("BELUM_CAIR");
    expect(ownerPayoutState(row(ids.undelivered))).toBe("BELUM_CAIR");
    // T-287: the payout wait starts when Mengantar delivered it; an undelivered resi has none.
    expect(row(ids.deliveredUnpaid).deliveredAt).toBeInstanceOf(Date);
    expect(row(ids.undelivered).deliveredAt).toBeNull();
    // Mengantar's own history time wins over when a (late) pull recorded it, and the earliest
    // DELIVERED report counts — a later re-observation does not reset the wait.
    await record(); // a second pull re-observes the same DELIVERED resi later
    const observed = (await adminPool.query<{ id: string }>(
      `SELECT id FROM provider_order_status_observations WHERE shipment_id = $1 AND mapped_status = 'DELIVERED' ORDER BY observed_at`,
      [ids.deliveredUnpaid])).rows;
    expect(observed).toHaveLength(2);
    await adminPool.query("UPDATE provider_order_status_observations SET last_history_at = '2026-09-01T03:00:00Z' WHERE id = $1", [observed[0]!.id]);
    await adminPool.query("UPDATE provider_order_status_observations SET last_history_at = '2026-09-05T03:00:00Z' WHERE id = $1", [observed[1]!.id]);
    const again = await asAdminA((tx, context) => loadOwnerMoney(tx, context, wide));
    expect(again.rows.find((candidate) => candidate.shipmentId === ids.deliveredUnpaid)!.deliveredAt).toEqual(new Date("2026-09-01T03:00:00Z"));
    expect(again.rows).toHaveLength(money.rows.length);

    expect(summarizeOwnerMoney(money.rows)).toEqual({
      byCourier: [{ count: 6, courier: "JNE", marginIdr: -11_610, provenIdr: -11_244 }],
      margin: { estimateCount: 3, idr: -11_610, provenCount: 3, provenIdr: -11_244, unknownCount: 0 },
      needsReviewCount: 2,
      returned: { count: 1 },
      // Mengantar's invoice total 197 756.0442, rounded once.
      settled: { count: 2, payoutIdr: 197_756 },
      unsettled: { codIdr: 227_326, count: 2, estimatedPayoutIdr: 199_756 },
    });
    expect(money.lastPullAt).toBeInstanceOf(Date);
    expect(money.truncated).toBe(false);
  });

  it("is the Tenant Admin's own: an Operator is refused and another tenant sees nothing", async () => {
    await seedIssuedCodOrder(tenantA, outletA, "SANITIZED-CNOTE-0001");
    await record();
    await expect(withTenantContext(appDb, operatorA, tenantA, (tx, context) => loadOwnerMoney(tx, context, wide)))
      .rejects.toThrow(OwnerMoneyDeniedError);
    const other = await withTenantContext(appDb, adminB, tenantB, (tx, context) => loadOwnerMoney(tx, context, wide));
    expect(other).toMatchObject({ lastPullAt: null, rows: [] });
    const outside = await asAdminA((tx, context) => loadOwnerMoney(tx, context, {
      startInclusive: new Date("2020-01-01T00:00:00Z"), endExclusive: new Date("2020-01-02T00:00:00Z"),
    }));
    expect(outside.rows).toEqual([]);
  });

  it("keeps each payment method's own margin rule", () => {
    const base: OwnerMoneyRow = {
      chargeUnits: BigInt(0), chargedShippingIdr: 24_375, cnoteNo: "X", collectIdr: 369_815, courier: "JNE",
      estimatedPayoutIdr: 333_125, expectedUnits: null, goodsValueIdr: 325_000, deliveredAt: null, issuedAt: new Date(), latestProviderStatus: null,
      outletName: "O", paymentMethod: "COD", publicReference: "GC-10177", refundUnits: BigInt(0), settledUnits: null,
      shipmentId: "s", shippingAmountIdr: 32_500, status: "ISSUED",
    };
    // GC-10177 (dev): Ongkir ditagih 32 500 against 24 375 deducted — the courier discount is the margin.
    expect(ownerMarginUnits(base)).toEqual({ basis: "ESTIMATE", units: BigInt(81_250_000) });
    // COD Ongkir GC-10178: the whole Estimasi cair is margin (no goods in the charge).
    expect(ownerMarginUnits({ ...base, collectIdr: 7_000, estimatedPayoutIdr: 467, goodsValueIdr: 0, paymentMethod: "COD_ONGKIR" }))
      .toEqual({ basis: "ESTIMATE", units: BigInt(4_670_000) });
    // Non-COD: the quote price on the invoice minus the shipping Mengantar deducts; never "proven".
    const nonCod = { ...base, collectIdr: null, estimatedPayoutIdr: null, goodsValueIdr: null, paymentMethod: "NON_COD" as const, shippingAmountIdr: 10_000, chargedShippingIdr: 7_500 };
    expect(ownerMarginUnits(nonCod)).toEqual({ basis: "ESTIMATE", units: BigInt(25_000_000) });
    expect(ownerPayoutState(nonCod)).toBeNull();
    // A returned COD before Mengantar bills it: minus the shipping it deducts.
    expect(ownerMarginUnits({ ...base, status: "RTS_QUEUED" })).toEqual({ basis: "ESTIMATE", units: BigInt(-243_750_000) });
    expect(ownerPayoutState({ ...base, status: "RTS_QUEUED" })).toBe("RETUR");
    // A legacy COD row without a stored goods value cannot be split: unknown, not zero.
    expect(ownerMarginUnits({ ...base, goodsValueIdr: null })).toBeNull();
    // Paid out, then billed again: still needs a look.
    const billedAfter = { ...base, chargeUnits: BigInt(-90_000_000), expectedUnits: BigInt(3_331_250_000), settledUnits: BigInt(3_331_250_000) };
    expect(ownerPayoutState(billedAfter)).toBe("PERLU_DICEK");
    // …and the later charge comes off the proven margin: 333 125 − 9 000 − 325 000.
    expect(ownerMarginUnits(billedAfter)).toEqual({ basis: "PROVEN", units: BigInt(-8_750_000) });
  });
});
