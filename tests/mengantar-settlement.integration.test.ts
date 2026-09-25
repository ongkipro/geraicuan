import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchMengantarSettlement,
  MengantarSettlementError,
  MengantarSettlementTooLargeError,
  normalizeMengantarInvoicePage,
  normalizeMengantarOrderPage,
  parseMengantarWibTimestamp,
} from "@/lib/mengantar-settlement";
import { providerSettlementAccountKey } from "@/db/provider-settlement-repository";
import { validateMengantarTransportScope } from "@/lib/mengantar-order";

const invoices = JSON.parse(readFileSync("tests/fixtures/mengantar-invoices.sanitized.json", "utf8"));
const orders = JSON.parse(readFileSync("tests/fixtures/mengantar-orders.sanitized.json", "utf8"));
const orderContract = JSON.parse(readFileSync("tests/fixtures/mengantar-order-contract.shape.json", "utf8"));
const credentials = { apiKey: "SECRET-KEY-must-never-leak", baseUrl: "https://provider.example.test", pickupAddressId: "pickup" };
const period = { start: new Date("2026-09-01T00:00:00+07:00"), end: new Date("2026-10-01T00:00:00+07:00") };
const clone = <T>(value: T): T => structuredClone(value);

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json; charset=utf-8" }, ...init });
}

afterEach(() => vi.unstubAllGlobals());

describe("Mengantar settlement contract", () => {
  it("keeps the verified payout identity in the sanitized fixture", () => {
    // Compared in ten-thousandths of a rupiah: the fixture carries fractional amounts, as real invoices do.
    const units = (value: number) => Math.round(value * 10_000);
    for (const invoice of invoices.reconciliation.data) {
      const subItems = invoice.subItems as { amount: number; COD_AMOUNT: number; COD_FEE: number; estimatedSpecialPrice: number }[];
      expect(subItems.reduce((sum, item) => sum + units(item.amount), 0)).toBe(units(invoice.amount));
      for (const item of subItems) {
        expect(units(item.amount)).toBe(units(item.COD_AMOUNT) - units(item.estimatedSpecialPrice));
        expect(units(item.COD_FEE)).toBe(item.COD_AMOUNT * 333);
        // T-178: the deducted price is shipping plus the fee, never below the fee.
        expect(units(item.estimatedSpecialPrice)).toBeGreaterThanOrEqual(units(item.COD_FEE));
      }
    }
  });

  it("normalizes per-AWB settlement items and discards receiver PII", () => {
    const page = normalizeMengantarInvoicePage(invoices.reconciliation, "SETTLEMENT");
    expect(page.count).toBe(2);
    expect(page.items).toHaveLength(3);
    expect(page.items[0]).toMatchObject({
      itemType: "SETTLEMENT",
      providerInvoiceId: "SANITIZEDINVOICE0001",
      invoiceNumber: "SANITIZED-INV-0001",
      invoiceStatus: "statusCleared",
      cnoteNo: "SANITIZED-CNOTE-0001",
      amountIdr: "99878.0221",
      codAmountIdr: 113663,
      codFeeIdr: "3784.9779",
      shippingAmountIdr: "13784.9779",
    });
    expect(page.items[0].invoiceCreatedAt.toISOString()).toBe("2026-09-10T03:00:00.000Z");
    expect(JSON.stringify(page)).not.toMatch(/SENTINEL/);
  });

  it("reads return charges per AWB and refunds only as in-memory AWB tokens", () => {
    const charges = normalizeMengantarInvoicePage(invoices.payment, "CHARGE");
    expect(charges.items).toEqual([expect.objectContaining({ itemType: "CHARGE", cnoteNo: "SANITIZED-CNOTE-0003", amountIdr: "-9000.0000", shippingAmountIdr: "9000.0000" })]);
    const refunds = normalizeMengantarInvoicePage(invoices.refund, "REFUND");
    expect(refunds.items).toEqual([]);
    expect(refunds.refunds).toEqual([expect.objectContaining({ amountIdr: "-40000.0000", referenceTokens: ["SANITIZED-CNOTE-0004"] })]);
    const lowercase = clone(invoices.refund);
    lowercase.data[0].description = "Claim approved for damaged or lost order jne00000000abc1";
    expect(normalizeMengantarInvoicePage(lowercase, "REFUND").refunds[0].referenceTokens).toEqual(["jne00000000abc1"]);
  });

  it("fails closed when a reconciliation invoice does not add up or the shape drifts", () => {
    const unbalanced = clone(invoices.reconciliation);
    unbalanced.data[0].amount += 1;
    expect(() => normalizeMengantarInvoicePage(unbalanced, "SETTLEMENT")).toThrow(MengantarSettlementError);
    // Exact to the ten-thousandth: one ten-thousandth of a rupiah off is not "close enough".
    const offByOneUnit = clone(invoices.reconciliation);
    offByOneUnit.data[0].amount = 197756.0443;
    expect(() => normalizeMengantarInvoicePage(offByOneUnit, "SETTLEMENT")).toThrow(MengantarSettlementError);

    const wrongType = clone(invoices.reconciliation);
    wrongType.data[0].type = "typeWithdraw";
    expect(() => normalizeMengantarInvoicePage(wrongType, "SETTLEMENT")).toThrow(MengantarSettlementError);

    const unsafeAwb = clone(invoices.reconciliation);
    unsafeAwb.data[1].subItems[0].cnote_no = "../../etc";
    expect(() => normalizeMengantarInvoicePage(unsafeAwb, "SETTLEMENT")).toThrow(MengantarSettlementError);

    // T-178: fractions to four places are real data; anything past that, or outside the range, is not.
    for (const [field, value] of [
      ["amount", 48002.00001], ["amount", Number.NaN], ["amount", Number.POSITIVE_INFINITY], ["amount", "48002"],
      ["amount", 10_000_000_000], ["estimatedSpecialPrice", 11998.00005], ["estimatedSpecialPrice", -1],
      ["COD_FEE", 1998.12345], ["COD_FEE", -0.01], ["COD_AMOUNT", 60000.5],
    ] as const) {
      const drifted = clone(invoices.reconciliation);
      drifted.data[1].subItems[0][field] = value;
      if (field === "amount" && typeof value === "number" && Number.isFinite(value)) drifted.data[1].amount = value;
      expect(() => normalizeMengantarInvoicePage(drifted, "SETTLEMENT"), `${field}=${String(value)}`).toThrow(MengantarSettlementError);
    }

    expect(() => normalizeMengantarInvoicePage({ ...invoices.reconciliation, success: false }, "SETTLEMENT")).toThrow(MengantarSettlementError);
  });

  it("T-223: reads lastHistory desc/time (WIB) and pod_code from the captured record shape", () => {
    const [first, second, third] = clone(orders.list.data);
    // Captured values: lastHistory {date "05-09-2026 16:16", desc, code "D02"}, pod_code "D02".
    first.lastHistory = orderContract.fields.lastHistory.shape;
    first.pod_code = orderContract.fields.pod_code.shape;
    second.lastHistory = { date: "31-02-2026 10:00", desc: "  \n " };
    second.pod_code = { nested: true };
    third.lastHistory = "not an object";
    third.pod_code = 402;
    const page = normalizeMengantarOrderPage({ ...orders.list, data: [first, second, third] });

    expect(page.orders[0]).toMatchObject({
      lastHistoryDesc: orderContract.fields.lastHistory.shape.desc,
      lastHistoryAt: new Date("2026-09-05T09:16:00.000Z"),
      podCode: "D02",
    });
    expect(page.orders[1]).toMatchObject({ status: "RTS", lastHistoryDesc: null, lastHistoryAt: null, podCode: null });
    expect(page.orders[2]).toMatchObject({ lastHistoryDesc: null, lastHistoryAt: null, podCode: "402" });
  });

  it.each([
    ["05-09-2026 16:16", "2026-09-05T09:16:00.000Z"],
    ["01-01-2026 03:00:30", "2025-12-31T20:00:30.000Z"],
    ["2026-09-05T16:16:00Z", null],
    ["05-09-2026", null],
    ["32-01-2026 10:00", null],
    ["29-02-2026 10:00", null],
    ["05-09-2026 24:00", null],
    [null, null],
    [1_757_000_000, null],
  ])("parses Mengantar WIB time %j defensively", (value, expected) => {
    const parsed = parseMengantarWibTimestamp(value);
    expect(parsed?.toISOString() ?? null).toBe(expected);
  });

  it("keeps order statuses with an AWB, skips deleted orders and drops PII", () => {
    const page = normalizeMengantarOrderPage(orders.list);
    expect(page.pageLength).toBe(5);
    // T-223: this capture carries no `lastHistory`/`pod_code`, so the new evidence fields are null.
    const noHistory = { lastHistoryDesc: null, lastHistoryAt: null, podCode: null };
    expect(page.orders).toEqual([
      { cnoteNo: "SANITIZED-CNOTE-0005", status: "DELIVERED", ...noHistory },
      { cnoteNo: "SANITIZED-CNOTE-0003", status: "RTS", ...noHistory },
      { cnoteNo: "SANITIZED-CNOTE-0006", status: "UNDELIVERED", ...noHistory },
    ]);
    expect(JSON.stringify(page)).not.toMatch(/SENTINEL/);
  });

  it("pages every invoice type and orders with GET, the period and no credential in errors", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL, init: RequestInit) => {
      expect(init.method ?? "GET").toBe("GET");
      expect(init.redirect).toBe("error");
      const url = new URL(input);
      requests.push(url);
      if (url.pathname.endsWith("/order")) return jsonResponse(orders.list);
      const type = url.searchParams.get("invoiceFilter");
      return jsonResponse(type === "typeReconciliation" ? invoices.reconciliation : type === "typePayment" ? invoices.payment : invoices.refund);
    }));

    const snapshot = await fetchMengantarSettlement(credentials, period);
    expect(requests.map((url) => url.searchParams.get("invoiceFilter") ?? "order")).toEqual(["typeReconciliation", "typePayment", "typeRefund", "order"]);
    for (const url of requests) {
      expect(url.pathname.startsWith(`/api/public/${credentials.apiKey}/`)).toBe(true);
      expect(JSON.parse(url.searchParams.get("dateRange")!)).toEqual({ startDate: "2026-08-31T17:00:00.000Z", endDate: "2026-09-30T16:59:59.999Z" });
    }
    expect(snapshot).toMatchObject({ invoiceCount: 5, orderCount: 5 });
    expect(snapshot.items).toHaveLength(4);
    expect(snapshot.items.map((item) => item.amountIdr)).toEqual(["99878.0221", "97878.0221", "48002.0000", "-9000.0000"]);
    expect(snapshot.refunds).toHaveLength(1);
    expect(snapshot.orderStatuses).toHaveLength(3);
  });

  it("follows invoice pages until count is reached and refuses an unbounded account", async () => {
    const fullPage = { success: true, count: 120, data: Array.from({ length: 50 }, (_, index) => ({ ...clone(invoices.refund.data[0]), _id: `SANITIZEDREFUND${index}` })) };
    const lastPage = { success: true, count: 120, data: fullPage.data.slice(0, 20) };
    const pages: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
      const url = new URL(input);
      const filter = url.searchParams.get("invoiceFilter");
      pages.push(`${filter ?? "order"}:${url.searchParams.get("page")}`);
      if (url.pathname.endsWith("/order")) return jsonResponse({ success: true, count: 0, data: [] });
      if (filter !== "typeRefund") return jsonResponse({ success: true, count: 0, data: [] });
      return jsonResponse(url.searchParams.get("page") === "3" ? lastPage : fullPage);
    }));
    const snapshot = await fetchMengantarSettlement(credentials, period);
    expect(pages).toEqual(["typeReconciliation:1", "typePayment:1", "typeRefund:1", "typeRefund:2", "typeRefund:3", "order:1"]);
    expect(snapshot.refunds).toHaveLength(120);

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ success: true, count: 1_000_000, data: fullPage.data.map((invoice) => ({ ...invoice, type: "typeReconciliation", subItems: [], amount: 0 })) })));
    await expect(fetchMengantarSettlement(credentials, period)).rejects.toThrow(MengantarSettlementTooLargeError);
  });

  it("refuses a short page before count is reached instead of reporting partial data", async () => {
    const shortInvoices = { success: true, count: 30, data: invoices.refund.data };
    vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/order")) return jsonResponse({ success: true, count: 0, data: [] });
      return jsonResponse(url.searchParams.get("invoiceFilter") === "typeRefund" ? shortInvoices : { success: true, count: 0, data: [] });
    }));
    await expect(fetchMengantarSettlement(credentials, period)).rejects.toThrow(MengantarSettlementError);

    vi.stubGlobal("fetch", vi.fn(async (input: URL) => new URL(input).pathname.endsWith("/order")
      ? jsonResponse({ ...orders.list, count: 80 })
      : jsonResponse({ success: true, count: 0, data: [] })));
    await expect(fetchMengantarSettlement(credentials, period)).rejects.toThrow(MengantarSettlementError);
  });

  it("maps transport, status and content-type failures to one credential-free error", async () => {
    for (const failure of [
      async () => { throw new TypeError(`fetch failed for https://provider.example.test/api/public/${credentials.apiKey}/invoices`); },
      async () => jsonResponse({ success: true }, { status: 500 }),
      async () => new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }),
    ]) {
      vi.stubGlobal("fetch", vi.fn(failure));
      const error = await fetchMengantarSettlement(credentials, period).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(MengantarSettlementError);
      expect(String((error as Error).message) + String((error as Error).stack)).not.toContain(credentials.apiKey);
    }
  });
  it("derives the same Mengantar account key as order batches for both credential sources", () => {
    const tenantId = "00000000-0000-4000-8000-000000004601";
    const outletId = "00000000-0000-4000-8000-000000004611";
    for (const credentialSource of ["platform_default", "private"] as const) {
      const scope = { tenantId, outletId, pickupAddressId: "pickup", courier: "JNE", credentialSource };
      const accountIdentity = credentialSource === "platform_default" ? "platform_default" : `managed://mengantar/${tenantId}/${outletId}`;
      const { providerAccountKey } = validateMengantarTransportScope(scope, { ...scope, accountIdentity, transport: {} });
      expect(providerSettlementAccountKey(tenantId, outletId, credentialSource)).toBe(providerAccountKey);
    }
  });
});

/**
 * T-178: invoices shaped like the owner's real ones. 1,016 of 2,866 real COD
 * subItems and 202 of 600 real invoices carry a fraction, because the price
 * Mengantar deducts is shipping plus `COD × 0.0333` unrounded. The amounts
 * here are synthetic and deterministic; the shape — round-thousand and
 * grossed-up (T-175) COD amounts, one to four decimal places, several AWBs per
 * invoice — is the real one. Each is encoded twice: as exact decimal JSON text,
 * and as a JavaScript backend would emit it after computing in doubles.
 */
describe("T-178 fractional settlement invoices", () => {
  function realShapedInvoices(encoding: "decimal" | "double") {
    let seed = 178;
    const next = (bound: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % bound;
    };
    const expected: { cnote: string; amount: bigint; special: bigint; fee: bigint }[] = [];
    const texts: string[] = [];
    const text = (units: bigint) => {
      const negative = units < BigInt(0);
      const magnitude = negative ? -units : units;
      return `${negative ? "-" : ""}${magnitude / BigInt(10_000)}.${String(magnitude % BigInt(10_000)).padStart(4, "0")}`;
    };
    for (let invoiceIndex = 0; invoiceIndex < 600; invoiceIndex += 1) {
      const subItems: string[] = [];
      let totalUnits = BigInt(0);
      let totalDouble = 0;
      const count = 1 + next(8);
      for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
        const goods = 25_000 + next(400) * 1_000;
        const shipping = 4_000 + next(36) * 500;
        const cod = next(2) === 0 ? goods : Math.ceil(((goods + shipping) * 10_000) / 9_667);
        const special = shipping - next(3) * 500;
        const feeUnits = BigInt(cod) * BigInt(333);
        const specialUnits = BigInt(special) * BigInt(10_000) + feeUnits;
        const amountUnits = BigInt(cod) * BigInt(10_000) - specialUnits;
        totalUnits += amountUnits;
        const cnote = `SANITIZED-${invoiceIndex}-${itemIndex}`;
        expected.push({ cnote, amount: amountUnits, special: specialUnits, fee: feeUnits });
        if (encoding === "decimal") {
          subItems.push(`{"cnote_no":"${cnote}","amount":${text(amountUnits)},"COD_AMOUNT":${cod},"COD_FEE":${text(feeUnits)},"estimatedSpecialPrice":${text(specialUnits)},"RECEIVER_NAME":"SENTINEL"}`);
        } else {
          const fee = cod * 0.0333;
          const specialPrice = special + fee;
          const amount = cod - specialPrice;
          totalDouble += amount;
          subItems.push(JSON.stringify({ cnote_no: cnote, amount, COD_AMOUNT: cod, COD_FEE: fee, estimatedSpecialPrice: specialPrice, RECEIVER_NAME: "SENTINEL" }));
        }
      }
      const total = encoding === "decimal" ? text(totalUnits) : JSON.stringify(totalDouble);
      texts.push(`{"_id":"SANITIZEDREAL${invoiceIndex}","inv_number":"SANITIZED-REAL-${invoiceIndex}","type":"typeReconciliation","status":"statusCleared","createdAt":"2026-09-10T03:00:00.000Z","amount":${total},"subItems":[${subItems.join(",")}]}`);
    }
    return { page: JSON.parse(`{"success":true,"count":600,"data":[${texts.join(",")}]}`), expected, text };
  }

  /**
   * T-178 review: floating-point noise scales with the numbers a provider
   * computes *from*, not with the result. A small COD close to shipping plus
   * fee — `10007 − (9000 + 10007 × 0.0333)` is `673.7669000000005` — kept its
   * noise through a read at 15 significant digits of the result and was
   * refused, and one refused line aborts the whole pull. The real-shaped
   * invoices above use goods from 25,000 and at most eight lines, so they never
   * produced it.
   */
  it("accepts binary noise on small COD lines and long invoices, and still refuses a genuine fifth decimal", () => {
    const line = (cnote: string, cod: number, shipping: number) => {
      const fee = cod * 0.0333;
      const special = shipping + fee;
      return { cnote_no: cnote, amount: cod - special, COD_AMOUNT: cod, COD_FEE: fee, estimatedSpecialPrice: special, RECEIVER_NAME: "SENTINEL" };
    };
    const invoice = (id: number, lines: ReturnType<typeof line>[]) => ({
      _id: `SANITIZEDSMALL${id}`,
      inv_number: `SANITIZED-SMALL-${id}`,
      type: "typeReconciliation",
      status: "statusCleared",
      createdAt: "2026-09-10T03:00:00.000Z",
      amount: lines.reduce((sum, item) => sum + item.amount, 0),
      subItems: lines,
    });

    const reviewerCase = normalizeMengantarInvoicePage(
      { success: true, count: 1, data: [invoice(0, [line("SANITIZED-SMALL-0", 10_007, 9_000)])] },
      "SETTLEMENT",
    );
    expect(reviewerCase.items[0].amountIdr).toBe("673.7669");

    // Every small COD from 5,000 to 60,000 against a shipping price close to
    // it, in invoices of 40 lines whose totals are summed in doubles too.
    const invoices = [];
    let pending: ReturnType<typeof line>[] = [];
    let id = 1;
    for (let cod = 5_000; cod <= 60_000; cod += 7) {
      const shipping = Math.max(0, Math.floor(cod * 0.9) - (cod % 500));
      if (cod - shipping - cod * 0.0333 <= 0) continue;
      pending.push(line(`SANITIZED-SMALL-${id}-${cod}`, cod, shipping));
      if (pending.length === 40) {
        invoices.push(invoice(id, pending));
        pending = [];
        id += 1;
      }
    }
    expect(invoices.length).toBeGreaterThan(150);
    const normalized = normalizeMengantarInvoicePage({ success: true, count: invoices.length, data: invoices }, "SETTLEMENT");
    expect(normalized.items).toHaveLength(invoices.length * 40);
    expect(JSON.stringify(normalized)).not.toMatch(/SENTINEL/);

    // Noise is not a licence for a fifth decimal: that is still refused.
    const fifthDecimal = invoice(9_999, [{ ...line("SANITIZED-SMALL-FIFTH", 10_007, 9_000), amount: 673.76695 }]);
    fifthDecimal.amount = 673.76695;
    expect(() => normalizeMengantarInvoicePage({ success: true, count: 1, data: [fifthDecimal] }, "SETTLEMENT"))
      .toThrow();
  });

  for (const encoding of ["decimal", "double"] as const) {
    it(`parses every real-shaped fractional invoice (${encoding} JSON) without loss and reconciles each total exactly`, () => {
      const { page, expected, text } = realShapedInvoices(encoding);
      const fractionalItems = expected.filter((item) => item.amount % BigInt(10_000) !== BigInt(0)).length;
      const invoicesWithFraction = (page.data as { subItems: { amount: number }[] }[])
        .filter((invoice) => invoice.subItems.some((item) => !Number.isInteger(item.amount))).length;
      // The shape the owner's account has: many fractions, not a curiosity.
      expect(fractionalItems).toBeGreaterThan(expected.length / 4);
      expect(invoicesWithFraction).toBeGreaterThan(100);
      const binaryNoise = (page.data as { subItems: { COD_FEE: number }[] }[])
        .flatMap((invoice) => invoice.subItems)
        .filter((item) => (String(item.COD_FEE).split(".")[1] ?? "").length > 4).length;
      // The double encoding really carries noise past the fourth decimal; the decimal one never does.
      if (encoding === "double") expect(binaryNoise).toBeGreaterThan(0);
      else expect(binaryNoise).toBe(0);

      const normalized = normalizeMengantarInvoicePage(page, "SETTLEMENT");
      expect(normalized.items).toHaveLength(expected.length);
      normalized.items.forEach((item, index) => {
        expect(item.cnoteNo).toBe(expected[index].cnote);
        expect(item.amountIdr).toBe(text(expected[index].amount));
        expect(item.shippingAmountIdr).toBe(text(expected[index].special));
        expect(item.codFeeIdr).toBe(text(expected[index].fee));
      });
      expect(JSON.stringify(normalized)).not.toMatch(/SENTINEL/);
    });
  }
});
