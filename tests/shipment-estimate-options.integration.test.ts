import { describe, expect, it } from "vitest";

import { buildShipmentEstimateOptions } from "@/lib/shipment-estimate-options";

const service = {
  codEligible: true,
  deliveryEstimate: "1-2 hari",
  estimateServiceId: "00000000-0000-4200-8000-000000000001",
  insuranceAmountIdr: null,
  normalPriceIdr: 12_000,
  providerService: "SAP",
  shippingAmountIdr: 12_000,
  specialPriceIdr: 9_800,
};

describe("T-200 shared issuance options (detail and one-page creation confirm the same values)", () => {
  it("adds the COD charge breakdown only to an eligible full-COD service", () => {
    const [cod] = buildShipmentEstimateOptions({
      codFormulaRetired: false,
      declaredValueIdr: 100_000,
      paymentMethod: "COD",
      services: [service],
    });
    expect(cod.codBreakdown).not.toBeNull();
    expect(cod.codBreakdown?.goodsValueIdr).toBe(100_000);
    expect(cod.codBreakdown?.shippingAmountIdr).toBe(12_000);

    const [ineligible] = buildShipmentEstimateOptions({
      codFormulaRetired: false,
      declaredValueIdr: 100_000,
      paymentMethod: "COD",
      services: [{ ...service, codEligible: false }],
    });
    expect(ineligible.codBreakdown).toBeNull();
  });

  it("fails a COD total past the integer range closed as COD-ineligible instead of throwing", () => {
    const [option] = buildShipmentEstimateOptions({
      codFormulaRetired: false,
      declaredValueIdr: 2_147_483_647,
      paymentMethod: "COD",
      services: [service],
    });
    expect(option.codBreakdown).toBeNull();
    expect(option.codEligible).toBe(false);
  });

  it("offers no breakdown for a retired COD formula, non-COD or COD Ongkir", () => {
    for (const [paymentMethod, codFormulaRetired] of [["COD", true], ["NON_COD", false], ["COD_ONGKIR", false]] as const) {
      const [option] = buildShipmentEstimateOptions({ codFormulaRetired, declaredValueIdr: 100_000, paymentMethod, services: [service] });
      expect(option.codBreakdown).toBeNull();
    }
  });

  it("uses the shipping Mengantar deducts (special price first) as the COD Ongkir basis", () => {
    const [option] = buildShipmentEstimateOptions({
      codFormulaRetired: false,
      declaredValueIdr: 100_000,
      paymentMethod: "COD_ONGKIR",
      services: [service],
    });
    expect(option.shippingDeductedIdr).toBe(9_800);
    expect(option.shippingAmountIdr).toBe(12_000);
  });
});
