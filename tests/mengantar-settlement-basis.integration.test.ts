import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  deriveDraftProviderMoneyLines,
  type ProviderMoneyFacts,
} from "@/lib/shipment-draft-logic";
import { claimProviderBatch, completeProviderOrder, prepareProviderBatches } from "@/db/order-batch-repository";
import { calculateCodAmounts } from "@/db/cod-totals-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import {
  classifyProviderSettlement,
  listProviderSettlementReview,
  recordProviderSettlementPull,
} from "@/db/provider-settlement-repository";
import { normalizeMengantarInvoicePage, type ProviderSettlementSnapshot } from "@/lib/mengantar-settlement";
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

const tenantA = "00000000-0000-0000-0000-000000004701";
const outletA = "00000000-0000-0000-0000-000000004711";
const adminA = "settlement-basis-admin-a";
const platformKey = "c".repeat(64);
const period = { start: new Date("2026-09-16T00:00:00Z"), end: new Date("2026-10-01T00:00:00Z") };

const asAdminA = <T>(work: Parameters<typeof withTenantContext<T>>[3]) =>
  withTenantContext(appDb, adminA, tenantA, work);

let sequence = 0;

/**
 * Seeds one issued COD shipment through the real production path —
 * `prepareProviderBatches` (which computes `provider_charged_shipping_idr`
 * from `COALESCE(special, normal, price)`, the same chain
 * `deriveDraftProviderMoneyLines` uses) and `completeProviderOrder` (which
 * triggers `appendLedgerForIssuedProviderOrder`) — rather than hand-inserting
 * the order snapshot, so a regression in either the COALESCE or the ledger
 * write is caught by these tests, not just asserted around.
 */
async function seedIssuedCodOrder(options: {
  cnoteNo: string;
  priceIdr: number;
  normalPriceIdr?: number | null;
  specialPriceIdr?: number | null;
  goodsValueIdr?: number;
}) {
  sequence += 1;
  const suffix = String(sequence).padStart(12, "0");
  const ids = {
    shipmentId: `00000000-0000-0000-0047-${suffix}`,
    snapshotId: `00000000-0000-0000-0048-${suffix}`,
    serviceId: `00000000-0000-0000-0049-${suffix}`,
  };
  const goodsValueIdr = options.goodsValueIdr ?? 100_000;
  const normalPriceIdr = options.normalPriceIdr ?? null;
  const specialPriceIdr = options.specialPriceIdr ?? null;
  const providerChargedShippingIdr = specialPriceIdr ?? normalPriceIdr ?? options.priceIdr;
  const cod = calculateCodAmounts(goodsValueIdr, options.priceIdr);

  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, 'ESTIMATED')",
    [ids.shipmentId, tenantA, outletA],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (shipment_id, tenant_id, destination_area_id, destination_area_label, package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod, destination_area_verified_at)
     VALUES ($1, $2, 'fixture-area', 'Fixture area', 'Sanitized parcel', 1000, 1, $3, true, now())`,
    [ids.shipmentId, tenantA, goodsValueIdr],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
     VALUES
     ($1, $2, 'SENDER', 'Synthetic Sender', '0000000000', 'Synthetic origin', NULL, NULL),
     ($1, $2, 'RECIPIENT', 'Synthetic Recipient', '0000000000', 'Synthetic destination', 'fixture-area', 'Fixture area')`,
    [tenantA, ids.shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id, destination_area_label, weight_grams, is_cod_requested, credential_source)
     VALUES ($1, $2, $3, $4, 'fixture-origin', 'fixture-area', 'Fixture area', 1000, true, 'platform_default')`,
    [ids.snapshotId, tenantA, ids.shipmentId, outletA],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr, normal_price_idr, special_price_idr, shipping_source_field, delivery_estimate, cod_eligible)
     VALUES ($1, $2, $3, 'JNE REG', 'IDR', $4, $5, $6, 'price', 'fixture', true)`,
    [ids.serviceId, tenantA, ids.snapshotId, options.priceIdr, normalPriceIdr, specialPriceIdr],
  );
  await adminPool.query(
    `INSERT INTO shipment_cod_totals (tenant_id, shipment_id, snapshot_id, estimate_service_id, currency, goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr, provider_cod_amount_idr, cod_formula_version)
     VALUES ($1, $2, $3, $4, 'IDR', $5, $6, $7, $8, $9, $10)`,
    [tenantA, ids.shipmentId, ids.snapshotId, ids.serviceId, cod.goodsValueIdr, cod.shippingAmountIdr, cod.serviceFeeIdr, cod.vatAmountIdr, cod.providerCodAmountIdr, cod.codFormulaVersion],
  );

  const [batch] = await asAdminA((tx, context) => prepareProviderBatches(
    tx,
    context,
    [{ shipmentId: ids.shipmentId, estimateSnapshotId: ids.snapshotId, estimateServiceId: ids.serviceId }],
    async () => platformKey,
  ));
  await asAdminA((tx, context) => claimProviderBatch(tx, context, batch.id));

  await asAdminA((tx, context) =>
    completeProviderOrder(tx, context, batch.id, {
      shipmentId: ids.shipmentId,
      providerOrderId: `provider-${ids.shipmentId}`,
      isPaid: true,
      cnoteNo: options.cnoteNo,
    }));

  const persisted = await adminPool.query(
    `SELECT shipping_amount_idr AS "shippingAmountIdr", provider_charged_shipping_idr AS "providerChargedShippingIdr"
     FROM provider_order_snapshots WHERE shipment_id = $1`,
    [ids.shipmentId],
  );
  // Prove the production code, not the test, computed these — the buyer
  // basis (`shippingAmountIdr`) is untouched `price`, and the provider basis
  // is the COALESCE this correction introduced.
  expect(persisted.rows[0].shippingAmountIdr).toBe(options.priceIdr);
  expect(persisted.rows[0].providerChargedShippingIdr).toBe(providerChargedShippingIdr);

  return { shipmentId: ids.shipmentId, cod, providerChargedShippingIdr };
}

/** Ten-thousandths of a rupiah as decimal text, computed here independently of the code under test. */
function idrText(units: number) {
  const sign = units < 0 ? "-" : "";
  const magnitude = Math.abs(units);
  return `${sign}${Math.floor(magnitude / 10_000)}.${String(magnitude % 10_000).padStart(4, "0")}`;
}

/**
 * A reconciliation invoice shaped like the owner's real ones (T-178 evidence):
 * Mengantar deducts `estimatedSpecialPrice` = discounted shipping + `COD × 0.0333`
 * unrounded, and pays `COD_AMOUNT − estimatedSpecialPrice`. `paidUnits` overrides
 * what was actually paid (a short payment, or a provider that rounds to the sen).
 * It goes through the real parser, so the provider's JSON numbers are what is stored.
 */
function realShapedSettlement(cnoteNo: string, codAmountIdr: number, specialShippingIdr: number, paidUnits?: number): ProviderSettlementSnapshot {
  const feeUnits = codAmountIdr * 333;
  const specialUnits = specialShippingIdr * 10_000 + feeUnits;
  const amountUnits = paidUnits ?? codAmountIdr * 10_000 - specialUnits;
  const page = JSON.parse(`{"success":true,"count":1,"data":[{"_id":"INV${cnoteNo.replaceAll("-", "")}","inv_number":"NUM-${cnoteNo}","type":"typeReconciliation","status":"statusCleared","createdAt":"2026-09-16T01:00:00.000Z","amount":${idrText(amountUnits)},"subItems":[{"cnote_no":"${cnoteNo}","amount":${idrText(amountUnits)},"COD_AMOUNT":${codAmountIdr},"COD_FEE":${idrText(feeUnits)},"estimatedSpecialPrice":${idrText(specialUnits)}}]}]}`);
  return {
    invoiceCount: 1,
    orderCount: 1,
    items: normalizeMengantarInvoicePage(page, "SETTLEMENT").items,
    refunds: [],
    orderStatuses: [],
  };
}

async function record(snapshot: ProviderSettlementSnapshot) {
  return asAdminA((tx, context) => recordProviderSettlementPull(tx, context, {
    outletId: outletA,
    credentialSource: "platform_default",
    providerAccountKey: platformKey,
    period,
    snapshot,
  }));
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  sequence = 0;
  await adminPool.query(
    `TRUNCATE shipment_rate_limits, provider_order_status_observations, provider_settlement_items, provider_settlement_pulls,
      ledger_entries, reconciliation_runs, provider_unpaid_recoveries, provider_order_snapshots, provider_batches,
      shipment_cod_totals, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties,
      shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE`,
  );
  await adminPool.query("INSERT INTO users (id, name, email) VALUES ($1, 'Settlement Basis Admin', 'settlement-basis-a@example.test')", [adminA]);
  await adminPool.query("INSERT INTO tenants (id, name, status) VALUES ($1, 'Settlement Basis Tenant', 'ACTIVE')", [tenantA]);
  await adminPool.query("INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN')", [tenantA, adminA]);
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
     VALUES ($1, $2, 'Outlet Basis A', 'fixture-pickup', 'fixture-origin')`,
    [outletA, tenantA],
  );
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("T-146 money-semantics correction", () => {
  // T-178: both figures now subtract Mengantar's 3.33% COD fee. The draft shows
  // it rounded half-up to the rupiah (M-0); Keuangan compares against the fee
  // exactly as Mengantar deducts it, unrounded. They may differ by that
  // rounding and by nothing else.
  it("binds COD-SELLER-PAYOUT-IDR (draft) to SETTLE-EXPECTED-IDR (Keuangan): they differ only by the rounding of Mengantar's COD fee", async () => {
    const priceIdr = 10_000;
    const normalPriceIdr = 9_000;
    const specialPriceIdr = 7_000;
    const { shipmentId, cod } = await seedIssuedCodOrder({
      cnoteNo: "BASIS-CNOTE-BIND",
      priceIdr,
      normalPriceIdr,
      specialPriceIdr,
    });

    // Draft-side formula (shipment-draft-experience.tsx), computed from the
    // same provider money facts the shipment was seeded with.
    const facts: ProviderMoneyFacts = {
      codFeeIdr: null,
      discountIdr: null,
      normalPriceIdr,
      shippingAmountIdr: priceIdr,
      specialPriceIdr,
    };
    const draftMoney = deriveDraftProviderMoneyLines(facts, cod.providerCodAmountIdr);
    expect(draftMoney.estimatedSellerPayoutIdr).not.toBeNull();
    expect(draftMoney.mengantarCodFeeIdr).not.toBeNull();
    const exactFeeUnits = cod.providerCodAmountIdr * 333;
    const keuanganExpectationUnits =
      (draftMoney.estimatedSellerPayoutIdr! + draftMoney.mengantarCodFeeIdr!) * 10_000 - exactFeeUnits;

    // Keuangan-side formula (provider-settlement-repository.ts), after a
    // real-shaped settlement of exactly what Mengantar pays.
    await record(realShapedSettlement("BASIS-CNOTE-BIND", cod.providerCodAmountIdr, specialPriceIdr));
    const review = await asAdminA((tx, context) => listProviderSettlementReview(tx, context));
    const row = review.rows.find((entry) => entry.shipmentId === shipmentId);
    expect(row).toBeDefined();

    // The binding assertion: Keuangan's expectation is the draft payout with
    // the draft's rounded fee swapped for the exact one, to the ten-thousandth.
    expect(Math.round(row!.expectedPayoutIdr! * 10_000)).toBe(keuanganExpectationUnits);
    expect(Math.abs(row!.expectedPayoutIdr! - draftMoney.estimatedSellerPayoutIdr!)).toBeLessThanOrEqual(0.5);
    expect(row!.settlementClass).toBe("MATCHED");
  });

  it("classifies a real-shaped, correctly paid COD settlement — fractional, net of Mengantar's fee — as MATCHED", async () => {
    const { shipmentId, cod, providerChargedShippingIdr } = await seedIssuedCodOrder({
      cnoteNo: "BASIS-CNOTE-MATCHED",
      priceIdr: 10_000,
      normalPriceIdr: 9_000,
      specialPriceIdr: 7_000,
    });
    expect(providerChargedShippingIdr).toBe(7_000);
    // 113 790 − 7 000 − 113 790 × 0.0333 (3 789.2070) = 103 000.7930: what Mengantar pays.
    expect(cod.providerCodAmountIdr).toBe(113_790);
    const paidUnits = cod.providerCodAmountIdr * 10_000 - providerChargedShippingIdr * 10_000 - cod.providerCodAmountIdr * 333;
    expect(paidUnits).toBe(1_030_007_930);

    await record(realShapedSettlement("BASIS-CNOTE-MATCHED", cod.providerCodAmountIdr, 7_000));
    const stored = await adminPool.query("SELECT amount_idr::text AS amount, shipping_amount_idr::text AS special, cod_fee_idr::text AS fee FROM provider_settlement_items");
    expect(stored.rows).toEqual([{ amount: "103000.7930", special: "10789.2070", fee: "3789.2070" }]);
    const review = await asAdminA((tx, context) => listProviderSettlementReview(tx, context));
    const row = review.rows.find((entry) => entry.shipmentId === shipmentId);
    expect(row).toMatchObject({
      expectedPayoutIdr: 103_000.793,
      settledIdr: 103_000.793,
      varianceIdr: 0,
      settlementClass: "MATCHED",
    });
  });

  it("matches a provider that rounds its fee to the sen, and nothing coarser", async () => {
    const { shipmentId, cod } = await seedIssuedCodOrder({
      cnoteNo: "BASIS-CNOTE-SEN",
      priceIdr: 10_000,
      specialPriceIdr: 7_000,
    });
    const exactUnits = cod.providerCodAmountIdr * 10_000 - 70_000_000 - cod.providerCodAmountIdr * 333;
    // Fee 3 789.2070 rounded to the sen is 3 789.21: paid 0.0030 less.
    await record(realShapedSettlement("BASIS-CNOTE-SEN", cod.providerCodAmountIdr, 7_000, exactUnits - 30));
    let row = (await asAdminA((tx, context) => listProviderSettlementReview(tx, context))).rows.find((entry) => entry.shipmentId === shipmentId);
    expect(row).toMatchObject({ settledIdr: 103_000.79, varianceIdr: -0.003, settlementClass: "MATCHED" });

    // One sen short is not rounding.
    await adminPool.query("UPDATE provider_settlement_pulls SET created_at = created_at - interval '2 minutes'");
    await record(realShapedSettlement("BASIS-CNOTE-SEN", cod.providerCodAmountIdr, 7_000, exactUnits - 100));
    row = (await asAdminA((tx, context) => listProviderSettlementReview(tx, context))).rows.find((entry) => entry.shipmentId === shipmentId);
    expect(row).toMatchObject({ settledIdr: 103_000.783, varianceIdr: -0.01, settlementClass: "AMOUNT_MISMATCH" });
  });

  it("still classifies a genuine short-payment as AMOUNT_MISMATCH under the corrected basis", async () => {
    const { shipmentId, cod, providerChargedShippingIdr } = await seedIssuedCodOrder({
      cnoteNo: "BASIS-CNOTE-SHORT",
      priceIdr: 10_000,
      normalPriceIdr: 9_000,
      specialPriceIdr: 7_000,
    });
    const expectedUnits = cod.providerCodAmountIdr * 10_000 - providerChargedShippingIdr * 10_000 - cod.providerCodAmountIdr * 333;
    const expectedPayoutIdr = expectedUnits / 10_000;
    const shortPaidIdr = (expectedUnits - 15_000_000) / 10_000;

    await record(realShapedSettlement("BASIS-CNOTE-SHORT", cod.providerCodAmountIdr, providerChargedShippingIdr, expectedUnits - 15_000_000));
    const review = await asAdminA((tx, context) => listProviderSettlementReview(tx, context));
    const row = review.rows.find((entry) => entry.shipmentId === shipmentId);
    expect(row).toMatchObject({
      expectedPayoutIdr,
      settledIdr: shortPaidIdr,
      varianceIdr: -1_500,
      settlementClass: "AMOUNT_MISMATCH",
    });
    expect(classifyProviderSettlement({
      isCod: true,
      settledIdr: shortPaidIdr,
      varianceIdr: -1_500,
      chargeIdr: 0,
      refundIdr: 0,
      latestProviderStatus: null,
    })).toBe("AMOUNT_MISMATCH");
  });

  it("leaves the buyer-facing COD total, service fee and VAT unchanged regardless of the special price", async () => {
    const priceIdr = 10_000;
    const goodsValueIdr = 100_000;
    const withoutDiscount = await seedIssuedCodOrder({
      cnoteNo: "BASIS-CNOTE-BUYER-1",
      priceIdr,
      goodsValueIdr,
      normalPriceIdr: null,
      specialPriceIdr: null,
    });
    const withDeepDiscount = await seedIssuedCodOrder({
      cnoteNo: "BASIS-CNOTE-BUYER-2",
      priceIdr,
      goodsValueIdr,
      normalPriceIdr: 9_000,
      specialPriceIdr: 1_000,
    });

    // Same `price` and goods value in both cases: the buyer's bill is
    // identical whether or not — and however much — the provider discounts
    // its own settlement basis.
    expect(withDeepDiscount.cod).toEqual(withoutDiscount.cod);
    expect(withDeepDiscount.cod).toMatchObject({
      goodsValueIdr,
      shippingAmountIdr: priceIdr,
      serviceFeeIdr: 3_414,
      vatAmountIdr: 376,
      providerCodAmountIdr: 113_790,
      codFormulaVersion: 2,
    });

    // Only the provider's cost basis (not persisted anywhere the buyer sees)
    // differs between the two shipments.
    expect(withoutDiscount.providerChargedShippingIdr).toBe(priceIdr);
    expect(withDeepDiscount.providerChargedShippingIdr).toBe(1_000);

    const { rows } = await adminPool.query(
      `SELECT amount_idr FROM ledger_entries
       WHERE tenant_id = $1 AND entry_type = 'COD_PRINCIPAL_COLLECTABLE'
         AND shipment_id IN ($2, $3)`,
      [tenantA, withoutDiscount.shipmentId, withDeepDiscount.shipmentId],
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row: { amount_idr: string }) => Number(row.amount_idr))).toEqual([goodsValueIdr, goodsValueIdr]);
  });
});
