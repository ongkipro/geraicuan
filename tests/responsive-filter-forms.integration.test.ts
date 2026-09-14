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
  const surfaces = [
    {
      files: ["src/app/app/dashboard-period-filter.tsx"],
      ids: ["dashboard-rentang", "dashboard-outlet", "dashboard-tz", "dashboard-dari", "dashboard-sampai"],
      names: ["rentang", "outlet", "tz", "dari", "sampai"],
      route: "/app",
    },
    {
      files: ["src/app/app/analitik/analytics-filters.tsx", "src/app/app/analitik/analytics-filter-fields.tsx"],
      ids: ["analytics-rentang", "analytics-dari", "analytics-sampai", "analytics-outlet", "analytics-kurir", "analytics-status", "analytics-tz", "analytics-basis"],
      names: ["rentang", "dari", "sampai", "outlet", "kurir", "status", "tz", "basis"],
      route: "/app/analitik",
    },
    {
      files: ["src/app/app/keuangan/components/finance-filters.tsx"],
      ids: ["finance-range", "finance-start", "finance-end", "finance-timezone", "finance-outlet", "finance-status"],
      names: ["rentang", "dari", "sampai", "tz", "outlet", "status"],
      route: "/app/keuangan",
    },
  ] as const;

  it("defines the filter bar layout for narrow screens and switches it at the md breakpoint", () => {
    const css = source("src/app/globals.css");
    expect(css).toMatch(/\.cms-filter-bar\s*\{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.cms-filter-advanced\s*>\s*summary\s*\{[^}]*min-height:\s*44px/);
    const desktopBlocks = [...css.matchAll(/@media \(min-width:\s*768px\)\s*\{([\s\S]*?)\n\}/g)].map((match) => match[1]);
    expect(desktopBlocks.some((block) => /\.cms-filter-bar\s*>\s*:last-child[^{]*\{[^}]*grid-row:\s*1/.test(block))).toBe(true);
  });

  it.each(surfaces)("keeps one SSR-native form and one control set on $route", ({ files, ids, names, route }) => {
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
    expect(text).toMatch(/<details className="cms-filter-advanced"[^>]*\bopen=\{/);
    expect(text).toContain("data-filter-disclosure");
    expect(text).not.toMatch(/\bSheet(?:Content|Trigger|Header|Footer|Close)?\b/);
    expect(text).not.toMatch(/matchMedia|useMediaQuery|desktop-|mobile-/);

    for (const id of ids) {
      expect(occurrences(text, new RegExp(`id=["']${id}["']`, "g")), id).toBe(1);
      expect(occurrences(text, new RegExp(`htmlFor=["']${id}["']`, "g")), id).toBe(1);
    }
    for (const name of names) {
      expect(occurrences(text, new RegExp(`name=["']${name}["']`, "g")), name).toBe(1);
    }
  });
});
