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
  // T-238 (owner): a cancellation is its own terminal state.
  Canceled: "CANCELLED",
  "Gagal Kirim": "PROBLEM",
  "Masalah pengiriman": "PROBLEM",
  "Paket Hilang": "PROBLEM",
};

/**
 * T-238: Mengantar Public API docs (api-public.mengantar.com/docs/, 2026-09-26) — the webhook
 * `status_category` "common values" and the `GET /order` `status` filter values, plus the
 * `GET /order` example's `status: "active"`. Documented, never captured: unverified map.
 */
const DOCUMENTED_STATUS: Record<string, ShipmentStatus | null> = {
  "PENDING PICKUP": null,
  "PICKED UP": "IN_TRANSIT",
  "ON DELIVERY": "IN_TRANSIT",
  DELIVERED: "DELIVERED",
  UNDELIVERED: "PROBLEM",
  "PICKUP FAILED": "PROBLEM",
  RTS: "RTS_QUEUED",
  "ACTIVE/WAITING NEXT PROCESS": null,
  ERROR: "PROBLEM",
  CANCELED: "CANCELLED",
  CANCELLED: "CANCELLED",
  DELIVERED_PENDING: "IN_TRANSIT",
  DELIVERED_COMPLETED: "DELIVERED",
  active: null,
};

describe("T-238 documented Mengantar status values", () => {
  it("maps every documented value conservatively without touching the live-verified map", () => {
    for (const [value, expected] of Object.entries(DOCUMENTED_STATUS)) {
      expect(lookupProviderDeliveryStatus(normalizeProviderDeliveryStatus(value)), value).toBe(expected);
    }
    expect(PROVIDER_DELIVERY_STATUS_MAP).toEqual({
      DELIVERED: "DELIVERED",
      "DELIVERY PROBLEM": "PROBLEM",
      RTS: "RTS_QUEUED",
      "PENDING PICKUP": null,
    });
    expect(isUnverifiedProviderDeliveryStatus("DELIVERED_PENDING")).toBe(true);
    // A pending delivery is not final; only the completed one is.
    expect(decideProviderDeliveryTransition("DELIVERED_PENDING", "ISSUED")).toMatchObject({ mappedStatus: "IN_TRANSIT", outcome: "APPLIED" });
    expect(decideProviderDeliveryTransition("DELIVERED_COMPLETED", "IN_TRANSIT")).toMatchObject({ mappedStatus: "DELIVERED", outcome: "APPLIED" });
    expect(decideProviderDeliveryTransition("Pickup Failed", "ISSUED")).toMatchObject({ mappedStatus: "PROBLEM", outcome: "APPLIED" });
    // Owner 2026-09-26: CANCELLED only from ISSUED / IN_TRANSIT / PROBLEM; terminal after.
    // T-247 (M1): and from AWAITING_UPSTREAM_PAYMENT — Mengantar cancelling an unpaid order.
    for (const from of ["ISSUED", "IN_TRANSIT", "PROBLEM", "AWAITING_UPSTREAM_PAYMENT"] as const) {
      expect(decideProviderDeliveryTransition("CANCELLED", from), from).toMatchObject({ mappedStatus: "CANCELLED", outcome: "APPLIED" });
      expect(decideProviderDeliveryTransition("Canceled", from).outcome, from).toBe("APPLIED");
    }
    for (const from of ["DELIVERED", "RTS_QUEUED", "RTS_IN_TRANSIT", "RTS_RECEIVED", "SUBMISSION_UNKNOWN", "FAILED", "DRAFT"] as const) {
      expect(decideProviderDeliveryTransition("CANCELLED", from).outcome, from).toBe("REFUSED");
    }
    expect(decideProviderDeliveryTransition("CANCELLED", "CANCELLED").outcome).toBe("UNCHANGED");
    for (const later of ["DELIVERED", "RTS", "On delivery", "Paket Hilang"]) {
      expect(decideProviderDeliveryTransition(later, "CANCELLED").outcome, later).toBe("REFUSED");
    }
    expect(providerOrderStatusLabel("CANCELED")).toBe("Dibatalkan");
    expect(decideProviderDeliveryTransition("ACTIVE/WAITING NEXT PROCESS", "ISSUED")).toMatchObject({ mappedStatus: null, outcome: "NO_LIFECYCLE_STATE" });
    expect(providerOrderStatusLabel("ACTIVE/WAITING NEXT PROCESS")).toBe("Menunggu proses berikutnya");
    expect(providerOrderStatusLabel("active")).toBe("Aktif di Mengantar");
  });
});

describe("T-231 Mengantar Status Parcel vocabulary", () => {
  it("maps every §9.3 value as spelled in the app", () => {
    for (const [appValue, expected] of Object.entries(APP_STATUS_PARCEL)) {
      expect(lookupProviderDeliveryStatus(normalizeProviderDeliveryStatus(appValue)), appValue).toBe(expected);
    }
    // Every unverified key is one of the §9.3 values or a T-238 documented value; nothing extra slipped in.
    const listed = new Set([...Object.keys(APP_STATUS_PARCEL), ...Object.keys(DOCUMENTED_STATUS)].map(normalizeProviderDeliveryStatus));
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
    expect(delivered.map(([key]) => key).sort()).toEqual(["DELIVERED_COMPLETED", "TERKIRIM (COMPLETED)"]);
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
    for (const unknown of ["ON PROCESS", "Terkirim", "Tanpa Pembaruan Setelah 48 jam", "RETURNED TO SHIPPER", ""]) {
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
