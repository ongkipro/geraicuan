import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchMengantarPickupOptions,
  MengantarLocationError,
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
  vi.unstubAllGlobals();
});

describe("Mengantar pickup location contract", () => {
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
