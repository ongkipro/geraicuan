import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LabelSheet } from "@/app/app/label/[shipmentId]/label-sheet";
import type { PrintableLabel } from "@/db/label-print-repository";

const SHIPMENT_ID = "00000000-0000-4000-8000-000000000431";

function printableLabel(overrides: Partial<PrintableLabel> = {}): PrintableLabel {
  return {
    awb: "JNE-LABEL-000431",
    codBreakdown: null,
    courier: "JNE",
    destinationAreaLabel: "Gambir, Jakarta Pusat",
    insuranceAmountIdr: null,
    isCod: false,
    paymentMethod: "NON_COD",
    issuedAt: new Date("2026-09-01T01:00:00.000Z"),
    lastPrintedAt: null,
    outletName: "Outlet Label Pusat",
    package: {
      content: "Pakaian",
      declaredValueIdr: 150_000,
      heightCm: 25,
      lengthCm: 40,
      quantity: 1,
      weightGrams: 2_450,
      widthCm: 30,
    },
    printCount: 0,
    providerCodAmountIdr: null,
    providerService: "REG",
    recipient: {
      address: "Jl. Penerima 1",
      name: "Penerima Label",
      phone: "081299998765",
    },
    sender: {
      address: "Jl. Pengirim 2",
      name: "Pengirim Label",
      phone: "081211110000",
    },
    shipmentId: SHIPMENT_ID,
    publicReference: "GC-10431",
    shippingAmountIdr: 8_000,
    ...overrides,
  };
}

describe("physical LabelSheet contract", () => {
  it("retains one physical sheet with the package label, cut line and sender stub by default", () => {
    const html = renderToStaticMarkup(createElement(LabelSheet, { label: printableLabel() }));

    expect(html.match(/<article/g)).toHaveLength(1);
    expect(html).toMatch(/<article aria-label="Label 10 × 15 cm: label paket dan bukti pengirim" class="label-sheet" data-label-size="10x15">/);
    expect(html.match(/class="label-head"/g)).toHaveLength(1);
    expect(html.match(/class="label-party(?: |")/g)).toHaveLength(2);
    expect(html.match(/class="label-payment"/g)).toHaveLength(1);
    expect(html.match(/class="label-footer"/g)).toHaveLength(1);
    expect(html.match(/class="label-stub"/g)).toHaveLength(1);
    expect(html).toContain("JNE-LABEL-000431");
    expect(html.replace(/<[^>]+>/g, " ")).toContain("GC-10431");
    expect(html.replace(/<[^>]+>/g, " ")).not.toContain(SHIPMENT_ID);
    expect(html).toContain("Penerima Label");
    expect(html).toContain("Pengirim Label");
    expect(html).not.toContain("label-hide");
  });

  it("prints the sheet without a barcode when the AWB is too long to scan", () => {
    const html = renderToStaticMarkup(createElement(LabelSheet, { label: printableLabel({ awb: "A".repeat(30) }) }));

    expect(html).not.toContain("label-barcode");
    // The AWB text itself still prints so the courier can key it in.
    expect(html).toContain("A".repeat(30));
  });
});
