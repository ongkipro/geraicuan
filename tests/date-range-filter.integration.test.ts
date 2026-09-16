import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DateRangeFilter } from "@/components/cms/date-range-filter";
import {
  formatRangeLabel,
  parseAnalyticsRange,
  serializeAnalyticsRange,
} from "@/lib/analytics-range";

/**
 * T-163 / PR-53 — one date-range control, one URL contract.
 *
 * The URL half matters most: this control replaced a period `<select>` plus a
 * "Tanggal khusus" disclosure on three pages and was added to three more, so
 * every link a tenant has bookmarked has to keep resolving to the same window.
 */

const NOW = new Date("2026-09-16T05:00:00.000Z");

const render = (overrides: Partial<Parameters<typeof DateRangeFilter>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(DateRangeFilter, {
      endDate: "2026-09-16",
      idPrefix: "dashboard",
      presetId: "30-hari",
      rangeLabel: "18 Agu 2026 – 16 Sep 2026",
      startDate: "2026-08-18",
      timezoneLabel: "WIB (UTC+07:00)",
      todayLocalDate: "2026-09-16",
      ...overrides,
    }),
  );

describe("the range trigger's anatomy", () => {
  const html = render();
  const trigger = html.match(/<summary[^>]*>/)?.[0] ?? "";

  // The reference anatomy asked for `aria-haspopup="dialog"`, but departure 1
  // made this a `<details>` disclosure whose content never leaves the form: no
  // modality, no focus trap, no Escape. It announces what it is — an expandable
  // summary over a labelled group — and must not claim a dialog it is not.
  it("is one summary naming the resolved range, with disclosure semantics", () => {
    expect(trigger).not.toBe("");
    expect(trigger).not.toContain("aria-haspopup");
    expect(trigger).toContain('aria-expanded="false"');
    expect(trigger).toContain('id="dashboard-range-trigger"');
    // The calendar icon, then the range itself as the label.
    expect(html).toMatch(/<summary[\s\S]*?lucide-calendar-days[\s\S]*?18 Agu 2026 – 16 Sep 2026[\s\S]*?<\/summary>/);
    expect(html).not.toMatch(/role="dialog"/);
    expect(html).toMatch(/<div[^>]*aria-label="Pilih rentang tanggal"[^>]*role="group"|<div[^>]*role="group"[^>]*aria-label="Pilih rentang tanggal"/);
  });

  it("wears our single 2px full-alpha focus ring and no half-alpha one", () => {
    expect(trigger).toContain("focus-visible:ring-2");
    expect(trigger).toContain("focus-visible:ring-ring");
    expect(trigger).not.toMatch(/ring-ring\/\d+/);
    expect(trigger).not.toMatch(/\bring-3\b/);
    // 44 px comes from the stylesheet, not from a utility, so assert it there.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.cms-range-filter > summary \{[^}]*min-height:44px/);
  });

  it("keeps the whole range in the page's form whether the panel is open or shut", () => {
    // The panel is a native <details>: closed, its content is `display:none`
    // but every control in it is still submitted. A popover would unmount all
    // three and the page's own "Terapkan" would post without the range it is
    // showing. Nothing here is a hidden mirror of a widget's state.
    expect(html).not.toMatch(/type="hidden"/);
    expect(html.match(/name="dari"/g) ?? []).toHaveLength(1);
    expect(html.match(/name="sampai"/g) ?? []).toHaveLength(1);
    expect(html.match(/type="date"/g) ?? []).toHaveLength(2);
    // One radio per preset, all under the one name, exactly one checked.
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(8);
    expect(radios.every((radio) => radio.includes('name="rentang"'))).toBe(true);
    expect(radios.filter((radio) => radio.includes('checked=""'))).toHaveLength(1);
    // The collapsed select is a mirror, never a second submitted value.
    expect(html).toMatch(/<select(?![^>]*\bname=)/);
    // PR-35 keeps WIB locked: no timezone control anywhere in this panel.
    expect(html).not.toMatch(/name="tz"/);
  });

  it("marks the active preset without relying on colour", () => {
    const checked = (html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [])
      .filter((radio) => radio.includes('checked=""'));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain('value="30-hari"');
    expect(html).toMatch(/role="radiogroup"/);
    // The native select below `lg` carries the same value server-side, so the
    // chosen preset is painted before hydration rather than after it.
    expect(html).toMatch(/<option value="30-hari" selected="">30 hari terakhir<\/option>/);
  });

  it("states the resolved range and zone in text, and the compared span when there is one", () => {
    expect(html).toContain("Rentang aktif: 18 Agu 2026 – 16 Sep 2026 · WIB (UTC+07:00)");
    expect(html).not.toContain("dibandingkan dengan");
    expect(render({ comparisonLabel: "19 Jul 2026 – 17 Agu 2026" }))
      .toContain("dibandingkan dengan 19 Jul 2026 – 17 Agu 2026");
  });

  it("offers every PR-53 preset, Bulan lalu included", () => {
    for (const label of [
      "Hari ini", "Kemarin", "Minggu ini", "Bulan ini", "Bulan lalu",
      "7 hari terakhir", "30 hari terakhir", "Rentang khusus",
    ]) {
      expect(html, label).toContain(label);
    }
  });
});

describe("old links resolve unchanged", () => {
  const resolved = (params: Record<string, string>) => {
    const range = parseAnalyticsRange(params, NOW);
    return {
      end: range.lastIncludedDate,
      issues: range.issues,
      preset: range.presetId,
      start: range.startDate,
      timezone: range.timezone,
    };
  };

  it("keeps a bookmarked preset link on its own window", () => {
    expect(resolved({ rentang: "30-hari" })).toEqual({
      end: "2026-09-16",
      issues: [],
      preset: "30-hari",
      start: "2026-08-18",
      timezone: "Asia/Jakarta",
    });
    expect(resolved({ rentang: "7-hari" }).start).toBe("2026-09-10");
  });

  it("keeps an explicit start and end, with or without the retired khusus flag", () => {
    const expected = {
      end: "2026-08-15",
      issues: [],
      preset: "kustom",
      start: "2026-08-10",
      timezone: "Asia/Jakarta",
    };
    expect(resolved({ rentang: "kustom", dari: "2026-08-10", sampai: "2026-08-15" })).toEqual(expected);
    // `khusus=1` was the old "Terapkan rentang khusus" button on Keuangan. The
    // control no longer emits it; the parser still honours it, so a link
    // someone saved before T-163 opens the same window.
    expect(resolved({ khusus: "1", dari: "2026-08-10", sampai: "2026-08-15" })).toEqual(expected);
    expect(resolved({ rentang: "30-hari", khusus: "1", dari: "2026-08-10", sampai: "2026-08-15" })).toEqual(expected);
  });

  it("normalizes a retired timezone value without moving the dates", () => {
    for (const tz of ["Asia/Makassar", "Asia/Jayapura", "UTC"]) {
      expect(resolved({ rentang: "kustom", dari: "2026-08-10", sampai: "2026-08-15", tz }), tz).toEqual({
        end: "2026-08-15",
        issues: [],
        preset: "kustom",
        start: "2026-08-10",
        timezone: "Asia/Jakarta",
      });
    }
    // An unrecognised zone still falls back and still says so.
    expect(resolved({ rentang: "30-hari", tz: "Mars/Olympus" }).issues).toEqual(["tz_tidak_dikenal"]);
  });

  it("keeps the fallback messages a bad range already produced", () => {
    expect(resolved({ rentang: "tidak-ada" }).issues).toEqual(["rentang_tidak_dikenal"]);
    expect(resolved({ rentang: "kustom", dari: "2026-08-15", sampai: "2026-08-10" }).issues)
      .toEqual(["urutan_tanggal_terbalik"]);
    expect(resolved({ rentang: "kustom", dari: "2020-01-01", sampai: "2026-01-01" }).issues)
      .toEqual(["rentang_terlalu_panjang"]);
    expect(resolved({ rentang: "kustom", dari: "2026-09-01", sampai: "2027-01-01" }))
      .toMatchObject({ end: "2026-09-16", issues: ["tanggal_masa_depan"] });
  });

  it("round-trips what the control submits, for every preset", () => {
    for (const preset of ["hari-ini", "kemarin", "minggu-ini", "bulan-ini", "bulan-lalu", "7-hari", "30-hari"]) {
      const range = parseAnalyticsRange({ rentang: preset }, NOW);
      const back = parseAnalyticsRange(
        Object.fromEntries(serializeAnalyticsRange(range)),
        NOW,
      );
      expect(back.startDate, preset).toBe(range.startDate);
      expect(back.lastIncludedDate, preset).toBe(range.lastIncludedDate);
      expect(back.presetId, preset).toBe(preset);
    }

    // And what the control submits for a hand-picked window: `rentang=kustom`
    // with both dates, no `khusus`.
    const custom = serializeAnalyticsRange(
      parseAnalyticsRange({ rentang: "kustom", dari: "2026-09-01", sampai: "2026-09-10" }, NOW),
    );
    expect(Object.fromEntries(custom)).toEqual({
      dari: "2026-09-01",
      rentang: "kustom",
      sampai: "2026-09-10",
      tz: "Asia/Jakarta",
    });
  });

  it("names the window the same way the control's label does", () => {
    const range = parseAnalyticsRange({ rentang: "bulan-lalu" }, NOW);
    const { periodLabel, presetLabel, timezoneLabel } = formatRangeLabel(range);
    expect(periodLabel).toBe("1 Agu 2026 – 31 Agu 2026");
    expect(presetLabel).toBe("Bulan lalu");
    expect(render({ presetId: "bulan-lalu", rangeLabel: periodLabel, timezoneLabel }))
      .toContain("Rentang aktif: 1 Agu 2026 – 31 Agu 2026 · WIB (UTC+07:00)");
  });
});

describe("the Indonesian calendar contract", () => {
  const source = readFileSync(join(process.cwd(), "src/components/ui/calendar.tsx"), "utf8");

  it("uses id-ID names and the week start minggu-ini already counts from", () => {
    // `minggu-ini` counts back to Monday (`(dayOfWeek + 6) % 7`), so the grid
    // has to start there or the highlighted week and the applied week differ.
    expect(source).toContain("weekStartsOn={1}");
    expect(source).toContain('Intl.DateTimeFormat("id-ID"');
    expect(source).toContain("formatWeekdayName");
    expect(source).toContain("formatCaption");
    // react-day-picker hands the formatter a *local* midnight, so a forced
    // `timeZone: "UTC"` named the previous day for every reader east of
    // Greenwich — the browser sweep caught the grid reading "Min, Sen, Sel…"
    // while the week genuinely started on Monday.
    expect(source).not.toMatch(/weekdayFormatter[\s\S]{0,120}timeZone/);
    expect(source).not.toMatch(/captionFormatter[\s\S]{0,120}timeZone/);
    const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "short" });
    // 2026-09-14 is a Monday in every zone at local noon.
    expect(weekday.format(new Date(2026, 8, 14, 12))).toBe("Sen");
  });

  it("keeps a 44px day target below md and our full-alpha ring", () => {
    expect(source).toContain("size-11");
    expect(source).toContain("md:size-8");
    expect(source).toContain("focus-visible:ring-2 focus-visible:ring-ring");
    expect(source).not.toMatch(/ring-ring\/\d+/);
    expect(source).not.toMatch(/\bring-3\b/);
  });

  it("paints the range ends on --primary and the band between on --muted", () => {
    expect(source).toMatch(/range_start:[^\n]*bg-muted[^\n]*bg-primary/);
    expect(source).toMatch(/range_end:[^\n]*bg-muted[^\n]*bg-primary/);
    expect(source).toMatch(/range_middle:[^\n]*bg-muted/);
  });
});
