import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { codChargeBreakdown } from "@/lib/mengantar-cod-fee";
import { deriveDraftProviderMoneyLines } from "@/lib/shipment-draft-logic";
import type { ProviderOrderSource } from "@/db/order-batch-repository";
import {
  buildMengantarOrderRequest,
  MengantarOrderPayloadError,
} from "@/lib/mengantar-order";
import {
  MengantarEstimateError,
  normalizeMengantarEstimateServices,
} from "@/lib/mengantar-estimate";
import {
  normalizePartyPhone,
  toBillableWeightKg,
  validateShipmentDraft,
  ShipmentWeightUnavailableError,
} from "@/lib/shipment-draft";

function submission(values: Record<string, string> = {}) {
  const formData = new FormData();
  const defaults: Record<string, string> = {
    declaredValue: "150.000",
    destinationAreaId: "3171010",
    destinationAreaLabel: "Gambir, Jakarta Pusat",
    outletId: "00000000-0000-4000-8000-000000000111",
    packageContent: "Pakaian",
    packageQuantity: "1",
    packageWeightGrams: "500",
    paymentType: "NON_COD",
    recipientAddress: "Jl. Medan Merdeka Barat 1",
    recipientName: "Penerima",
    recipientPhone: "081234567890",
    senderAddress: "Jl. Asia Afrika 8",
    senderName: "Pengirim",
    senderPhone: "081212345678",
    ...values,
  };
  for (const [key, value] of Object.entries(defaults)) formData.set(key, value);
  return formData;
}

const providerOrder: ProviderOrderSource = {
  shipmentId: "00000000-0000-4000-8000-000000000152",
  pickupAddressId: "pickup-fixture",
  courier: "JNE",
  providerService: "JNE",
  senderName: "Pengirim",
  senderPhone: "081212345678",
  senderAddress: "Jl. Asia Afrika 8",
  recipientName: "Penerima",
  recipientPhone: "081234567890",
  recipientAddress: "Jl. Medan Merdeka Barat 1",
  destinationAreaId: "3171010",
  destinationAreaLabel: "Gambir, Jakarta Pusat",
  destinationAreaVerifiedAt: new Date("2026-09-16T00:00:00.000Z"),
  packageContent: "Pakaian",
  weightGrams: 500,
  quantity: 1,
  declaredValueIdr: 150_000,
  isCod: false,
  providerCodAmountIdr: null,
  isHazardous: false,
  recipientAddressLandmark: null,
  shippingInstruction: null,
  handoverType: "DROP_OFF",
  pickupVehicle: null,
  pickupDate: null,
  pickupSlot: null,
};

describe("PR-47 draft field parity", () => {
  it("validates the operational handling fields", () => {
    const validated = validateShipmentDraft(submission({
      isHazardous: "true",
      recipientAddressLandmark: "Seberang masjid, pagar hijau",
      shippingInstruction: "Titip ke satpam bila rumah kosong.",
    }));

    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.input).toMatchObject({
      isHazardous: true,
      recipientAddressLandmark: "Seberang masjid, pagar hijau",
      shippingInstruction: "Titip ke satpam bila rumah kosong.",
    });
  });

  it("rejects an oversized or control-bearing instruction and landmark", () => {
    const tooLong = validateShipmentDraft(submission({
      recipientAddressLandmark: "x".repeat(161),
      shippingInstruction: "y".repeat(501),
    }));
    expect(tooLong.ok).toBe(false);
    if (tooLong.ok) return;
    expect(tooLong.errors.shippingInstruction).toBeTruthy();
    expect(tooLong.errors.recipientAddressLandmark).toBeTruthy();

    const control = validateShipmentDraft(submission({
      shippingInstruction: "Titip‮ke satpam",
    }));
    expect(control.ok).toBe(false);
  });
});

describe("PR-47 guard: one Indonesian phone form", () => {
  it.each([
    ["081234567890", "081234567890"],
    ["+6281234567890", "081234567890"],
    ["+62 812-3456-7890", "081234567890"],
    ["6281234567890", "081234567890"],
    ["81234567890", "081234567890"],
    ["(021) 5551234", "0215551234"],
  ])("converges %s on %s", (input, expected) => {
    expect(normalizePartyPhone(input)).toBe(expected);
  });

  it.each([
    "+6512345678",
    "+14155552671",
    "0012345678901",
    "0000000000",
    "0812345",
    "0812345678901234",
    "abc",
  ])("rejects the non-Indonesian shape %s", (input) => {
    expect(normalizePartyPhone(input)).toBeNull();
  });

  it("stores a draft's two spellings of one number identically", () => {
    const national = validateShipmentDraft(submission({ recipientPhone: "0812 3456 7890" }));
    const international = validateShipmentDraft(submission({ recipientPhone: "+62-812-3456-7890" }));
    expect(national.ok && international.ok).toBe(true);
    if (!national.ok || !international.ok) return;
    expect(national.input.recipientPhone).toBe(international.input.recipientPhone);
  });

  it("refuses a non-Indonesian recipient or sender before a draft exists", () => {
    const foreign = validateShipmentDraft(submission({ recipientPhone: "+6512345678" }));
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.errors.recipientPhone).toBeTruthy();
  });
});

describe("PR-47 guard: grams to billable kilograms", () => {
  it.each([
    [1, 1],
    [500, 1],
    [1_000, 1],
    [1_001, 2],
    [2_000, 2],
    [2_400, 3],
    [100_000, 100],
  ])("converts %i g to %i kg", (grams, kg) => {
    expect(toBillableWeightKg(grams)).toBe(kg);
  });

  it.each([0, -1, 1.5, Number.NaN, 100_001])("refuses %s grams", (grams) => {
    expect(() => toBillableWeightKg(grams)).toThrow(ShipmentWeightUnavailableError);
  });

  it("D-26: sends the documented weight in kg, exact from grams", () => {
    expect(buildMengantarOrderRequest({ ...providerOrder, weightGrams: 1 }).orders[0]!.weight).toBe(0.001);
    expect(buildMengantarOrderRequest({ ...providerOrder, weightGrams: 1_250 }).orders[0]!.weight).toBe(1.25);
    expect(buildMengantarOrderRequest({ ...providerOrder, weightGrams: 2_000 }).orders[0]!.weight).toBe(2);
    expect(() => buildMengantarOrderRequest({ ...providerOrder, weightGrams: 0 })).toThrow(MengantarOrderPayloadError);
  });
});

describe("PR-47 guard: COD amount and destination verification (documented body, D-26)", () => {
  it("refuses to submit a COD order without a COD total", () => {
    for (const providerCodAmountIdr of [null, 0]) {
      expect(() => buildMengantarOrderRequest({
        ...providerOrder,
        isCod: true,
        providerCodAmountIdr,
      })).toThrow(MengantarOrderPayloadError);
    }
  });

  it("sends the persisted COD total as `COD` and no `goodsValue`", () => {
    const [item] = buildMengantarOrderRequest({
      ...providerOrder,
      isCod: true,
      providerCodAmountIdr: 113_663,
    }).orders;
    expect(item).toMatchObject({ COD: 113_663 });
    expect(item).not.toHaveProperty("goodsValue");
  });

  it("sends a non-COD order's goods value as `goodsValue` and no `COD`", () => {
    const [item] = buildMengantarOrderRequest(providerOrder).orders;
    expect(item).toMatchObject({ goodsValue: providerOrder.declaredValueIdr });
    expect(item).not.toHaveProperty("COD");
  });

  it("refuses an area id that was never re-verified against the account", () => {
    expect(() => buildMengantarOrderRequest({
      ...providerOrder,
      destinationAreaVerifiedAt: null,
    })).toThrow(MengantarOrderPayloadError);
  });

  it("carries every operational field under its documented key", () => {
    const [item] = buildMengantarOrderRequest({
      ...providerOrder,
      isHazardous: true,
      recipientAddressLandmark: "Seberang masjid",
      shippingInstruction: "Titip ke satpam",
    }).orders;

    expect(item).toMatchObject({
      isDangerousGoods: true,
      destinationMark: "Seberang masjid",
      deliveryInstruction: "Titip ke satpam",
    });
  });

  it("omits the optional handling fields when the draft left them empty", () => {
    const [item] = buildMengantarOrderRequest(providerOrder).orders;
    expect(item!.isDangerousGoods).toBe(false);
    expect(item).not.toHaveProperty("destinationMark");
    expect(item).not.toHaveProperty("deliveryInstruction");
  });
});

describe("PR-47 estimate money ingestion", () => {
  it("ingests normal, special, COD fee and discount from the sandbox fixture", async () => {
    const fixture = JSON.parse(
      await readFile("tests/fixtures/mengantar-estimate.sandbox.json", "utf8"),
    ) as { response: { body: { data: unknown } } };

    const services = normalizeMengantarEstimateServices(fixture.response.body.data);
    const sapCargo = services.find((service) => service.providerService === "SapCargo");

    // T-237: a cargo key reads its cargo tier (`cargoDiscount`, `cargoEstimated*`).
    expect(sapCargo).toMatchObject({
      codFeeIdr: 0,
      discountIdr: 4_500,
      normalPriceIdr: 22_500,
      shippingAmountIdr: 22_500,
      specialPriceIdr: 16_875,
    });
  });

  it("keeps an omitted money key null instead of guessing zero", () => {
    const [service] = normalizeMengantarEstimateServices({
      JNE: { price: 8_000, estimate_delivery: "2 - 3 days", currency: "IDR" },
    });
    expect(service).toMatchObject({
      codFeeIdr: null,
      discountIdr: null,
      normalPriceIdr: null,
      specialPriceIdr: null,
    });
  });

  it.each([
    { codFee: -1 },
    { estimatedPrice: 1.5 },
    { estimatedSpecialPrice: 2_147_483_648 },
    // A special price above the normal price means the keys do not mean what
    // this contract assumes, so the service is dropped rather than persisted.
    { estimatedPrice: 8_000, estimatedSpecialPrice: 9_000 },
  ])("fails a malformed money value closed when it prices the shipment: %j", (overrides) => {
    expect(() => normalizeMengantarEstimateServices({
      JNE: {
        price: 8_000,
        estimate_delivery: "2 - 3 days",
        currency: "IDR",
        ...overrides,
      },
    })).toThrow(MengantarEstimateError);
  });

  // `discount` is display-only: nothing prices the shipment or computes the
  // seller payout from it, so a malformed value degrades to null instead of
  // dropping an otherwise correctly-priced courier.
  it.each([{ discount: "2400" }, { discount: -1 }, { discount: 1.5 }])(
    "degrades a malformed display-only discount to null instead of dropping the service: %j",
    (overrides) => {
      const [service] = normalizeMengantarEstimateServices({
        JNE: {
          price: 8_000,
          estimate_delivery: "2 - 3 days",
          currency: "IDR",
          codFee: 0,
          estimatedPrice: 8_000,
          estimatedSpecialPrice: 5_600,
          ...overrides,
        },
      });
      expect(service).toMatchObject({
        providerService: "JNE",
        normalPriceIdr: 8_000,
        specialPriceIdr: 5_600,
        discountIdr: null,
      });
    },
  );
});

describe("PR-47 seller payout", () => {
  // T-175: COD 113 790 is formula version 2 for goods 100 000 + shipping
  // 10 000. Mengantar keeps the special price plus 3.33% of the COD amount
  // (3 789.207, half-up 3 789); the quote's own codFee (here 2 500) is not the
  // fee and is never used.
  it("subtracts the settlement shipping basis and Mengantar's 3.33% COD fee, never the quote's codFee", () => {
    const money = deriveDraftProviderMoneyLines(
      {
        codFeeIdr: 2_500,
        discountIdr: 2_400,
        normalPriceIdr: 10_000,
        shippingAmountIdr: 10_000,
        specialPriceIdr: 7_000,
      },
      113_790,
    );

    expect(money).toEqual({
      estimatedSellerPayoutIdr: 113_790 - 7_000 - 3_789,
      mengantarCodFeeIdr: 3_789,
      normalPriceIdr: 10_000,
      providerChargedShippingIdr: 7_000,
      providerDiscountIdr: 2_400,
      shippingSpreadIdr: 10_000 - 7_000,
      specialPriceIdr: 7_000,
    });
  });

  it("bills the normal price when no special price is offered", () => {
    const money = deriveDraftProviderMoneyLines(
      {
        codFeeIdr: null,
        discountIdr: null,
        normalPriceIdr: null,
        shippingAmountIdr: 10_000,
        specialPriceIdr: null,
      },
      113_790,
    );

    expect(money.normalPriceIdr).toBe(10_000);
    expect(money.providerChargedShippingIdr).toBe(10_000);
    expect(money.mengantarCodFeeIdr).toBe(3_789);
    expect(money.shippingSpreadIdr).toBe(0);
    // No discount: the seller nets the goods value, plus the 1-rupiah ceiling.
    expect(money.estimatedSellerPayoutIdr).toBe(100_001);
  });

  it("has no payout line outside COD", () => {
    const money = deriveDraftProviderMoneyLines(
      {
        codFeeIdr: 0,
        discountIdr: 0,
        normalPriceIdr: 10_000,
        shippingAmountIdr: 10_000,
        specialPriceIdr: 7_000,
      },
      null,
    );
    expect(money.estimatedSellerPayoutIdr).toBeNull();
  });

  // B1 regression: SiCepatCargo's own fixture entry carries a cargo-tier `price`
  // (30 000) against a non-cargo `estimatedPrice`/`estimatedSpecialPrice` pair
  // (6 000 / 4 200) — see tests/fixtures/mengantar-estimate.sandbox.json. For a
  // goods value of 100 000, codAmountIdr (built from `price`) works out to
  // 134 329; subtracting the mismatched 4 200 basis used to render "Estimasi
  // diterima penjual Rp 130.129" — more than the goods value. The scale-mismatch
  // guard must hide the figure instead of showing that inflated number.
  it("hides the payout when price and the settlement basis look like different quotes", () => {
    const money = deriveDraftProviderMoneyLines(
      {
        codFeeIdr: 0,
        discountIdr: 1_500,
        normalPriceIdr: 6_000,
        shippingAmountIdr: 30_000,
        specialPriceIdr: 4_200,
      },
      134_329,
    );

    expect(money.estimatedSellerPayoutIdr).toBeNull();
  });

  it("keeps a legitimate discount ratio (SAPLite-style, 1.43x) unmasked", () => {
    const money = deriveDraftProviderMoneyLines(
      {
        codFeeIdr: 0,
        discountIdr: 700,
        normalPriceIdr: 7_000,
        shippingAmountIdr: 10_000,
        specialPriceIdr: 6_300,
      },
      113_790,
    );

    expect(money.estimatedSellerPayoutIdr).toBe(113_790 - 6_300 - 3_789);
  });

  it("never lets a negative payout through silently", () => {
    const money = deriveDraftProviderMoneyLines(
      {
        codFeeIdr: 0,
        discountIdr: 0,
        normalPriceIdr: 10_000,
        shippingAmountIdr: 10_000,
        specialPriceIdr: 7_000,
      },
      // Smaller than the (in-scale) 7 000 shipping deduction: the resulting
      // payout would be negative.
      5_000,
    );

    expect(money.estimatedSellerPayoutIdr).toBeNull();
  });

  it("derives normal price, special price, Mengantar's COD fee and the seller payout for one COD service", () => {
    const money = deriveDraftProviderMoneyLines(
      { codFeeIdr: 2_500, discountIdr: 3_000, normalPriceIdr: 10_000, shippingAmountIdr: 10_000, specialPriceIdr: 7_000 },
      113_790,
    );
    expect(money).toMatchObject({
      estimatedSellerPayoutIdr: 103_001,
      mengantarCodFeeIdr: 3_789,
      normalPriceIdr: 10_000,
      providerChargedShippingIdr: 7_000,
      shippingSpreadIdr: 3_000,
      specialPriceIdr: 7_000,
    });
    // T-193: one Biaya COD — Mengantar's fee on the total, VAT inside — and the round-up.
    expect(codChargeBreakdown({ goodsValueIdr: 100_000, providerCodAmountIdr: 113_790, shippingAmountIdr: 10_000 })).toEqual({
      codFeeIdr: 3_789,
      codFeeVatIncludedIdr: 375,
      goodsValueIdr: 100_000,
      providerCodAmountIdr: 113_790,
      roundingIdr: 1,
      shippingAmountIdr: 10_000,
    });
  });

  it("has no special price when the provider offers none", () => {
    const money = deriveDraftProviderMoneyLines(
      { codFeeIdr: null, discountIdr: null, normalPriceIdr: null, shippingAmountIdr: 10_000, specialPriceIdr: null },
      null,
    );
    expect(money.normalPriceIdr).toBe(10_000);
    expect(money.specialPriceIdr).toBeNull();
  });
});
