import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchMengantarEstimate,
  MengantarEstimateError,
  normalizeMengantarEstimateServices,
} from "@/lib/mengantar-estimate";

type EstimateFixture = { response: { body: { data: unknown } } };

async function loadFixture() {
  const content = await readFile("tests/fixtures/mengantar-estimate.sandbox.json", "utf8");
  return JSON.parse(content) as EstimateFixture;
}

const credentials = {
  apiKey: "fixture-key",
  baseUrl: "https://mengantar.invalid",
  originAreaId: "origin-fixture",
  pickupAddressId: "pickup-fixture",
};
const request = {
  destinationAreaId: "destination-fixture",
  originAreaId: credentials.originAreaId,
  weightGrams: 1_000,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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

  it("keeps the request deadline active while a response body drips", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      const signal = init?.signal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"success":true,"data":'));
          const drip = setInterval(() => controller.enqueue(new Uint8Array([0x20])), 1_000);
          signal?.addEventListener("abort", () => {
            clearInterval(drip);
            controller.error(signal.reason);
          }, { once: true });
        },
      });
      return new Response(body, {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }));

    const result = fetchMengantarEstimate(credentials, request);
    const rejected = expect(result).rejects.toEqual(new MengantarEstimateError());
    await vi.advanceTimersByTimeAsync(15_000);

    await rejected;
  });

  it("rejects and aborts an oversized chunked body", async () => {
    const observed: { signal?: AbortSignal } = {};
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.signal) observed.signal = init.signal;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (let chunk = 0; chunk < 5; chunk += 1) {
              controller.enqueue(new Uint8Array(128_001));
            }
            controller.close();
          },
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      );
    }));

    await expect(fetchMengantarEstimate(credentials, request))
      .rejects.toEqual(new MengantarEstimateError());
    expect(observed.signal?.aborted).toBe(true);
  });
});
