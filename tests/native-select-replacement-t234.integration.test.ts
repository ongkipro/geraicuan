import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * T-234: native `<select>` replaced by the shadcn Select (Buat kiriman pickup date/slot, Histori
 * status facet, status-pull outlet) and the member role by two radio option cards. The posted
 * field names and values do not change. No database: Server Actions are stubs.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/pengiriman",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/app/actions", () => ({
  saveShipmentDraft: async () => ({}),
  searchRecipientShipmentContacts: async () => ({}),
  searchSenderShipmentContacts: async () => ({}),
  selectShipmentContact: async () => ({}),
}));
vi.mock("@/app/app/location-actions", () => ({ searchMengantarDestinationAreas: async () => ({}) }));
vi.mock("@/app/app/anggota/actions", () => ({
  changeMemberRoleAction: async () => ({}),
  deactivateMemberAction: async () => ({}),
  inviteMemberAction: async () => ({}),
}));

const { ShipmentCreateForm } = await import("@/app/app/pengiriman/baru/shipment-create-form");
const { StatusSelect } = await import("@/app/app/pengiriman/_list/status-select");
const { StatusPull } = await import("@/app/app/pengiriman/_list/status-pull");
const { InviteMemberCard } = await import("@/app/app/anggota/_components/invite-member-card");
const { validateShipmentDraft } = await import("@/lib/shipment-draft");

/** Every named, submittable control in the markup: [tag, name, value]. */
function namedControls(html: string) {
  return [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)].flatMap(([, tag, attributes]) => {
    const name = /\bname="([^"]*)"/.exec(attributes)?.[1];
    if (!name) return [];
    return [{ attributes, name, tag, value: /\bvalue="([^"]*)"/.exec(attributes)?.[1] ?? "" }];
  });
}

describe("no native select remains in src", () => {
  it("finds no <select element in any source file", () => {
    const offenders: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry) && readFileSync(path, "utf8").includes("<select")) offenders.push(path);
      }
    };
    walk(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});

describe("Buat kiriman pickup schedule posts pickupDate and pickupSlot unchanged", () => {
  // 17.00 WIB: today's slots have passed, so tomorrow at 09.00 is the first choice (D-27).
  const html = renderToStaticMarkup(createElement(ShipmentCreateForm, {
    gerai: { name: "Gerai Uji", phone: "081234567890" },
    nowIso: "2026-09-26T10:00:00.000Z",
    outlets: [{
      id: "00000000-0000-4000-8000-000000000234",
      name: "Outlet Uji",
      pickupPoints: [{ isDefault: true, originAreaLabel: "Coblong, Kota Bandung", pickupAddressId: "P-1", pickupAddressLabel: "Gudang, Jl. Dago 1, Coblong" }],
    }],
    steps: [],
    submissionId: "00000000-0000-4000-8000-000000000235",
  }));
  const controls = namedControls(html);

  it("renders comboboxes (with their calendar/clock icon) instead of native selects", () => {
    expect(html).toMatch(/<button[^>]*role="combobox"[^>]*id="pickupDate"|<button[^>]*id="pickupDate"[^>]*role="combobox"/);
    expect(html).toMatch(/<button[^>]*role="combobox"[^>]*id="pickupSlot"|<button[^>]*id="pickupSlot"[^>]*role="combobox"/);
    expect(html).toContain('for="pickupDate"');
    expect(html).toContain("lucide-calendar-days");
    expect(html).toContain("lucide-clock");
    // The Selects carry no name: nothing but the hidden inputs posts these fields.
    expect(controls.filter((control) => control.tag === "select")).toEqual([]);
  });

  it("posts exactly one pickupDate and one pickupSlot, which the action's validation accepts", () => {
    const date = controls.filter((control) => control.name === "pickupDate");
    const slot = controls.filter((control) => control.name === "pickupSlot");
    expect(date).toEqual([expect.objectContaining({ tag: "input", value: "2026-09-27" })]);
    expect(slot).toEqual([expect.objectContaining({ tag: "input", value: "09:00" })]);
    expect(date[0].attributes).toContain('type="hidden"');

    const formData = new FormData();
    for (const control of controls) if (!control.attributes.includes('type="radio"')) formData.set(control.name, control.value);
    for (const [name, value] of Object.entries({
      declaredValue: "150000", destinationAreaId: "AREA-1", destinationAreaLabel: "Dago, Coblong, Kota Bandung",
      packageContent: "Kemeja", packageQuantity: "1", packageWeightGrams: "700", paymentType: "NON_COD",
      recipientAddress: "Jalan Contoh 2", recipientName: "Budi Santoso", recipientPhone: "081234567891",
    })) formData.set(name, value);
    const result = validateShipmentDraft(formData, new Date("2026-09-26T10:00:00.000Z"));
    expect(result.ok ? null : result.errors).toBeNull();
    expect(result.ok && result.input).toMatchObject({ handoverType: "PICKUP", pickupDate: "2026-09-27", pickupSlot: "09:00" });
  });
});

describe("Histori status facet and status-pull outlet", () => {
  it("renders the status facet as a labelled combobox showing the current status", () => {
    const html = renderToStaticMarkup(createElement(StatusSelect, {
      label: "Status kiriman",
      options: [
        { href: "/app/pengiriman?status=ALL", label: "Semua status", value: "ALL" },
        { href: "/app/pengiriman?status=DELIVERED", label: "Terkirim", value: "DELIVERED" },
      ],
      value: "DELIVERED",
    }));
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Status kiriman"');
    expect(namedControls(html)).toEqual([]);
  });

  it("keeps the outlet choice as one hidden outletId field, outside a native select", () => {
    const html = renderToStaticMarkup(createElement(StatusPull, {
      action: async () => ({}),
      attemptId: "00000000-0000-4000-8000-000000000001",
      outlets: [{ id: "00000000-0000-4000-8000-0000000000aa", name: "Gudang" }, { id: "00000000-0000-4000-8000-0000000000bb", name: "Toko" }],
      range: { lastIncludedDate: "2026-09-25", presetId: "30-hari", startDate: "2026-08-27", timezone: "Asia/Jakarta" },
    }));
    expect(html).toContain('aria-label="Outlet untuk perbarui status"');
    const outlet = namedControls(html).filter((control) => control.name === "outletId");
    expect(outlet).toEqual([expect.objectContaining({ tag: "input", value: "00000000-0000-4000-8000-0000000000aa" })]);
  });
});

describe("Undang anggota role cards", () => {
  it("posts role=OPERATOR by default from two radio cards with the Select's values", () => {
    const html = renderToStaticMarkup(createElement(InviteMemberCard, { attemptId: "00000000-0000-4000-8000-000000000005" }));
    const roles = namedControls(html).filter((control) => control.name === "role");
    expect(roles.map((control) => [control.tag, control.value, control.attributes.includes("checked")])).toEqual([
      ["input", "OPERATOR", true],
      ["input", "TENANT_ADMIN", false],
    ]);
    expect(html).toContain("Peran awal</legend>");
    expect(html).toContain("Buat kiriman dan cetak resi.");
    expect(html).toContain("Semua akses Operator, ditambah laporan, pengaturan, dan anggota.");
    expect(html).not.toContain('role="combobox"');
  });
});
