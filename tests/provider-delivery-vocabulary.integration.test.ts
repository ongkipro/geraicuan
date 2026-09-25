import { describe, expect, it } from "vitest";

import { providerOrderStatusLabel } from "@/lib/labels/finance";
import {
  decideProviderDeliveryTransition,
  isUnverifiedProviderDeliveryStatus,
  lookupProviderDeliveryStatus,
  normalizeProviderDeliveryStatus,
  PROVIDER_DELIVERY_STATUS_MAP,
  PROVIDER_DELIVERY_STATUS_UNVERIFIED_MAP,
} from "@/lib/provider-delivery-status";
import type { ShipmentStatus } from "@/lib/shipment-queue";

// T-231 / PR-89. No database: the mapping is pure. The §9.3 list is Mengantar's
// app display vocabulary, not a captured API value, so it lives in its own
// UNVERIFIED map (DATA-13) and never overrides the four observed values.

/** mengantar-app-ui-analysis.md §9.3, as the app spells them. */
const APP_STATUS_PARCEL: Record<string, ShipmentStatus | null> = {
  Error: "PROBLEM",
  "Unpaid Order": null,
  "Menunggu Penjemputan": null,
  "Origin gateway": "IN_TRANSIT",
  "Close by system": "PROBLEM",
  "Proses gateway": "IN_TRANSIT",
  "Proses masuk": "IN_TRANSIT",
  "On delivery": "IN_TRANSIT",
  "Terkirim (Pending)": "IN_TRANSIT",
  "Shipment breach": "PROBLEM",
  "Terkirim (Completed)": "DELIVERED",
  Tertahan: "PROBLEM",
  "Kendala transportasi": "PROBLEM",
  RTS: "RTS_QUEUED",
  "Pengiriman Terkendala": "PROBLEM",
  "Return Origin": "PROBLEM",
  Canceled: "PROBLEM",
  "Gagal Kirim": "PROBLEM",
  "Masalah pengiriman": "PROBLEM",
  "Paket Hilang": "PROBLEM",
};

describe("T-231 Mengantar Status Parcel vocabulary", () => {
  it("maps every §9.3 value as spelled in the app", () => {
    for (const [appValue, expected] of Object.entries(APP_STATUS_PARCEL)) {
      expect(lookupProviderDeliveryStatus(normalizeProviderDeliveryStatus(appValue)), appValue).toBe(expected);
    }
    // Every unverified key is one of the §9.3 values; nothing extra slipped in.
    const listed = new Set(Object.keys(APP_STATUS_PARCEL).map(normalizeProviderDeliveryStatus));
    for (const key of Object.keys(PROVIDER_DELIVERY_STATUS_UNVERIFIED_MAP)) expect(listed.has(key), key).toBe(true);
  });

  it("keeps the observed values verified and flags only the app vocabulary as unverified", () => {
    for (const key of Object.keys(PROVIDER_DELIVERY_STATUS_MAP)) {
      expect(isUnverifiedProviderDeliveryStatus(key), key).toBe(false);
      expect(Object.hasOwn(PROVIDER_DELIVERY_STATUS_UNVERIFIED_MAP, key), key).toBe(false);
    }
    expect(isUnverifiedProviderDeliveryStatus("PAKET HILANG")).toBe(true);
    expect(isUnverifiedProviderDeliveryStatus("ON PROCESS")).toBe(false);
    // Only a clearly terminal value may claim delivery.
    const delivered = Object.entries(PROVIDER_DELIVERY_STATUS_UNVERIFIED_MAP).filter(([, status]) => status === "DELIVERED");
    expect(delivered.map(([key]) => key)).toEqual(["TERKIRIM (COMPLETED)"]);
    // No unverified value can start or advance a return on its own.
    expect(Object.values(PROVIDER_DELIVERY_STATUS_UNVERIFIED_MAP)).not.toContain("RTS_QUEUED");
  });

  it("applies unverified values through the same transition graph", () => {
    expect(decideProviderDeliveryTransition("On delivery", "ISSUED")).toMatchObject({ mappedStatus: "IN_TRANSIT", outcome: "APPLIED" });
    expect(decideProviderDeliveryTransition("Paket Hilang", "IN_TRANSIT")).toMatchObject({ mappedStatus: "PROBLEM", outcome: "APPLIED" });
    expect(decideProviderDeliveryTransition("Terkirim (Completed)", "PROBLEM")).toMatchObject({ mappedStatus: "DELIVERED", outcome: "APPLIED" });
    // Never backwards: in transit after a problem or a delivery, or anything after a return.
    expect(decideProviderDeliveryTransition("Proses gateway", "PROBLEM").outcome).toBe("REFUSED");
    expect(decideProviderDeliveryTransition("On delivery", "DELIVERED").outcome).toBe("REFUSED");
    expect(decideProviderDeliveryTransition("Gagal Kirim", "RTS_QUEUED").outcome).toBe("REFUSED");
    // Not from before our own issuance record says the order exists.
    expect(decideProviderDeliveryTransition("On delivery", "SUBMISSION_UNKNOWN").outcome).toBe("REFUSED");
    expect(decideProviderDeliveryTransition("On delivery", "IN_TRANSIT").outcome).toBe("UNCHANGED");
    expect(decideProviderDeliveryTransition("Unpaid Order", "AWAITING_UPSTREAM_PAYMENT"))
      .toMatchObject({ mappedStatus: null, outcome: "NO_LIFECYCLE_STATE" });
    expect(decideProviderDeliveryTransition("Menunggu Penjemputan", "SUBMISSION_UNKNOWN"))
      .toMatchObject({ mappedStatus: null, outcome: "NO_LIFECYCLE_STATE" });
  });

  it("still refuses a value in neither vocabulary", () => {
    for (const unknown of ["UNDELIVERED", "ON PROCESS", "Terkirim", "Tanpa Pembaruan Setelah 48 jam", ""]) {
      expect(decideProviderDeliveryTransition(unknown, "ISSUED"), unknown).toMatchObject({
        mappedStatus: null,
        outcome: "UNRECOGNISED",
      });
    }
  });

  it("labels every §9.3 value without calling it unknown", () => {
    for (const appValue of Object.keys(APP_STATUS_PARCEL)) {
      expect(providerOrderStatusLabel(appValue), appValue).not.toMatch(/tidak dikenal/);
    }
    expect(providerOrderStatusLabel("Paket Hilang")).toBe("Bermasalah");
    expect(providerOrderStatusLabel("On delivery")).toBe("Dalam perjalanan");
    expect(providerOrderStatusLabel("Unpaid Order")).toBe("Belum dibayar ke Mengantar");
  });
});
