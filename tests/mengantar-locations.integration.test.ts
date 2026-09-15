import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchMengantarDestinationAreas,
  fetchMengantarPickupOptions,
  MengantarLocationError,
  MengantarLocationQueryError,
  normalizeMengantarAreaQuery,
  normalizeMengantarDestinationAreaOptions,
  normalizeMengantarPickupOptions,
} from "@/lib/mengantar-locations";

const payload = {
  success: true,
  data: [
    {
      _id: "pickup-2",
      PICKUP_ADDRESS: "Jalan Merdeka 2",
      PICKUP_AUTOFILL: "area-2",
      PICKUP_CITY: "Kota Bandung",
      PICKUP_DISTRICT: "Coblong",
      PICKUP_NAME: "Gudang Barat",
      PICKUP_PIC: "must-not-reach-browser",
      PICKUP_PIC_PHONE: "081234567890",
      PICKUP_REGION: "Jawa Barat",
      PICKUP_SUBDISTRICT: "Dago",
      PICKUP_ZIP: "40135",
      user_id: "provider-user-private",
    },
    {
      _id: "pickup-1",
      PICKUP_ADDRESS: "Jalan Asia Afrika 1",
      PICKUP_AUTOFILL: "area-1",
      PICKUP_CITY: "Kota Bandung",
      PICKUP_DISTRICT: "Sumur Bandung",
      PICKUP_NAME: "Gudang Pusat",
      PICKUP_PIC: "must-not-reach-browser",
      PICKUP_PIC_PHONE: "089999999999",
      PICKUP_REGION: "Jawa Barat",
      PICKUP_SUBDISTRICT: "Braga",
      PICKUP_ZIP: "40111",
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const areaPayload = {
  success: true,
  data: [
    {
      _id: "area-2",
      PROVINCE_NAME: "Jawa Barat",
      CITY_NAME: "Kota Bandung",
      DISTRICT_NAME: "Coblong",
      SUBDISTRICT_NAME: "Dago",
      ZIP_CODE: "40135",
      ROUTING_CODE: "must-not-reach-browser",
      user_id: "provider-user-private",
    },
    {
      _id: "area-1",
      PROVINCE_NAME: "DKI Jakarta",
      CITY_NAME: "Jakarta Selatan",
      DISTRICT_NAME: "Setiabudi",
      SUBDISTRICT_NAME: "Karet Semanggi",
      ZIP_CODE: "12930",
      KEC_CODE: "unrelated-routing-code",
    },
  ],
};

describe("Mengantar pickup location contract", () => {
  it("keeps multiline address text and does not let another pickup block the configured one", async () => {
    const multiline = structuredClone(payload);
    multiline.data[0].PICKUP_ADDRESS = "Jalan Contoh 1\r\nLantai 2\nBlok A\rPintu B";
    const options = normalizeMengantarPickupOptions(multiline);
    expect(options[0].pickupLabel).toContain("Jalan Contoh 1 Lantai 2 Blok A Pintu B");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(multiline)));
    await expect(fetchMengantarPickupOptions({
      apiKey: "test-key",
      baseUrl: "https://api-public.mengantar.com",
      pickupAddressId: "pickup-1",
    }, "platform_default")).resolves.toEqual([expect.objectContaining({ pickupAddressId: "pickup-1" })]);
  });

  it.each([
    ["PICKUP_ADDRESS", "Jalan\u0000Contoh"],
    ["PICKUP_ADDRESS", "Jalan\u202eContoh"],
    ["PICKUP_ADDRESS", "Jalan\tContoh"],
    ["PICKUP_ADDRESS", "\r\n"],
    ["_id", "pickup\n1"],
    ["PICKUP_AUTOFILL", "area\r1"],
    ["PICKUP_NAME", "Gudang\nBarat"],
  ])("retains control validation for %s", (field, value) => {
    expect(() => normalizeMengantarPickupOptions({
      success: true,
      data: [{ ...payload.data[0], [field]: value }],
    })).toThrow(MengantarLocationError);
  });

  it("maps GET /address into deterministic safe pickup and derived-area options", () => {
    const options = normalizeMengantarPickupOptions(payload);

    expect(options).toEqual([
      {
        originAreaId: "area-2",
        originLabel: "Coblong, Kota Bandung, Jawa Barat",
        pickupAddressId: "pickup-2",
        pickupLabel:
          "Gudang Barat, Jalan Merdeka 2, Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
      },
      {
        originAreaId: "area-1",
        originLabel: "Sumur Bandung, Kota Bandung, Jawa Barat",
        pickupAddressId: "pickup-1",
        pickupLabel:
          "Gudang Pusat, Jalan Asia Afrika 1, Braga, Sumur Bandung, Kota Bandung, Jawa Barat, 40111",
      },
    ]);
    const serialized = JSON.stringify(options);
    expect(serialized).not.toContain("must-not-reach-browser");
    expect(serialized).not.toContain("081234567890");
    expect(serialized).not.toContain("provider-user-private");
  });

  it("returns the account list for private credentials and only the configured platform pickup", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => {
      void _input;
      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const credentials = {
      apiKey: "key/with reserved characters",
      baseUrl: "https://api-public.mengantar.com",
      pickupAddressId: "pickup-1",
    };

    await expect(fetchMengantarPickupOptions(credentials, "private")).resolves.toHaveLength(2);
    await expect(fetchMengantarPickupOptions(credentials, "platform_default")).resolves.toEqual([
      expect.objectContaining({ pickupAddressId: "pickup-1", originAreaId: "area-1" }),
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/public/key%2Fwith%20reserved%20characters/address",
    );
  });

  it.each([
    null,
    { success: false, data: [] },
    { success: true, data: [{}] },
    { success: true, data: [{ ...payload.data[0], PICKUP_AUTOFILL: "" }] },
    { success: true, data: [payload.data[0], payload.data[0]] },
  ])("rejects malformed provider payloads", (invalidPayload) => {
    expect(() => normalizeMengantarPickupOptions(invalidPayload)).toThrow(
      MengantarLocationError,
    );
  });

  it("fails closed on a non-JSON response without exposing the response body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("secret upstream failure", {
      headers: { "content-type": "text/plain" },
      status: 502,
    })));

    await expect(fetchMengantarPickupOptions({
      apiKey: "test-key",
      baseUrl: "https://api-public.mengantar.com",
      pickupAddressId: "pickup-1",
    }, "private")).rejects.toEqual(new MengantarLocationError());
  });
});

describe("Mengantar destination-area contract", () => {
  it("normalizes safe Unicode whitespace and rejects blank, short, oversized, or control input", () => {
    expect(normalizeMengantarAreaQuery("  Karet\u00a0  Semanggi  ")).toBe(
      "Karet Semanggi",
    );
    for (const invalid of ["", "ab", "x".repeat(101), "Dago\nBandung", "Dago\u202eBandung"]) {
      expect(() => normalizeMengantarAreaQuery(invalid)).toThrow(
        MengantarLocationQueryError,
      );
    }
  });

  it("maps only provider ID and readable Indonesian hierarchy with deterministic duplicate handling", () => {
    const options = normalizeMengantarDestinationAreaOptions({
      ...areaPayload,
      data: [...areaPayload.data, { ...areaPayload.data[0] }],
    });

    expect(options).toEqual([
      {
        areaId: "area-2",
        areaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
      },
      {
        areaId: "area-1",
        areaLabel: "Karet Semanggi, Setiabudi, Jakarta Selatan, DKI Jakarta, 12930",
      },
    ]);
    const serialized = JSON.stringify(options);
    expect(serialized).not.toContain("must-not-reach-browser");
    expect(serialized).not.toContain("provider-user-private");
    expect(serialized).not.toContain("unrelated-routing-code");
  });

  it("rejects conflicting IDs, malformed hierarchy, and provider fan-out above 100 rows", () => {
    expect(() => normalizeMengantarDestinationAreaOptions({
      success: true,
      data: [
        areaPayload.data[0],
        { ...areaPayload.data[0], SUBDISTRICT_NAME: "Lebak Gede" },
      ],
    })).toThrow(MengantarLocationError);
    expect(() => normalizeMengantarDestinationAreaOptions({
      success: true,
      data: [{ ...areaPayload.data[0], ZIP_CODE: null }],
    })).toThrow(MengantarLocationError);
    expect(() => normalizeMengantarDestinationAreaOptions({
      success: true,
      data: Array.from({ length: 101 }, (_, index) => ({
        ...areaPayload.data[0],
        _id: `area-${index}`,
      })),
    })).toThrow(MengantarLocationError);
  });

  it("performs one server-only GET with encoded key/query and returns a safe no-result state", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://api-public.mengantar.com/api/public/key%2Fprivate/address/search?keyword=Karet+Semanggi",
      );
      expect(init).toMatchObject({
        headers: { Accept: "application/json" },
        redirect: "error",
      });
      return new Response(JSON.stringify({ success: true, data: [] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMengantarDestinationAreas({
      apiKey: "key/private",
      baseUrl: "https://api-public.mengantar.com",
    }, "  Karet\u00a0Semanggi ")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed, oversized, unavailable, or non-origin provider responses", async () => {
    const credentials = {
      apiKey: "secret-must-not-escape",
      baseUrl: "https://api-public.mengantar.com",
    };
    const failureBodies = [
      new Response("not-json", {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
      new Response(JSON.stringify(areaPayload), {
        headers: {
          "content-length": "512001",
          "content-type": "application/json",
        },
        status: 200,
      }),
      new Response(new Uint8Array(512_001), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
      new Response("upstream secret body", {
        headers: { "content-type": "text/plain" },
        status: 503,
      }),
    ];

    for (const response of failureBodies) {
      vi.stubGlobal("fetch", vi.fn(async () => response));
      const error = await fetchMengantarDestinationAreas(credentials, "Karet Semanggi")
        .catch((reason: unknown) => reason);
      expect(error).toEqual(new MengantarLocationError());
      expect(String(error)).not.toContain(credentials.apiKey);
      expect(String(error)).not.toContain("upstream secret body");
    }

    for (const baseUrl of [
      "http://api-public.mengantar.com",
      "https://api-public.mengantar.com/proxy",
      "https://api-public.mengantar.com?target=elsewhere",
    ]) {
      await expect(fetchMengantarDestinationAreas({
        ...credentials,
        baseUrl,
      }, "Karet Semanggi")).rejects.toEqual(new MengantarLocationError());
    }
  });

  it("aborts a provider request after the ten-second bound without retrying", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted provider request", "AbortError"));
        });
      }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchMengantarDestinationAreas({
      apiKey: "server-only-key",
      baseUrl: "https://api-public.mengantar.com",
    }, "Karet Semanggi");
    const assertion = expect(pending).rejects.toEqual(new MengantarLocationError());
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
