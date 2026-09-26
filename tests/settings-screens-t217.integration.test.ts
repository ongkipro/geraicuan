import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T-217 (UI v3): Pengaturan and Anggota screens — pure ordering/access rules and key markup.
 * No database: the Server Actions are replaced by stubs, `next/navigation` by a fixed route.
 */

const route = vi.hoisted(() => ({ pathname: "/app/pengaturan" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: () => undefined }),
}));
vi.mock("@/app/app/pengaturan/actions", () => ({
  addOutletPickupPoint: async () => ({}),
  loadMengantarPickupOptions: async () => ({}),
  removeOutletPickupPoint: async () => ({}),
  saveCourierPreferences: async () => ({}),
  saveGeraiProfile: async () => ({}),
  savePrivateMengantarCredential: async () => ({}),
  saveLabelSettings: async () => ({}),
  savePickupPointNotes: async () => ({}),
  saveShipmentPrefix: async () => ({}),
  saveTenantContact: async () => ({}),
  setDefaultOutletPickupPoint: async () => ({}),
  switchMengantarToPlatformDefault: async () => ({}),
}));
vi.mock("@/app/app/anggota/actions", () => ({
  changeMemberRoleAction: async () => ({}),
  deactivateMemberAction: async () => ({}),
  inviteMemberAction: async () => ({}),
}));

const logic = await import("@/app/app/pengaturan/_components/settings-logic");
const { SettingsNav } = await import("@/app/app/pengaturan/_components/settings-nav");
const { ShipmentPrefixCard } = await import("@/app/app/pengaturan/_components/shipment-prefix-card");
const { GeraiIdentityCard } = await import("@/app/app/pengaturan/_components/gerai-identity-card");
const { GeraiProfileCard } = await import("@/app/app/pengaturan/_components/gerai-profile-card");
const { OutletSelect } = await import("@/app/app/pengaturan/_components/outlet-select");
const { CourierPreferences } = await import("@/app/app/pengaturan/kurir/courier-preferences");
const { SELECTABLE_COURIERS } = await import("@/lib/gerai-settings");
const { LabelInfoEditor } = await import("@/app/app/pengaturan/label/label-info-editor");
const { DEFAULT_LABEL_FIELDS, DEFAULT_LABEL_FIELDS_BY_SIZE } = await import("@/lib/label-fields");
const { NO_GERAI_BRAND } = await import("@/app/app/brand/gerai-brand");
const NO_NOTES = { accessNote: null, picName: null, picPhone: null, schedule: null };
const { ConnectionForm } = await import("@/app/app/pengaturan/koneksi/connection-form");
const { PickupPoints } = await import("@/app/app/pengaturan/pickup/pickup-points");
const { MemberAccessDialog } = await import("@/app/app/anggota/_components/member-access-dialog");
const { InviteMemberCard } = await import("@/app/app/anggota/_components/invite-member-card");

const SelectUi = await import("@/components/ui/select");

const filledButtons = (html: string) => html.match(/data-slot="button" data-variant="default"/g)?.length ?? 0;

const outlet = {
  connectionIssue: null,
  connectionSource: "platform_default",
  connectionStatus: "platform_default",
  connectionUpdatedAtLabel: null,
  defaultOriginAreaId: "o-1",
  defaultOriginAreaLabel: "Coblong, Kota Bandung",
  defaultPickupAddressId: "p-1",
  defaultPickupAddressLabel: "Gudang Utama",
  id: "79000000-0000-4000-8000-000000000001",
  name: "Outlet Pusat",
  readinessStatus: "ready",
  updatedAtLabel: "25 Sep 2026, 10.13 WIB",
} as const;

describe("settings rules", () => {
  it("orders outlets needing attention first, then by name, and picks the requested one", () => {
    const outlets = [
      { id: "c", name: "Cabang", readinessStatus: "ready" as const },
      { id: "b", name: "Beta", readinessStatus: "needs_attention" as const },
      { id: "a", name: "Alfa", readinessStatus: "ready" as const },
    ];
    const ordered = logic.orderOutlets(outlets);
    expect(ordered.map((item) => item.id)).toEqual(["b", "a", "c"]);
    expect(logic.pickActiveOutlet(ordered, "c")?.id).toBe("c");
    expect(logic.pickActiveOutlet(ordered, "unknown")?.id).toBe("b");
    expect(logic.pickActiveOutlet(ordered, ["c"])?.id).toBe("b");
    expect(logic.pickActiveOutlet([], "c")).toBeNull();
  });

  it("orders members active first, viewer first, admins before operators", () => {
    const members = [
      { id: "1", name: "Zaki", role: "OPERATOR" as const, status: "ACTIVE" as const, userId: "u1" },
      { id: "2", name: "Ayu", role: "OPERATOR" as const, status: "SUSPENDED" as const, userId: "u2" },
      { id: "3", name: "Budi", role: "TENANT_ADMIN" as const, status: "ACTIVE" as const, userId: "u3" },
      { id: "4", name: "Wulan", role: "OPERATOR" as const, status: "ACTIVE" as const, userId: "viewer" },
    ];
    expect(logic.orderMembers(members, "viewer").map((member) => member.id)).toEqual(["4", "3", "1", "2"]);
    expect(logic.summarizeMembers(members)).toEqual({
      active: 3, activeAdmins: 1, activeOperators: 2, inactive: 1, total: 4,
    });
  });

  it("protects the last active admin, the viewer and suspended members from the manage action", () => {
    const admin = { id: "1", name: "A", role: "TENANT_ADMIN" as const, status: "ACTIVE" as const, userId: "u1" };
    expect(logic.memberAccess(admin, "viewer", 1)).toMatchObject({ isLastActiveAdmin: true, manageable: false, note: "Pemilik gerai terakhir dilindungi" });
    expect(logic.memberAccess(admin, "viewer", 2)).toMatchObject({ manageable: true, note: null });
    expect(logic.memberAccess(admin, "u1", 2)).toMatchObject({ isCurrentUser: true, manageable: false });
    expect(logic.memberAccess({ ...admin, status: "SUSPENDED" }, "viewer", 1)).toMatchObject({ isLastActiveAdmin: false, manageable: false });
    expect(logic.initials("Ayu  Admin Utama")).toBe("AA");
    expect(logic.initials("   ")).toBe("?");
  });

  it("names the connection in one sentence", () => {
    expect(logic.connectionSentence(outlet)).toBe("Koneksi bawaan GeraiCUAN");
    expect(logic.connectionSentence({ ...outlet, privateConnectionRequired: true })).toBe("Belum terhubung ke akun Mengantar gerai");
    expect(logic.connectionSentence({ ...outlet, connectionSource: "private", connectionStatus: "private_attention" }))
      .toContain("perlu diperiksa");
  });
});

describe("settings sub-menu", () => {
  beforeEach(() => {
    route.pathname = "/app/pengaturan";
  });

  it.each([
    ["/app/pengaturan/pickup", "Titik pickup"],
    ["/app/anggota", "Anggota & akses"],
    ["/app/pengaturan", "Profil gerai"],
    ["/app/pengaturan/label", "Informasi label"],
    ["/app/pengaturan/kurir", "Mitra kurir"],
  ])("lists the seven pages in order and marks %s current", (pathname, current) => {
    route.pathname = pathname;
    const html = renderToStaticMarkup(createElement(SettingsNav));
    const links = [...html.matchAll(/<a([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, body]) => ({
      current: attributes.includes('aria-current="page"'),
      label: body.replace(/<[^>]+>/g, "").replace("&amp;", "&").trim(),
    }));
    expect(links.map((link) => link.label)).toEqual(["Profil gerai", "Informasi label", "Titik pickup", "Outlet", "Mitra kurir", "Koneksi Mengantar", "Anggota & akses"]);
    expect(links.filter((link) => link.current).map((link) => link.label)).toEqual([current]);
  });
});

describe("gerai identity card (T-233)", () => {
  it("frames the read-only name like the locked Awalan and leaves validation to the server (T-253)", () => {
    const html = renderToStaticMarkup(createElement(GeraiIdentityCard, { name: "Gerai Sinar", whatsapp: "081234567890" }));
    const name = html.match(/<p[^>]*data-readonly=""[^>]*>([^<]*)<\/p>/);
    expect(name?.[1]).toBe("Gerai Sinar");
    expect(name?.[0]).toMatch(/\bbg-muted\b/);
    expect(name?.[0]).toMatch(/\bmin-h-10\b/);
    expect(html).toMatch(/<form[^>]*id="gerai-contact-form"[^>]*novalidate=""/i);
  });

  it("shows the name read-only and the WhatsApp as the one editable field with one save", () => {
    const html = renderToStaticMarkup(createElement(GeraiIdentityCard, { name: "Gerai Sinar", whatsapp: "081234567890" }));
    expect(html).toContain("Gerai Sinar");
    expect(html).not.toContain('name="name"');
    expect(html).toContain('name="whatsapp"');
    expect(html).toContain('value="081234567890"');
    expect(html).toContain("Simpan WhatsApp");
    expect(filledButtons(html)).toBe(1);
  });
});

describe("settings sub-menu shape (T-252)", () => {
  it("is one list that scrolls sideways below 1024px and becomes the rail from 1024px", () => {
    route.pathname = "/app/pengaturan/koneksi";
    const html = renderToStaticMarkup(createElement(SettingsNav));
    const list = html.match(/<ul class="([^"]*)"/)?.[1] ?? "";
    expect(list.split(" ")).toEqual(expect.arrayContaining(["flex", "overflow-x-auto", "lg:grid"]));
    // 44px pills on touch, 40px in the rail.
    const current = html.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0] ?? "";
    expect(current).toContain("h-11");
    expect(current).toContain("lg:h-10");
    expect(current).toContain("whitespace-nowrap");
  });
});

describe("dropdowns show their value in the server HTML (T-236, T-252)", () => {
  const profile = { businessCategory: null, csEmail: null, labelNote: null, website: null };

  it("renders the chosen kategori usaha in the trigger before hydration, and can clear it", () => {
    const chosen = renderToStaticMarkup(createElement(GeraiProfileCard, { initial: { ...profile, businessCategory: "FASHION" } }));
    const trigger = chosen.match(/<button[^>]*id="gerai-category"[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? "";
    expect(trigger).toContain("Fashion, tekstil &amp; pakaian");
    expect(chosen).toContain('type="hidden" name="businessCategory" value="FASHION"');
    const empty = renderToStaticMarkup(createElement(GeraiProfileCard, { initial: profile }));
    expect(empty.match(/<button[^>]*id="gerai-category"[^>]*>([\s\S]*?)<\/button>/)?.[1]).toContain("Pilih kategori");
    expect(empty).toContain('type="hidden" name="businessCategory" value=""');
    expect(filledButtons(empty)).toBe(1);
  });

  it("marks an empty kategori usaha as a muted placeholder in the server HTML, and a chosen one as a value (T-253)", () => {
    const triggerTag = (html: string) => html.match(/<button[^>]*id="gerai-category"[^>]*>/)?.[0] ?? "";
    const triggerBody = (html: string) => html.match(/<button[^>]*id="gerai-category"[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? "";
    const empty = renderToStaticMarkup(createElement(GeraiProfileCard, { initial: profile }));
    // data-placeholder is what the shared trigger styles muted (data-placeholder:text-muted-foreground).
    expect(triggerTag(empty)).toContain('data-placeholder=""');
    expect(triggerTag(empty)).toContain("data-placeholder:text-muted-foreground");
    expect(triggerBody(empty).replace(/<[^>]+>/g, "")).toBe("Pilih kategori usaha");
    expect(empty).not.toContain("Tidak diisi");
    const chosen = renderToStaticMarkup(createElement(GeraiProfileCard, { initial: { ...profile, businessCategory: "FASHION" } }));
    expect(triggerTag(chosen)).not.toContain("data-placeholder=");
    expect(triggerBody(chosen)).not.toContain("Pilih kategori usaha");
    // Full row: the select is not wrapped in the 2-column grid the contact fields use.
    expect(empty).not.toMatch(/sm:grid-cols-2">\s*<div[^>]*data-slot="field"[^>]*>\s*<label[^>]*for="gerai-category"/);
  });

  it("renders the active outlet in the outlet select before hydration", () => {
    const html = renderToStaticMarkup(createElement(OutletSelect, {
      activeId: "b",
      outlets: [
        { id: "a", name: "Outlet Pusat", readinessStatus: "ready" },
        { id: "b", name: "Outlet Cabang", readinessStatus: "needs_attention" },
      ],
    }));
    const trigger = html.match(/<button[^>]*id="settings-outlet"[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? "";
    expect(trigger).toContain("Outlet Cabang · perlu dilengkapi");
    // T-253: the trigger clamps to one line; the title carries a long name whole.
    expect(html.match(/<button[^>]*id="settings-outlet"[^>]*>/)?.[0]).toContain('title="Outlet Cabang · perlu dilengkapi"');
  });
});

describe("shared Select sizing (T-253)", () => {
  // The portal content never renders on the server, so read the element the wrapper builds.
  type Element = { props: Record<string, unknown> & { children?: unknown; className?: string } };

  it("opens as a start-aligned popper no wider than the viewport allows, with 40/44px items", () => {
    const portal = SelectUi.SelectContent({ children: null }) as unknown as Element;
    const content = portal.props.children as Element;
    expect(content.props.position).toBe("popper");
    expect(content.props.align).toBe("start");
    expect(content.props.className).toContain("max-h-(--radix-select-content-available-height)");
    expect(content.props.className).toContain("max-w-(--radix-select-content-available-width)");
    const viewport = (content.props.children as Element[]).find((child) => child?.props?.["data-position"]);
    expect(viewport?.props.className).toContain("min-w-(--radix-select-trigger-width)");
    const item = SelectUi.SelectItem({ children: "x", value: "x" }) as unknown as Element;
    expect(item.props.className).toMatch(/\bmin-h-10\b/);
    expect(item.props.className).toMatch(/\bmax-md:min-h-11\b/);
  });
});

describe("switch rows are the hit target (T-253)", () => {
  // The switch keeps its 32 × 18px look; its ::after fills the positioned row instead of a
  // fixed halo, so the label, description (and logo) toggle it: a ≥ 44px touch target.
  const rowSwitches = (html: string) => [...html.matchAll(/<li\b([^>]*)>(?:(?!<\/li>)[\s\S])*?(<button[^>]*role="switch"[^>]*>)/g)]
    .map(([, li, button]) => ({ button, li }));

  it("on Mitra kurir", () => {
    const rows = rowSwitches(renderToStaticMarkup(createElement(CourierPreferences, { disabled: [] })));
    expect(rows).toHaveLength(SELECTABLE_COURIERS.length);
    for (const { button, li } of rows) {
      expect(li).toMatch(/class="relative /);
      expect(button).toMatch(/class="[^"]*\bstatic\b[^"]*after:inset-0/);
      expect(button).not.toMatch(/\brelative\b|after:-inset-/);
    }
  });

  it("on Informasi label, with the Profil gerai links above the row overlay", () => {
    const html = renderToStaticMarkup(createElement(LabelInfoEditor, { brand: NO_GERAI_BRAND, geraiName: "Gerai Sinar", geraiWhatsapp: null, initial: DEFAULT_LABEL_FIELDS_BY_SIZE }));
    const rows = rowSwitches(html);
    expect(rows).toHaveLength(9);
    for (const { button, li } of rows) {
      expect(li).toMatch(/class="relative /);
      expect(button).toMatch(/class="[^"]*\bstatic\b[^"]*after:inset-0/);
      expect(button).not.toMatch(/\brelative\b|after:-inset-/);
    }
    expect(html.match(/<a[^>]*class="relative z-10[^"]*"[^>]*href="\/app\/pengaturan"/g)).toHaveLength(2);
  });
});

describe("Mitra kurir", () => {
  it("states how many couriers are on and names its one save", () => {
    const html = renderToStaticMarkup(createElement(CourierPreferences, { disabled: ["JNE"] }));
    expect(html).toContain(`${SELECTABLE_COURIERS.length - 1} dari ${SELECTABLE_COURIERS.length} aktif`);
    expect(html).toContain("Simpan pilihan kurir");
    expect(filledButtons(html)).toBe(1);
  });
});

describe("Informasi label editor (T-229)", () => {
  it("renders the size cards, one switch per field, the real label sheet and one Simpan", () => {
    const initial = { ...DEFAULT_LABEL_FIELDS_BY_SIZE, "10x10": { ...DEFAULT_LABEL_FIELDS, senderPhone: false } };
    const html = renderToStaticMarkup(createElement(LabelInfoEditor, { brand: NO_GERAI_BRAND, geraiName: "Gerai Sinar", geraiWhatsapp: "081234567890", initial }));
    expect(html.match(/name="label-info-size"/g)).toHaveLength(2);
    // T-243: + Logo kurir, Logo gerai and Catatan resi (the last two disabled without a logo/catatan).
    expect(html.match(/data-slot="switch"/g)).toHaveLength(9);
    expect(html.match(/class="label-sheet"/g)).toHaveLength(1);
    expect(html).toContain("Gerai Sinar");
    // Both sizes travel in the form; the 10 × 10 choice is kept while 10 × 15 is shown.
    expect(html).toContain('type="hidden" name="10x10.senderPhone" value="0"');
    expect(html).toContain('type="hidden" name="10x15.senderPhone" value="1"');
    expect(html).not.toMatch(/pickup Mengantar<\/label>/);
    expect(filledButtons(html)).toBe(1);
  });
});

describe("shipment prefix card", () => {
  it("offers one filled lock action while unlocked, without a confirmation value in the form", () => {
    const html = renderToStaticMarkup(createElement(ShipmentPrefixCard, {
      attemptId: "00000000-0000-4000-8000-000000000001", lockedAtLabel: null, prefix: "GC", suggestedPrefix: "SBN",
    }));
    expect(html).toContain('name="prefix"');
    expect(html).toContain('value="SBN"');
    expect(html).toContain("Simpan dan kunci awalan");
    expect(filledButtons(html)).toBe(1);
    // Only the dialog's confirm button carries confirmation=locked, and the dialog is closed.
    expect(html).not.toContain('value="locked"');
  });

  it("shows the locked prefix read-only", () => {
    const html = renderToStaticMarkup(createElement(ShipmentPrefixCard, {
      attemptId: "00000000-0000-4000-8000-000000000001", lockedAtLabel: "25 Sep 2026, 10.13 WIB", prefix: "SBN", suggestedPrefix: "SBN",
    }));
    expect(html).toContain("Terkunci");
    expect(html).toContain("SBN-10013");
    expect(html).not.toContain('name="prefix"');
    expect(filledButtons(html)).toBe(0);
  });
});

describe("Koneksi Mengantar", () => {
  it("marks the persisted source as Digunakan and asks for no key on the platform default", () => {
    const html = renderToStaticMarkup(createElement(ConnectionForm, { outlet }));
    expect(html.match(/Digunakan/g)).toHaveLength(1);
    // T-252: the shared option cards (native radios in a fieldset), as in every other settings choice.
    expect(html.match(/type="radio"[^>]*name="connection-mode"|name="connection-mode"[^>]*type="radio"/g)).toHaveLength(2);
    expect(html).toContain("<legend");
    expect(html).not.toContain('name="apiKey"');
  });

  it("renders the API key field blank for an outlet on its own account", () => {
    const html = renderToStaticMarkup(createElement(ConnectionForm, {
      outlet: { ...outlet, connectionSource: "private", connectionStatus: "private_ready", connectionUpdatedAtLabel: "1 Sep 2026, 07.00 WIB" },
    }));
    const field = html.match(/<input[^>]*name="apiKey"[^>]*>/)?.[0] ?? "";
    expect(field).toContain('type="password"');
    expect(field).not.toContain("value=");
    expect(html).toContain("Ganti API key");
  });

  it("offers no platform default to a gerai that must ship on its own account", () => {
    const html = renderToStaticMarkup(createElement(ConnectionForm, { outlet: { ...outlet, privateConnectionRequired: true } }));
    expect(html).not.toContain('name="connection-mode"');
    expect(html).toContain('name="apiKey"');
  });
});

describe("Titik pickup", () => {
  const points = [
    { isDefault: true, notes: NO_NOTES, originAreaLabel: "Coblong, Kota Bandung", pickupAddressId: "p-1", pickupAddressLabel: "Gudang Utama" },
    { isDefault: false, notes: NO_NOTES, originAreaLabel: "Sukajadi, Kota Bandung", pickupAddressId: "p-2", pickupAddressLabel: "Gudang Dua" },
  ];

  it("offers Jadikan utama only on the non-default point and Hapus on every point", () => {
    const html = renderToStaticMarkup(createElement(PickupPoints, {
      connectionSource: "platform_default", outletId: outlet.id, outletName: outlet.name, points,
    }));
    expect(html.match(/Jadikan utama/g)).toHaveLength(1);
    expect(html.match(/>Hapus</g)).toHaveLength(2);
    expect(html).toContain("Utama");
    // No filled primary: adding a pickup point is an outline action (reference).
    expect(filledButtons(html)).toBe(0);
    expect(html).toContain("Pilih alamat pickup dulu.");
  });

  it("sizes the pickup address trigger to the 40/44px control standard (T-253)", () => {
    const html = renderToStaticMarkup(createElement(PickupPoints, {
      connectionSource: "platform_default", outletId: outlet.id, outletName: outlet.name, points,
    }));
    const trigger = html.match(/<button[^>]*id="pickup-address"[^>]*>/)?.[0] ?? "";
    // min-h decides the height (40, 44 below md); 6px padding keeps one line under it (py-2 made 40.5px).
    expect(trigger).toMatch(/\bmin-h-10\b/);
    expect(trigger).toMatch(/\bmax-md:min-h-11\b/);
    expect(trigger).toMatch(/\bpy-1\.5\b/);
    expect(trigger).not.toMatch(/\bpy-2\b/);
  });

  it("says the outlet cannot ship without a pickup point", () => {
    const html = renderToStaticMarkup(createElement(PickupPoints, {
      connectionSource: "platform_default", outletId: outlet.id, outletName: outlet.name, points: [],
    }));
    expect(html).toContain("Belum ada titik pickup");
    expect(html).toContain("belum dapat membuat kiriman");
  });
});

describe("Anggota & akses", () => {
  it("replaces Kelola akses with the protection sentence for the last admin", () => {
    const props = {
      deactivateAttemptId: "00000000-0000-4000-8000-000000000002", email: "a@example.test", membershipId: "00000000-0000-4000-8000-000000000003",
      name: "Ayu", role: "TENANT_ADMIN" as const, roleAttemptId: "00000000-0000-4000-8000-000000000004",
    };
    const protectedHtml = renderToStaticMarkup(createElement(MemberAccessDialog, { ...props, manageable: false, note: "Pemilik gerai terakhir dilindungi" }));
    expect(protectedHtml).toContain("Pemilik gerai terakhir dilindungi");
    expect(protectedHtml).not.toContain("Kelola akses");
    const manageableHtml = renderToStaticMarkup(createElement(MemberAccessDialog, { ...props, manageable: true, note: null }));
    expect(manageableHtml).toContain('aria-label="Kelola akses Ayu"');
  });

  it("submits the invite from the card footer with the form's field names", () => {
    const html = renderToStaticMarkup(createElement(InviteMemberCard, { attemptId: "00000000-0000-4000-8000-000000000005" }));
    expect(html).toContain('name="email"');
    expect(html).toContain('name="attemptId"');
    expect(html).toContain('form="member-invite-form"');
    expect(filledButtons(html)).toBe(1);
  });
});

describe("loading and error states", () => {
  it("keeps the header and sub-menu while members load and shows skeleton cards", async () => {
    route.pathname = "/app/anggota";
    const { default: MembersLoading } = await import("@/app/app/anggota/loading");
    const html = renderToStaticMarkup(createElement(MembersLoading));
    // T-252: every settings page, Anggota & akses included, keeps the H1 of the current sidebar item.
    expect(html).toContain("Pengaturan</h1>");
    expect(html).toContain('aria-label="Menu pengaturan"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-slot="skeleton"');
  });

  it("offers a retry when a settings page fails", async () => {
    const { default: SettingsError } = await import("@/app/app/pengaturan/error");
    const html = renderToStaticMarkup(createElement(SettingsError, { error: new Error("x"), reset: () => undefined }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Coba lagi");
  });
});
