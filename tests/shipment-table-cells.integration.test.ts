import { describe, expect, it } from "vitest";

import { formatDistrictCity, formatPostalCode, formatWibDateTimeParts } from "@/lib/label-format";

describe("T-148 stacked shipment table cells", () => {
  it("shows district and city from Mengantar area labels of any shape, never subdistrict, province or zip", () => {
    expect(formatDistrictCity("Cihapit, Bandung Wetan, Kota Bandung, Jawa Barat, 40114")).toBe("Bandung Wetan, Kota Bandung");
    // No subdistrict: the district must not shift into the province.
    expect(formatDistrictCity("Coblong, Kota Bandung, Jawa Barat, 40135")).toBe("Coblong, Kota Bandung");
    expect(formatDistrictCity("Coblong, Kota Bandung, Jawa Barat")).toBe("Coblong, Kota Bandung");
    // A comma inside the subdistrict name must not shift the city out.
    expect(formatDistrictCity("Kebon Jeruk, Blok A, Kebon Jeruk, Jakarta Barat, DKI Jakarta, 11530")).toBe("Kebon Jeruk, Jakarta Barat");
    expect(formatDistrictCity("Gambir, Jakarta Pusat")).toBe("Gambir, Jakarta Pusat");
  });

  it("splits an instant into a WIB date line and time line", () => {
    expect(formatWibDateTimeParts(new Date("2026-09-14T17:30:00.000Z"))).toEqual({ date: "15 Sep 2026", time: "00.30 WIB" });
  });

  // T-167: the Kontak directory row reads postal code from the same stored
  // label with formatPostalCode, counted from the end like formatDistrictCity.
  it("reads the postal code from a Mengantar area label of any shape, or null when there is none", () => {
    expect(formatPostalCode("Cihapit, Bandung Wetan, Kota Bandung, Jawa Barat, 40114")).toBe("40114");
    expect(formatPostalCode("Coblong, Kota Bandung, Jawa Barat, 40135")).toBe("40135");
    // A comma inside an earlier segment must not shift the trailing zip out.
    expect(formatPostalCode("Kebon Jeruk, Blok A, Kebon Jeruk, Jakarta Barat, DKI Jakarta, 11530")).toBe("11530");
    // 3-part label with no zip: not a false positive on the last part.
    expect(formatPostalCode("Coblong, Kota Bandung, Jawa Barat")).toBeNull();
    expect(formatPostalCode("Gambir, Jakarta Pusat")).toBeNull();
    // Missing area (address predates area selection): no label at all.
    expect(formatPostalCode(null)).toBeNull();
  });
});
