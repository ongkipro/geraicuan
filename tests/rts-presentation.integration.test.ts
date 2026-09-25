import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatWibDateTime } from "@/lib/label-format";


/**
 * Guards for the return-queue composition T-77 repaired.
 *
 * These assert on **rendered HTML**, not on source text. Two earlier versions
 * of this file matched the source, and independent review walked through both
 * of them: the first because the assertions were bound to a comment, a `<=`
 * count and one JSX spelling; the second because `role={"tablist"}`, a
 * `shortRowId(row)` helper declared above the component, `className={"..."}`
 * and a KPI row rebuilt from `filterTabs` are all different source text and the
 * same rendered defect. Source matching enumerates spellings forever. The
 * browser does not care how the JSX was written, so neither does this file.
 */

const fixture = {
  auditHeader: null as string | null,
  page: {
    // PR-57: the queue states where these return states came from and how far
    // behind they may be, so the fixture carries that basis like the page does.
    basis: {
      lastObservedAt: new Date("2026-09-08T09:45:00.000Z") as Date | null,
      observationVisible: true,
    },
    generatedAt: new Date("2026-09-09T03:00:00.000Z"),
    page: 1,
    pageSize: 20,
    status: "ALL" as const,
    totalCount: 7,
    totalPages: 1,
    summary: {
      // Deliberately distinctive values. With 3/2/1/1 the "counts appear only
      // inside the filter" assertion cannot tell a restated count from a weight
      // or a page number, so it had to require the number to be a whole text
      // node — and a tile rendering "3 kiriman" walked straight through it.
      totalRtsCount: 88,
      queuedCount: 37,
      inTransitCount: 23,
      receivedCount: 11,
      problemCount: 17,
    },
    rows: [
      {
        shipmentId: "72000000-0000-4000-8000-000000000003",
        publicReference: "GC-10003",
        status: "RTS_QUEUED",
        createdAt: new Date("2026-09-01T02:00:00.000Z"),
        updatedAt: new Date("2026-09-02T02:00:00.000Z"),
        outletName: "Local Development Outlet",
        destinationAreaLabel: "Kebon Jeruk, Jakarta Barat",
        packageContent: "Paket contoh",
        packageWeightGrams: 2750,
        declaredValueIdr: 575_000,
        paymentMethod: "COD" as "COD" | "COD_ONGKIR" | "NON_COD",
        providerCodAmountIdr: 575_000 as number | null,
        recipientName: "Joko Santoso",
        recipientPhone: "080000000010",
        providerService: "JNE REG",
        awb: "SANITIZED-CNOTE-0003",
        latestEventNotes: "Penerima tidak dapat dihubungi.",
        latestEventAt: new Date("2026-09-02T02:00:00.000Z"),
      },
      {
        // No AWB: the row where the internal reference legitimately appears,
        // because it is then the only identifier the row has.
        shipmentId: "72000009-0000-4000-8000-000000000009",
        publicReference: "GC-10009",
        status: "PROBLEM",
        createdAt: new Date("2026-09-01T02:00:00.000Z"),
        updatedAt: new Date("2026-09-03T02:00:00.000Z"),
        outletName: "Local Development Outlet",
        destinationAreaLabel: "Kelapa Gading, Jakarta Utara",
        packageContent: "Paket contoh",
        packageWeightGrams: 3500,
        declaredValueIdr: 725_000,
        paymentMethod: "COD" as "COD" | "COD_ONGKIR" | "NON_COD",
        providerCodAmountIdr: 725_000 as number | null,
        recipientName: "Dedi Kurniawan",
        recipientPhone: "080000000004",
        providerService: "JNE REG",
        awb: null,
        latestEventNotes: null,
        latestEventAt: null,
      },
    ],
  },
};

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: () => fixture.auditHeader })),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (href: string) => { throw new Error(`NEXT_REDIRECT:${href}`); },
}));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => ({
    role: "TENANT_ADMIN" as const,
    scope: "tenant" as const,
    tenantId: "70000000-0000-4000-8000-000000000001",
    userId: "t77-user",
  })),
}));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (
    _db: unknown,
    userId: string,
    tenantId: string,
    work: (tx: unknown, context: unknown) => Promise<unknown>,
  ) => work({}, { role: "TENANT_ADMIN", tenantId, userId })),
}));
// T-204: Retur lists the tenant's outlets for the Tenant Admin status pull.
vi.mock("@/db/tenant-repository", () => ({
  listTenantOutlets: vi.fn(async () => [{ id: "00000000-0000-4000-8000-000000020621", name: "Gerai retur" }]),
}));
vi.mock("@/db/rts-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/rts-repository")>()),
  loadRtsShipmentsPage: vi.fn(async () => fixture.page),
}));

const { default: RtsPage } = await import("@/app/app/pengiriman/rts/page");

async function render(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(
    await RtsPage({ searchParams: Promise.resolve(searchParams) }) as never,
  );
}

/** Every occurrence of `needle`, so a second copy cannot hide behind the first. */
const occurrences = (haystack: string, needle: string | RegExp) =>
  (haystack.match(
    typeof needle === "string"
      ? new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
      : new RegExp(needle.source, needle.flags.includes("g") ? needle.flags : `${needle.flags}g`),
  ) ?? []).length;

describe("return queue presentation", () => {
  let html = "";
  // The page states its resolved date range in text ("19 Agu 2026 – 17 Sep
  // 2026"), and this file proves each filter count is printed once by giving
  // the counts distinctive values (37, 23, 11, 17, 88) and counting them in the
  // whole document. On a real clock the range carries today's day of the month,
  // so the suite failed on the 11th, 17th and 23rd and passed on every other day
  // — a date collision, not a restated count. Pin the clock to a day whose
  // range label shares no number with the counts.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-05T03:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(async () => {
    fixture.auditHeader = null;
    fixture.page.rows[0].awb = "SANITIZED-CNOTE-0003";
    html = await render();
  });

  it("shows complete operational phones and destinations", () => {
    const visible = html.replace(/<[^>]+>/g, " ");
    for (const row of fixture.page.rows) {
      expect(visible).toContain(row.recipientPhone);
      expect(visible).toContain(row.destinationAreaLabel);
    }
    expect(visible).not.toContain("••••");
  });

  it("wraps full provider-length AWBs, recipients and outlets while keeping Status & Waktu merged", async () => {
    fixture.page.rows[0].awb = "AWB12345".repeat(5);
    const markup = await render();
    const cells = [...markup.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/g)].map(([cell]) => cell);
    const awb = cells.find(cell => cell.includes(fixture.page.rows[0].awb!));
    expect(awb).toContain("max-w-40");
    expect(awb).toContain("whitespace-normal");
    expect(awb).toContain("sticky left-0");
    // T-172: the pinned cell takes the row's own opaque fill so the zebra stripe
    // reaches it. jsdom computes no cascade, so the rendered proof that this is
    // opaque and matches its row is the pinned-column pass in admin-programme.mjs.
    expect(awb).toContain("bg-inherit");
    expect(awb).toMatch(new RegExp(`<a[^>]*class="[^"]*break-all[^"]*"[^>]*>${fixture.page.rows[0].awb}</a>`));
    for (const value of ["Joko Santoso", "Local Development Outlet"]) {
      expect(cells.find(cell => cell.includes(value))).toMatch(/class="[^"]*max-w-48[^"]*whitespace-normal/);
    }
    expect(markup).toContain("Status &amp; Waktu");
    expect(markup).not.toContain("Waktu Update</th>");
  });

  it("states each filter count once, inside the control that acts on it", async () => {
    // The page opened with four KPI cards showing 7/3/2/1 directly above filter
    // chips showing the same 7/3/2/1 — the chips additionally carrying the
    // PROBLEM count and being clickable, so the cards were a strictly smaller,
    // unactionable copy of the control beneath them.
    //
    // Asserted on occurrence count in the whole document, not on DOM position.
    // `withoutFilterNav` used to define "restated" as "printed outside the
    // `<nav>` element", and a KPI tile row placed *inside* that element —
    // structurally part of the filter's markup without being one of its
    // links — read as zero restatements while printing every count a second
    // time. Each distinctive value legitimately appears exactly once, in its
    // one filter chip; a second appearance anywhere is the same defect
    // whatever element carries it or where it sits in the tree.
    const text = html.replace(/<[^>]*>/g, " ");
    for (const [label, count] of [
      ["queued", 37], ["inTransit", 23], ["received", 11], ["problem", 17],
      ["total", 88],
    ] as const) {
      expect(text.match(new RegExp(`\\b${count}\\b`, "g")) ?? [], label).toHaveLength(1);
    }

    // Composition matches its sibling queue exactly rather than out-carding it.
    const cardsIn = (source: string) => (source.match(/\bCard[A-Za-z]*\b/g) ?? []).length;
    const rtsSource = readFileSync(join(process.cwd(), "src/app/app/pengiriman/rts/page.tsx"), "utf8");
    const queueSource = readFileSync(join(process.cwd(), "src/app/app/pengiriman/page.tsx"), "utf8");
    expect(cardsIn(rtsSource)).toBe(cardsIn(queueSource));
  });

  it("renders the status filter as the shared PR-52 state panel, not as a tablist", () => {
    // The entries act on this page's own `status` URL state. There is no tab
    // panel and no roving focus, so `role="tablist"` promised keyboard
    // semantics it never had.
    expect(occurrences(html, /role="tablist"/)).toBe(0);

    // T-162: the chips became the shared panel. Its entries are real submit
    // buttons — that is what makes `aria-pressed` legal ARIA and gives Enter
    // and Space without a key handler. A link cannot carry `aria-pressed`.
    const panel = html.match(/<form[^>]*data-slot="state-summary-panel"[^>]*>[\s\S]*?<\/form>/)?.[0];
    expect(panel, "state summary panel").toBeDefined();
    expect(panel!).toContain('method="get"');
    expect(panel!).toContain('action="/app/pengiriman/rts"');
    expect(panel!).toMatch(/<ul[^>]*aria-label="Ringkasan status retur"/);

    const entries = panel!.match(/<button[^>]*aria-pressed="(?:true|false)"[^>]*>/g) ?? [];
    expect(entries, "one entry per filter").toHaveLength(5);
    for (const entry of entries) {
      expect(entry, entry).toContain('type="submit"');
      expect(entry, entry).toContain('name="status"');
      // 44 px touch target below md, and our single full-alpha 2px focus ring.
      expect(entry, entry).toContain("min-h-11");
      expect(entry, entry).toContain("focus-visible:ring-2");
      expect(entry, entry).toContain("focus-visible:ring-ring");
      expect(entry, entry).not.toMatch(/ring-ring\/\d+|ring-3/);
    }

    // Exactly one entry is pressed, and it is the one the unfiltered fixture
    // selects. The shell keeps the one truthful current page, so no filter
    // claims `aria-current` at all any more.
    const pressed = panel!.match(/<button[^>]*aria-pressed="true"[^>]*>/g) ?? [];
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toContain('value="ALL"');
    expect(occurrences(panel!, "aria-current")).toBe(0);

    // The active entry is marked without relying on colour: one check glyph,
    // in the pressed entry only.
    expect(panel!.match(/<svg/g) ?? [], "check glyph only on the pressed entry").toHaveLength(1);
  });

  it("scrolls the wide table inside a labelled, keyboard-reachable region", () => {
    // A bare `overflow-x-auto` cannot be reached or scrolled by keyboard and
    // announces nothing. The sibling queue already solved this.
    const region = html.match(/<div[^>]*data-slot="table-container"[^>]*>/);
    expect(region, "table container").not.toBeNull();
    expect(region![0]).toContain('role="region"');
    expect(region![0]).toContain('tabindex="0"');
    expect(region![0]).toMatch(/aria-label="Daftar kiriman retur; geser horizontal/);

    // No other horizontal scroller may be left unlabelled and unreachable.
    // Any horizontal scroller, not one utility spelling: `overflow-auto` and
    // `overflow-scroll` scroll horizontally too, and an added
    // `overflow-auto whitespace-nowrap` strip passed a check bound to
    // `overflow-x-auto`.
    for (const opening of html.match(/<[a-z]+[^>]*\boverflow(?:-x)?-(?:auto|scroll)\b[^>]*>/g) ?? []) {
      const announced = /aria-label=|aria-labelledby=|role="region"/.test(opening);
      const reachable = /tabindex="0"/.test(opening);
      expect(announced && reachable, opening.slice(0, 120)).toBe(true);
    }
  });

  it("renders one record card per row below md, linked by shipment number (T-203)", () => {
    const list = html.match(/<ul[^>]*aria-label="Daftar kiriman retur"[^>]*>[\s\S]*?<\/ul>/)?.[0] ?? "";
    expect(list).toMatch(/^<ul[^>]*class="[^"]*\bmd:hidden\b/);
    expect(list.match(/<li\b/g) ?? []).toHaveLength(fixture.page.rows.length);
    for (const row of fixture.page.rows) {
      expect(list).toContain(`>${row.publicReference}</a>`);
      expect(list).toContain(row.recipientName);
    }
    expect(html).toMatch(/<div[^>]*data-slot="table-container"[^>]*class="[^"]*max-md:hidden/);
  });

  it("uses one complete primary identifier per row", () => {
    const body = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    expect(rows).toHaveLength(fixture.page.rows.length);
    rows.forEach(([, markup], index) => {
      const row = fixture.page.rows[index];
      const primaryCell = markup.match(/<td[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? "";
      const visiblePrimary = primaryCell.replace(/<[^>]+>/g, " ").trim();
      expect(visiblePrimary).toBe(row.awb ?? row.publicReference);
      const visibleRow = markup.replace(/<[^>]+>/g, " ");
      if (row.awb) {
        expect(visibleRow).not.toContain(row.shipmentId);
        expect(visibleRow).not.toContain(row.publicReference);
      }
    });
  });

  it("keeps the wide table scrollable rather than clipped", () => {
    // `min-w-*` on the table is what makes the container scroll; without it the
    // columns compress instead and the region is decorative.
    expect(html).toMatch(/<table[^>]*min-w-\[60rem\]/);
    // TableCell is nowrap; the clamped note cell must opt back into wrapping
    // with a ceiling, or its sentence sets the column width and the table
    // overflows even at 1440.
    const noteCell = html.match(/<td[^>]*>(?:(?!<\/td>).)*Penerima tidak dapat dihubungi\.(?:(?!<\/td>).)*<\/td>/)?.[0];
    expect(noteCell, "note cell").toBeDefined();
    const noteOpening = noteCell!.match(/^<td[^>]*>/)![0];
    expect(noteOpening).toMatch(/\bwhitespace-normal\b/);
    expect(noteOpening).toMatch(/\bmax-w-/);
    expect(noteCell).toMatch(/\bline-clamp-2\b/);
  });
});

// T-169 / PR-57. Until this task, every state in this queue came from the demo
// seed: no code path ever wrote a delivery state. Now that the settlement pull
// writes them, the page has to say the outcome is Mengantar's report and how
// far behind it may be, or an operator reads a stale queue as live truth.
describe("return queue states its provider basis", () => {
  it("names Mengantar and the last pull for a reader who may see the provider evidence", async () => {
    fixture.auditHeader = null;
    fixture.page.basis = { lastObservedAt: new Date("2026-09-08T09:45:00.000Z"), observationVisible: true };

    const text = (await render()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    expect(text).toContain("dilaporkan Mengantar");
    expect(text).toContain(formatWibDateTime(new Date("2026-09-08T09:45:00.000Z")));
  });

  it("offers the Tenant Admin the pull that feeds these states, on the page's own range (T-204)", async () => {
    fixture.auditHeader = null;
    const html = await render();
    expect(html).toContain("Perbarui status dari Mengantar");
    expect(html).toMatch(/name="outletId"[^>]*value="00000000-0000-4000-8000-000000020621"/);
    expect(html).toMatch(/name="rentang"[^>]*value="30-hari"/);
  });

  it("states the mechanism, not an invented time, for a reader who may not", async () => {
    fixture.auditHeader = null;
    fixture.page.basis = { lastObservedAt: null, observationVisible: false };

    const text = (await render()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    expect(text).toContain("dilaporkan Mengantar");
    expect(text).toContain("memperbarui status dari Mengantar di Histori kiriman atau Retur");
    expect(text).not.toMatch(/tarikan terakhir/);
  });
});
