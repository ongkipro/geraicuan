import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CodOngkirCharge } from "@/app/app/cod-ongkir-charge";
import { LabelSheet } from "@/app/app/label/[shipmentId]/label-sheet";
import {
  COD_ONGKIR_METRIC_IDS,
  evaluateCodOngkirCharge,
  formatDraftIdr,
} from "@/app/app/shipment-draft-experience";
import { PaymentMethodFields } from "@/app/app/shipment-draft-form";
import { loadShipmentExport, loadShipmentPage } from "@/db/analytics-repository";
import {
  calculateCodAmounts,
  calculateCodOngkirAmounts,
  COD_ONGKIR_FORMULA_VERSION,
  CodOngkirChargeRefusedError,
  ensureCodTotalsForConfirmation,
} from "@/db/cod-totals-repository";
import {
  appendEstimateSnapshot,
  type EstimateRequestMetadata,
  type SupportedEstimateService,
} from "@/db/estimate-repository";
import { loadPrintableLabel, type PrintableLabel } from "@/db/label-print-repository";
import { reconcileLedgerPeriod } from "@/db/ledger-repository";
import { completeProviderOrder } from "@/db/order-batch-repository";
import * as schema from "@/db/schema";
import { loadShipmentReportPage } from "@/db/shipment-report-repository";
import { withTenantContext } from "@/db/tenant-context";
import { serializeAnalyticsCsv, serializeShipmentReportCsv } from "@/lib/analytics-export";
import { EMPTY_ANALYTICS_FILTERS } from "@/lib/analytics-filters";
import { parseAnalyticsRange } from "@/lib/analytics-range";
import {
  codOngkirBreakEvenIdr,
  codOngkirSellerDifferenceIdr,
  MAX_COD_AMOUNT_IDR,
  mengantarCodFeeIdr,
  shippingMengantarDeductsIdr,
} from "@/lib/mengantar-cod-fee";
import { buildMengantarOrderPayload } from "@/lib/mengantar-order";
import { validateShipmentDraft } from "@/lib/shipment-draft";
import { SHIPMENT_REPORT_COLUMNS } from "@/lib/shipment-report";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

/**
 * T-186 / PR-64 / D-12 — COD Ongkir: the courier collects a shipping charge
 * only, editable upward from break-even.
 *
 * Deduction model (tests/fixtures/mengantar-cod-identities.json, T-146's 554/554
 * settlement identity): Mengantar keeps the shipping it deducts plus exactly
 * 0.0333 × the COD amount, so a charge C nets the seller C − S − 0.0333·C. All
 * money comparisons below are exact integers scaled by 10 000.
 */

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
const adminDb = drizzle({ client: adminPool, schema });
const appDb = drizzle({ client: appPool, schema });

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

const b = (value: number) => BigInt(value);
/** Formatted rupiah as it reads once markup whitespace is collapsed. */
const idr = (value: number) => formatDraftIdr(value).replace(/\s+/g, " ");

/** The seller's exact net, in ten-thousandths of a rupiah: 9667·C − 10000·S. */
function exactNetUnits(charge: number, shipping: number) {
  return b(9_667) * b(charge) - b(10_000) * b(shipping);
}

function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** The largest deducted shipping whose break-even still fits the COD column. */
const MAX_SHIPPING = Math.floor((MAX_COD_AMOUNT_IDR * 9_667) / 10_000);

function shippingCases() {
  const random = prng(186);
  const out: number[] = [];
  for (let shipping = 0; shipping <= 60_000; shipping += 1) out.push(shipping);
  for (let index = 0; index < 20_000; index += 1) out.push(Math.floor(random() * 5_000_000));
  for (let index = 0; index < 2_000; index += 1) out.push(Math.floor(random() * MAX_SHIPPING));
  out.push(MAX_SHIPPING);
  return out;
}

describe("T-186 COD Ongkir break-even (application)", () => {
  it("is the smallest whole rupiah that covers the shipping Mengantar deducts plus its 3.33%, and never leaves the seller negative", () => {
    const random = prng(9_667);
    const failures: Array<{ shipping: number; breakEven: number | null; why: string }> = [];
    for (const shipping of shippingCases()) {
      const breakEven = codOngkirBreakEvenIdr(shipping);
      if (breakEven === null) {
        failures.push({ breakEven, shipping, why: "no break-even" });
        continue;
      }
      if (exactNetUnits(breakEven, shipping) < b(0)) failures.push({ breakEven, shipping, why: "negative at break-even" });
      if (breakEven > 1 && exactNetUnits(breakEven - 1, shipping) >= b(0)) {
        failures.push({ breakEven, shipping, why: "not minimal" });
      }
      // What the operator is shown, with Mengantar's fee rounded half-up, is never negative either.
      if (codOngkirSellerDifferenceIdr(breakEven, shipping) < 0) failures.push({ breakEven, shipping, why: "rounded difference negative" });
      // And every charge the application accepts above it stays non-negative.
      const above = Math.min(MAX_COD_AMOUNT_IDR, breakEven + 1 + Math.floor(random() * 1_000_000));
      for (const charge of [breakEven + 1 <= MAX_COD_AMOUNT_IDR ? breakEven + 1 : breakEven, above]) {
        const amounts = calculateCodOngkirAmounts({ chargeIdr: charge, goodsValueIdr: 1, shippingAmountIdr: 0, shippingDeductedIdr: shipping });
        if (exactNetUnits(amounts.providerCodAmountIdr, shipping) < b(0) || codOngkirSellerDifferenceIdr(charge, shipping) < 0) {
          failures.push({ breakEven, shipping, why: `negative at accepted ${charge}` });
        }
      }
      if (failures.length > 5) break;
    }
    expect(failures).toEqual([]);
  });

  it("refuses a charge one rupiah below break-even in the form and on the server, and accepts break-even", () => {
    const failures: number[] = [];
    for (const shipping of [1, 7, 9_000, 9_800, 10_000, 14_000, 123_457, MAX_SHIPPING]) {
      const breakEven = codOngkirBreakEvenIdr(shipping)!;
      const accepted = calculateCodOngkirAmounts({ chargeIdr: breakEven, goodsValueIdr: 50_000, shippingAmountIdr: shipping, shippingDeductedIdr: shipping });
      if (accepted.providerCodAmountIdr !== breakEven || evaluateCodOngkirCharge(String(breakEven), shipping).kind !== "valid") {
        failures.push(shipping);
      }
      let refused: unknown = null;
      try {
        calculateCodOngkirAmounts({ chargeIdr: breakEven - 1, goodsValueIdr: 50_000, shippingAmountIdr: shipping, shippingDeductedIdr: shipping });
      } catch (error) {
        refused = error;
      }
      const inline = evaluateCodOngkirCharge(String(breakEven - 1), shipping);
      if (
        !(refused instanceof CodOngkirChargeRefusedError)
        || refused.reason !== "BELOW_BREAK_EVEN"
        || refused.breakEvenIdr !== breakEven
        || inline.kind !== "invalid"
        || !inline.message.includes(formatDraftIdr(breakEven))
      ) {
        failures.push(shipping);
      }
    }
    expect(failures).toEqual([]);
    // The worked example the owner will see: JNE REG 14 000 → 14 483.
    expect(codOngkirBreakEvenIdr(14_000)).toBe(14_483);
    expect(evaluateCodOngkirCharge("14.482", 14_000)).toEqual({
      kind: "invalid",
      message: `Ongkir tidak boleh di bawah titik impas ${formatDraftIdr(14_483)}. ${formatDraftIdr(14_482)} kurang ${formatDraftIdr(1)} dan membuat penjual rugi.`,
    });
    expect(evaluateCodOngkirCharge("20.000", 14_000)).toEqual({
      chargeIdr: 20_000, kind: "valid", mengantarCodFeeIdr: 666, sellerDifferenceIdr: 5_334,
    });
    expect(evaluateCodOngkirCharge("20000,5", 14_000).kind).toBe("invalid");
  });

  it("collects the charge alone: the COD amount never contains the goods, and fee + VAT is Mengantar's 3.33% of the charge", () => {
    for (const goods of [1, 100_000, 2_000_000_000]) {
      const amounts = calculateCodOngkirAmounts({ chargeIdr: 20_000, goodsValueIdr: goods, shippingAmountIdr: 12_000, shippingDeductedIdr: 9_800 });
      expect(amounts).toEqual({
        codFormulaVersion: COD_ONGKIR_FORMULA_VERSION,
        codShippingBasisIdr: 9_800,
        goodsValueIdr: goods,
        providerCodAmountIdr: 20_000,
        serviceFeeIdr: 600,
        shippingAmountIdr: 12_000,
        vatAmountIdr: 66,
      });
      expect(amounts.serviceFeeIdr + amounts.vatAmountIdr).toBe(mengantarCodFeeIdr(20_000));
    }
    expect(() => calculateCodOngkirAmounts({ chargeIdr: null, goodsValueIdr: 1, shippingAmountIdr: 0, shippingDeductedIdr: 9_800 }))
      .toThrow(expect.objectContaining({ reason: "MISSING", breakEvenIdr: 10_138 }));
    expect(() => calculateCodOngkirAmounts({ chargeIdr: 10_138.5, goodsValueIdr: 1, shippingAmountIdr: 0, shippingDeductedIdr: 9_800 }))
      .toThrow(expect.objectContaining({ reason: "INVALID" }));
  });

  it("takes break-even from the shipping Mengantar deducts: special price, else normal, else price", () => {
    expect(shippingMengantarDeductsIdr({ normalPriceIdr: 12_000, shippingAmountIdr: 13_000, specialPriceIdr: 9_800 })).toBe(9_800);
    expect(shippingMengantarDeductsIdr({ normalPriceIdr: 12_000, shippingAmountIdr: 13_000, specialPriceIdr: null })).toBe(12_000);
    expect(shippingMengantarDeductsIdr({ normalPriceIdr: null, shippingAmountIdr: 13_000, specialPriceIdr: null })).toBe(13_000);
  });

  it("sends the charge as the COD amount and the goods only as the declared goods value (provisional, D-5)", () => {
    const [payload] = buildMengantarOrderPayload([{
      courier: "JNE", declaredValueIdr: 250_000, destinationAreaId: "area", destinationAreaLabel: "Area",
      destinationAreaVerifiedAt: new Date(), isCod: true, isHazardous: false, packageContent: "Kain",
      pickupAddressId: "pickup", providerCodAmountIdr: 20_000, providerService: "JNE REG", quantity: 1,
      recipientAddress: "Alamat", recipientAddressLandmark: null, recipientName: "Penerima", recipientPhone: "081200000001",
      senderAddress: "Alamat", senderName: "Pengirim", senderPhone: "081200000002", shipmentId: randomUUID(),
      shippingInstruction: null, weightGrams: 1_000,
    }]);
    expect(payload).toMatchObject({ cod_amount: 20_000, goods_value: 250_000, is_cod: true });
  });
});

/**
 * Binds the TypeScript break-even to the database CHECKs on the real table
 * definition, copied with its constraints into a temporary table.
 */
describe("T-186 COD Ongkir: application and database agree", () => {
  type Row = { goods: number; shipping: number; basis: number | null; fee: number; vat: number; cod: number; version: number };
  const insertSql = `INSERT INTO cod_ongkir_probe (
    id, tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
    goods_value_idr, shipping_amount_idr, cod_shipping_basis_idr, service_fee_idr, vat_amount_idr,
    provider_cod_amount_idr, cod_formula_version
  ) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'IDR', $1, $2, $3, $4, $5, $6, $7)`;

  async function withProbe(work: (accepts: (row: Row) => Promise<boolean>) => Promise<void>) {
    const client = await adminPool.connect();
    try {
      await client.query("CREATE TEMP TABLE cod_ongkir_probe (LIKE shipment_cod_totals INCLUDING CONSTRAINTS INCLUDING DEFAULTS)");
      const accepts = async (row: Row) => {
        await client.query("SAVEPOINT probe");
        try {
          await client.query(insertSql, [row.goods, row.shipping, row.basis, row.fee, row.vat, row.cod, row.version]);
          await client.query("RELEASE SAVEPOINT probe");
          return true;
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT probe");
          if ((error as { code?: string }).code !== "23514") throw error;
          return false;
        }
      };
      await client.query("BEGIN");
      await work(accepts);
      await client.query("ROLLBACK");
    } finally {
      await client.query("DROP TABLE IF EXISTS cod_ongkir_probe").catch(() => undefined);
      client.release();
    }
  }

  function rowFor(shipping: number, charge: number, goods = 100_000): Row {
    const fee = mengantarCodFeeIdr(charge);
    const serviceFee = Math.floor((fee * 100 + 55) / 111);
    return { basis: shipping, cod: charge, fee: serviceFee, goods, shipping: shipping + 2_000, vat: fee - serviceFee, version: 3 };
  }

  it("carries the version 3 checks on the live table", async () => {
    const { rows } = await adminPool.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'shipment_cod_totals'::regclass AND contype = 'c' AND convalidated`,
    );
    expect(rows.map((row) => row.conname)).toEqual(expect.arrayContaining([
      "shipment_cod_totals_cod_ongkir_break_even_v3",
      "shipment_cod_totals_cod_ongkir_fee_split_v3",
      "shipment_cod_totals_cod_ongkir_fee_v3",
      "shipment_cod_totals_formula_version_known",
      "shipment_cod_totals_provider_cod_amount_exact",
      "shipment_cod_totals_shipping_basis_v3",
    ]));
  });

  it("accepts break-even from the application and refuses one rupiah below it, for every shipping amount probed", async () => {
    const random = prng(3);
    const shippings = [0, 1, 2, 7, 9_666, 9_667, 9_800, 10_000, 14_000, 123_457, MAX_SHIPPING];
    for (let shipping = 0; shipping <= 400; shipping += 1) shippings.push(shipping);
    for (let index = 0; index < 200; index += 1) shippings.push(Math.floor(random() * 5_000_000));

    await withProbe(async (accepts) => {
      const refusedWrongly: Row[] = [];
      const acceptedWrongly: Row[] = [];
      for (const shipping of shippings) {
        const breakEven = codOngkirBreakEvenIdr(shipping)!;
        const app = calculateCodOngkirAmounts({ chargeIdr: breakEven, goodsValueIdr: 100_000, shippingAmountIdr: shipping + 2_000, shippingDeductedIdr: shipping });
        const applicationRow: Row = {
          basis: app.codShippingBasisIdr, cod: app.providerCodAmountIdr, fee: app.serviceFeeIdr, goods: app.goodsValueIdr,
          shipping: app.shippingAmountIdr, vat: app.vatAmountIdr, version: app.codFormulaVersion,
        };
        if (!(await accepts(applicationRow))) refusedWrongly.push(applicationRow);
        // One rupiah below break-even, with its own correct fee split, so only
        // the break-even rule can refuse it.
        if (breakEven > 1 && await accepts(rowFor(shipping, breakEven - 1))) acceptedWrongly.push(rowFor(shipping, breakEven - 1));
      }
      expect(refusedWrongly).toEqual([]);
      expect(acceptedWrongly).toEqual([]);
    });
  });

  it("refuses a wrong fee, a wrong split, a missing basis, and a basis on another version; keeps versions 1 and 2 valid", async () => {
    await withProbe(async (accepts) => {
      const valid = rowFor(9_800, 20_000);
      expect(await accepts(valid)).toBe(true);
      // A charge far above break-even is the owner's choice and stays valid.
      expect(await accepts(rowFor(9_800, 1_500_000))).toBe(true);
      // The goods never enter a version 3 amount: a huge goods value changes nothing.
      expect(await accepts({ ...valid, goods: 2_000_000_000 })).toBe(true);
      expect(await accepts({ ...valid, vat: valid.vat + 1 })).toBe(false);
      expect(await accepts({ ...valid, fee: valid.fee + 1, vat: valid.vat - 1 })).toBe(false);
      expect(await accepts({ ...valid, basis: null })).toBe(false);
      expect(await accepts({ ...valid, basis: -1 })).toBe(false);
      expect(await accepts({ ...valid, version: 4 })).toBe(false);

      const historical: Row = { basis: null, cod: 113_663, fee: 3_300, goods: 100_000, shipping: 10_000, vat: 363, version: 1 };
      expect(await accepts(historical)).toBe(true);
      const v2 = calculateCodAmounts(100_000, 10_000);
      const current: Row = { basis: null, cod: v2.providerCodAmountIdr, fee: v2.serviceFeeIdr, goods: 100_000, shipping: 10_000, vat: v2.vatAmountIdr, version: 2 };
      expect(await accepts(current)).toBe(true);
      expect(await accepts({ ...current, basis: 10_000 })).toBe(false);
      // A goods-inclusive version 2 amount cannot be relabelled as COD Ongkir
      // without its basis, and a version 3 row cannot pose as version 2.
      expect(await accepts({ ...current, version: 3 })).toBe(false);
      expect(await accepts({ ...valid, basis: null, version: 2 })).toBe(false);
    });
  });
});

const tenantA = "00000000-0000-0186-0000-000000000001";
const tenantB = "00000000-0000-0186-0000-000000000002";
const outletA = "00000000-0000-0186-0001-000000000001";
const outletB = "00000000-0000-0186-0001-000000000002";
const userA = "cod-ongkir-admin-a";
const userB = "cod-ongkir-admin-b";
const originArea = "origin-186";

function shipmentUuid(sequence: number) {
  return `00000000-0000-0186-0002-${String(sequence).padStart(12, "0")}`;
}

async function clean() {
  await adminPool.query(
    `TRUNCATE ledger_entries, reconciliation_runs, print_events, provider_unpaid_recoveries,
      provider_order_snapshots, provider_batches, shipment_cod_totals,
      shipment_estimate_services, shipment_estimate_snapshots, shipment_parties,
      shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE`,
  );
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES ($1, 'COD Ongkir A', 'cod-ongkir-a@example.test'), ($2, 'COD Ongkir B', 'cod-ongkir-b@example.test')`,
    [userA, userB],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'COD Ongkir Tenant A', 'ACTIVE'), ($2, 'COD Ongkir Tenant B', 'ACTIVE')",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($3, $4, 'TENANT_ADMIN')",
    [tenantA, userA, tenantB, userB],
  );
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
     VALUES ($1, $2, 'Outlet COD Ongkir', 'pickup-186', $5), ($3, $4, 'Outlet B', 'pickup-186-b', 'origin-186-b')`,
    [outletA, tenantA, outletB, tenantB, originArea],
  );
}

async function seedDraft(sequence: number, method: "COD" | "COD_ONGKIR", status: "DRAFT" | "SUBMISSION_QUEUED" = "DRAFT", createdAt = "2026-09-03T03:00:00Z") {
  const shipmentId = shipmentUuid(sequence);
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)",
    [shipmentId, tenantA, outletA, status, createdAt],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod, cod_shipping_only
    ) VALUES ($1, $2, 'destination-186', 'Destination 186', 'Kain batik', 1000, 1, 250000, true, $3)`,
    [shipmentId, tenantA, method === "COD_ONGKIR"],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address) VALUES
      ($1, $2, 'SENDER', 'Toko Pengirim', '081255553333', 'Ruko Pengirim'),
      ($1, $2, 'RECIPIENT', 'Penerima', '081377772222', 'Jl. Penerima 1')`,
    [tenantA, shipmentId],
  );
  return shipmentId;
}

const codRequest = {
  credentialSource: "platform_default",
  destinationAreaId: "destination-186",
  destinationAreaLabel: "Destination 186",
  isCodRequested: true,
  originAreaId: originArea,
  weightGrams: 1_000,
} satisfies EstimateRequestMetadata;

// A discounted account: Mengantar deducts the special price (9 800), not the
// 12 000 price the buyer-facing quote carries.
const discountedService = {
  codEligible: true,
  codFeeIdr: 0,
  currency: "IDR",
  deliveryEstimate: "2 - 3 days",
  discountIdr: 2_200,
  insuranceAmountIdr: null,
  insuranceSourceField: null,
  normalPriceIdr: 12_000,
  providerService: "SAP REG",
  shippingAmountIdr: 12_000,
  shippingSourceField: "price",
  specialPriceIdr: 9_800,
} satisfies SupportedEstimateService;

describe("T-186 COD Ongkir confirmation: application and row-level security", () => {
  beforeAll(async () => {
    await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  });
  beforeEach(clean);

  async function estimate(shipmentId: string) {
    const snapshotId = await withTenantContext(appDb, userA, tenantA, (tx, context) =>
      appendEstimateSnapshot(tx, context, shipmentId, codRequest, [discountedService]));
    const [service] = await adminDb.select({ id: schema.shipmentEstimateServices.id })
      .from(schema.shipmentEstimateServices)
      .where(eq(schema.shipmentEstimateServices.snapshotId, snapshotId));
    return { estimateServiceId: service!.id, estimateSnapshotId: snapshotId, shipmentId };
  }

  const confirm = (selection: Parameters<typeof ensureCodTotalsForConfirmation>[2]) =>
    withTenantContext(appDb, userA, tenantA, (tx, context) => ensureCodTotalsForConfirmation(tx, context, selection));

  it("refuses a missing or below-break-even charge server-side, records a raised charge as version 3, and keeps it immutable", async () => {
    const selection = await estimate(await seedDraft(1, "COD_ONGKIR"));
    const breakEven = codOngkirBreakEvenIdr(9_800)!;
    expect(breakEven).toBe(10_138);

    await expect(confirm({ ...selection, codShippingChargeIdr: null }))
      .rejects.toMatchObject({ reason: "MISSING", breakEvenIdr: breakEven });
    await expect(confirm({ ...selection, codShippingChargeIdr: breakEven - 1 }))
      .rejects.toMatchObject({ reason: "BELOW_BREAK_EVEN", breakEvenIdr: breakEven });
    expect(await adminDb.select().from(schema.shipmentCodTotals)).toEqual([]);

    const recorded = await confirm({ ...selection, codShippingChargeIdr: 15_000 });
    expect(recorded).toMatchObject({
      codFormulaVersion: 3,
      codShippingBasisIdr: 9_800,
      goodsValueIdr: 250_000,
      providerCodAmountIdr: 15_000,
      serviceFeeIdr: 450,
      shippingAmountIdr: 12_000,
      vatAmountIdr: 50,
    });
    expect(recorded!.serviceFeeIdr + recorded!.vatAmountIdr).toBe(mengantarCodFeeIdr(15_000));

    // A retry confirms the recorded charge; a different one is refused, never rewritten.
    await expect(confirm({ ...selection, codShippingChargeIdr: 15_000 })).resolves.toMatchObject({ id: recorded!.id });
    await expect(confirm({ ...selection, codShippingChargeIdr: 16_000 }))
      .rejects.toMatchObject({ reason: "ALREADY_RECORDED", recordedChargeIdr: 15_000 });
  });

  it("refuses a charge for a shipment that is not COD Ongkir, and computes full COD without one", async () => {
    const selection = await estimate(await seedDraft(2, "COD"));
    await expect(confirm({ ...selection, codShippingChargeIdr: 20_000 }))
      .rejects.toBeInstanceOf(CodOngkirChargeRefusedError);
    await expect(confirm(selection)).resolves.toMatchObject({ codFormulaVersion: 2, codShippingBasisIdr: null, providerCodAmountIdr: calculateCodAmounts(250_000, 12_000).providerCodAmountIdr });
  });

  it("row-level security refuses a goods-inclusive total or a forged basis for a COD Ongkir draft", async () => {
    const selection = await estimate(await seedDraft(3, "COD_ONGKIR"));
    const insertAsApp = (values: Partial<typeof schema.shipmentCodTotals.$inferInsert>) =>
      withTenantContext(appDb, userA, tenantA, (tx) => tx.insert(schema.shipmentCodTotals).values({
        currency: "IDR",
        estimateServiceId: selection.estimateServiceId,
        goodsValueIdr: 250_000,
        providerCodAmountIdr: 0,
        serviceFeeIdr: 0,
        shipmentId: selection.shipmentId,
        shippingAmountIdr: 12_000,
        snapshotId: selection.estimateSnapshotId,
        tenantId: tenantA,
        vatAmountIdr: 0,
        ...values,
      }));
    // What a previous-release instance would write: the full COD version 2 total.
    await expect(insertAsApp({ ...calculateCodAmounts(250_000, 12_000) }))
      .rejects.toMatchObject({ cause: { code: "42501" } });
    // A version 3 row that checks break-even against `price` rather than the special price Mengantar deducts.
    const forged = calculateCodOngkirAmounts({ chargeIdr: codOngkirBreakEvenIdr(12_000)!, goodsValueIdr: 250_000, shippingAmountIdr: 12_000, shippingDeductedIdr: 12_000 });
    await expect(insertAsApp(forged)).rejects.toMatchObject({ cause: { code: "42501" } });
    const honest = calculateCodOngkirAmounts({ chargeIdr: codOngkirBreakEvenIdr(9_800)!, goodsValueIdr: 250_000, shippingAmountIdr: 12_000, shippingDeductedIdr: 9_800 });
    await expect(insertAsApp(honest)).resolves.toBeDefined();
  });

  it("refuses a COD Ongkir draft that is not COD", async () => {
    await expect(adminPool.query(
      `INSERT INTO shipments (id, tenant_id, outlet_id) VALUES ($1, $2, $3);`,
      [shipmentUuid(4), tenantA, outletA],
    )).resolves.toBeDefined();
    await expect(adminPool.query(
      `INSERT INTO shipment_drafts (shipment_id, tenant_id, destination_area_id, destination_area_label,
        package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod, cod_shipping_only)
       VALUES ($1, $2, 'd', 'D', 'P', 1000, 1, 1000, false, true)`,
      [shipmentUuid(4), tenantA],
    )).rejects.toMatchObject({ code: "23514" });
  });
});

describe("T-186 an issued COD Ongkir shipment: ledger, label, report and analytics", () => {
  const charge = 20_000;
  const basis = 9_800;
  const now = new Date("2026-09-12T05:00:00.000Z");
  const range = parseAnalyticsRange({ rentang: "kustom", dari: "2026-09-01", sampai: "2026-09-10", tz: "Asia/Jakarta" }, now);

  async function seedQueued(sequence: number, method: "COD" | "COD_ONGKIR") {
    const shipmentId = await seedDraft(sequence, method, "SUBMISSION_QUEUED");
    const suffix = String(sequence).padStart(12, "0");
    const ids = {
      batchId: `00000000-0000-0186-0004-${suffix}`,
      orderId: `00000000-0000-0186-0005-${suffix}`,
      serviceId: `00000000-0000-0186-0006-${suffix}`,
      shipmentId,
      snapshotId: `00000000-0000-0186-0007-${suffix}`,
    };
    await adminPool.query(
      `INSERT INTO shipment_estimate_snapshots (id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
        destination_area_label, weight_grams, is_cod_requested, credential_source)
       VALUES ($1, $2, $3, $4, $5, 'destination-186', 'Destination 186', 1000, true, 'platform_default')`,
      [ids.snapshotId, tenantA, shipmentId, outletA, originArea],
    );
    await adminPool.query(
      `INSERT INTO shipment_estimate_services (id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
        shipping_source_field, delivery_estimate, cod_eligible, normal_price_idr, special_price_idr)
       VALUES ($1, $2, $3, 'JNE REG', 'IDR', 12000, 'price', 'fixture', true, 12000, $4)`,
      [ids.serviceId, tenantA, ids.snapshotId, basis],
    );
    const amounts = method === "COD_ONGKIR"
      ? calculateCodOngkirAmounts({ chargeIdr: charge, goodsValueIdr: 250_000, shippingAmountIdr: 12_000, shippingDeductedIdr: basis })
      : { ...calculateCodAmounts(250_000, 12_000), codShippingBasisIdr: null };
    await adminPool.query(
      `INSERT INTO shipment_cod_totals (tenant_id, shipment_id, snapshot_id, estimate_service_id, currency, goods_value_idr,
        shipping_amount_idr, service_fee_idr, vat_amount_idr, provider_cod_amount_idr, cod_formula_version, cod_shipping_basis_idr)
       VALUES ($1, $2, $3, $4, 'IDR', $5, $6, $7, $8, $9, $10, $11)`,
      [tenantA, shipmentId, ids.snapshotId, ids.serviceId, amounts.goodsValueIdr, amounts.shippingAmountIdr, amounts.serviceFeeIdr,
        amounts.vatAmountIdr, amounts.providerCodAmountIdr, amounts.codFormulaVersion, amounts.codShippingBasisIdr],
    );
    await adminPool.query(
      `INSERT INTO provider_batches (id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
        provider_account_key, idempotency_key, status, submission_attempted_at)
       VALUES ($1, $2, $3, 'pickup-186', 'JNE', 'platform_default', $4, $5, 'SUBMITTING', '2026-09-03T03:30:00Z')`,
      [ids.batchId, tenantA, outletA, "c".repeat(64), String(sequence).padStart(64, "0")],
    );
    await adminPool.query(
      `INSERT INTO provider_order_snapshots (id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id,
        position, provider_service, destination_area_id, destination_area_label, currency, shipping_amount_idr, is_cod,
        provider_cod_amount_idr, provider_charged_shipping_idr)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG', 'destination-186', 'Destination 186', 'IDR', 12000, true, $7, $8)`,
      [ids.orderId, tenantA, ids.batchId, shipmentId, ids.snapshotId, ids.serviceId, amounts.providerCodAmountIdr, basis],
    );
    await withTenantContext(appDb, userA, tenantA, (tx, context) =>
      completeProviderOrder(tx, context, ids.batchId, {
        cnoteNo: `AWB186${sequence}`,
        isPaid: true,
        providerOrderId: `provider-186-${sequence}`,
        shipmentId,
      }));
    return { ...ids, amounts };
  }

  beforeAll(async () => {
    await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  });
  beforeEach(clean);

  it("books zero COD principal for COD Ongkir, the goods principal for COD, and reconciles both exactly", async () => {
    const ongkir = await seedQueued(11, "COD_ONGKIR");
    const cod = await seedQueued(12, "COD");
    const entriesFor = async (shipmentId: string) => (await adminDb.select().from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.shipmentId, shipmentId)))
      .map((entry) => [entry.entryType, entry.financialClass, entry.amountIdr])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])));

    // T-193: Mengantar's fee on the charge, VAT inside it, and no VAT liability row.
    expect(await entriesFor(ongkir.shipmentId)).toEqual([
      ["COD_PRINCIPAL_COLLECTABLE", "LIABILITY", 0],
      ["MENGANTAR_COD_FEE_COST", "EXPENSE", mengantarCodFeeIdr(ongkir.amounts.providerCodAmountIdr)],
      ["MENGANTAR_SHIPPING_COST", "EXPENSE", basis],
    ]);
    expect(await entriesFor(cod.shipmentId)).toContainEqual(["COD_PRINCIPAL_COLLECTABLE", "LIABILITY", 250_000]);

    const reconciled = await withTenantContext(appDb, userA, tenantA, (tx, context) =>
      reconcileLedgerPeriod(tx, context, {
        attemptId: randomUUID(),
        cadence: "MONTHLY",
        outletId: outletA,
        periodEnd: new Date("2100-01-01T00:00:00.000Z"),
        periodStart: new Date("2000-01-01T00:00:00.000Z"),
      }));
    const principal = reconciled.reconciliations.find(({ run }) => run.reconciledEntryType === "COD_PRINCIPAL_COLLECTABLE")?.run;
    expect(principal).toMatchObject({ ledgerTotalIdr: 250_000, sourceTotalIdr: 250_000, status: "MATCHED", varianceIdr: 0 });
    // T-193: the fee reconciles on Mengantar's rate for both, and no VAT row is expected.
    const byType = new Map(reconciled.reconciliations.map(({ run }) => [run.reconciledEntryType, run]));
    const expectedFee = mengantarCodFeeIdr(ongkir.amounts.providerCodAmountIdr) + mengantarCodFeeIdr(cod.amounts.providerCodAmountIdr);
    expect(byType.get("MENGANTAR_COD_FEE_COST")).toMatchObject({ ledgerTotalIdr: expectedFee, sourceTotalIdr: expectedFee, status: "MATCHED" });
    expect(byType.get("COD_SERVICE_FEE_VAT_PAYABLE")).toMatchObject({ ledgerTotalIdr: 0, sourceTotalIdr: 0, status: "MATCHED" });
    expect(reconciled.reconciliations.filter(({ run }) => run.status !== "MATCHED")).toEqual([]);
  });

  it("prints COD Ongkir as a shipping charge only and never a goods breakdown", async () => {
    const ongkir = await seedQueued(21, "COD_ONGKIR");
    const label = await withTenantContext(appDb, userA, tenantA, (tx, context) => loadPrintableLabel(tx, context, ongkir.shipmentId));
    expect(label).toMatchObject({ codBreakdown: null, isCod: true, paymentMethod: "COD_ONGKIR", providerCodAmountIdr: charge });

    const text = renderToStaticMarkup(createElement(LabelSheet, { label })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain(`COD ONGKIR — TAGIH ONGKIR SAJA ${idr(charge)}`);
    expect(text).toContain("Barang sudah dibayar JANGAN DITAGIH");
    expect(text).toContain(`COD ONGKIR ${idr(charge)}`);
    expect(text).not.toContain("COD — TAGIH KE PENERIMA");
    expect(text).not.toMatch(/Nilai barang \S/);
  });

  it("states the method in the report, its export and the analytics table and export", async () => {
    const ongkir = await seedQueued(31, "COD_ONGKIR");
    await seedQueued(32, "COD");

    const report = await withTenantContext(appDb, userA, tenantA, (tx, context) =>
      loadShipmentReportPage(tx, context, { filters: EMPTY_ANALYTICS_FILTERS, page: 1, pageSize: 50, range }));
    const ongkirRow = report.rows.find((row) => row.shipmentId === ongkir.shipmentId)!;
    expect(report.rows.map((row) => row.paymentMethod).sort()).toEqual(["COD", "COD_ONGKIR"]);
    // What the courier collects, less the shipping and the 3.33% Mengantar keeps: the seller's difference.
    expect(ongkirRow).toMatchObject({
      codDisbursementEstimateIdr: codOngkirSellerDifferenceIdr(charge, basis),
      codFeeIdr: mengantarCodFeeIdr(charge),
      shippingCostIdr: basis,
    });
    const paymentColumn = SHIPMENT_REPORT_COLUMNS.find((column) => column.metricId === "RPT-SHP-PAYMENT-MODE")!;
    expect(paymentColumn.value(ongkirRow)).toBe("COD_ONGKIR");
    expect(serializeShipmentReportCsv([ongkirRow])).toContain('"COD_ONGKIR"');

    const analytics = await withTenantContext(appDb, userA, tenantA, (tx, context) =>
      loadShipmentPage(tx, context, range, { limit: 50, offset: 0 }));
    expect(analytics.rows.find((row) => row.shipmentId === ongkir.shipmentId)).toMatchObject({ isCod: true, paymentMethod: "COD_ONGKIR", providerCodAmountIdr: charge });
    expect(analytics.rows.map((row) => row.paymentMethod).sort()).toEqual(["COD", "COD_ONGKIR"]);
    const exported = await withTenantContext(appDb, userA, tenantA, (tx, context) => loadShipmentExport(tx, context, range));
    const csv = serializeAnalyticsCsv(exported.rows).replace("﻿", "").trimEnd().split("\r\n");
    expect(csv[0]!.split(",").at(-1)).toBe('"payment_method"');
    expect(csv.slice(1).map((line) => line.split(",").at(-1)).sort()).toEqual(['"COD"', '"COD_ONGKIR"']);

    // The other tenant sees none of it.
    const foreign = await withTenantContext(appDb, userB, tenantB, (tx, context) =>
      loadShipmentReportPage(tx, context, { filters: EMPTY_ANALYTICS_FILTERS, page: 1, pageSize: 50, range }));
    expect(foreign.rows).toEqual([]);
  });
});

describe("T-186 the draft form and the label render each method's own facts", () => {
  const visible = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const render = (defaultMethod?: string) =>
    renderToStaticMarkup(createElement(PaymentMethodFields, { defaultDeclaredValue: "150000", defaultMethod }));

  it("offers the three methods as labelled choices and renders only the chosen method's field", () => {
    const panels = {
      COD: render("COD"),
      COD_ONGKIR: render("COD_ONGKIR"),
      NON_COD: render("NON_COD"),
    };
    for (const markup of Object.values(panels)) {
      const text = visible(markup);
      for (const label of ["Non-COD", "COD", "COD Ongkir"]) expect(text).toContain(label);
      // One goods value input, ever: the method's own panel owns it.
      expect(markup.match(/name="declaredValue"/g)).toHaveLength(1);
      expect(markup).toContain('aria-live="polite"');
      expect(markup).not.toContain(`name="codShippingChargeIdr"`);
    }
    expect(panels.NON_COD).toContain('data-payment-panel="NON_COD"');
    expect(visible(panels.NON_COD)).toContain("Nilai barang untuk asuransi (Rp)");
    expect(visible(panels.NON_COD)).not.toMatch(/Total COD dihitung otomatis|Ongkir yang ditagih kurir diatur/);

    expect(panels.COD).toContain('data-payment-panel="COD"');
    expect(visible(panels.COD)).toContain("Total COD dihitung otomatis");
    expect(visible(panels.COD)).not.toMatch(/untuk asuransi \(Rp\)|Ongkir yang ditagih kurir diatur|sudah dibayar \(Rp\)/);

    expect(panels.COD_ONGKIR).toContain('data-payment-panel="COD_ONGKIR"');
    expect(visible(panels.COD_ONGKIR)).toContain("Nilai barang yang sudah dibayar (Rp)");
    expect(visible(panels.COD_ONGKIR)).toContain("Ongkir yang ditagih kurir diatur saat memilih layanan");
    expect(visible(panels.COD_ONGKIR)).not.toMatch(/Total COD dihitung otomatis|untuk asuransi \(Rp\)/);

    // An unknown method from a replayed form falls back to Non-COD rather than no panel.
    expect(render("CASH")).toContain('data-payment-panel="NON_COD"');
  });

  it("validates the method server-side and derives COD from it", () => {
    const form = (paymentType: string, declaredValue = "150000") => {
      const data = new FormData();
      for (const [key, value] of Object.entries({
        declaredValue, destinationAreaId: "3171010", destinationAreaLabel: "Gambir", outletId: randomUUID(),
        packageContent: "Kain", packageQuantity: "1", packageWeightGrams: "1000", paymentType,
        recipientAddress: "Alamat", recipientName: "Penerima", recipientPhone: "081377772222",
        senderAddress: "Alamat", senderName: "Pengirim", senderPhone: "081255553333",
      })) data.set(key, value);
      return validateShipmentDraft(data);
    };
    expect(form("COD_ONGKIR")).toMatchObject({ input: { isCod: true, paymentMethod: "COD_ONGKIR" }, ok: true });
    expect(form("COD")).toMatchObject({ input: { isCod: true, paymentMethod: "COD" }, ok: true });
    expect(form("NON_COD")).toMatchObject({ input: { isCod: false, paymentMethod: "NON_COD" }, ok: true });
    expect(form("COD_ONGKIR", "0")).toMatchObject({ errors: { declaredValue: "Nilai barang untuk COD Ongkir harus lebih dari Rp0." }, ok: false });
    expect(form("CASH")).toMatchObject({ errors: { paymentType: "Pilih metode pembayaran: Non-COD, COD, atau COD Ongkir." }, ok: false });
  });

  it("starts the COD Ongkir charge at break-even and states the seller's difference", () => {
    const markup = renderToStaticMarkup(createElement(CodOngkirCharge, {
      idPrefix: "probe", name: "codShippingChargeIdr", providerService: "JNE REG", shippingDeductedIdr: 14_000,
    }));
    expect(markup).toContain('value="14483"');
    expect(markup).toContain('name="codShippingChargeIdr"');
    const text = visible(markup);
    expect(text).toContain(`Titik impas (ongkir minimal) ${idr(14_483)}`);
    expect(text).toContain(`Selisih diterima penjual ${idr(codOngkirSellerDifferenceIdr(14_483, 14_000))}`);
    for (const id of Object.values(COD_ONGKIR_METRIC_IDS)) expect(markup).toContain(`data-metric-id="${id}"`);
    expect(COD_ONGKIR_METRIC_IDS.mengantarFee).toBe("COD-ONGKIR-MENGANTAR-FEE-IDR");
    expect(markup).toMatch(/data-metric-id="COD-ONGKIR-MENGANTAR-FEE-IDR"><dt[^>]*>Biaya COD Mengantar/);
    expect(text).not.toContain("Nilai barang");
  });

  it("shows a refused charge without an assertive alert and announces it politely only on blur or submit (T-199)", () => {
    // No usable shipping amount renders the refusal immediately, as a typed low charge does.
    const markup = renderToStaticMarkup(createElement(CodOngkirCharge, {
      idPrefix: "probe", name: "codShippingChargeIdr", providerService: "JNE REG", shippingDeductedIdr: -1,
    }));
    expect(markup).toContain('id="probe-charge-error"');
    expect(markup).toMatch(/aria-describedby="probe-charge-hint probe-charge-error"/);
    // Typing never fires an alert, and the results block does not chatter on every keystroke.
    expect(markup).not.toContain('role="alert"');
    expect(markup).not.toMatch(/<dl[^>]*aria-live/);
    // The polite regions start empty: blur/submit fills one, a settled valid charge the other.
    expect(markup).toContain('<p aria-live="polite" class="sr-only" data-cod-ongkir-announcement="refusal"></p>');
    expect(markup).toContain('<p aria-live="polite" class="sr-only" data-cod-ongkir-announcement="settled"></p>');
  });

  it("never prints a goods breakdown on a COD Ongkir label, even if one is supplied", () => {
    const label: PrintableLabel = {
      awb: "JX1234567890",
      codBreakdown: { codFeeIdr: 666, codFeeVatIncludedIdr: 66, goodsValueIdr: 425_000, providerCodAmountIdr: 437_666, roundingIdr: 0, shippingAmountIdr: 12_000 },
      courier: "JNE",
      destinationAreaLabel: "Kebon Kacang, Tanah Abang, Jakarta Pusat",
      insuranceAmountIdr: null,
      isCod: true,
      issuedAt: new Date("2026-09-14T08:24:00.000Z"),
      lastPrintedAt: null,
      outletName: "Outlet",
      package: { content: "Kain", declaredValueIdr: 425_000, heightCm: null, lengthCm: null, quantity: 1, weightGrams: 1_000, widthCm: null },
      paymentMethod: "COD_ONGKIR",
      printCount: 0,
      providerCodAmountIdr: 20_000,
      providerService: "JNE REG",
      publicReference: "GC-10186",
      recipient: { address: "Jl. Penerima", name: "Penerima", phone: "081377772222" },
      sender: { address: "Ruko", name: "Pengirim", phone: "081255553333" },
      shipmentId: randomUUID(),
      shippingAmountIdr: 12_000,
    };
    const text = visible(renderToStaticMarkup(createElement(LabelSheet, { label })));
    expect(text).toContain(`COD ONGKIR — TAGIH ONGKIR SAJA ${idr(20_000)}`);
    expect(text).toContain("Nilai (lunas)");
    expect(text).not.toMatch(/Nilai barang \S|Ongkir Mengantar|Biaya COD|COD — TAGIH KE PENERIMA/);
  });
});
