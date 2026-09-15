import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchMengantarEstimate,
  MengantarEstimateError,
  MengantarNoSupportedServicesError,
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

  it("distinguishes an explicitly unsupported route while retaining the existing error superclass", () => {
    expect(() => normalizeMengantarEstimateServices({
      JNE: { unsupported: true }, SAP: { unsupported: true },
    })).toThrow(MengantarNoSupportedServicesError);
    expect(new MengantarNoSupportedServicesError()).toBeInstanceOf(MengantarEstimateError);
  });

  it.each([{}, { JNE: { price: "bad" } }, { JNE: { unsupported: true }, broken: null },
    { "invalid/service": { unsupported: true } }, []])(
    "keeps malformed or unknown payloads as provider failures: %j", (payload) => {
      try {
        normalizeMengantarEstimateServices(payload);
        expect.fail("The malformed payload must fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(MengantarEstimateError);
        expect(error).not.toBeInstanceOf(MengantarNoSupportedServicesError);
      }
    },
  );

  it("only returns the unsupported-route distinction for a successful provider envelope", async () => {
    const data = { JNE: { unsupported: true } };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data }), {
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, data }), {
        headers: { "content-type": "application/json" },
      })));
    await expect(fetchMengantarEstimate(credentials, request)).rejects.toBeInstanceOf(MengantarNoSupportedServicesError);
    await expect(fetchMengantarEstimate(credentials, request)).rejects.not.toBeInstanceOf(MengantarNoSupportedServicesError);
  });

  it("uses an HTTPS origin-only base URL and encodes the credential path segment", async () => {
    const fixture = await loadFixture();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe(
        "https://mengantar.invalid/api/public/key%2Fprivate/order/estimate?origin_id=origin-fixture&destination_id=destination-fixture&courier=all&weight=1",
      );
      return new Response(JSON.stringify({
        data: fixture.response.body.data,
        success: true,
      }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMengantarEstimate({
      ...credentials,
      apiKey: "key/private",
    }, request)).resolves.toHaveLength(14);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    "http://mengantar.invalid",
    "https://user:pass@mengantar.invalid",
    "https://mengantar.invalid/prefix",
    "https://mengantar.invalid?redirect=https://example.com",
    "https://mengantar.invalid#fragment",
    "https://",
  ])("rejects non-origin provider base URL %s before fetch", async (baseUrl) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMengantarEstimate({
      ...credentials,
      baseUrl,
    }, request)).rejects.toEqual(new MengantarEstimateError());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a blank API key before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMengantarEstimate({
      ...credentials,
      apiKey: "   ",
    }, request)).rejects.toEqual(new MengantarEstimateError());
    expect(fetchMock).not.toHaveBeenCalled();
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
