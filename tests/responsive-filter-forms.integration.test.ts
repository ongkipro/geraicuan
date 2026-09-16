import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function source(...files: string[]) {
  return files.map((file) => readFileSync(join(repositoryRoot, file), "utf8")).join("\n");
}

function occurrences(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

describe("responsive GET filter form composition", () => {
  // T-163: `rentang`, `dari` and `sampai` moved out of every page and into the
  // one shared control, which each page composes into the form it already had.
  // The shared file is read alongside the page's own so the counts below still
  // mean "exactly one control per parameter on this route".
  const RANGE_CONTROL = "src/components/cms/date-range-filter.tsx";
  const surfaces = [
    {
      advancedDisclosure: false,
      files: ["src/app/app/dashboard-period-filter.tsx", RANGE_CONTROL],
      ids: ["dashboard-outlet"],
      idPrefix: "dashboard",
      names: ["rentang", "outlet", "dari", "sampai"],
      route: "/app",
    },
    {
      advancedDisclosure: true,
      files: ["src/app/app/analitik/analytics-filters.tsx", "src/app/app/analitik/analytics-filter-fields.tsx", RANGE_CONTROL],
      ids: ["analytics-outlet", "analytics-kurir", "analytics-status", "analytics-basis"],
      idPrefix: "analytics",
      names: ["rentang", "dari", "sampai", "outlet", "kurir", "status", "basis"],
      route: "/app/analitik",
    },
    {
      advancedDisclosure: true,
      files: ["src/app/app/keuangan/components/finance-filters.tsx", RANGE_CONTROL],
      ids: ["finance-outlet", "finance-status"],
      idPrefix: "finance",
      names: ["rentang", "dari", "sampai", "outlet", "status"],
      route: "/app/keuangan",
    },
    // T-165/T-166 (PR-55). Registered in the change that created them: the same
    // shared range control, the same one-GET-form rule, no second period
    // control and no timezone control.
    {
      advancedDisclosure: true,
      files: ["src/app/app/laporan/pengiriman/report-filters.tsx", RANGE_CONTROL],
      ids: ["shipment-report-outlet", "shipment-report-kurir", "shipment-report-status"],
      idPrefix: "shipment-report",
      names: ["rentang", "dari", "sampai", "outlet", "kurir", "status"],
      route: "/app/laporan/pengiriman",
    },
    {
      advancedDisclosure: false,
      files: ["src/app/app/laporan/cetak-resi/print-history-filters.tsx", RANGE_CONTROL],
      ids: ["print-history-outlet"],
      idPrefix: "print-history",
      names: ["rentang", "dari", "sampai", "outlet"],
      route: "/app/laporan/cetak-resi",
    },
  ] as const;

  it("defines the filter bar layout for narrow screens and switches it at the md breakpoint", () => {
    const css = source("src/app/globals.css");
    expect(css).toMatch(/\.cms-filter-bar\s*\{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.cms-filter-advanced\s*>\s*summary\s*\{[^}]*min-height:\s*44px/);
    const desktopBlocks = [...css.matchAll(/@media \(min-width:\s*768px\)\s*\{([\s\S]*?)\n\}/g)].map((match) => match[1]);
    expect(desktopBlocks.some((block) => /\.cms-filter-bar\s*>\s*:last-child[^{]*\{[^}]*grid-row:\s*1/.test(block))).toBe(true);
  });

  it.each(surfaces)("keeps one SSR-native form and one control set on $route", ({ advancedDisclosure, files, idPrefix, ids, names, route }) => {
    const text = source(...files);
    expect(occurrences(text, /<form\b/g)).toBe(1);
    expect(text).toContain(`action="${route}#`);
    expect(text).toContain('method="get"');
    expect(text).toContain("<details");
    expect(text).toContain("<summary");
    // Phase 13 (T-125): the whole-form mobile disclosure became a persistent filter bar whose
    // advanced fields sit in one native <details>. Bind to that mechanism: the form is the
    // responsive filter bar, the disclosure is its advanced section, and it opens server-side
    // whenever an advanced value is active so an applied filter is never hidden.
    expect(text).toContain('className="cms-filter-bar"');
    if (advancedDisclosure) {
      expect(text).toMatch(/<details className="cms-filter-advanced"[^>]*\bopen=\{/);
    } else {
      // T-163 left /app with nothing advanced: the range control absorbed the
      // only fields that disclosure held, so a disclosure with nothing in it
      // would be a control for its own sake.
      expect(text).not.toContain('className="cms-filter-advanced"');
    }
    expect(text).toContain("data-filter-disclosure");
    expect(text).not.toMatch(/\bSheet(?:Content|Trigger|Header|Footer|Close)?\b/);
    expect(text).not.toMatch(/matchMedia|useMediaQuery|desktop-|mobile-/);
    // The range panel is a native disclosure too, for the same reason: the
    // named `rentang`, `dari` and `sampai` controls must stay inside this one
    // GET form whether the panel is open or shut.
    expect(text).toContain('className="cms-range-filter"');
    expect(text).toMatch(/<summary[\s\S]{0,200}aria-expanded=/);
    // A permanently mounted `role="dialog"` also collided with the command
    // palette's own dialog; `header-tools.mjs` caught it on /app.
    expect(text).not.toMatch(/role="dialog"/);
    // The reference markup's half-alpha ring must not reach any of them.
    expect(text).not.toMatch(/ring-ring\/\d+/);
    expect(text).not.toMatch(/\bring-3\b/);

    // The range control owns its own ids through one prefix, so the route
    // names the prefix and the shared control is asserted once, below.
    expect(occurrences(text, new RegExp(`idPrefix=["']${idPrefix}["']`, "g")), idPrefix).toBe(1);
    for (const id of ids) {
      expect(occurrences(text, new RegExp(`id=["']${id}["']`, "g")), id).toBe(1);
      expect(occurrences(text, new RegExp(`htmlFor=["']${id}["']`, "g")), id).toBe(1);
    }
    for (const name of names) {
      expect(occurrences(text, new RegExp(`name=["']${name}["']`, "g")), name).toBe(1);
    }
    // PR-34–PR-37: operational periods are fixed to WIB, so no filter offers a timezone control.
    expect(text).not.toMatch(/name=["']tz["']/);
    expect(text).not.toMatch(/id=["'][a-z]+-(?:tz|timezone)["']/);
  });
  it("declares the shared range control's ids once each, every one of them labelled", () => {
    const text = source(RANGE_CONTROL);

    // One control per parameter, each id derived from the route's prefix.
    for (const field of ["rentang", "dari", "sampai"]) {
      expect(occurrences(text, new RegExp(`id=\\{\`\\$\\{idPrefix\\}-${field}\`\\}`, "g")), field).toBe(1);
    }
    // The two date inputs are labelled by a <label for>; the preset select has
    // no visible <label> of its own and is labelled by the panel's heading.
    for (const field of ["dari", "sampai"]) {
      expect(occurrences(text, new RegExp(`htmlFor=\\{\`\\$\\{idPrefix\\}-${field}\`\\}`, "g")), field).toBe(1);
    }
    expect(occurrences(text, /aria-labelledby=\{`\$\{idPrefix\}-range-preset-label`\}/g)).toBe(2);

    // The typed path stays native, and the only submitted preset value is the
    // hidden input: a second named preset control would submit twice.
    expect(occurrences(text, /\n\s*type="date"\n/g)).toBe(2);
    expect(occurrences(text, /name="rentang"/g)).toBe(1);
    expect(text).toMatch(/type="radio"/);
    expect(text).not.toMatch(/type="hidden"/);
  });
});