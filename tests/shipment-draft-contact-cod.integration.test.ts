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

vi.mock("@/app/app/location-actions", () => ({
  searchMengantarDestinationAreas: vi.fn(),
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
      outlets: [{ id: "00000000-0000-0000-0000-000000000027", name: "Outlet fixture", pickupPoints: [] }],
      submissionId: "00000000-0000-4000-8000-000000000040",
    }));

    // PR-48: the contact picker is now the shared combobox — a role="combobox"
    // trigger (id kept stable) whose in-popup CommandInput only renders once
    // opened, so SSR markup asserts on the always-rendered trigger contract.
    expect(occurrences(markup, 'role="combobox"')).toBeGreaterThanOrEqual(2);
    expect(markup).toContain('id="senderContactQuery"');
    expect(markup).toContain('id="recipientContactQuery"');
    expect(markup).toContain('aria-controls="senderContactQuery-list"');
    expect(markup).toContain('aria-controls="recipientContactQuery-list"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('noValidate=""');
    expect(occurrences(markup, "min-h-11")).toBeGreaterThanOrEqual(14);
    expect(markup).toContain('name="destinationMode"');
    expect(markup).toContain("Area tujuan Mengantar");
    expect(markup).not.toContain("ID area tujuan");
    expect(markup.indexOf("Outlet asal")).toBeLessThan(markup.indexOf("Area tujuan Mengantar"));
  });

  // Owner steering 2026-09-16: the form read as one long sheet with no visible break
  // between origin, sender, recipient and package. Each section is a card whose headline
  // sits on the shared muted band, and the first section is no longer unlabelled.
  it("separates the draft form into named sections with banded headlines", () => {
    const markup = renderToStaticMarkup(createElement(ShipmentDraftForm, {
      autoFocusFirstField: false,
      outlets: [{ id: "00000000-0000-0000-0000-000000000027", name: "Outlet fixture", pickupPoints: [] }],
      submissionId: "00000000-0000-4000-8000-000000000041",
    }));

    // The headline now opens with a lucide marker, so read the heading's text content.
    const headings = [...markup.matchAll(/<h2[^>]*data-slot="card-title"[^>]*>([\s\S]*?)<\/h2>/g)]
      .map(([, inner]) => inner.replace(/<[^>]*>/g, "").trim());
    expect(headings).toEqual([
      "Gudang asal",
      "Pengirim",
      "Penerima",
      "Paket",
      "Instruksi dan penanganan",
      "Nilai dan pembayaran",
    ]);
    // Every one of those headlines carries the band, not just the first.
    const banded = [...markup.matchAll(/<div[^>]*data-slot="card-header"[^>]*class="([^"]*)"/g)]
      .filter(([, className]) => className.includes("bg-muted/40") && className.includes("border-b"));
    expect(banded).toHaveLength(headings.length);
    // Every section headline carries an icon marker, and the icon is decorative only.
    const markedHeadings = [...markup.matchAll(/<h2[^>]*data-slot="card-title"[^>]*>([\s\S]*?)<\/h2>/g)]
      .filter(([, inner]) => /<svg[^>]*aria-hidden="true"/.test(inner));
    expect(markedHeadings).toHaveLength(headings.length);
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
            providerCodAmountIdr: 113_790,
            shippingAmountIdr: 10_000,
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
    // T-193: one Biaya COD — Mengantar's fee on the total, VAT inside — and the round-up.
    expect(text).toContain("Biaya COD Mengantar 3,33% (termasuk PPN Rp 375) Rp 3.789");
    expect(text).toContain("Pembulatan ke rupiah Rp 1");
    expect(text).not.toMatch(/PPN biaya COD|Rp 3\.414|Rp 376/);
    expect(text).toContain("Total ditagih ke pelanggan Rp 113.790");
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
