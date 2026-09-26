import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * T-215 (UI v3): Pengirim/Penerima, Kontak baru/detail, Cek resi and Cek tarif — query parsing,
 * presentation helpers and key markup. No database and no Mengantar: every Server Action module is
 * replaced, so only the screens' own logic runs.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/kontak/pengirim",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/app/kontak/actions", () => ({ saveContact: vi.fn(), searchContacts: vi.fn() }));
vi.mock("@/app/app/kontak/[contactId]/actions", () => ({
  addContactAddressAction: vi.fn(),
  archiveContactAction: vi.fn(),
  setPrimaryContactAddressAction: vi.fn(),
  updateContactAction: vi.fn(),
  updateContactAddressAction: vi.fn(),
}));
vi.mock("@/app/app/cek-resi/actions", () => ({ lookupShipmentTracking: vi.fn() }));
vi.mock("@/app/app/cek-tarif/actions", () => ({ checkShippingRates: vi.fn() }));
vi.mock("@/app/app/location-actions", () => ({ searchMengantarDestinationAreas: vi.fn() }));

const { contactDirectoryHref, contactHistoryHref, pageCount, parseContactDirectoryQuery, parseContactHistoryQuery, shareText } = await import("@/app/app/kontak/contact-directory-query");
const { contactDetailHref, parseContactNumber } = await import("@/lib/contact-role-filter");
const { contactCategoryLabel, parseContactCategory } = await import("@/lib/contact-category");
const { ContactDirectoryList, contactAreaLine } = await import("@/app/app/kontak/contact-directory-list");
const { ContactCreateForm } = await import("@/app/app/kontak/baru/contact-create-form");
const { ContactArchiveZone, ContactAddressesCard, ContactDataSection } = await import("@/app/app/kontak/[contactId]/contact-detail-cards");
const { ContactFormSkeleton } = await import("@/app/app/kontak/contact-skeletons");
const { trackingTimeline } = await import("@/app/app/cek-resi/tracking-result-model");
const { TrackingLookup, TrackingResultCard } = await import("@/app/app/cek-resi/tracking-lookup");
const { RateCheck, RateResults, rateView } = await import("@/app/app/cek-tarif/rate-check");
const { DestinationAreaPicker } = await import("@/app/app/_shared/destination-area-picker");

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const filledPrimaries = (html: string) => html.match(/data-slot="button" data-variant="default"/g)?.length ?? 0;

const contact = {
  address: "JL. RIAU NO. 27",
  addressCount: 2,
  archived: false,
  category: "PIC_UTAMA",
  contactNumber: 55,
  deliveredCount: 5,
  destinationAreaLabel: "Citarum, Bandung Wetan, Kota Bandung, Jawa Barat, 40115",
  id: "71000000-0000-4000-8000-000000000055",
  isRecipient: true,
  isSender: true,
  name: "Butik Kirana",
  phone: "081290000055",
  shipmentCount: 6,
};

describe("contact directory query", () => {
  it("parses status and page, falling back to Aktif and page 1", () => {
    expect(parseContactDirectoryQuery({})).toEqual({ page: 1, status: "active" });
    expect(parseContactDirectoryQuery({ halaman: "3", status: "archived" })).toEqual({ page: 3, status: "archived" });
    expect(parseContactDirectoryQuery({ halaman: ["2", "9"], status: "semua" })).toEqual({ page: 2, status: "active" });
    for (const bad of ["0", "-1", "1.5", "abc", "9999999"]) expect(parseContactDirectoryQuery({ halaman: bad }).page).toBe(1);
  });

  it("keeps the defaults out of the URL and never carries a search term", () => {
    expect(contactDirectoryHref("pengirim", "active")).toBe("/app/kontak/pengirim");
    expect(contactDirectoryHref("penerima", "all", 2)).toBe("/app/kontak/penerima?status=all&halaman=2");
    expect(pageCount(0)).toBe(1);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(21)).toBe(2);
  });

  it("reads an area as 'Kecamatan, Kota' plus postcode, or says why there is none", () => {
    expect(contactAreaLine(contact)).toBe("Bandung Wetan, Kota Bandung 40115");
    expect(contactAreaLine({ address: null, destinationAreaLabel: null })).toBe("Belum ada alamat");
    expect(contactAreaLine({ address: "Jl. A", destinationAreaLabel: null })).toBe("Area belum dipilih");
  });
});

describe("ContactDirectoryList", () => {
  const base = { page: 1, role: "pengirim" as const, status: "active" as const, summary: { active: 1, all: 1, archived: 0 }, totalPages: 1 };

  it("renders tabs with counts, the table and record cards with the other role marked", () => {
    const html = render(createElement(ContactDirectoryList, { ...base, rows: [contact] }));
    expect(html).toContain('aria-current="page" class=');
    expect(html).toMatch(/Aktif <span[^>]*>\(1\)<\/span>/);
    expect(html).toContain("Diarsipkan <span");
    for (const header of ["Nama pengirim", "WhatsApp", "Alamat utama", "Kiriman", "Status", "Aksi"]) expect(html).toContain(`>${header}</th>`);
    expect(html).toContain("Juga penerima");
    expect(html).toContain(">PIC Utama</span>");
    expect(html).toContain("+1 alamat");
    // T-241: CON-SHP-COUNT with CON-SHP-DELIVERED-SHARE, and the status column.
    expect(html).toContain("6 kiriman");
    expect(html).toContain("83,3% terkirim");
    expect(html).toContain("Aktif</span>");
    expect(html).toContain('href="https://wa.me/6281290000055"');
    // T-241: the detail URL carries the per-tenant number only — no uuid, name or phone.
    expect(html).toContain('href="/app/kontak/pengirim/55"');
    expect(html).not.toContain(contact.id);
    expect(html).not.toMatch(/href="\/app\/kontak\/[^"]*(?:Butik|0812)/);
    expect(html).toContain('data-slot="record-list"');
    expect(html).toContain('role="search"');
    // The directory card itself adds no filled primary (the header's "<Peran> baru" is the one).
    expect(filledPrimaries(html)).toBe(0);
  });

  it("paginates by 20 with links that keep the tab", () => {
    const html = render(createElement(ContactDirectoryList, { ...base, page: 2, rows: [contact], status: "all", summary: { active: 30, all: 45, archived: 15 }, totalPages: 3 }));
    expect(html).toContain("Halaman 2 dari 3");
    expect(html).toContain('href="/app/kontak/pengirim?status=all"');
    expect(html).toContain('href="/app/kontak/pengirim?status=all&amp;halaman=3"');
  });

  it("shows the empty state with a create action, and a quiet one for the archive", () => {
    const empty = render(createElement(ContactDirectoryList, { ...base, rows: [], summary: { active: 0, all: 0, archived: 0 } }));
    expect(empty).toContain("Belum ada pengirim");
    expect(empty).toContain('href="/app/kontak/baru?peran=pengirim"');
    const archived = render(createElement(ContactDirectoryList, { ...base, rows: [], status: "archived", summary: { active: 0, all: 0, archived: 0 } }));
    expect(archived).toContain("Belum ada pengirim diarsipkan");
    expect(archived).not.toContain("/app/kontak/baru");
  });
});

describe("Kontak baru and detail", () => {
  it("keeps the character-class rules on name, phone, label and address, and one filled primary", () => {
    const html = render(createElement(ContactCreateForm, { canManageSettings: true, outlets: [{ id: "o1", name: "Outlet Utama" }], role: "pengirim" }));
    expect(html).toMatch(/id="contactName"[^>]*data-character-class="BUSINESS_NAME"|data-character-class="BUSINESS_NAME"[^>]*id="contactName"/);
    expect(html).toContain('data-character-class="PHONE"');
    expect(html).toContain('data-character-class="ADDRESS"');
    expect(html).toContain('type="hidden" name="peran" value="pengirim"');
    for (const card of ["Kontak", "Peran", "Alamat pertama"]) expect(html).toContain(`>${card}</h2>`);
    expect(filledPrimaries(html)).toBe(1);
    expect(html).toContain("Simpan kontak");
  });

  it("uses the person-name rule for a recipient-only form", () => {
    const html = render(createElement(ContactCreateForm, { canManageSettings: false, outlets: [], role: "penerima" }));
    expect(html).toMatch(/data-character-class="PERSON_NAME"/);
    expect(html).toContain("Outlet belum siap");
  });

  it("lists addresses with Utama and Edit, and caps adding at 20", () => {
    const props = {
      archived: false,
      canManageSettings: true,
      contact: { category: null, id: contact.id, isRecipient: true, isSender: false, name: "Andi", phone: "0812" },
      outlets: [],
      outletsUnavailable: false,
    };
    const address = { address: "Jl. A", destinationAreaId: "a", destinationAreaLabel: "Dago, Coblong, Kota Bandung", id: "x", isPrimary: true, label: "Rumah" };
    const one = render(createElement(ContactAddressesCard, { ...props, addresses: [address] }));
    expect(one).toContain(">Utama</span>");
    expect(one).toContain('aria-label="Edit alamat Rumah"');
    // T-241: "Jadikan utama" only on an address that is not already primary.
    expect(one).not.toContain("Jadikan utama");
    const two = render(createElement(ContactAddressesCard, { ...props, addresses: [address, { ...address, id: "y", isPrimary: false, label: "Kantor" }] }));
    expect(two).toContain('<ul class="grid gap-3 @lg/section:grid-cols-2" id="alamat">');
    expect(two).toContain('aria-label="Jadikan Kantor alamat utama"');
    expect(two).not.toContain('aria-label="Jadikan Rumah alamat utama"');
    expect(one).toContain("Tambah alamat");
    const full = render(createElement(ContactAddressesCard, { ...props, addresses: Array.from({ length: 20 }, (_, index) => ({ ...address, id: `a${index}`, label: `L${index}` })) }));
    expect(full).toContain("Batas 20 alamat aktif tercapai");
    expect(full).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Tambah alamat/);
    expect(one).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Tambah alamat/);
  });

  it("names the contact on the archive action", () => {
    const html = render(createElement(ContactArchiveZone, { contact: { category: null, id: contact.id, isRecipient: true, isSender: false, name: "Andi", phone: "0812" }, role: "penerima" }));
    expect(html).toContain("Zona hati-hati");
    expect(html).toContain("Arsipkan kontak");
    expect(filledPrimaries(html)).toBe(0);
  });

  // T-246 (owner: "bg white … kecuali card atas biar gak rancu"): below the KPI cards the detail
  // page is flat sections on white — no card chrome, no pink block, one save for name, phone,
  // kategori and roles (updateContactAction always took them together).
  it("renders the detail regions as flat sections with one Data kontak save", () => {
    const detailContact = { category: null, id: contact.id, isRecipient: true, isSender: true, name: "Andi", phone: "0812" };
    const zone = render(createElement(ContactArchiveZone, { contact: detailContact, role: "penerima" }));
    expect(zone).toContain('data-slot="contact-section"');
    expect(zone).not.toContain('data-slot="card"');
    expect(zone).not.toContain("bg-tile-danger");
    expect(zone).toContain('data-variant="outline"');
    const data = render(createElement(ContactDataSection, { contact: detailContact }));
    expect(data).toContain('data-slot="contact-section"');
    expect(data).not.toContain('data-slot="card"');
    expect(data.match(/type="submit"/g)).toHaveLength(1);
    expect(data).toContain("Simpan data kontak");
    for (const name of ["contactName", "contactPhone", "category", "roleSender", "roleRecipient"]) expect(data).toContain(`name="${name}"`);
    // T-250: the form sits in the 340px side column — fields stacked (two columns only when the
    // section is ≥ 576px), Peran as two compact 44px checkbox rows (no option cards; the effect
    // stays as each checkbox's description), and the one save full width.
    expect(data).toContain("@container/section");
    expect(data).toContain("grid gap-x-4 @xl/section:grid-cols-2");
    expect(data).not.toMatch(/md:grid-cols-2|xl:grid-cols-3/);
    expect(data.match(/data-compact="true"/g)).toHaveLength(2);
    expect(data).not.toContain("has-checked:bg-accent");
    expect(data).toMatch(/<label class="[^"]*\bmin-h-11\b[^"]*" data-compact="true"><input aria-describedby="roleSender-effect"/);
    expect(data).toMatch(/<span class="sr-only" id="roleSender-effect">/);
    expect(data).toMatch(/<button[^>]*class="[^"]*\bw-full\b[^"]*"[^>]*type="submit"[^>]*>(?:(?!<\/button>)[\s\S])*Simpan data kontak/);
    // The loading skeleton takes the same two-column shape.
    const skeleton = render(createElement(ContactFormSkeleton, { detail: true, title: "Detail penerima" }));
    expect(skeleton).toContain('data-slot="contact-detail-columns"');
    expect(skeleton.indexOf('data-column="main"')).toBeLessThan(skeleton.indexOf('data-column="side"'));
    expect(skeleton.match(/@max-4xl\/detail:order-\d/g)).toEqual(["@max-4xl/detail:order-3", "@max-4xl/detail:order-2", "@max-4xl/detail:order-1"]);
    // The create form keeps the option cards.
    const create = render(createElement(ContactCreateForm, { canManageSettings: true, outlets: [], role: "pengirim" }));
    expect(create).toContain("has-checked:bg-accent");
    expect(create).not.toContain("data-compact");
    const addresses = render(createElement(ContactAddressesCard, {
      addresses: [{ address: "Jl. A", destinationAreaId: "a", destinationAreaLabel: "Dago", id: "x", isPrimary: true, label: "Rumah" }],
      archived: false, canManageSettings: true, contact: detailContact, outlets: [], outletsUnavailable: false,
    }));
    expect(addresses).not.toContain('data-slot="card"');
    expect(addresses).toMatch(/<li class="[^"]*\bborder\b[^"]*\bbg-card\b/);
    // T-250: one address fills the column; two or more go 2-up once the section is ≥ 512px.
    expect(addresses).toContain('<ul class="grid gap-3" id="alamat">');
  });
});

describe("T-241 contact URLs, history query and kategori", () => {
  it("addresses a contact by its per-tenant number and rejects anything else", () => {
    expect(contactDetailHref(12, "penerima")).toBe("/app/kontak/penerima/12");
    expect(parseContactNumber("12")).toBe(12);
    for (const bad of ["0", "012", "-1", "1.5", "abc", "12a", "1234567890", contact.id]) expect(parseContactNumber(bad)).toBeNull();
  });

  it("keeps the history tab and page in the URL, the defaults out of it", () => {
    expect(parseContactHistoryQuery({})).toEqual({ page: 1, payment: "all" });
    expect(parseContactHistoryQuery({ halaman: "2", riwayat: "non-cod" })).toEqual({ page: 2, payment: "noncod" });
    expect(parseContactHistoryQuery({ halaman: "x", riwayat: "semua" })).toEqual({ page: 1, payment: "all" });
    expect(contactHistoryHref("pengirim", 7, "all")).toBe("/app/kontak/pengirim/7");
    expect(contactHistoryHref("pengirim", 7, "cod", 3)).toBe("/app/kontak/pengirim/7?riwayat=cod&halaman=3");
    expect(shareText(1, 3)).toBe("33,3%");
    expect(shareText(0, 0)).toBeNull();
  });

  it("parses kategori: empty is none, an unknown code is invalid", () => {
    expect(parseContactCategory("")).toBeNull();
    expect(parseContactCategory(null)).toBeNull();
    expect(parseContactCategory("DROPSHIPPER")).toBe("DROPSHIPPER");
    expect(parseContactCategory("Skor Mengantar")).toBeUndefined();
    expect(contactCategoryLabel("PIC_UTAMA")).toBe("PIC Utama");
    expect(contactCategoryLabel(null)).toBeNull();
  });

  it("offers the optional kategori on the create form, posted as `category`", () => {
    const html = render(createElement(ContactCreateForm, { canManageSettings: true, outlets: [], role: "pengirim" }));
    expect(html).toContain("Peran / kategori");
    expect(html).toContain('type="hidden" name="category" value=""');
    expect(html).toContain("Tanpa kategori");
  });
});

describe("Cek resi", () => {
  const result = {
    awb: "11LP1700187536",
    courier: "lion",
    declaredValueIdr: 250_000,
    destinationAreaLabel: "PANAKKUKANG, MAKASSAR",
    historyEvents: [] as { description: string; occurredAtIso: string }[],
    observation: { observedAtIso: "2026-09-25T03:13:00Z", providerStatus: "ON PROCESS" },
    paymentMethod: "COD" as const,
    providerCodAmountIdr: 119_479,
    providerService: "lion REGPACK",
    publicReference: "GC-10058",
    returnAwb: null as string | null,
    status: "IN_TRANSIT" as const,
    updatedAtIso: "2026-09-25T02:45:00Z",
  };

  it("builds a newest-first timeline with its source", () => {
    const timeline = trackingTimeline(result);
    expect(timeline.map((entry) => entry.source)).toEqual(["Mengantar", "GeraiCUAN"]);
    expect(timeline[1].title).toBe("Dalam perjalanan");
    expect(trackingTimeline({ ...result, observation: null })).toHaveLength(1);
  });

  it("renders the result card with the resi in mono, the status badge and WIB times", () => {
    const html = render(createElement(TrackingResultCard, { result }));
    expect(html).toContain('class="font-mono text-xl font-bold break-all" id="hasil-cek-resi">11LP1700187536<');
    expect(html).toContain('data-tone="info"');
    expect(html).toContain("Dalam perjalanan");
    expect(html).toContain("WIB · Mengantar");
    expect(html).toContain('href="/app/pengiriman/10058"');
  });

  it("renders not-found and rate-limited outcomes, with one filled primary", () => {
    const missing = render(createElement(TrackingLookup, { initialState: { kind: "missing", query: "GC-99999" } }));
    expect(missing).toContain("Kiriman tidak ditemukan");
    expect(filledPrimaries(missing)).toBe(1);
    const limited = render(createElement(TrackingLookup, { initialState: { kind: "limited", query: "GC-1" } }));
    expect(limited).toContain('role="alert"');
    expect(limited).toContain("Terlalu banyak pencarian");
  });
});

describe("Cek tarif", () => {
  const services = [
    { codEligible: true, deliveryEstimate: "2-3 Day", providerService: "JNE REG", shippingAmountIdr: 22_000 },
    { codEligible: false, deliveryEstimate: "3 - 5 days", providerService: "SAPLite", shippingAmountIdr: 17_500 },
    { codEligible: true, deliveryEstimate: "1 hari", providerService: "JNE YES", shippingAmountIdr: 34_000 },
  ];
  const quote = { destinationAreaLabel: "KEBAYORAN BARU, JAKARTA SELATAN", originAreaLabel: "SURABAYA", outletId: "o1", retrievedAt: "2026-09-14T17:00:00Z", services, weightGrams: 1000 };

  it("groups couriers in quote order and sorts services cheapest first under the chip filter", () => {
    const all = rateView(services, null);
    expect(all.couriers).toEqual(["JNE", "SAP"]);
    expect(all.shown.map((service) => service.shippingAmountIdr)).toEqual([17_500, 22_000, 34_000]);
    expect(rateView(services, "JNE").shown.map((service) => service.providerService)).toEqual(["JNE REG", "JNE YES"]);
    expect(services[0].providerService).toBe("JNE REG");
  });

  it("renders chips, service rows with ongkir, estimasi and COD", () => {
    const html = render(createElement(RateResults, { quote }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Saring kurir"');
    expect(html).toMatch(/Rp\s?17\.500/);
    expect(html).toContain("2–3 hari");
    expect(html).toContain("COD tersedia");
    expect(html).toContain("Tanpa COD");
    expect(html).toContain("1 kg");
  });

  it("says why nothing can be checked without a ready outlet, and offers settings only to admins", () => {
    const admin = render(createElement(RateCheck, { canManageSettings: true, outlets: [] }));
    expect(admin).toContain("Belum ada outlet yang siap");
    expect(admin).toContain('href="/app/pengaturan"');
    expect(filledPrimaries(admin)).toBe(0);
    const operator = render(createElement(RateCheck, { canManageSettings: false, outlets: [] }));
    expect(operator).not.toContain('href="/app/pengaturan"');
  });

  it("has one filled primary and the weight locked to digits when an outlet is ready", () => {
    const html = render(createElement(RateCheck, { canManageSettings: false, initialState: { error: "Tarif belum dapat dimuat dari Mengantar. Coba lagi." }, outlets: [{ id: "o1", name: "Outlet Utama" }] }));
    expect(filledPrimaries(html)).toBe(1);
    expect(html).toContain('data-character-class="NUMERIC_INTEGER"');
    expect(html).toContain("Tarif belum tersedia");
  });
});

describe("DestinationAreaPicker", () => {
  it("posts the fields the destination actions validate, empty until an area is picked", () => {
    const html = render(createElement(DestinationAreaPicker, { outlets: [{ id: "o1", name: "Outlet Utama" }] }));
    for (const name of ["areaId", "areaLabel", "areaQuery", "areaOutletId"]) expect(html).toContain(`type="hidden" name="${name}" value=""`);
    expect(html).toContain('type="hidden" name="areaSelectionChanged" value="0"');
    expect(html).toContain('role="combobox"');
  });

  it("T-247 (L11): asks for the outlet first when there are several and none is chosen", () => {
    const outlets = [{ id: "o1", name: "Outlet Utama" }, { id: "o2", name: "Outlet Kedua" }];
    const html = render(createElement(DestinationAreaPicker, { outlets }));
    expect(html).toContain("Pilih outlet dulu");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*role="combobox"|<button[^>]*role="combobox"[^>]*disabled=""/);
    // Cek tarif passes its own (empty) outlet choice the same way.
    expect(render(createElement(DestinationAreaPicker, { fixedOutletId: "", outlets }))).toContain("Pilih outlet dulu");
    // One outlet is chosen for the user; the normal search prompt shows.
    expect(render(createElement(DestinationAreaPicker, { outlets: outlets.slice(0, 1) }))).not.toContain("Pilih outlet dulu");
  });

  it("shows a stored area and posts the outlet when asked to", () => {
    const html = render(createElement(DestinationAreaPicker, {
      defaultArea: { areaId: "a1", areaLabel: "DAGO, COBLONG, KOTA BANDUNG" },
      fixedOutletId: "o1",
      outlets: [{ id: "o1", name: "Outlet Utama" }],
      submitOutletWithoutSelection: true,
    }));
    expect(html).toContain("Dago, Coblong, Kota Bandung");
    expect(html).toContain('type="hidden" name="areaOutletId" value="o1"');
    // The stored area is not re-posted: only a new pick carries an id the server re-validates.
    expect(html).toContain('type="hidden" name="areaId" value=""');
  });
});
