import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T-263 (critique 2026-09-29 #2): the counter operator's path — role landing, the Cetak resi
 * queue default, folded sections in Buat kiriman, the mobile Filter sheet, whole-card record
 * targets, the label page order with one print button, the stub's handover time, and the
 * thermal sheet's Non-COD line. No database (the queue contents are in state-summary-panel).
 */

const principal = vi.hoisted(() => ({ current: null as null | Record<string, unknown> | "denied" }));

vi.mock("@/lib/cms-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cms-auth")>();
  return {
    ...actual,
    requireCmsScope: async () => {
      if (principal.current === "denied") throw new actual.CmsAuthorizationDeniedError("anonymous");
      return principal.current;
    },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/label",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

const { tenantLandingPath } = await import("@/lib/cms-shell-navigation");
const { tenantLandingAction } = await import("@/app/login/actions");
const { DEFAULT_PRINT_STATE, labelIndexHref, parseLabelQuery } = await import("@/app/app/label/label-query");
const { activeFilterCount } = await import("@/app/app/pengiriman/_list/search-params");
const { ListFilterSheet } = await import("@/components/app/list-filter-sheet");
const { RecordItem } = await import("@/components/app/record-list");
const flow = await import("@/app/app/pengiriman/baru/flow-parts");
const { ShipmentCreateForm } = await import("@/app/app/pengiriman/baru/shipment-create-form");
const { LabelPrintPanel } = await import("@/app/app/label/[shipmentId]/label-print-panel");
const { LabelSheet } = await import("@/app/app/label/[shipmentId]/label-sheet");
const { MONEY_LABELS } = await import("@/lib/shipment-money");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("landing after a tenant sign-in", () => {
  beforeEach(() => { principal.current = null; });

  it("sends an Operator of an active gerai to Cetak resi and everyone else to Dasbor", () => {
    expect(tenantLandingPath("OPERATOR", "ACTIVE")).toBe("/app/label");
    expect(tenantLandingPath("TENANT_ADMIN", "ACTIVE")).toBe("/app");
    // A gerai awaiting approval: its setup steps are on Dasbor and Cetak resi refuses it.
    expect(tenantLandingPath("OPERATOR", "PROVISIONING")).toBe("/app");
    expect(tenantLandingPath("TENANT_ADMIN", "PROVISIONING")).toBe("/app");
  });

  it("reads the role from the session the sign-in set, and falls back to /app without one", async () => {
    principal.current = { role: "OPERATOR", scope: "tenant", tenantId: "t", tenantStatus: "ACTIVE", userId: "u" };
    expect(await tenantLandingAction()).toBe("/app/label");
    principal.current = { role: "TENANT_ADMIN", scope: "tenant", tenantId: "t", tenantStatus: "ACTIVE", userId: "u" };
    expect(await tenantLandingAction()).toBe("/app");
    principal.current = "denied";
    expect(await tenantLandingAction()).toBe("/app");
  });

  it("is wired into the tenant login only; /app, the menu and the home link are unchanged", () => {
    const form = read("src/app/login/_components/login-form.tsx");
    expect(form).toMatch(/window\.location\.assign\(tenant \? await tenantLandingAction\(\)\.catch\(\(\) => destination\) : destination\)/);
    expect(read("src/app/login/tenant/page.tsx")).toContain('destination="/app"');
    // Dasbor stays the owner's page and a menu item for both roles.
    expect(read("src/app/app/page.tsx")).not.toMatch(/redirect\("\/app\/label"\)/);
  });
});

describe("Cetak resi opens on Belum dicetak", () => {
  it("reads no `cetak` as Belum dicetak and `cetak=semua` as Semua", () => {
    expect(DEFAULT_PRINT_STATE).toBe("belum");
    expect(parseLabelQuery({}).printState).toBe("belum");
    expect(parseLabelQuery({ cetak: "semua" }).printState).toBe("semua");
    expect(parseLabelQuery({ cetak: "sudah" }).printState).toBe("sudah");
    expect(parseLabelQuery({ cetak: "lain" }).printState).toBe("belum");
  });

  it("writes every state as a link that reopens the same list", () => {
    expect(labelIndexHref({ printState: "belum" })).toBe("/app/label");
    expect(labelIndexHref({ printState: "semua" })).toBe("/app/label?cetak=semua");
    expect(labelIndexHref({ awbSuffix: "ABC", printState: "sudah" }, { rentang: "7-hari" })).toBe("/app/label?rentang=7-hari&q=ABC&cetak=sudah");
    for (const state of ["semua", "belum", "sudah", "batal"] as const) {
      const href = labelIndexHref({ printState: state });
      expect(parseLabelQuery(Object.fromEntries(new URL(href, "http://x").searchParams)).printState).toBe(state);
    }
  });

  it("names the printed tile Siap diserahkan and keeps Semua one tap away", () => {
    const page = read("src/app/app/label/page.tsx");
    expect(page).toMatch(/label: "Siap diserahkan", metricId: "LBL-PRINTED", value: "sudah"/);
    expect(page).toMatch(/allHref=\{query\.printState === "semua" \? undefined : allHref\}/);
    expect(page).toMatch(/Tampilkan semua resi/);
  });
});

describe("mobile Filter sheet", () => {
  it("counts the filters that differ from the list's default", () => {
    expect(activeFilterCount({ defaultStatus: "belum", presetId: "30-hari", status: "belum" })).toBe(0);
    expect(activeFilterCount({ defaultStatus: "belum", presetId: "30-hari", status: "semua" })).toBe(1);
    expect(activeFilterCount({ defaultStatus: "ALL", presetId: "7-hari", status: "ISSUED" })).toBe(2);
    expect(activeFilterCount({ defaultStatus: "ALL", presetId: "kustom", status: "ALL" })).toBe(1);
  });

  const sheet = (count: number, allHref?: string) => renderToStaticMarkup(createElement(ListFilterSheet, {
    action: "/app/label",
    allHref,
    clearHref: "/app/label",
    count,
    options: [{ count: 3, label: "Belum dicetak", value: "belum" }],
    range: { endDate: "2026-09-30", presetId: "30-hari", startDate: "2026-09-01" },
    search: createElement("form", { role: "search" }),
    statusLegend: "Status cetak",
    statusName: "cetak",
    summary: "Belum dicetak · 30 hari terakhir",
    value: "belum",
  }));

  it("puts the search first, then one Filter button carrying the count, phones only", () => {
    const html = sheet(2, "/app/label?cetak=semua");
    expect(html).toMatch(/^<div class="flex flex-col gap-2 md:hidden" data-slot="list-filter-sheet">/);
    expect(html.indexOf('role="search"')).toBeLessThan(html.indexOf('aria-label="Filter, 2 aktif"'));
    expect(html).toMatch(/data-slot="filter-count"[^>]*>2</);
    expect(text(html)).toContain("Belum dicetak · 30 hari terakhir");
    expect(html).toContain('href="/app/label?cetak=semua"');
    const none = sheet(0);
    expect(none).toContain('aria-label="Filter"');
    expect(none).not.toContain("filter-count");
  });

  it("hides the desktop filter row, tiles and status select below 768px on all three lists", () => {
    for (const path of ["src/app/app/label/page.tsx", "src/app/app/pengiriman/page.tsx", "src/app/app/pengiriman/rts/page.tsx"]) {
      const page = read(path);
      expect(page, path).toContain("<ListFilterSheet");
      expect(page, path).toMatch(/<div className="max-md:hidden">\s*<PeriodFilter/);
      expect(page, path).toMatch(/<StatusTiles\s+className="max-md:hidden"/);
    }
    expect(read("src/app/app/pengiriman/page.tsx")).toMatch(/<div className="max-md:hidden">\s*<StatusSelect/);
  });
});

describe("record card as the tap target", () => {
  it("stretches the identity link over the card and keeps the detail slot clickable above it", () => {
    const html = renderToStaticMarkup(createElement(RecordItem, {
      detail: createElement("button", { type: "button" }, "Pilih untuk cetak"),
      href: "/app/label/10178",
      title: "JX123",
    }));
    expect(html).toMatch(/<li class="[^"]*\brelative\b[^"]*" data-slot="record-item">/);
    const link = /<a [^>]*data-slot="record-link"[^>]*>/.exec(html)?.[0] ?? "";
    expect(link).toContain("after:absolute");
    expect(link).toContain("after:inset-0");
    expect(link).toContain('href="/app/label/10178"');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toMatch(/<div class="relative z-10" data-slot="record-detail"><button/);
  });

  it("leaves a card without href as plain text", () => {
    const html = renderToStaticMarkup(createElement(RecordItem, { title: "GC-1" }));
    expect(html).not.toContain("<a ");
    expect(html).not.toMatch(/class="[^"]*\brelative\b/);
  });

  it("gives the Cetak resi selection a full-width 44px row", () => {
    const source = read("src/app/app/label/batch-selection.tsx");
    expect(source).toMatch(/visibleLabel \? "flex min-h-11 w-full items-center gap-3"/);
    expect(source).toMatch(/<label className="flex min-h-11 flex-1 cursor-pointer items-center text-sm" htmlFor=\{id\}>\s*Pilih untuk cetak<span className="sr-only"> resi \{awb\}<\/span>/);
  });
});

describe("Buat kiriman folds complete sections on phones", () => {
  const card = (collapsed: boolean) => renderToStaticMarkup(createElement(
    flow.SectionCard,
    {
      aside: null,
      collapse: { collapsed, onToggle: () => undefined, summary: "Penjemputan terjadwal · Rab, 30 Sep" },
      id: "section-handover",
      number: 1,
      state: "complete",
      title: "Penyerahan paket & asal",
    } as Parameters<typeof flow.SectionCard>[0],
    createElement("input", { id: "first" }),
  ));

  it("folded: summary line and Ubah (aria-expanded false) controlling a body hidden below 768px only", () => {
    const html = card(true);
    expect(html).toMatch(/data-slot="section-summary"[^>]*>Penjemputan terjadwal · Rab, 30 Sep</);
    expect(html).toMatch(/<button[^>]*aria-controls="section-handover-body" aria-expanded="false"[^>]*>Ubah<span class="sr-only"> Penyerahan paket &amp; asal<\/span>/);
    expect(html).toMatch(/<div class="flex flex-col gap-5 max-md:hidden" data-slot="section-body" id="section-handover-body"><input id="first"/);
    expect(html).toMatch(/data-slot="section-fold"[^>]*/);
    expect(/class="([^"]*)" data-slot="section-fold"/.exec(html)?.[1]).toContain("md:hidden");
  });

  it("unfolded: Selesai (aria-expanded true) and the body shown", () => {
    const html = card(false);
    expect(html).toMatch(/aria-expanded="true"[^>]*>Selesai/);
    expect(html).not.toContain("data-slot=\"section-summary\"");
    expect(html).toMatch(/<div class="flex flex-col gap-5" data-slot="section-body" id="section-handover-body">/);
  });

  it("opens the form with the pre-filled pickup section folded and the recipient section open", () => {
    const html = renderToStaticMarkup(createElement(ShipmentCreateForm, {
      gerai: { name: "Gerai Uji", phone: "081234567890" },
      nowIso: "2026-09-26T03:00:00.000Z",
      outlets: [{
        id: "00000000-0000-4000-8000-000000000263",
        name: "Outlet Uji",
        pickupPoints: [{ isDefault: true, originAreaLabel: "Coblong, Kota Bandung", pickupAddressId: "P-1", pickupAddressLabel: "Gudang, Jl. Dago 1" }],
      }],
      steps: [
        { detail: "a", label: "Isi data", state: "current" },
        { detail: "b", label: "Cek tarif", state: "pending" },
        { detail: "c", label: "Terbitkan resi", state: "pending" },
      ],
      submissionId: "00000000-0000-4000-8000-000000000264",
    }));
    expect(html).toMatch(/id="section-handover-body"/);
    expect(/<div class="([^"]*)" data-slot="section-body" id="section-handover-body"/.exec(html)?.[1]).toContain("max-md:hidden");
    expect(/<div class="([^"]*)" data-slot="section-body" id="section-parties-body"/.exec(html)?.[1]).not.toContain("max-md:hidden");
    expect(html.match(/data-slot="section-fold"/g)).toHaveLength(1);
    expect(text(/data-slot="section-summary"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "")).toMatch(/Penjemputan terjadwal · .+ Outlet Uji · Coblong, Kota Bandung/);
    // T-249 states are unchanged by the fold.
    expect([...html.matchAll(/data-flow-section="[^"]+" data-state="(\w+)"/g)].map((match) => match[1]))
      .toEqual(["complete", "current", "pending", "pending", "locked"]);
  });
});

describe("label page: preview first, one print button, handover time", () => {
  const panel = () => renderToStaticMarkup(createElement(LabelPrintPanel, {
    history: createElement("section", { id: "rincian-uang" }, "Rincian uang"),
    initialAttemptId: "00000000-0000-4000-8000-000000000265",
    invoiceToggle: { href: "/app/label/10178?invoice=1", label: "Sertakan invoice" },
    lastPrintedAt: null,
    operatorId: "operator",
    printCount: 0,
    shipmentId: "00000000-0000-4000-8000-000000000266",
  } as Omit<Parameters<typeof LabelPrintPanel>[0], "children"> as Parameters<typeof LabelPrintPanel>[0], createElement("div", { id: "sheet" })));

  it("renders the preview before the print card and the Rincian uang panel after it", () => {
    const html = panel();
    const preview = html.indexOf('id="sheet"');
    const print = html.indexOf('type="submit"');
    const money = html.indexOf('id="rincian-uang"');
    expect(preview).toBeGreaterThan(-1);
    expect(preview).toBeLessThan(print);
    expect(print).toBeLessThan(money);
    // From 1024px the preview returns to the right column.
    expect(html).toMatch(/class="grid min-w-0 gap-6 print:static print:block lg:col-start-3 lg:row-start-1/);
  });

  it("has one print button; the invoice is a mode link, not a second print entry", () => {
    const html = panel();
    // The preview frame's own controls are not print actions; exactly one button prints.
    expect([...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].filter((match) => /cetak/i.test(text(match[1])))).toHaveLength(1);
    expect(text(html)).toContain("Cetak label 10 × 15 cm");
    expect(html).toMatch(/<a [^>]*href="\/app\/label\/10178\?invoice=1"[^>]*>.*Sertakan invoice<\/a>/);
    const page = read("src/app/app/label/[shipmentId]/page.tsx").replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(page).not.toMatch(/Cetak resi \+ invoice|Cetak label saja|Cetak invoice saja/);
    expect(page).not.toMatch(/<PageHeader[\s\S]{0,200}actions=/);
  });

  it("pins that one print button to a mobile bottom bar: below 1024px only, 44px, safe-area, never printed", () => {
    const html = panel();
    const bars = [...html.matchAll(/<(form|div) ([^>]*data-slot="mobile-print-bar"[^>]*)>([\s\S]*?)<\/\1>/g)];
    expect(bars).toHaveLength(1);
    const [, tag, attrs, inner] = bars[0];
    // The bar is the print form itself, not a copy: still one print entry on the page.
    expect(tag).toBe("form");
    expect(inner).toMatch(/<button[^>]*type="submit"[^>]*>[\s\S]*Cetak label 10 × 15 cm/);
    const classes = /class="([^"]*)"/.exec(attrs)![1].split(" ");
    expect(classes).toEqual(expect.arrayContaining([
      "max-lg:fixed", "max-lg:inset-x-0", "max-lg:bottom-0", "print:hidden",
      "max-lg:pb-[max(--spacing(3),env(safe-area-inset-bottom))]",
    ]));
    // Desktop keeps the in-card button: every layout class is scoped below lg.
    expect(classes.filter((name) => !name.startsWith("max-lg:") && !name.startsWith("max-sm:") && name !== "print:hidden")).toEqual([]);
    expect(inner).toMatch(/<button[^>]*class="[^"]*max-lg:h-11/);
    // The bar lives in the label-hide card (display:none in print) and the page leaves room for it.
    expect(html.lastIndexOf('class="label-hide', html.indexOf('data-slot="mobile-print-bar"'))).toBeGreaterThan(-1);
    expect(html).toMatch(/^<div class="grid gap-6 print:block print:pb-0 max-lg:pb-24 /);
    // Tab order: the size choice comes before the pinned print button.
    expect(html.indexOf('name="label-size"')).toBeLessThan(html.indexOf('data-slot="mobile-print-bar"'));
  });

  it("before the invoice exists, the bar holds Cetak resi + invoice — still one print control", () => {
    const html = renderToStaticMarkup(createElement(LabelPrintPanel, {
      both: { invoice: null, shipmentNumber: "10178" },
      history: null,
      initialAttemptId: "00000000-0000-4000-8000-000000000265",
      invoiceToggle: { href: "/app/label/10178", label: "Tanpa invoice" },
      lastPrintedAt: null,
      operatorId: "operator",
      printCount: 0,
      shipmentId: "00000000-0000-4000-8000-000000000266",
    } as Omit<Parameters<typeof LabelPrintPanel>[0], "children"> as Parameters<typeof LabelPrintPanel>[0], createElement("div", { id: "sheet" })));
    expect(html.match(/data-slot="mobile-print-bar"/g)).toHaveLength(1);
    const bar = html.slice(html.indexOf('data-slot="mobile-print-bar"'));
    expect(text(bar.slice(0, bar.indexOf("</button>")))).toContain("Cetak resi + invoice");
    expect([...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].filter((match) => /cetak/i.test(text(match[1])))).toHaveLength(1);
  });

  it("puts no handover time on the stub: none is recorded (T-265 removed 'Diserahkan')", () => {
    const sheet = read("src/app/app/label/[shipmentId]/label-sheet.tsx");
    expect(sheet).not.toMatch(/<dt>Diserahkan|HandoverTime/);
    expect(read("src/app/app/label/[shipmentId]/label-print-context.tsx")).not.toMatch(/printedAt|HandoverTime/);
  });

});

describe("thermal sheet Non-COD line", () => {
  const label = (overrides: Record<string, unknown>) => ({
    awb: "JX263", codBreakdown: null, courier: "JNE", destinationAreaLabel: "Kebon Kacang, Tanah Abang, Jakarta Pusat, DKI Jakarta, 10240",
    insuranceAmountIdr: null, isCod: false, issuedAt: new Date("2026-09-14T08:24:00.000Z"), lastPrintedAt: null,
    outletName: "Outlet", package: { content: "Kain", declaredValueIdr: 100_000, heightCm: null, lengthCm: null, quantity: 1, weightGrams: 1_000, widthCm: null },
    paymentMethod: "NON_COD", printCount: 0, providerCodAmountIdr: null, providerService: "JNE REG", publicReference: "GC-10263",
    recipient: { address: "Jl. A", landmark: null, name: "Penerima", phone: "081200000000" },
    sender: { address: "Jl. B", name: "Pengirim", phone: "081211111111" }, shipmentId: "00000000-0000-4000-8000-000000000267",
    shippingAmountIdr: 9_000, chargedShippingIdr: 6_300, ...overrides,
  }) as Parameters<typeof LabelSheet>[0]["label"];

  it("prints Ongkir dibayar ke Mengantar at the charged amount, like the Rincian uang panel", () => {
    const html = text(renderToStaticMarkup(createElement(LabelSheet, { label: label({}) })));
    // T-265: renamed from "Biaya kirim Mengantar" so it never blurs with the buyer's ongkir.
    expect(MONEY_LABELS.shippingCost).toBe("Ongkir dibayar ke Mengantar");
    expect(html).toContain("Ongkir dibayar ke Mengantar Rp 6.300");
    expect(html).not.toContain("Rp 9.000");
    expect(html).not.toContain("Ongkir Mengantar");
  });

  it("falls back to the order's price on a legacy snapshot without the charged amount", () => {
    expect(text(renderToStaticMarkup(createElement(LabelSheet, { label: label({ chargedShippingIdr: null }) }))))
      .toContain("Ongkir dibayar ke Mengantar Rp 9.000");
  });
});
