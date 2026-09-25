import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ContactDetailPage from "@/app/app/kontak/[contactId]/page";
import NewContactPage from "@/app/app/kontak/baru/page";
import RecipientDirectoryPage from "@/app/app/kontak/penerima/page";
import SenderDirectoryPage from "@/app/app/kontak/pengirim/page";

const CONTACT_ID = "00000000-0000-4000-8000-000000000651";
const ADDRESS_ID = "00000000-0000-4000-8000-000000000652";

const mocks = vi.hoisted(() => ({
  addresses: [] as Array<Record<string, unknown>>,
  contacts: [] as Array<Record<string, unknown>>,
  currentContact: null as Record<string, unknown> | null,
  outlets: [] as Array<{ id: string; name: string }>,
  principal: {
    role: "TENANT_ADMIN" as "OPERATOR" | "TENANT_ADMIN",
    scope: "tenant" as const,
    tenantId: "00000000-0000-4000-8000-000000000601",
    userId: "contact-render-user",
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/app/location-actions", () => ({
  searchMengantarDestinationAreas: vi.fn(async () => ({ options: [], success: true })),
}));

vi.mock("@/app/app/kontak/actions", () => ({
  saveContact: vi.fn(async () => ({})),
  searchContacts: vi.fn(async () => ({ rows: [], searched: false })),
}));

vi.mock("@/app/app/kontak/[contactId]/actions", () => ({
  addContactAddressAction: vi.fn(async () => ({})),
  archiveContactAction: vi.fn(async () => ({})),
  updateContactAction: vi.fn(async () => ({})),
  updateContactAddressAction: vi.fn(async () => ({})),
}));

vi.mock("@/db/client", () => ({ db: {} }));

vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (_db, _userId, _tenantId, callback) =>
    callback({}, {
      role: mocks.principal.role,
      tenantId: mocks.principal.tenantId,
      userId: mocks.principal.userId,
    }),
  ),
}));

vi.mock("@/db/contact-repository", () => ({
  getContact: vi.fn(async () => mocks.currentContact),
  listContactAddresses: vi.fn(async () => mocks.addresses),
  listContactDirectory: vi.fn(async (_tx: unknown, _context: unknown, input: { role: "all" | "recipient" | "sender" }) =>
    mocks.contacts.filter((contact) =>
      input.role === "all"
      || (input.role === "sender" && contact.isSender)
      || (input.role === "recipient" && contact.isRecipient),
    ),
  ),
  loadContactDirectoryPage: vi.fn(async (_tx: unknown, _context: unknown, input: { role: "all" | "recipient" | "sender"; status: "all" | "active" | "archived" }) => {
    const inRole = mocks.contacts.filter((contact) =>
      input.role === "all"
      || (input.role === "sender" && contact.isSender)
      || (input.role === "recipient" && contact.isRecipient),
    );
    const archived = inRole.filter((contact) => Boolean(contact.archivedAt));
    return {
      rows: input.status === "all"
        ? inRole
        : input.status === "archived"
          ? archived
          : inRole.filter((contact) => !contact.archivedAt),
      summary: {
        active: inRole.length - archived.length,
        all: inRole.length,
        archived: archived.length,
      },
    };
  }),
}));

vi.mock("@/db/outlet-readiness-repository", () => ({
  listReadyShipmentOutlets: vi.fn(async () => mocks.outlets),
}));

vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => mocks.principal),
}));

function activeContact(overrides: Record<string, unknown> = {}) {
  return {
    address: "Jl. Aman No. 5",
    addressCount: 1,
    archivedAt: null,
    destinationAreaLabel: "Gambir, Jakarta Pusat, DKI Jakarta, 10110",
    id: CONTACT_ID,
    isRecipient: true,
    isSender: true,
    name: "Penerima Aman",
    phone: "081234567890",
    ...overrides,
  };
}

function activeAddress(overrides: Record<string, unknown> = {}) {
  return {
    address: "Jl. Contoh No. 10",
    archivedAt: null,
    destinationAreaId: "area-651",
    destinationAreaLabel: "Gambir, Jakarta Pusat",
    id: ADDRESS_ID,
    isPrimary: true,
    label: "Rumah",
    ...overrides,
  };
}

async function renderDirectory(status?: string, role: "penerima" | "pengirim" = "pengirim") {
  const params: Record<string, string> = {};
  if (status !== undefined) params.status = status;
  const Page = role === "pengirim" ? SenderDirectoryPage : RecipientDirectoryPage;
  const element = await Page({ searchParams: Promise.resolve(params) });
  return renderToStaticMarkup(element);
}

async function renderDetail(searchParams: Record<string, string> = { dari: "pengirim" }) {
  const element = await ContactDetailPage({
    params: Promise.resolve({ contactId: CONTACT_ID }),
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  mocks.addresses.length = 0;
  mocks.contacts.length = 0;
  mocks.currentContact = null;
  mocks.outlets.length = 0;
  mocks.principal.role = "TENANT_ADMIN";
});

describe("contact route render contracts", () => {
  it("renders a complete phone directory row and a safe invalid-status recovery", async () => {
    mocks.contacts.push(activeContact());

    const populated = await renderDirectory();
    expect(populated).toContain("Penerima Aman");
    expect(populated).toContain("081234567890");
    expect(populated).not.toContain("0812••••890");
    expect(populated).not.toContain("••••");
    expect(populated).toMatch(/class="[^"]*min-h-11[^"]*" href="\/app\/kontak\/baru\?peran=pengirim"/);
    // The row: street address, district/city, postal code (all derived from
    // the same stored destination_area_label), and a WhatsApp affordance
    // built from the canonical phone.
    expect(populated).toContain("Jl. Aman No. 5");
    expect(populated).toContain("Gambir, Jakarta Pusat");
    expect(populated).toContain("10110");
    expect(populated).toContain('href="https://wa.me/6281234567890"');

    // T-162: the status filter is the shared PR-52 state panel. It exposes its
    // selection programmatically, not by button variant alone: exactly one
    // entry is pressed, and it is the requested one.
    const statusPanel = (html: string) =>
      html.match(/<form[^>]*data-slot="state-summary-panel"[^>]*>[\s\S]*?<\/form>/)?.[0] ?? "";
    for (const [requested, value] of [[undefined, "active"], ["archived", "archived"], ["all", "all"]] as const) {
      const panel = statusPanel(requested === undefined ? populated : await renderDirectory(requested));
      expect(panel, String(requested)).toMatch(/<ul[^>]*aria-label="Status pengirim"/);
      const pressed = panel.match(/<button[^>]*aria-pressed="true"[^>]*>/g) ?? [];
      expect(pressed, String(requested)).toHaveLength(1);
      expect(pressed[0]).toContain(`value="${value}"`);
      expect(pressed[0]).toContain('name="status"');
      expect(panel).not.toContain("aria-current");
      expect(panel.match(/<svg/g) ?? [], "check glyph only on the pressed entry").toHaveLength(1);
      // Three entries, each a 44 px submit target carrying the page's own
      // `status` parameter.
      expect(panel.match(/<button[^>]*aria-pressed="(?:true|false)"[^>]*>/g) ?? []).toHaveLength(3);
      expect(panel.match(/<button[^>]*class="[^"]*min-h-11/g) ?? []).toHaveLength(3);
    }

    const invalid = await renderDirectory("unknown");
    expect(invalid).toContain("Filter status disesuaikan");
    expect(invalid).toContain("Status tidak dikenali; pengirim aktif ditampilkan.");
  });

  it("scopes each role menu to its own contacts, counts and links, and states missing address data explicitly (T-188)", async () => {
    mocks.contacts.push(
      activeContact({ id: "00000000-0000-4000-8000-000000000661", isRecipient: false, isSender: true, name: "T188 Pengirim Saja" }),
      activeContact({
        address: null,
        addressCount: 0,
        destinationAreaLabel: null,
        id: "00000000-0000-4000-8000-000000000662",
        isRecipient: true,
        isSender: false,
        name: "T188 Penerima Tanpa Alamat",
      }),
      activeContact({
        addressCount: 3,
        destinationAreaLabel: null,
        id: "00000000-0000-4000-8000-000000000663",
        isRecipient: true,
        isSender: true,
        name: "T188 Dua Peran Area Belum Dipilih",
      }),
    );

    const pengirim = await renderDirectory(undefined, "pengirim");
    const penerima = await renderDirectory(undefined, "penerima");

    // Each list holds only its role; a dual-role contact is in both.
    expect(pengirim).toContain("T188 Pengirim Saja");
    expect(pengirim).toContain("T188 Dua Peran Area Belum Dipilih");
    expect(pengirim).not.toContain("T188 Penerima Tanpa Alamat");
    expect(penerima).toContain("T188 Penerima Tanpa Alamat");
    expect(penerima).toContain("T188 Dua Peran Area Belum Dipilih");
    expect(penerima).not.toContain("T188 Pengirim Saja");

    // Title, create button preselecting the role, no role tabs or Peran column.
    expect(pengirim).toMatch(/<h1[^>]*>Pengirim<\/h1>/);
    expect(penerima).toMatch(/<h1[^>]*>Penerima<\/h1>/);
    expect(pengirim).toContain('href="/app/kontak/baru?peran=pengirim"');
    expect(penerima).toContain('href="/app/kontak/baru?peran=penerima"');
    for (const html of [pengirim, penerima]) {
      expect(html).not.toContain('aria-label="Peran kontak"');
      expect(html).not.toContain(">Peran</th>");
    }

    // Counts are the role's own, under the role's own metric IDs.
    const count = (html: string, metric: string) =>
      new RegExp(`data-metric-id="${metric}"[\\s\\S]*?>(\\d+)<`).exec(html)?.[1];
    expect(count(pengirim, "CON-SENDER-ACTIVE")).toBe("2");
    expect(count(penerima, "CON-RECIPIENT-ACTIVE")).toBe("2");
    expect(pengirim).not.toContain("CON-RECIPIENT-");
    expect(penerima).not.toContain("CON-SENDER-");
    expect(pengirim).toContain('action="/app/kontak/pengirim"');
    expect(penerima).toContain('action="/app/kontak/penerima"');

    // The other role is a marker on dual-role rows only, never the page's own
    // role; one per row in the table (the phone card list repeats it below md).
    const table = (html: string) => html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? "";
    expect(table(pengirim).match(/data-also-role="penerima"/g) ?? []).toHaveLength(1);
    expect(table(penerima).match(/data-also-role="pengirim"/g) ?? []).toHaveLength(1);
    expect(pengirim).not.toContain('data-also-role="pengirim"');
    expect(penerima).not.toContain('data-also-role="penerima"');
    expect(table(penerima)).toMatch(/data-also-role="pengirim"[^>]*>[\s\S]*?Juga pengirim<span class="sr-only">: kontak ini juga tersimpan sebagai pengirim<\/span>/);

    // Compact status filter: Aktif, Diarsipkan, Semua with inline counts;
    // the Status column only when viewing Semua; the listed count has its ID.
    expect([...pengirim.matchAll(/<button[^>]*aria-pressed[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0].replace(/<span class="sr-only">[\s\S]*?<\/span>/, "").replace(/<[^>]+>/g, "").trim()))
      .toEqual(["Aktif2", "Diarsipkan0", "Semua2"]);
    expect(pengirim).toMatch(/data-metric-id="CON-SENDER-LISTED"[^>]*>2 pengirim</);
    expect(penerima).toMatch(/data-metric-id="CON-RECIPIENT-LISTED"[^>]*>2 penerima</);
    expect(table(pengirim)).not.toContain(">Status</th>");
    expect(table(await renderDirectory("all", "pengirim"))).toContain(">Status</th>");

    // Detail links carry the list they came from.
    expect(pengirim).toContain('href="/app/kontak/00000000-0000-4000-8000-000000000663?dari=pengirim"');
    expect(penerima).toContain('href="/app/kontak/00000000-0000-4000-8000-000000000663?dari=penerima"');

    // Zero addresses and an address predating area selection are both stated
    // explicitly; "+N alamat" links to the detail's address list.
    expect(penerima).toContain("Belum ada alamat");
    expect(penerima).toContain("Area belum dipilih");
    expect(penerima).toMatch(/href="\/app\/kontak\/00000000-0000-4000-8000-000000000663\?dari=penerima#alamat"[^>]*>\s*\+2 alamat/);
  });

  it("gives each role list its own empty state and create action (T-188)", async () => {
    const empty = await renderDirectory(undefined, "penerima");
    expect(empty).toContain("Belum ada penerima");
    expect(empty).toMatch(/href="\/app\/kontak\/baru\?peran=penerima"[^>]*>[\s\S]*?Penerima baru/);
    expect(empty).not.toContain("Belum ada kontak");
  });

  it("preselects the role the create form was opened for, still offering both (T-188)", async () => {
    const checked = (html: string, name: string) =>
      new RegExp(`<input(?=[^>]*name="${name}")(?=[^>]*checked="")[^>]*>`).test(html);
    const recipient = renderToStaticMarkup(await NewContactPage({ searchParams: Promise.resolve({ peran: "penerima" }) }));
    expect(checked(recipient, "roleRecipient")).toBe(true);
    expect(checked(recipient, "roleSender")).toBe(false);
    expect(recipient).toContain('name="roleSender"');
    expect(recipient).toMatch(/<input[^>]*name="peran"[^>]*value="penerima"|<input[^>]*value="penerima"[^>]*name="peran"/);

    for (const html of [
      renderToStaticMarkup(await NewContactPage({ searchParams: Promise.resolve({}) })),
      renderToStaticMarkup(await NewContactPage({ searchParams: Promise.resolve({ peran: "semua" }) })),
    ]) {
      expect(checked(html, "roleSender")).toBe(true);
      expect(checked(html, "roleRecipient")).toBe(false);
    }
  });

  it("canonicalises a detail URL without dari to the contact's first role and follows dari for the back link (T-188)", async () => {
    mocks.currentContact = activeContact({ isSender: false });
    mocks.addresses.push(activeAddress());

    await expect(renderDetail({ alamat: ADDRESS_ID })).rejects.toThrow(
      `REDIRECT:/app/kontak/${CONTACT_ID}?alamat=${ADDRESS_ID}&dari=penerima`,
    );
    await expect(renderDetail({ dari: "semua" })).rejects.toThrow(`REDIRECT:/app/kontak/${CONTACT_ID}?dari=penerima`);

    const fromRecipients = await renderDetail({ dari: "penerima" });
    expect(fromRecipients).toMatch(/href="\/app\/kontak\/penerima"[^>]*>[\s\S]{0,400}?Kembali ke daftar penerima/);
    expect(fromRecipients).toContain(`href="/app/kontak/${CONTACT_ID}?dari=penerima&amp;alamat=${ADDRESS_ID}#alamat-edit"`);

    mocks.currentContact = activeContact();
    const fromSenders = await renderDetail({ dari: "pengirim" });
    expect(fromSenders).toMatch(/href="\/app\/kontak\/pengirim"[^>]*>[\s\S]{0,400}?Kembali ke daftar pengirim/);
    // Header: both role chips (the originating one filled), status, actions;
    // the contact and its roles are separate cards and forms.
    const header = fromSenders.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(header).toMatch(/data-variant="secondary"[^>]*>Pengirim</);
    expect(header).toMatch(/data-variant="outline"[^>]*>Penerima</);
    expect(header).toContain(">Aktif<");
    expect(header).toContain('href="#form-kontak"');
    expect(header).toContain(`href="/app/kontak/${CONTACT_ID}?dari=pengirim&amp;arsipkan=1#arsip-kontak"`);
    expect(fromSenders).toContain('id="form-kontak"');
    expect(fromSenders).toContain('id="form-peran"');
    expect(fromSenders).toContain("Muncul di menu Penerima dan bisa dipilih sebagai tujuan kiriman.");
    expect(fromSenders).toContain('href="https://wa.me/6281234567890"');
  });

  it("renders contact creation with truthful outlet readiness", async () => {
    const unavailable = renderToStaticMarkup(await NewContactPage({ searchParams: Promise.resolve({}) }));
    expect(unavailable).toContain("Buat kontak");
    expect(unavailable).toContain("Outlet belum siap");
    expect(unavailable).toContain("Simpan kontak");

    mocks.outlets.push({ id: "00000000-0000-4000-8000-000000000653", name: "Outlet Pusat" });
    const ready = renderToStaticMarkup(await NewContactPage({ searchParams: Promise.resolve({}) }));
    expect(ready).toContain("Sumber pencarian:");
    expect(ready).toContain("Outlet Pusat");
    expect(ready).not.toContain("Outlet belum siap");
  });

  it("selects an address editor and gates archive confirmation to Tenant Admin", async () => {
    mocks.currentContact = activeContact();
    mocks.addresses.push(activeAddress());
    mocks.outlets.push({ id: "00000000-0000-4000-8000-000000000653", name: "Outlet Pusat" });

    const selected = await renderDetail({ alamat: ADDRESS_ID, dari: "pengirim" });
    expect(selected).toContain('id="alamat-edit"');
    expect(selected).toContain("Edit Rumah");
    expect(selected).toContain("Data pada kiriman sebelumnya tetap tersimpan.");

    const confirmation = await renderDetail({ arsipkan: "1", dari: "pengirim" });
    expect(confirmation).toContain('id="arsip-kontak"');
    expect(confirmation).toContain("Arsipkan Penerima Aman?");
    expect(confirmation).toContain("Ya, arsipkan kontak");

    mocks.principal.role = "OPERATOR";
    const operator = await renderDetail({ arsipkan: "1", dari: "pengirim" });
    expect(operator).toContain("Arsip kontak dikelola oleh Tenant Admin.");
    expect(operator).not.toContain("Ya, arsipkan kontak");
    expect(operator).not.toContain("?arsipkan=1");
  });

  it("keeps an archived contact readable and removes every mutation form", async () => {
    mocks.currentContact = activeContact({ archivedAt: new Date("2026-09-02T00:00:00.000Z") });
    mocks.addresses.push(activeAddress());

    const html = await renderDetail({ dari: "pengirim", diarsipkan: "1" });
    expect(html).toContain("Data kontak diarsipkan; hanya dapat dibaca.");
    expect(html.match(/<header[\s\S]*?<\/header>/)?.[0]).toMatch(/data-variant="destructive"[^>]*>Diarsipkan</);
    expect(html).not.toContain('href="#form-kontak"');
    expect(html).not.toContain("arsipkan=1");
    const archivedWithoutNotice = await renderDetail({ dari: "pengirim" });
    expect(archivedWithoutNotice).toContain("Kontak ini diarsipkan");
    expect(html).toContain("Kontak diarsipkan");
    expect(html).toContain("Kontak ini sudah diarsipkan.");
    expect(html).not.toContain('id="form-kontak"');
    expect(html).not.toContain('id="alamat-baru"');
    expect(html).not.toContain("Edit alamat");
  });
});
