import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
        status: "RTS_QUEUED",
        createdAt: new Date("2026-09-01T02:00:00.000Z"),
        updatedAt: new Date("2026-09-02T02:00:00.000Z"),
        outletName: "Local Development Outlet",
        destinationAreaLabel: "Kebon Jeruk, Jakarta Barat",
        packageContent: "Paket contoh",
        packageWeightGrams: 2750,
        isCod: true,
        declaredValueIdr: 575_000,
        recipientName: "Joko Santoso",
        recipientPhoneMasked: "•••• 0010",
        providerService: "JNE REG",
        awb: "SANITIZED-CNOTE-0003",
        latestEventNotes: "Penerima tidak dapat dihubungi.",
        latestEventAt: new Date("2026-09-02T02:00:00.000Z"),
      },
      {
        // No AWB: the row where the truncated identifier legitimately appears,
        // because it is then the only identifier the row has.
        shipmentId: "72000009-0000-4000-8000-000000000009",
        status: "PROBLEM",
        createdAt: new Date("2026-09-01T02:00:00.000Z"),
        updatedAt: new Date("2026-09-03T02:00:00.000Z"),
        outletName: "Local Development Outlet",
        destinationAreaLabel: "Kelapa Gading, Jakarta Utara",
        packageContent: "Paket contoh",
        packageWeightGrams: 3500,
        isCod: true,
        declaredValueIdr: 725_000,
        recipientName: "Dedi Kurniawan",
        recipientPhoneMasked: "•••• 0004",
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
  beforeEach(async () => {
    fixture.auditHeader = null;
    html = await render();
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

  it("renders the status filter as a navigation landmark, not as a tablist", () => {
    // The chips are links that navigate. There is no tab panel and no roving
    // focus, so `role="tablist"` promised keyboard semantics it never had.
    expect(occurrences(html, /role="tablist"/)).toBe(0);

    // The label has to be on the landmark. `<div aria-label>` announces nothing.
    expect(html).toMatch(/<nav[^>]*aria-label="Filter status retur"/);

    // The shell owns the one truthful current page; a filter on that page is
    // `aria-current="true"`, and exactly one chip is active.
    expect(occurrences(html, 'aria-current="page"')).toBe(0);
    expect(occurrences(html, 'aria-current="true"')).toBe(1);
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

  it("never prints a second identifier beside a provider AWB", () => {
    // Every row rendered `ID: 72000000` in a field of its own, beside an AWB
    // that already identified the row and linked to it. Matched in the output,
    // so a helper or a template literal rebuilding it is the same finding.
    // Bound to the identifier, not to the word "ID" or to a slice length.
    // `Ref {row.shipmentId.slice(0, 7)}` prints a second identifier on every
    // row just as plainly, and a check looking for `ID:` and exactly eight
    // characters sees none of it.
    const rendered = html.replace(/<[^>]*>/g, " ");
    // Rows with no AWB legitimately print one truncated id as their link
    // text; rows with one never print any slice of their own id at all.
    // Prefix and suffix both — `Ref {shipmentId.slice(-8)}` is the same
    // defect at the other end of the string.
    //
    // Grouped by the exact slice value rather than checked per row, because
    // two ids can share a slice (both start "7200000" through length 7 here)
    // — skipping a shared slice instead of pooling it let a mutation on the
    // *other* row hide behind the shared one's own legitimate appearance.
    // The budget for a group is the number of no-AWB rows in it: any count
    // above that is a second identifier from whichever row contributed it.
    //
    // Every contiguous run of the id, not only its prefix and suffix: a slice
    // taken from the middle (`shipmentId.slice(9, 17)`) is the same defect and
    // a check that only looked at the two ends never saw it. The floor is 5,
    // not the 6 an earlier version used — independent review defeated that
    // with a 5-character middle slice. It is not lower still: at 4 characters
    // "0003" collides with the unrelated AWB "SANITIZED-CNOTE-0003" and the
    // check cannot tell that legitimate coincidence from a real second
    // identifier, so it would fail on the very fixture that has no defect.
    for (let length = 5; length <= 12; length++) {
      const owners = new Map<string, typeof fixture.page.rows[number][]>();
      for (const row of fixture.page.rows) {
        const id = row.shipmentId;
        for (let start = 0; start + length <= id.length; start++) {
          const slice = id.slice(start, start + length);
          owners.set(slice, [...(owners.get(slice) ?? []), row]);
        }
      }
      for (const [slice, rows] of owners) {
        const uniqueRows = [...new Set(rows)];
        const budget = uniqueRows.filter((row) => !row.awb).length;
        const seen = (rendered.match(new RegExp(slice, "gi")) ?? []).length;
        expect(seen, `${length}-char slice ${slice} of ${uniqueRows.map((r) => r.shipmentId).join(", ")}`)
          .toBeLessThanOrEqual(budget);
      }
    }

    expect(occurrences(html, "SANITIZED-CNOTE-0003")).toBe(1);
    // Counted as rendered text, not as a substring: both fixture ids appear in
    // `href`s, and a check that cannot tell an address from a printed field
    // would fail for the wrong reason and pass for the wrong reason too.
    const printed = [...html.matchAll(/>([^<>]+)</g)].map((match) => match[1].trim());
    expect(printed.filter((value) => value === "72000009")).toHaveLength(1);
    expect(printed.filter((value) => /^7200000[0-9]$/.test(value))).toHaveLength(1);
    expect(html).toMatch(/>72000009<\/a>/);
  });

  it("keeps the wide table scrollable rather than clipped", () => {
    // `min-w-*` on the table is what makes the container scroll; without it the
    // columns compress instead and the region is decorative.
    expect(html).toMatch(/<table[^>]*min-w-\[70rem\]/);
  });
});
