import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/actions", () => ({
  saveShipmentDraft: vi.fn(),
  searchRecipientShipmentContacts: vi.fn(),
  searchSenderShipmentContacts: vi.fn(),
  selectShipmentContact: vi.fn(),
}));

vi.mock("@/app/app/estimate-actions", () => ({
  loadShipmentEstimate: vi.fn(),
}));

import { DraftEstimatePanel } from "@/app/app/draft-estimate-panel";
import {
  invokeContactSearchFromKeyboard,
  SelectedContactProvenance,
} from "@/app/app/shipment-draft-experience";
import { ShipmentDraftForm } from "@/app/app/shipment-draft-form";

function visibleText(markup: string) {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function occurrences(markup: string, value: string) {
  return markup.split(value).length - 1;
}

describe("shipment draft contact and COD experience", () => {
  it("routes Enter to contact search while preventing the draft's default submit", () => {
    const preventDefault = vi.fn();
    const search = vi.fn();

    const handled = invokeContactSearchFromKeyboard(
      { isComposing: false, key: "Enter", preventDefault },
      search,
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledOnce();

    const composingPreventDefault = vi.fn();
    const composingSearch = vi.fn();
    expect(invokeContactSearchFromKeyboard(
      { isComposing: true, key: "Enter", preventDefault: composingPreventDefault },
      composingSearch,
    )).toBe(false);
    expect(composingPreventDefault).not.toHaveBeenCalled();
    expect(composingSearch).not.toHaveBeenCalled();
  });

  it("renders both contact searches with distinct accessible result regions", () => {
    const markup = renderToStaticMarkup(createElement(ShipmentDraftForm, {
      autoFocusFirstField: false,
      outlets: [{ id: "00000000-0000-0000-0000-000000000027", name: "Outlet fixture" }],
      submissionId: "00000000-0000-4000-8000-000000000040",
    }));

    expect(occurrences(markup, 'type="search"')).toBe(2);
    expect(markup).toContain('id="senderContactQuery"');
    expect(markup).toContain('id="recipientContactQuery"');
    expect(markup).toContain('aria-controls="sender-contact-results"');
    expect(markup).toContain('aria-controls="recipient-contact-results"');
    expect(markup).toContain('noValidate=""');
    expect(occurrences(markup, "min-h-11")).toBeGreaterThanOrEqual(18);
  });

  it("shows the selected contact and chosen address provenance", () => {
    const markup = renderToStaticMarkup(createElement(SelectedContactProvenance, {
      addressLabel: "Alamat fixture utama",
      partyLabel: "penerima",
      selection: {
        address: "Alamat fixture tanpa data pelanggan",
        addressId: "00000000-0000-0000-0000-000000000272",
        addressUpdatedAt: "2026-09-01T00:00:00.000Z",
        contactId: "00000000-0000-0000-0000-000000000271",
        contactUpdatedAt: "2026-09-01T00:00:00.000Z",
        destinationAreaId: "AREA-FIXTURE-T27",
        destinationAreaLabel: "Area fixture T27",
        name: "Kontak fixture T27",
        phone: "080000000027",
        role: "RECIPIENT",
      },
    }));
    const text = visibleText(markup);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="Kontak penerima terpilih"');
    expect(text).toContain("Kontak dipilih Kontak fixture T27");
    expect(text).toContain(
      "Alamat dipilih Alamat fixture utama Alamat fixture tanpa data pelanggan",
    );
    expect(text).toContain("Area alamat Area fixture T27");
    expect(text).toContain("Disalin dari direktori kontak penerima");
  });

  it("renders every pre-confirmation COD value independently", () => {
    const markup = renderToStaticMarkup(createElement(DraftEstimatePanel, {
      draftId: "00000000-0000-0000-0000-000000000027",
      isCod: true,
      snapshot: {
        retrievedAt: "2026-08-30T12:00:00.000Z",
        services: [{
          codBreakdown: {
            goodsValueIdr: 100_000,
            providerCodAmountIdr: 113_663,
            serviceFeeIdr: 3_300,
            shippingAmountIdr: 10_000,
            vatAmountIdr: 363,
          },
          codEligible: true,
          deliveryEstimate: "2–3 hari",
          providerService: "Layanan fixture T27",
          shippingAmountIdr: 10_000,
        }],
      },
    }));
    const text = visibleText(markup);

    expect(text).toContain("Rincian penagihan COD sebelum konfirmasi");
    expect(text).toContain("Layanan fixture T27");
    expect(text).toContain("Nilai barang dideklarasikan Rp 100.000");
    expect(text).toContain("Ongkir penyedia Rp 10.000");
    expect(text).toContain("Biaya layanan COD GeraiCUAN Rp 3.300");
    expect(text).toContain("PPN biaya layanan Rp 363");
    expect(text).toContain("Total ditagih ke pelanggan Rp 113.663");
    expect(text).toContain("belum mengonfirmasi layanan atau membuat pesanan ke penyedia");
  });

  it("keeps non-COD free of COD totals and explains an all-ineligible COD result", () => {
    const nonCod = visibleText(renderToStaticMarkup(createElement(DraftEstimatePanel, {
      draftId: "00000000-0000-0000-0000-000000000027",
      isCod: false,
      snapshot: {
        retrievedAt: "2026-08-30T12:00:00.000Z",
        services: [{
          codBreakdown: null,
          codEligible: true,
          deliveryEstimate: "2–3 hari",
          providerService: "Layanan non-COD",
          shippingAmountIdr: 10_000,
        }],
      },
    })));
    expect(nonCod).not.toContain("Rincian penagihan COD");

    const ineligible = visibleText(renderToStaticMarkup(createElement(DraftEstimatePanel, {
      draftId: "00000000-0000-0000-0000-000000000027",
      isCod: true,
      snapshot: {
        retrievedAt: "2026-08-30T12:00:00.000Z",
        services: [{
          codBreakdown: null,
          codEligible: false,
          deliveryEstimate: "2–3 hari",
          providerService: "Layanan tanpa COD",
          shippingAmountIdr: 10_000,
        }],
      },
    })));
    expect(ineligible).toContain("COD tidak tersedia");
    expect(ineligible).toContain("Tidak ada layanan yang mendukung COD");
  });
});
