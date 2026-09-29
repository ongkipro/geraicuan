import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IssuanceProvider, IssuanceServiceChooser, isOrderableOption } from "@/app/app/pengiriman/_components/issuance-panel";
import type { ShipmentEstimateOption } from "@/lib/shipment-estimate-options";

// T-260 (owner 2026-09-28: "untuk spx mungkin hold dulu (aktif namun belum bisa di pakai)"):
// a quote-only service is listed but cannot be chosen; the order builder refuses it as well.
const option = (providerService: string, estimateServiceId: string): ShipmentEstimateOption => ({
  codBreakdown: null,
  codEligible: true,
  deliveryEstimate: "1-2 Hari",
  estimateServiceId,
  insuranceAmountIdr: null,
  providerService,
  shippingAmountIdr: 20_000,
});

function render(options: ShipmentEstimateOption[]) {
  const props = {
    declaredValueIdr: 100_000,
    fixtureEnabled: false,
    options,
    paymentMethod: "NON_COD",
    shipmentId: "00000000-0000-4000-8000-000000000260",
    snapshotId: "00000000-0000-4000-8000-000000000261",
  } as Parameters<typeof IssuanceProvider>[0];
  return renderToStaticMarkup(createElement(IssuanceProvider, props, createElement(IssuanceServiceChooser)));
}

const radioFor = (html: string, id: string) => html.match(new RegExp(`<input[^>]*value="${id}"[^>]*>`))?.[0] ?? "";

describe("SPX on hold in the issuance service list (T-260)", () => {
  it("uses the order builder's rule: spx, paxel and SAPLite are not orderable, JNE is", () => {
    expect(["spx", "paxel", "SAPLite"].map((service) => isOrderableOption({ providerService: service }))).toEqual([false, false, false]);
    expect(isOrderableOption({ providerService: "JNE" })).toBe(true);
  });

  it("lists spx disabled with 'Segera hadir' while JNE stays selectable", () => {
    const html = render([option("JNE", "svc-jne"), option("spx", "svc-spx")]);
    expect(radioFor(html, "svc-spx")).toMatch(/\sdisabled(=""|\s|>)/);
    expect(radioFor(html, "svc-jne")).not.toMatch(/\sdisabled(=""|\s|>)/);
    expect(html.match(/>Segera hadir</g)).toHaveLength(1);
    expect(html).toContain("Belum bisa dipesan lewat Mengantar");
  });

  it("explains an estimate that holds only quote-only services instead of blaming COD", () => {
    const html = render([option("spx", "svc-spx")]);
    expect(html).toContain("Layanan untuk rute ini belum bisa dipesan lewat Mengantar.");
    expect(html).not.toContain('name="estimateServiceId"');
  });
});

describe("Mitra kurir marks quote-only couriers (T-260)", () => {
  it("flags spx and paxel 'Segera hadir' and no orderable courier", async () => {
    const { mengantarDocumentedOrderCourier } = await import("@/lib/mengantar-couriers");
    const { SELECTABLE_COURIERS } = await import("@/lib/gerai-settings");
    const quoteOnly = SELECTABLE_COURIERS.filter((courier) => mengantarDocumentedOrderCourier(courier) === null);
    expect([...quoteOnly].sort()).toEqual(["paxel", "spx"]);
    const source = (await import("node:fs")).readFileSync("src/app/app/pengaturan/kurir/courier-preferences.tsx", "utf8");
    expect(source).toMatch(/quoteOnly \? <StatusBadge label="Segera hadir"/);
  });
});
