import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ContactDetailPage from "@/app/app/kontak/[contactId]/page";
import NewContactPage from "@/app/app/kontak/baru/page";
import ContactDirectoryPage from "@/app/app/kontak/page";

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
        "CON-ACTIVE": inRole.length - archived.length,
        "CON-ALL": inRole.length,
        "CON-ARCHIVED": archived.length,
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

async function renderDirectory(status?: string, peran?: string) {
  const params: Record<string, string> = {};
  if (status !== undefined) params.status = status;
  if (peran !== undefined) params.peran = peran;
  const element = await ContactDirectoryPage({ searchParams: Promise.resolve(params) });
  return renderToStaticMarkup(element);
}

async function renderDetail(searchParams: Record<string, string> = {}) {
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
    expect(populated).toMatch(/class="[^"]*min-h-11[^"]*" href="\/app\/kontak\/baru"/);
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
      expect(panel, String(requested)).toMatch(/<ul[^>]*aria-label="Ringkasan status kontak"/);
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
    expect(invalid).toContain("Status tidak dikenali; kontak aktif ditampilkan.");
  });

  it("splits the directory into peran views, recovers from an invalid peran, and states missing address data explicitly", async () => {
    mocks.contacts.push(
      activeContact({ id: "00000000-0000-4000-8000-000000000661", isRecipient: false, isSender: true, name: "T167 Pengirim Saja" }),
      activeContact({
        address: null,
        addressCount: 0,
        destinationAreaLabel: null,
        id: "00000000-0000-4000-8000-000000000662",
        isRecipient: true,
        isSender: false,
        name: "T167 Penerima Tanpa Alamat",
      }),
      activeContact({
        addressCount: 3,
        destinationAreaLabel: null,
        id: "00000000-0000-4000-8000-000000000663",
        isRecipient: true,
        isSender: true,
        name: "T167 Dua Peran Area Belum Dipilih",
      }),
    );

    // The peran nav mirrors the status nav's programmatic-selection contract.
    const peranNav = (html: string) => html.match(/<nav[^>]*aria-label="Peran kontak"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? "";
    const semua = peranNav(await renderDirectory(undefined, "semua"));
    expect(semua.match(/<a[^>]*aria-current="true"[^>]*>/g) ?? []).toHaveLength(1);
    expect(semua).toContain('href="/app/kontak?status=active&amp;peran=semua"');

    const pengirim = await renderDirectory(undefined, "pengirim");
    expect(pengirim).toContain("T167 Pengirim Saja");
    expect(pengirim).toContain("T167 Dua Peran Area Belum Dipilih");
    expect(pengirim).not.toContain("T167 Penerima Tanpa Alamat");

    const penerima = await renderDirectory(undefined, "penerima");
    expect(penerima).toContain("T167 Penerima Tanpa Alamat");
    expect(penerima).toContain("T167 Dua Peran Area Belum Dipilih");
    expect(penerima).not.toContain("T167 Pengirim Saja");
    // A dual-role contact appears in both role-specific views.
    expect(pengirim).toContain("T167 Dua Peran Area Belum Dipilih");

    // Zero addresses and an address predating area selection are both stated
    // explicitly, never left as a blank cell; "+N alamat" is addresses beyond
    // the one shown, linking to the contact detail's address list.
    const all = await renderDirectory(undefined, "semua");
    expect(all).toContain("Belum ada alamat");
    expect(all).toContain("Area belum dipilih");
    expect(all).toMatch(/href="\/app\/kontak\/00000000-0000-4000-8000-000000000663#alamat"[^>]*>\s*\+2 alamat/);

    const invalidPeran = await renderDirectory(undefined, "unknown");
    expect(invalidPeran).toContain("Filter peran disesuaikan");
    expect(invalidPeran).toContain("Peran tidak dikenali; semua kontak ditampilkan.");
  });

  it("renders contact creation with truthful outlet readiness", async () => {
    const unavailable = renderToStaticMarkup(await NewContactPage());
    expect(unavailable).toContain("Buat kontak");
    expect(unavailable).toContain("Outlet belum siap");
    expect(unavailable).toContain("Simpan kontak");

    mocks.outlets.push({ id: "00000000-0000-4000-8000-000000000653", name: "Outlet Pusat" });
    const ready = renderToStaticMarkup(await NewContactPage());
    expect(ready).toContain("Sumber pencarian:");
    expect(ready).toContain("Outlet Pusat");
    expect(ready).not.toContain("Outlet belum siap");
  });

  it("selects an address editor and gates archive confirmation to Tenant Admin", async () => {
    mocks.currentContact = activeContact();
    mocks.addresses.push(activeAddress());
    mocks.outlets.push({ id: "00000000-0000-4000-8000-000000000653", name: "Outlet Pusat" });

    const selected = await renderDetail({ alamat: ADDRESS_ID });
    expect(selected).toContain('id="alamat-edit"');
    expect(selected).toContain("Edit Rumah");
    expect(selected).toContain("Data pada kiriman sebelumnya tetap tersimpan.");

    const confirmation = await renderDetail({ arsipkan: "1" });
    expect(confirmation).toContain('id="arsip-kontak"');
    expect(confirmation).toContain("Arsipkan Penerima Aman?");
    expect(confirmation).toContain("Ya, arsipkan kontak");

    mocks.principal.role = "OPERATOR";
    const operator = await renderDetail({ arsipkan: "1" });
    expect(operator).toContain("Arsip kontak dikelola oleh Tenant Admin.");
    expect(operator).not.toContain("Ya, arsipkan kontak");
    expect(operator).not.toContain("?arsipkan=1");
  });

  it("keeps an archived contact readable and removes every mutation form", async () => {
    mocks.currentContact = activeContact({ archivedAt: new Date("2026-09-02T00:00:00.000Z") });
    mocks.addresses.push(activeAddress());

    const html = await renderDetail({ diarsipkan: "1" });
    expect(html).toContain("Data kontak diarsipkan");
    expect(html).toContain("Kontak diarsipkan");
    expect(html).toContain("Kontak ini sudah diarsipkan.");
    expect(html).not.toContain('id="form-kontak"');
    expect(html).not.toContain('id="alamat-baru"');
    expect(html).not.toContain("Edit alamat");
  });
});
