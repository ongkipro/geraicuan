import { readFile } from "node:fs/promises";

import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { deriveDraftProviderMoneyLines } from "@/app/app/shipment-draft-experience";
import {
  calculateCodAmounts,
  COD_FORMULA_VERSION,
} from "@/db/cod-totals-repository";
import {
  codChargeBreakdown,
  mengantarCodFeeIdr,
  vatIncludedInMengantarCodFeeIdr,
} from "@/lib/mengantar-cod-fee";

/**
 * T-175: the COD amount never under-collects Mengantar's own fee.
 *
 * Deduction model, from `tests/fixtures/mengantar-cod-identities.json` (100 real
 * COD orders) and the settlement identity recorded under T-146 (554/554):
 * Mengantar keeps `specialShipping + 0.0333 × COD` of what the buyer pays, so
 * the seller receives `0.9667 × COD − specialShipping`. All comparisons below
 * are exact integer arithmetic scaled by 10 000; no float touches the money.
 */

const adminDatabaseUrl = process.env.DATABASE_URL;
if (!adminDatabaseUrl) throw new Error("DATABASE_URL is required for integration tests.");
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}
const adminPool = new Pool({ connectionString: adminDatabaseUrl });

afterAll(async () => {
  await adminPool.end();
});

const b = (value: number) => BigInt(value);
const SCALE = b(10_000);
const NET = b(9_667);

/** Seller payout ≥ goods under the evidenced model, exactly: 9667·COD − 10000·special ≥ 10000·goods. */
function sellerNetsGoods(cod: number, special: number, goods: number) {
  return NET * b(cod) - SCALE * b(special) >= SCALE * b(goods);
}

/** Deterministic spread (mulberry32) so a failure is reproducible from its printed case. */
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

type Case = { goods: number; shipping: number; special: number };

function cases(): Case[] {
  const random = prng(175);
  const out: Case[] = [];
  // Every small goods value against a handful of shipping amounts, zero discount
  // and full discount: the rounding edges live here.
  for (let goods = 1; goods <= 3_000; goods += 1) {
    for (const shipping of [0, 1, 7, 9_000, 10_000]) {
      out.push({ goods, shipping, special: shipping });
      out.push({ goods, shipping, special: 0 });
    }
  }
  // Realistic and large values, each with zero discount and a random discount.
  for (let index = 0; index < 20_000; index += 1) {
    const goods = 1 + Math.floor(random() * 50_000_000);
    const shipping = Math.floor(random() * 500_000);
    out.push({ goods, shipping, special: shipping });
    out.push({ goods, shipping, special: Math.floor(random() * (shipping + 1)) });
  }
  // The largest amounts the integer columns can hold.
  out.push({ goods: 2_000_000_000, shipping: 0, special: 0 });
  out.push({ goods: 2_075_000_000, shipping: 0, special: 0 });
  return out;
}

describe("T-175 COD amount formula (version 2)", () => {
  it("never leaves the seller below the goods value, at every discount including none", () => {
    const failures: Case[] = [];
    for (const item of cases()) {
      const cod = calculateCodAmounts(item.goods, item.shipping).providerCodAmountIdr;
      if (!sellerNetsGoods(cod, item.special, item.goods)) failures.push(item);
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it("is the smallest whole rupiah whose net of Mengantar's fee covers goods plus shipping", () => {
    const failures: Case[] = [];
    for (const item of cases()) {
      const cod = calculateCodAmounts(item.goods, item.shipping).providerCodAmountIdr;
      const covers = (amount: number) => NET * b(amount) >= SCALE * (b(item.goods) + b(item.shipping));
      // At zero discount "covers goods + shipping" is exactly "seller nets the
      // goods", so this is also minimality of the payout property there.
      const zeroDiscountMinimal =
        item.special !== item.shipping || !sellerNetsGoods(cod - 1, item.special, item.goods);
      if (!covers(cod) || covers(cod - 1) || !zeroDiscountMinimal) failures.push(item);
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it("splits the markup into fee and VAT that sum to it, with VAT 11% of the fee to the rupiah", () => {
    const failures: Case[] = [];
    for (const item of cases()) {
      const amounts = calculateCodAmounts(item.goods, item.shipping);
      const markup = amounts.providerCodAmountIdr - item.goods - item.shipping;
      const vatDeviationHundredths = Math.abs(amounts.vatAmountIdr * 100 - amounts.serviceFeeIdr * 11);
      if (
        amounts.serviceFeeIdr + amounts.vatAmountIdr !== markup
        || amounts.serviceFeeIdr < 0
        || amounts.vatAmountIdr < 0
        || amounts.serviceFeeIdr !== Number((b(markup) * b(100) + b(55)) / b(111))
        || vatDeviationHundredths > 55
        || amounts.codFormulaVersion !== 2
      ) {
        failures.push(item);
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it("gives the draft payout, with the fee rounded half-up, at least the goods value when shipping is not discounted", () => {
    const failures: Case[] = [];
    for (const item of cases()) {
      if (item.shipping === 0 || item.special !== item.shipping) continue;
      const cod = calculateCodAmounts(item.goods, item.shipping).providerCodAmountIdr;
      const money = deriveDraftProviderMoneyLines(
        { codFeeIdr: 0, discountIdr: null, normalPriceIdr: item.shipping, shippingAmountIdr: item.shipping, specialPriceIdr: null },
        cod,
      );
      if (money.estimatedSellerPayoutIdr === null || money.estimatedSellerPayoutIdr < item.goods) failures.push(item);
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it("reproduces the defect it replaces: the additive rule left the seller short at zero discount", () => {
    const goods = 100_000;
    const shipping = 10_000;
    const fee = Math.floor(((goods + shipping) * 3 + 50) / 100);
    const additiveCod = goods + shipping + fee + Math.floor((fee * 11 + 50) / 100);
    expect(additiveCod).toBe(113_663);
    expect(sellerNetsGoods(additiveCod, shipping, goods)).toBe(false);

    expect(calculateCodAmounts(goods, shipping)).toEqual({
      codFormulaVersion: 2,
      goodsValueIdr: 100_000,
      shippingAmountIdr: 10_000,
      serviceFeeIdr: 3_414,
      vatAmountIdr: 376,
      providerCodAmountIdr: 113_790,
    });
    // 113 790 − 3 789 (3.33%, half-up) − 10 000 shipping.
    expect(mengantarCodFeeIdr(113_790)).toBe(3_789);
    expect(sellerNetsGoods(113_790, shipping, goods)).toBe(true);
    expect(sellerNetsGoods(113_789, shipping, goods)).toBe(false);
  });

  it("uses the fee rate the provider evidence records", async () => {
    const evidence = JSON.parse(
      await readFile(new URL("./fixtures/mengantar-cod-identities.json", import.meta.url), "utf8"),
    ) as { codOrdersInspected: number; holds: Record<string, number> };
    expect(evidence.codOrdersInspected).toBeGreaterThan(0);
    expect(evidence.holds.codFeeIsExactly333BasisPointsOfCodAmount).toBe(evidence.codOrdersInspected);
    expect(evidence.holds.storedEstimatedPriceIsPricePlusCodFee).toBe(evidence.codOrdersInspected);
    expect(mengantarCodFeeIdr(10_000)).toBe(333);
  });
});

/**
 * T-193: one "Biaya COD". Every surface shows Mengantar's fee on the COD amount,
 * the VAT only as the part already inside it, and the lines add up to the COD
 * amount with the round-up shown on its own.
 */
describe("T-193 one COD fee", () => {
  it("adds up every version 2 amount as goods + shipping + Mengantar's fee + a round-up of 0 or 1", () => {
    const roundings = new Set<number>();
    for (const { goods, shipping } of cases()) {
      const amounts = calculateCodAmounts(goods, shipping);
      const charge = codChargeBreakdown(amounts);
      if (
        charge === null
        || charge.codFeeIdr !== mengantarCodFeeIdr(amounts.providerCodAmountIdr)
        || charge.goodsValueIdr + charge.shippingAmountIdr + charge.codFeeIdr + charge.roundingIdr !== amounts.providerCodAmountIdr
        || charge.roundingIdr < 0 || charge.roundingIdr > 1
      ) {
        throw new Error(`breakdown does not add up: ${JSON.stringify({ goods, shipping, amounts, charge })}`);
      }
      roundings.add(charge.roundingIdr);
    }
    expect([...roundings].sort()).toEqual([0, 1]);
    expect(codChargeBreakdown({ goodsValueIdr: 100_000, shippingAmountIdr: 10_000, providerCodAmountIdr: 113_790 })).toEqual({
      goodsValueIdr: 100_000,
      shippingAmountIdr: 10_000,
      codFeeIdr: 3_789,
      codFeeVatIncludedIdr: 375,
      roundingIdr: 1,
      providerCodAmountIdr: 113_790,
    });
  });

  it("has no honest breakdown for a version 1 amount, which is below goods + shipping + Mengantar's fee", () => {
    // 100 000 + 10 000 + round(113 663 × 0.0333) = 113 785 > 113 663.
    expect(codChargeBreakdown({ goodsValueIdr: 100_000, shippingAmountIdr: 10_000, providerCodAmountIdr: 113_663 })).toBeNull();
  });

  it("reports the VAT inside the fee as fee × 11 / 111, half-up, never more than the fee", () => {
    for (let fee = 0; fee <= 200_000; fee += 1) {
      const vat = vatIncludedInMengantarCodFeeIdr(fee);
      const doubled = b(fee) * b(22);
      // |vat − fee·11/111| ≤ 1/2, exactly: |222·vat − 22·fee| ≤ 111 — and never a tie.
      const distance = b(222) * b(vat) - doubled;
      if (distance > b(111) || distance < b(-111) || distance === b(111) || vat > fee) {
        throw new Error(`VAT share off at fee ${fee}: ${vat}`);
      }
    }
    expect(vatIncludedInMengantarCodFeeIdr(3_789)).toBe(375);
    expect(vatIncludedInMengantarCodFeeIdr(333)).toBe(33);
  });
});

/**
 * Binds the TypeScript formula to the database CHECKs on the real table
 * definition (copied with its constraints into a temporary table, so no tenant
 * graph is needed): every application row is accepted, every one-rupiah
 * deviation from it is refused, and version 1 rows stay accepted.
 */
describe("T-175 COD formula: application and database agree", () => {
  const insertSql = `INSERT INTO cod_formula_probe (
    id, tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
    goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
    provider_cod_amount_idr, cod_formula_version
  ) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'IDR', $1, $2, $3, $4, $5, $6)`;

  type Row = { goods: number; shipping: number; fee: number; vat: number; cod: number; version: number };

  async function withProbe(work: (accepts: (row: Row) => Promise<boolean>) => Promise<void>) {
    const client = await adminPool.connect();
    try {
      await client.query("CREATE TEMP TABLE cod_formula_probe (LIKE shipment_cod_totals INCLUDING CONSTRAINTS INCLUDING DEFAULTS)");
      const accepts = async (row: Row) => {
        await client.query("SAVEPOINT probe");
        try {
          await client.query(insertSql, [row.goods, row.shipping, row.fee, row.vat, row.cod, row.version]);
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
      await client.query("DROP TABLE IF EXISTS cod_formula_probe").catch(() => undefined);
      client.release();
    }
  }

  it("carries the version checks on the live table", async () => {
    const { rows } = await adminPool.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'shipment_cod_totals'::regclass AND contype = 'c' AND convalidated
       ORDER BY conname`,
    );
    expect(rows.map((row) => row.conname)).toEqual(expect.arrayContaining([
      "shipment_cod_totals_formula_version_known",
      "shipment_cod_totals_provider_cod_amount_exact",
      "shipment_cod_totals_provider_cod_amount_gross_up_v2",
      "shipment_cod_totals_service_fee_exact",
      "shipment_cod_totals_service_fee_split_v2",
      "shipment_cod_totals_vat_exact",
    ]));
  });

  it("accepts every application amount and refuses every one-rupiah deviation from it", async () => {
    const random = prng(9_667);
    const pairs: [number, number][] = [[1, 0], [100_000, 10_000], [2_000_000_000, 0]];
    for (let goods = 1; goods <= 120; goods += 1) pairs.push([goods, goods % 3 === 0 ? 0 : 9_000]);
    for (let index = 0; index < 120; index += 1) {
      pairs.push([1 + Math.floor(random() * 50_000_000), Math.floor(random() * 500_000)]);
    }

    await withProbe(async (accepts) => {
      const refusedWrongly: Row[] = [];
      const acceptedWrongly: Row[] = [];
      for (const [goods, shipping] of pairs) {
        const amounts = calculateCodAmounts(goods, shipping);
        const row: Row = {
          goods,
          shipping,
          fee: amounts.serviceFeeIdr,
          vat: amounts.vatAmountIdr,
          cod: amounts.providerCodAmountIdr,
          version: COD_FORMULA_VERSION,
        };
        if (!(await accepts(row))) refusedWrongly.push(row);
        const deviations: Row[] = [
          // COD one rupiah lower or higher, VAT absorbing it so the sum still holds.
          { ...row, cod: row.cod - 1, vat: row.vat - 1 },
          { ...row, cod: row.cod + 1, vat: row.vat + 1 },
          // Same COD, the split moved by one rupiah either way.
          { ...row, fee: row.fee + 1, vat: row.vat - 1 },
          { ...row, fee: row.fee - 1, vat: row.vat + 1 },
          // The sum broken.
          { ...row, vat: row.vat + 1 },
          // An unknown version.
          { ...row, version: 3 },
        ].filter((deviation) => deviation.fee >= 0 && deviation.vat >= 0 && deviation.cod > 0);
        for (const deviation of deviations) {
          if (await accepts(deviation)) acceptedWrongly.push(deviation);
        }
      }
      expect(refusedWrongly).toEqual([]);
      expect(acceptedWrongly).toEqual([]);
    });
  });

  it("keeps a version 1 row valid, refuses it relabelled as version 2, and defaults an unnamed version to 1", async () => {
    await withProbe(async (accepts) => {
      const historical: Row = { goods: 100_000, shipping: 10_000, fee: 3_300, vat: 363, cod: 113_663, version: 1 };
      expect(await accepts(historical)).toBe(true);
      expect(await accepts({ ...historical, version: 2 })).toBe(false);
      const current = calculateCodAmounts(100_000, 10_000);
      expect(await accepts({
        goods: 100_000, shipping: 10_000, fee: current.serviceFeeIdr, vat: current.vatAmountIdr, cod: current.providerCodAmountIdr, version: 1,
      })).toBe(false);
    });
    const { rows } = await adminPool.query<{ column_default: string }>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'shipment_cod_totals' AND column_name = 'cod_formula_version'`,
    );
    expect(rows[0]?.column_default).toBe("1");
  });
});
