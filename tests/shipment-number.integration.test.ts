import { describe, expect, it, vi } from "vitest";

import { saveTenantShipmentPrefix, ShipmentPrefixDeniedError } from "@/db/shipment-number-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import {
  normalizeShipmentPrefixInput,
  parseShipmentRouteKey,
  shipmentDetailHref,
  shipmentLabelHref,
  suggestShipmentPrefix,
} from "@/lib/shipment-number";

describe("PR-44 shipment number helpers", () => {
  it("parses canonical numbers, prefixed numbers in any case and legacy UUIDs", () => {
    expect(parseShipmentRouteKey("10013")).toEqual({ kind: "number", tenantNumber: 10013, canonical: true });
    expect(parseShipmentRouteKey("100000")).toEqual({ kind: "number", tenantNumber: 100000, canonical: true });
    expect(parseShipmentRouteKey("GC-10013")).toEqual({ kind: "number", tenantNumber: 10013, canonical: false });
    expect(parseShipmentRouteKey("tkp-10013")).toEqual({ kind: "number", tenantNumber: 10013, canonical: false });
    expect(parseShipmentRouteKey("GC%2D10013")).toEqual({ kind: "number", tenantNumber: 10013, canonical: false });
    expect(parseShipmentRouteKey("72000000-0000-4000-8000-00000000001A")).toEqual({ kind: "uuid", shipmentId: "72000000-0000-4000-8000-00000000001a" });
  });

  it("rejects numbers below the tenant floor, leading zeros, overflow and anything else", () => {
    for (const raw of ["9999", "01234", "0", "2147483648", "GC-9999", "ABCDEF-10013", "G-10013", "10013-GC", "../10013", "10013 ", "%E0%A4%A", "", "10013.5"]) {
      expect(parseShipmentRouteKey(raw), raw).toBeNull();
    }
    expect(parseShipmentRouteKey("2147483647")).toEqual({ kind: "number", tenantNumber: 2147483647, canonical: true });
  });

  it("builds numeric links only from stored PREFIX-number references", () => {
    expect(shipmentDetailHref("TKP-100000")).toBe("/app/pengiriman/100000");
    expect(shipmentLabelHref("GC-10013")).toBe("/app/label/10013");
    expect(() => shipmentDetailHref("95758-260901-039")).toThrow();
    // T-163 review: the detail replays the queue's range so "Kembali ke histori kiriman"
    // returns to the list the operator left, not to the default 30-day window
    // where the shipment just opened may not appear. Empty values never travel.
    expect(shipmentDetailHref("GC-10013", { rentang: "30-hari", dari: "", tz: "Asia/Jakarta" }))
      .toBe("/app/pengiriman/10013?rentang=30-hari&tz=Asia%2FJakarta");
    expect(shipmentDetailHref("GC-10013", {})).toBe("/app/pengiriman/10013");
  });

  it("suggests tenant initials and validates a one-time prefix", () => {
    expect(suggestShipmentPrefix("Toko Kopi Pagi")).toBe("TKP");
    // D-21 (T-225): at most three characters.
    expect(suggestShipmentPrefix("Sekar Batik Nusantara")).toBe("SBN");
    expect(suggestShipmentPrefix("Phi Store")).toBe("PS");
    expect(suggestShipmentPrefix("Phi")).toBe("PHI");
    expect(suggestShipmentPrefix("Ölçü Café & Bakery 2")).toBe("OCB");
    expect(suggestShipmentPrefix("Satu Dua Tiga Empat Lima Enam")).toBe("SDT");
    expect(suggestShipmentPrefix("A 29")).toBe("A2");
    expect(suggestShipmentPrefix("Z")).toBe("GC");
    expect(suggestShipmentPrefix("")).toBe("GC");
    expect(normalizeShipmentPrefixInput(" tkp- ")).toBe("TKP");
    expect(normalizeShipmentPrefixInput("a29")).toBe("A29");
    expect(normalizeShipmentPrefixInput("GC")).toBe("GC");
    for (const bad of ["T", "TKPJ", "SDTEL", "TOKOKU", "TK P", "TK_P", ""]) expect(normalizeShipmentPrefixInput(bad), bad).toBeNull();
    // Legacy 4–5 character references stay readable.
    expect(parseShipmentRouteKey("SDTEL-10013")).toEqual({ kind: "number", tenantNumber: 10013, canonical: false });
    expect(shipmentDetailHref("SDTEL-10013")).toBe("/app/pengiriman/10013");
  });

  it("denies a non-admin save in the application before any database call", async () => {
    const execute = vi.fn();
    const tx = { execute } as unknown as TenantTransaction;
    const context: TenantContext = { role: "OPERATOR", tenantId: "00000000-0000-4000-8000-000000004701", userId: "operator" };
    await expect(saveTenantShipmentPrefix(tx, context, "TKP", "00000000-0000-4000-8000-000000004702")).rejects.toThrow(ShipmentPrefixDeniedError);
    expect(execute).not.toHaveBeenCalled();
  });
});
