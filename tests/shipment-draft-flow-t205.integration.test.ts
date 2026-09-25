import { describe, expect, it } from "vitest";

import { composeProductRows, geraiAddress, parseProductRows } from "@/lib/shipment-draft-logic";
import { validateShipmentDraft } from "@/lib/shipment-draft";

describe("T-205 product rows compose into the stored content and quantity", () => {
  it("lists each named product with its quantity and sums the total", () => {
    expect(composeProductRows([
      { name: "Kain batik", quantity: "2" },
      { name: " Daster ", quantity: "1" },
    ])).toEqual({ packageContent: "Kain batik (2), Daster", packageQuantity: "3" });
  });

  it("leaves unused blank rows out of both fields", () => {
    expect(composeProductRows([
      { name: "Kain batik", quantity: "2" },
      { name: "  ", quantity: "5" },
    ])).toEqual({ packageContent: "Kain batik (2)", packageQuantity: "2" });
    // Nothing named yet: content is empty (the server asks for it) and the typed
    // quantity still counts, so no spurious quantity error joins it.
    expect(composeProductRows([{ name: "", quantity: "1" }])).toEqual({ packageContent: "", packageQuantity: "1" });
  });

  it("sends an empty total for an unreadable quantity, so the server's message answers it", () => {
    expect(composeProductRows([
      { name: "Kain batik", quantity: "2" },
      { name: "Daster", quantity: "" },
    ]).packageQuantity).toBe("");
    expect(composeProductRows([{ name: "Kain batik", quantity: "0" }]).packageQuantity).toBe("0");
  });

  it("round-trips a refused form back into its rows, and never splits text it cannot rebuild", () => {
    expect(parseProductRows("Kain batik (2), Daster", "3")).toEqual([
      { name: "Kain batik", quantity: "2" },
      { name: "Daster", quantity: "1" },
    ]);
    // A pre-T-205 free-text content, a name containing ", ", or a total that does not
    // match stays one row with every character kept.
    expect(parseProductRows("Baju, celana", "2")).toEqual([{ name: "Baju, celana", quantity: "2" }]);
    expect(parseProductRows("Kain batik (2), Daster", "4")).toEqual([{ name: "Kain batik (2), Daster", quantity: "4" }]);
    expect(parseProductRows(undefined, undefined)).toEqual([{ name: "", quantity: "1" }]);
  });

  it("produces values the unchanged server validation accepts", () => {
    const composed = composeProductRows([
      { name: "Kain batik", quantity: "2" },
      { name: "Daster", quantity: "1" },
    ]);
    const formData = new FormData();
    for (const [name, value] of Object.entries({
      declaredValue: "150000",
      destinationAreaId: "AREA-1",
      destinationAreaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
      destinationMode: "manual",
      outletId: "00000000-0000-4000-8000-000000000205",
      packageWeightGrams: "1200",
      paymentType: "NON_COD",
      recipientAddress: "Jalan Contoh 2",
      recipientName: "Budi Santoso",
      recipientPhone: "081234567891",
      senderAddress: "Jalan Contoh 1",
      senderName: "Gerai Bandung",
      senderPhone: "081234567890",
      ...composed,
    })) formData.set(name, value);
    const validated = validateShipmentDraft(formData);
    expect(validated.ok ? validated.input : validated.errors).toMatchObject({
      packageContent: "Kain batik (2), Daster",
      packageQuantity: 3,
    });
  });
});

describe("T-205 review: Alamat gerai sender address", () => {
  it("drops the leading pickup name, never repeats the area and respects the 500-character limit", () => {
    expect(geraiAddress({ pickupAddressLabel: "Gudang Dago, Jl. Juanda 12, Dago, Coblong, Kota Bandung, Jawa Barat, 40135" }))
      .toBe("Jl. Juanda 12, Dago, Coblong, Kota Bandung, Jawa Barat, 40135");
    expect(geraiAddress({ pickupAddressLabel: "Alamat tunggal" })).toBe("Alamat tunggal");
    expect(geraiAddress(null)).toBe("");
    expect(geraiAddress({ pickupAddressLabel: `Nama, ${"x".repeat(700)}` })).toHaveLength(500);
  });
});
