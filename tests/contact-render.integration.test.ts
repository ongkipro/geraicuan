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
  listContacts: vi.fn(async () => mocks.contacts),
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
    archivedAt: null,
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

async function renderDirectory(status?: string) {
  const element = await ContactDirectoryPage({
    searchParams: Promise.resolve(status === undefined ? {} : { status }),
  });
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

    // The status filter exposes its selection programmatically, not by button
    // variant alone: exactly one link is current, and it is the requested one.
    const statusNav = (html: string) => html.match(/<nav[^>]*aria-label="Status kontak"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? "";
    for (const [requested, href] of [[undefined, "/app/kontak?status=active"], ["archived", "/app/kontak?status=archived"]] as const) {
      const nav = statusNav(requested === undefined ? populated : await renderDirectory(requested));
      const current = nav.match(/<a[^>]*aria-current="true"[^>]*>/g) ?? [];
      expect(current, String(requested)).toHaveLength(1);
      expect(current[0]).toContain(`href="${href}"`);
      expect(nav).not.toContain('aria-current="page"');
      expect(nav.match(/<svg/g) ?? [], "check glyph only on the selected link").toHaveLength(1);
      expect(nav.match(/<a[^>]*class="[^"]*min-h-11/g) ?? []).toHaveLength(2);
    }

    const invalid = await renderDirectory("unknown");
    expect(invalid).toContain("Filter status disesuaikan");
    expect(invalid).toContain("Status tidak dikenali; kontak aktif ditampilkan.");
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
