import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  MengantarEstimateError,
  normalizeMengantarEstimateServices,
} from "@/lib/mengantar-estimate";

type EstimateFixture = { response: { body: { data: unknown } } };

async function loadFixture() {
  const content = await readFile("tests/fixtures/mengantar-estimate.sandbox.json", "utf8");
  return JSON.parse(content) as EstimateFixture;
}

describe("Mengantar estimate normalization", () => {
  it("uses returned price, omits unsupported services, and preserves COD eligibility", async () => {
    const fixture = await loadFixture();

    const services = normalizeMengantarEstimateServices(fixture.response.body.data);

    expect(services).toHaveLength(14);
    expect(services).not.toContainEqual(expect.objectContaining({ providerService: "paxel" }));
    expect(services).toContainEqual({
      providerService: "JNE",
      currency: "IDR",
      shippingAmountIdr: 8_000,
      shippingSourceField: "price",
      insuranceAmountIdr: null,
      insuranceSourceField: null,
      deliveryEstimate: "2 - 3 days",
      codEligible: false,
    });
    expect(services).toContainEqual(expect.objectContaining({
      providerService: "SAP",
      codEligible: true,
    }));
    expect(services).toContainEqual(expect.objectContaining({
      providerService: "SapCargo",
      shippingAmountIdr: 22_500,
      codEligible: false,
    }));
  });

  it("fails closed for an unrecognized provider payload", () => {
    expect(() => normalizeMengantarEstimateServices({ JNE: { currency: "USD", price: 1 } }))
      .toThrow(MengantarEstimateError);
  });
});
