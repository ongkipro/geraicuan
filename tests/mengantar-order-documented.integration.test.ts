import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { ProviderOrderSource } from "@/db/order-batch-repository";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { CourierLogo } from "@/components/app/courier-logo";
import {
  MENGANTAR_COURIERS,
  courierDisplayName,
  courierRecapOrder,
  isMengantarServiceOffered,
  mengantarCourierOfService,
  mengantarDocumentedOrderCourier,
} from "@/lib/mengantar-couriers";
import {
  isMengantarCargoService,
  normalizeMengantarEstimateServices,
} from "@/lib/mengantar-estimate";
import {
  buildMengantarOrderRequest,
  mengantarBatchIdLocation,
  mengantarPickupTimeRequest,
  MengantarOrderPayloadError,
  MengantarOrderSubmissionUnknownError,
  normalizeMengantarOrderResponse,
  normalizeMengantarPickupTimeResponse,
} from "@/lib/mengantar-order";
import {
  MengantarUnpaidRecoveryUnknownError,
  normalizeMengantarPayUnpaidResponse,
} from "@/lib/mengantar-unpaid-recovery";
import { serviceDisplayName } from "@/lib/labels/courier";
import { buildShipmentEstimateOptions } from "@/lib/shipment-estimate-options";

/**
 * T-237 (D-26..D-30): the documented Mengantar order contract, offline only.
 * Shapes follow api-public.mengantar.com/docs as read on 2026-09-26; no live
 * Mengantar call is made anywhere in this file.
 */

const order: ProviderOrderSource = {
  shipmentId: "00000000-0000-4000-8000-000000000237",
  pickupAddressId: "PICKUP-ADDRESS-237",
  courier: "JNE",
  providerService: "JNE",
  senderName: "Gerai Uji",
  senderPhone: "081212345678",
  senderAddress: "Jl. Gerai 1",
  recipientName: "Budi Santoso",
  recipientPhone: "081234567890",
  recipientAddress: "Jl. Contoh 2",
  destinationAreaId: "AREA-237",
  destinationAreaLabel: "Coblong, Kota Bandung",
  destinationAreaVerifiedAt: new Date("2026-09-26T00:00:00.000Z"),
  packageContent: "Kemeja",
  weightGrams: 1_250,
  quantity: 2,
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

const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof MengantarOrderPayloadError ? error.safeCode : `unexpected ${String(error)}`;
  }
  return null;
};

describe("D-26 documented POST /order body", () => {
  it("builds exactly the documented keys for a non-COD drop-off", () => {
    expect(buildMengantarOrderRequest(order)).toEqual({
      courier: "JNE",
      pickup: { type: "dropOff", address_id: "PICKUP-ADDRESS-237" },
      orders: [{
        customerName: "Budi Santoso",
        customerPhone: "081234567890",
        customerAddress: "Jl. Contoh 2",
        customerAddressDataId: "AREA-237",
        parcelContent: "Kemeja",
        weight: 1.25,
        quantity: 2,
        goodsValue: 150_000,
        isDangerousGoods: false,
      }],
    });
  });

  it("sends the sender nowhere: the documented body has only `dropShipper`, which D-30 keeps off", () => {
    const json = JSON.stringify(buildMengantarOrderRequest(order));
    expect(json).not.toContain("Gerai Uji");
    expect(json).not.toContain("dropShipper");
    expect(json).not.toMatch(/sender|receiver|is_cod|cod_amount|goods_value|destination_id/);
  });

  it("spells each courier the documented way and refuses the undocumented ones", () => {
    expect(buildMengantarOrderRequest({ ...order, courier: "SAP", providerService: "SAP" }).courier).toBe("Sap");
    expect(mengantarDocumentedOrderCourier("SiCepat")).toBe("SiCepat");
    expect(mengantarDocumentedOrderCourier("lion")).toBe("lion");
    // Owner 2026-09-26 ("spx → cargo juga aktif"): the docs' courier list has no SPX value.
    for (const courier of ["spx", "paxel", "Ninja"]) {
      expect(mengantarDocumentedOrderCourier(courier)).toBeNull();
      expect(refusal(() => buildMengantarOrderRequest({ ...order, courier, providerService: courier })))
        .toBe("ORDER_COURIER_UNDOCUMENTED");
    }
    // A service variant the body has no key for.
    expect(refusal(() => buildMengantarOrderRequest({ ...order, courier: "SAP", providerService: "SAPLite" })))
      .toBe("ORDER_SERVICE_UNDOCUMENTED");
  });

  it("sets the documented `cargo` flag for the four cargo services, and never with dangerous goods", () => {
    for (const [service, courier, documented] of [
      ["JNECargo", "JNE", "JNE"],
      ["SiCepatCargo", "SiCepat", "SiCepat"],
      ["SapCargo", "SAP", "Sap"],
      ["iDexpressCargo", "iDexpress", "iDexpress"],
    ] as const) {
      const body = buildMengantarOrderRequest({ ...order, courier, providerService: service });
      expect(body.courier).toBe(documented);
      expect(body.orders[0]!.cargo).toBe(true);
      expect(refusal(() => buildMengantarOrderRequest({ ...order, courier, providerService: service, isHazardous: true })))
        .toBe("ORDER_CARGO_DANGEROUS_GOODS");
    }
    expect(buildMengantarOrderRequest(order).orders[0]).not.toHaveProperty("cargo");
  });

  it("sends a COD order's recorded total as `COD` and never `goodsValue`", () => {
    const [item] = buildMengantarOrderRequest({ ...order, isCod: true, providerCodAmountIdr: 10_138 }).orders;
    expect(item).toMatchObject({ COD: 10_138 });
    expect(item).not.toHaveProperty("goodsValue");
    expect(refusal(() => buildMengantarOrderRequest({ ...order, isCod: true, providerCodAmountIdr: null })))
      .toBe("ORDER_COD_AMOUNT_MISSING");
  });

  it("builds a scheduled pickup only with a `time_id` and a vehicle volume", () => {
    const pickup = { ...order, handoverType: "PICKUP" as const, pickupVehicle: "MOBIL" as const, pickupDate: "2026-09-27", pickupSlot: "13:00" };
    expect(buildMengantarOrderRequest(pickup, { pickupTimeId: "TIME-1" }).pickup).toEqual({
      type: "scheduledPickup",
      address_id: "PICKUP-ADDRESS-237",
      time_id: "TIME-1",
      volume: "volumeMobil",
    });
    expect(buildMengantarOrderRequest({ ...pickup, pickupVehicle: "TRUK" }, { pickupTimeId: "T" }).pickup)
      .toMatchObject({ volume: "volumeTruck" });
    expect(refusal(() => buildMengantarOrderRequest(pickup))).toBe("ORDER_PICKUP_TIME_UNAVAILABLE");
    expect(refusal(() => buildMengantarOrderRequest({ ...pickup, pickupVehicle: null }, { pickupTimeId: "T" })))
      .toBe("ORDER_PICKUP_VOLUME_MISSING");
    // A pre-T-211 draft with no recorded handover is a drop-off.
    expect(buildMengantarOrderRequest({ ...order, handoverType: null }).pickup.type).toBe("dropOff");
  });
});

describe("D-27 POST /time request", () => {
  const tenAmWib = new Date("2026-09-26T03:00:00.000Z");
  const pickup = { pickupAddressId: "PICKUP-ADDRESS-237", pickupDate: "2026-09-27", pickupSlot: "09:00" };

  it("formats the documented `date` (mm-dd-yyyy) and `time` (\"9:00\")", () => {
    expect(mengantarPickupTimeRequest(pickup, tenAmWib)).toEqual({
      address_id: "PICKUP-ADDRESS-237",
      date: "09-27-2026",
      time: "9:00",
    });
    expect(mengantarPickupTimeRequest({ ...pickup, pickupSlot: "17:00" }, tenAmWib).time).toBe("17:00");
  });

  it("re-checks the slot at send time: a legacy 08:00, a passed slot or a missing one is refused", () => {
    for (const bad of [
      { ...pickup, pickupSlot: "08:00" },
      { ...pickup, pickupDate: "2026-09-26", pickupSlot: "11:00" },
      { ...pickup, pickupSlot: null },
    ]) {
      expect(refusal(() => mengantarPickupTimeRequest(bad, tenAmWib))).toBe("ORDER_PICKUP_SLOT_UNAVAILABLE");
    }
  });

  it("reads `data._id` from the documented response and checks the echoed time and address", () => {
    const request = { address_id: "62e27d67ecf5ae2893bc070a", date: "11-27-2022", time: "13:00" };
    const documented = {
      success: true,
      data: {
        isSunday: false, status: "empty", _id: "6981621996f8fc74a332cf38", date: "2026-02-03T00:00:00.000Z", time: "13:00",
        address: { _id: "62e27d67ecf5ae2893bc070a", PICKUP_NAME: "Seller or Store Name" },
      },
    };
    expect(normalizeMengantarPickupTimeResponse(documented, request)).toBe("6981621996f8fc74a332cf38");
    expect(() => normalizeMengantarPickupTimeResponse({ ...documented, data: { ...documented.data, time: "14:00" } }, request))
      .toThrow(MengantarOrderSubmissionUnknownError);
    expect(() => normalizeMengantarPickupTimeResponse({ success: false }, request)).toThrow(MengantarOrderSubmissionUnknownError);
  });
});

describe("D-26 documented POST /order response", () => {
  // The documented example, trimmed to the keys GeraiCUAN reads.
  const documented = {
    success: true,
    data: [{
      COD_AMOUNT: 500000, isPaid: true, _id: "697c58034fa61abe7c700da8",
      batch_id: "697c58034fa61abe7c700da6", batch: "26013014BBQFMM", ORDER_ID: "260130F0DRQH", cnote_no: "11000009548396",
    }],
    batch: "26013014BBQFMM",
    batch_id: "697c58034fa61abe7c700da6",
    courier: "JNE",
    errors: [],
  };

  it("stores `_id`, `cnote_no`, `isPaid`, and `batch_id` (what pay-unpaid takes), found at both levels", () => {
    expect(mengantarBatchIdLocation(documented)).toBe("both");
    expect(normalizeMengantarOrderResponse(documented, [order])).toEqual([{
      shipmentId: order.shipmentId,
      providerOrderId: "697c58034fa61abe7c700da8",
      providerBatchId: "697c58034fa61abe7c700da6",
      isPaid: true,
      cnoteNo: "11000009548396",
    }]);
  });

  it("accepts `batch_id` at either level alone, never the readable `batch` code in its place", () => {
    const itemOnly = { success: true, data: documented.data };
    const envelopeOnly = { ...documented, data: [{ ...documented.data[0], batch_id: undefined }] };
    const codeOnly = { success: true, data: [{ ...documented.data[0], batch_id: undefined }] };
    expect(mengantarBatchIdLocation(itemOnly)).toBe("item");
    expect(mengantarBatchIdLocation(envelopeOnly)).toBe("envelope");
    expect(mengantarBatchIdLocation(codeOnly)).toBe("none");
    expect(normalizeMengantarOrderResponse(itemOnly, [order])[0]!.providerBatchId).toBe("697c58034fa61abe7c700da6");
    expect(normalizeMengantarOrderResponse(envelopeOnly, [order])[0]!.providerBatchId).toBe("697c58034fa61abe7c700da6");
    expect(normalizeMengantarOrderResponse(codeOnly, [order])[0]!.providerBatchId).toBeNull();
  });

  it("fails closed when the item and the envelope disagree on a batch identifier", () => {
    for (const conflicting of [
      { ...documented, batch_id: "697c58034fa61abe7c700000" },
      { ...documented, batch: "OTHERBATCH" },
    ]) {
      expect(() => normalizeMengantarOrderResponse(conflicting, [order]))
        .toThrow(expect.objectContaining({ safeCode: "ORDER_RESPONSE_IDENTITY_AMBIGUOUS" }));
    }
  });

  it("matches the sanitized fixture the fixture transport answers with", () => {
    const fixture = JSON.parse(readFileSync("tests/fixtures/mengantar-order.sanitized.json", "utf8"));
    expect(mengantarBatchIdLocation(fixture.unpaid.response)).toBe("both");
    expect(normalizeMengantarOrderResponse(fixture.unpaid.response, [order])[0]).toMatchObject({
      providerOrderId: "SANITIZED-ORDER-UNPAID",
      providerBatchId: "SANITIZED-BATCH-UNPAID",
      isPaid: false,
      cnoteNo: null,
    });
  });
});

describe("D-26 documented POST /order/pay-unpaid response", () => {
  it("reads `{success, data: <count>, cnote_no: […]}` and correlates from the request", () => {
    expect(normalizeMengantarPayUnpaidResponse(
      { success: true, data: 1, cnote_no: ["DMP00097790689"] },
      "6332f5b98c3ea4bc8e15f72d",
      "SAP",
    )).toEqual({ providerBatchId: "6332f5b98c3ea4bc8e15f72d", courier: "SAP", cnoteNo: "DMP00097790689" });
  });

  it("fails closed on the documented two-order example, a count mismatch, or the old assumed shape", () => {
    const code = (response: unknown) => {
      try {
        normalizeMengantarPayUnpaidResponse(response, "BATCH", "JNE");
      } catch (error) {
        return error instanceof MengantarUnpaidRecoveryUnknownError ? error.safeCode : "unexpected";
      }
      return null;
    };
    expect(code({ success: true, data: 2, cnote_no: ["DMP00097790689", "DMP00097790690"] })).toBe("PAY_UNPAID_ORDER_CORRELATION_UNKNOWN");
    expect(code({ success: true, data: 2, cnote_no: ["DMP00097790689"] })).toBe("PAY_UNPAID_RESPONSE_SCHEMA_UNKNOWN");
    expect(code({ success: true, data: { batch_id: "BATCH", courier: "JNE", cnote_no: ["X1"] } })).toBe("PAY_UNPAID_RESPONSE_SCHEMA_UNKNOWN");
    expect(code({ success: true, data: 1, cnote_no: ["bad\nvalue"] })).toBe("PAY_UNPAID_RESPONSE_IDENTIFIER_UNSAFE");
  });
});

describe("Estimate: D-29 Ninja, D-30 COD flag, cargo tiers, SPX", () => {
  const sandbox = JSON.parse(readFileSync("tests/fixtures/mengantar-estimate.sandbox.json", "utf8"))
    .response.body.data as Record<string, Record<string, unknown>>;
  const byService = (services: ReturnType<typeof normalizeMengantarEstimateServices>) =>
    Object.fromEntries(services.map((service) => [service.providerService, service]));

  it("D-29: Ninja is removed — never offered, no catalogue entry or logo, but a historical shipment still reads \"Ninja\"", () => {
    const services = normalizeMengantarEstimateServices(sandbox);
    expect(services.map((service) => service.providerService)).not.toContain("Ninja");
    expect(isMengantarServiceOffered("Ninja")).toBe(false);
    expect(isMengantarServiceOffered("JNE")).toBe(true);
    expect(MENGANTAR_COURIERS).not.toContain("Ninja");
    expect(mengantarCourierOfService("Ninja")).toBeNull();
    expect(existsSync("public/couriers/ninja.svg")).toBe(false);
    // Historical rows: plain text name, no image; an extra recap column, not dropped.
    const logo = renderToStaticMarkup(createElement(CourierLogo, { courier: "Ninja" }));
    expect(logo).toContain(">Ninja<");
    expect(logo).not.toContain("<img");
    expect(serviceDisplayName("Ninja")).toBe("Ninja");
    expect(courierDisplayName("Ninja")).toBe("Ninja");
    expect(courierRecapOrder(["Ninja"]).at(-1)).toBe("Ninja");
    // A snapshot stored before D-29 still holding a Ninja quote is not offered either.
    const options = buildShipmentEstimateOptions({
      codFormulaRetired: false,
      declaredValueIdr: 100_000,
      paymentMethod: "NON_COD",
      services: ["Ninja", "JNE"].map((providerService, index) => ({
        codEligible: true, deliveryEstimate: "1-2 hari", estimateServiceId: `S-${index}`, insuranceAmountIdr: null,
        normalPriceIdr: null, providerService, shippingAmountIdr: 8_000, specialPriceIdr: null,
      })),
    });
    expect(options.map((option) => option.providerService)).toEqual(["JNE"]);
  });

  it("D-29: an estimate of Ninja alone is an unsupported route", () => {
    expect(() => normalizeMengantarEstimateServices({ Ninja: sandbox.Ninja })).toThrow("Mengantar estimate is unavailable.");
  });

  it("D-30: COD is not offered when `unsupportedCodCheckFirstSap` is true", () => {
    expect(byService(normalizeMengantarEstimateServices(sandbox)).SAPLite!.codEligible).toBe(true);
    const flipped = byService(normalizeMengantarEstimateServices({
      ...sandbox,
      SAPLite: { ...sandbox.SAPLite, unsupportedCodCheckFirstSap: true },
    }));
    expect(flipped.SAPLite!.codEligible).toBe(false);
    expect(flipped.SAP!.codEligible).toBe(true);
  });

  it("prices a cargo service from its cargo tier, not the regular one", () => {
    const services = byService(normalizeMengantarEstimateServices(sandbox, { weightGrams: 10_000 }));
    // SiCepatCargo's estimatedPrice/estimatedSpecialPrice (6 000 / 4 200) are the regular service's.
    expect(services.SiCepatCargo).toMatchObject({ shippingAmountIdr: 30_000, normalPriceIdr: 30_000, specialPriceIdr: 28_500, discountIdr: 1_500, deliveryEstimate: "2 - 3 Days" });
    expect(services.JNECargo).toMatchObject({ shippingAmountIdr: 40_000, normalPriceIdr: 40_000, specialPriceIdr: 38_000, discountIdr: 2_000, deliveryEstimate: "3 - 4 days" });
    expect(services.SapCargo).toMatchObject({ shippingAmountIdr: 22_500, normalPriceIdr: 22_500, specialPriceIdr: 16_875, codEligible: false, deliveryEstimate: "3 - 6 days" });
    expect(services.iDexpressCargo).toMatchObject({ shippingAmountIdr: 30_000, normalPriceIdr: 30_000, specialPriceIdr: 27_000 });
    // A regular service keeps its own fields.
    expect(services.SiCepat).toMatchObject({ shippingAmountIdr: 6_000, normalPriceIdr: 6_000, specialPriceIdr: 4_200 });
    expect(["JNECargo", "SiCepatCargo", "SapCargo", "iDexpressCargo"].every(isMengantarCargoService)).toBe(true);
    expect(["JNE", "SAPLite", "spx", "Cargo"].some(isMengantarCargoService)).toBe(false);
  });

  it("hides a cargo service below its `minimumWeightCargo`", () => {
    const at = (weightGrams: number) => normalizeMengantarEstimateServices(sandbox, { weightGrams }).map((s) => s.providerService);
    expect(at(4_999)).not.toContain("SapCargo");
    expect(at(5_000)).toContain("SapCargo");
    // Only SapCargo carries a minimum in the capture; the other cargo services stay.
    expect(at(1_000)).toEqual(expect.arrayContaining(["JNECargo", "SiCepatCargo", "iDexpressCargo"]));
    expect(normalizeMengantarEstimateServices({ ...sandbox, SapCargo: { ...sandbox.SapCargo, minimumWeightCargo: "lima" } }, { weightGrams: 9_000 })
      .map((s) => s.providerService)).not.toContain("SapCargo");
  });

  it("keeps SPX quotable under its courier's name while it cannot be ordered", () => {
    const services = normalizeMengantarEstimateServices({
      spx: { price: 9_000, estimatedPrice: 9_000, estimatedSpecialPrice: 8_100, currency: "IDR", estimate_delivery: "2 - 3 days", unsupported: false },
    });
    expect(services).toEqual([expect.objectContaining({ providerService: "spx", shippingAmountIdr: 9_000 })]);
    expect(serviceDisplayName("spx")).toBe("Shopee Express");
    expect(serviceDisplayName("SapCargo")).toBe("SAP Cargo");
    expect(mengantarCourierOfService("SiCepatCargo")).toBe("SiCepat");
  });
});
