import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildTrackingTimeline,
  codNetAmountIdr,
  detailNextStep,
  queueBackHref,
  staleCheckAvailable,
  type DetailNextStepInput,
} from "@/app/app/pengiriman/[shipmentId]/detail-model";
import { DefinitionGrid, RouteHeader, TrackingTimeline } from "@/app/app/pengiriman/[shipmentId]/detail-parts";
import { mengantarCodFeeIdr } from "@/lib/mengantar-cod-fee";

/**
 * T-213 (Detail kiriman, spec 17 §UX-v3.6 `/app/pengiriman/[n]`): the rail's next step per
 * status, the tracking timeline, the COD net amount and key markup. No database, no provider.
 */

const base: DetailNextStepInput = {
  batchStatus: null,
  hasAwb: false,
  hasEstimate: false,
  recoveryStatus: null,
  role: "TENANT_ADMIN",
  shipmentId: "11111111-1111-4111-8111-111111111111",
  shipmentNumber: "10058",
  status: "DRAFT",
};

describe("rail: one next step per status", () => {
  it("prints resi + invoice for Resi terbit and every later state, with label-only and invoice links", () => {
    for (const status of ["ISSUED", "IN_TRANSIT", "DELIVERED", "PROBLEM", "RTS_QUEUED", "RTS_IN_TRANSIT", "RTS_RECEIVED"] as const) {
      expect(detailNextStep({ ...base, hasAwb: true, status })).toEqual({
        invoiceHref: "/app/invoice/10058",
        kind: "print",
        labelHref: "/app/label/10058",
        printBothHref: "/app/label/10058?invoice=1",
      });
    }
    expect(detailNextStep({ ...base, hasAwb: false, status: "ISSUED" }).kind).toBe("none");
  });

  it("offers issuance on Diestimasi only with a stored estimate, else the draft", () => {
    expect(detailNextStep({ ...base, hasEstimate: true, status: "ESTIMATED" })).toMatchObject({ kind: "issue" });
    expect(detailNextStep({ ...base, status: "ESTIMATED" })).toMatchObject({ kind: "review-estimate" });
    expect(detailNextStep({ ...base, status: "DRAFT" })).toEqual({
      href: "/app/pengiriman/baru?draft=11111111-1111-4111-8111-111111111111",
      kind: "resume-draft",
    });
  });

  it("gives recovery and reconciliation to the Tenant Admin only (UX-v3.3)", () => {
    expect(detailNextStep({ ...base, status: "AWAITING_UPSTREAM_PAYMENT" }).kind).toBe("recover");
    expect(detailNextStep({ ...base, role: "OPERATOR", status: "AWAITING_UPSTREAM_PAYMENT" }).kind).toBe("none");
    expect(detailNextStep({ ...base, status: "SUBMISSION_UNKNOWN" }).kind).toBe("reconcile");
    expect(detailNextStep({ ...base, role: "OPERATOR", status: "SUBMISSION_UNKNOWN" }).kind).toBe("none");
  });

  it("never re-runs a recovery whose payment outcome is unknown", () => {
    for (const recoveryStatus of ["PAYING", "PAYMENT_UNKNOWN"]) {
      expect(detailNextStep({ ...base, recoveryStatus, status: "AWAITING_UPSTREAM_PAYMENT" }).kind).toBe("none");
    }
  });

  it("has no manual step while queued, and a new draft after failure", () => {
    expect(detailNextStep({ ...base, status: "SUBMISSION_QUEUED" }).kind).toBe("none");
    expect(detailNextStep({ ...base, status: "FAILED" })).toEqual({ href: "/app/pengiriman/baru", kind: "new-draft" });
  });

  it("offers the stale check for a submitting batch, and for a paying recovery to the admin only", () => {
    expect(staleCheckAvailable({ batchStatus: "SUBMITTING", recoveryStatus: null, role: "OPERATOR" })).toBe(true);
    expect(staleCheckAvailable({ batchStatus: "COMPLETED", recoveryStatus: "PAYING", role: "TENANT_ADMIN" })).toBe(true);
    expect(staleCheckAvailable({ batchStatus: "COMPLETED", recoveryStatus: "PAYING", role: "OPERATOR" })).toBe(false);
    expect(staleCheckAvailable({ batchStatus: "COMPLETED", recoveryStatus: null, role: "TENANT_ADMIN" })).toBe(false);
  });
});

describe("Detail pelacakan", () => {
  const created = new Date("2026-09-25T02:15:00.000Z");
  const issued = new Date("2026-09-25T03:13:00.000Z");

  it("lists Mengantar history newest first with its own time and description, then local facts", () => {
    const entries = buildTrackingTimeline({
      awb: "11LP1700187536",
      createdAt: created,
      issuedAt: issued,
      observations: [
        { lastHistoryAt: new Date("2026-09-26T01:00:00.000Z"), lastHistoryDesc: "Paket diterima di gudang Makassar", mappedStatus: "IN_TRANSIT", observedAt: new Date("2026-09-26T02:00:00.000Z"), providerStatus: "On delivery" },
        { lastHistoryAt: null, lastHistoryDesc: null, mappedStatus: null, observedAt: new Date("2026-09-25T06:00:00.000Z"), providerStatus: "Menunggu Penjemputan" },
      ],
    });
    expect(entries.map((entry) => entry.title)).toEqual(["Dalam perjalanan", "Menunggu Penjemputan", "Resi terbit", "Kiriman dibuat"]);
    expect(entries[0]).toMatchObject({ at: new Date("2026-09-26T01:00:00.000Z"), detail: "Paket diterima di gudang Makassar" });
  });

  it("collapses repeated pulls that saw nothing new into the earliest sighting", () => {
    const same = { lastHistoryAt: new Date("2026-09-26T01:00:00.000Z"), lastHistoryDesc: "Kurir menuju alamat", mappedStatus: "IN_TRANSIT" as const, providerStatus: "On delivery" };
    const entries = buildTrackingTimeline({
      awb: null,
      createdAt: created,
      issuedAt: null,
      observations: [
        { ...same, observedAt: new Date("2026-09-26T03:00:00.000Z") },
        { ...same, observedAt: new Date("2026-09-26T02:00:00.000Z") },
      ],
    });
    expect(entries.map((entry) => entry.title)).toEqual(["Dalam perjalanan", "Kiriman dibuat"]);
  });

  it("renders time (WIB), status and description; the newest entry is marked", () => {
    const html = renderToStaticMarkup(createElement(TrackingTimeline, {
      entries: [
        { at: issued, detail: "AWB 11LP1700187536 diterima dari Mengantar", key: "a", title: "Resi terbit" },
        { at: created, detail: null, key: "b", title: "Kiriman dibuat" },
      ],
    }));
    expect(html).toContain("25 Sep 2026, 10.13 WIB");
    expect(html).toContain("Resi terbit");
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain("font-bold");
  });
});

describe("Jumlah bersih (estimasi pencairan)", () => {
  it("is COD − shipping Mengantar deducts − 3.33% COD fee, COD methods only", () => {
    expect(codNetAmountIdr({ chargedShippingIdr: 21_000, paymentMethod: "COD", providerCodAmountIdr: 119_479 }))
      .toBe(119_479 - 21_000 - mengantarCodFeeIdr(119_479));
    expect(codNetAmountIdr({ chargedShippingIdr: 21_000, paymentMethod: "COD_ONGKIR", providerCodAmountIdr: 27_000 }))
      .toBe(27_000 - 21_000 - mengantarCodFeeIdr(27_000));
    expect(codNetAmountIdr({ chargedShippingIdr: 21_000, paymentMethod: "NON_COD", providerCodAmountIdr: null })).toBeNull();
  });

  it("is unknown before an order, on legacy snapshots and never negative", () => {
    expect(codNetAmountIdr({ chargedShippingIdr: 21_000, paymentMethod: "COD", providerCodAmountIdr: null })).toBeNull();
    expect(codNetAmountIdr({ chargedShippingIdr: null, paymentMethod: "COD", providerCodAmountIdr: 119_479 })).toBeNull();
    expect(codNetAmountIdr({ chargedShippingIdr: 30_000, paymentMethod: "COD_ONGKIR", providerCodAmountIdr: 20_000 })).toBeNull();
  });
});

describe("markup and navigation", () => {
  it("carries only the queue's range keys back", () => {
    expect(queueBackHref({ rentang: "30-hari", tz: "Asia/Jakarta" })).toBe("/app/pengiriman?rentang=30-hari&tz=Asia%2FJakarta");
    expect(queueBackHref({ evil: "x", rentang: ["a", "b"] })).toBe("/app/pengiriman");
  });

  it("renders a definition list and the three route stops", () => {
    const grid = renderToStaticMarkup(createElement(DefinitionGrid, { items: [{ label: "Berat", value: "1,2 kg" }] }));
    expect(grid).toContain("<dt");
    expect(grid).toContain("1,2 kg");
    const route = renderToStaticMarkup(createElement(RouteHeader, {
      courier: { title: "Lion Parcel Regpack" },
      estimate: "2–3 hari",
      recipient: { title: "Andi Makkasau" },
      sender: { title: "Sekar Batik" },
    }));
    expect(route.match(/<li/g)).toHaveLength(3);
    expect(route).toContain("Estimasi tiba 2–3 hari");
  });
});
