import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DateRangePicker, PICKER_PRESETS } from "@/components/app/date-range-picker";
import {
  parseAnalyticsRange,
  previousAnalyticsRange,
  serializeAnalyticsRange,
  type AnalyticsRange,
} from "@/lib/analytics-range";

/**
 * T-240 (owner request 2026-09-26): the picker offers exactly Hari ini, Kemarin, 7 hari terakhir,
 * 30 hari terakhir and Bulan ini, then the calendar. Every window is a WIB calendar-day window,
 * and every comparison is the equal-length window ending where the current one begins (T-163).
 */

type Window = { start: string; last: string; span: number };
const days = (range: AnalyticsRange): Window => ({ start: range.startDate, last: range.lastIncludedDate, span: range.spanDays });
const at = (id: string, now: string) => parseAnalyticsRange({ rentang: id }, new Date(now));
const wibMidnight = (date: string) => new Date(`${date}T00:00:00+07:00`).toISOString();

// [now (UTC instant), preset, current window, comparison window]
const boundaries: [string, string, Window, Window][] = [
  // 23:59:59.999 WIB on 31 Aug — still August in WIB although UTC is 16:59.
  ["2026-08-31T16:59:59.999Z", "hari-ini", { start: "2026-08-31", last: "2026-08-31", span: 1 }, { start: "2026-08-30", last: "2026-08-30", span: 1 }],
  ["2026-08-31T16:59:59.999Z", "kemarin", { start: "2026-08-30", last: "2026-08-30", span: 1 }, { start: "2026-08-29", last: "2026-08-29", span: 1 }],
  ["2026-08-31T16:59:59.999Z", "7-hari", { start: "2026-08-25", last: "2026-08-31", span: 7 }, { start: "2026-08-18", last: "2026-08-24", span: 7 }],
  ["2026-08-31T16:59:59.999Z", "30-hari", { start: "2026-08-02", last: "2026-08-31", span: 30 }, { start: "2026-07-03", last: "2026-08-01", span: 30 }],
  ["2026-08-31T16:59:59.999Z", "bulan-ini", { start: "2026-08-01", last: "2026-08-31", span: 31 }, { start: "2026-07-01", last: "2026-07-31", span: 31 }],
  // 00:00 WIB on 1 Sep (17:00 UTC on 31 Aug) — month start: the new month has one day.
  ["2026-08-31T17:00:00.000Z", "hari-ini", { start: "2026-09-01", last: "2026-09-01", span: 1 }, { start: "2026-08-31", last: "2026-08-31", span: 1 }],
  ["2026-08-31T17:00:00.000Z", "kemarin", { start: "2026-08-31", last: "2026-08-31", span: 1 }, { start: "2026-08-30", last: "2026-08-30", span: 1 }],
  ["2026-08-31T17:00:00.000Z", "7-hari", { start: "2026-08-26", last: "2026-09-01", span: 7 }, { start: "2026-08-19", last: "2026-08-25", span: 7 }],
  ["2026-08-31T17:00:00.000Z", "30-hari", { start: "2026-08-03", last: "2026-09-01", span: 30 }, { start: "2026-07-04", last: "2026-08-02", span: 30 }],
  ["2026-08-31T17:00:00.000Z", "bulan-ini", { start: "2026-09-01", last: "2026-09-01", span: 1 }, { start: "2026-08-31", last: "2026-08-31", span: 1 }],
  // 00:00 WIB on 1 Jan 2027 (17:00 UTC on 31 Dec 2026) — year start.
  ["2026-12-31T17:00:00.000Z", "hari-ini", { start: "2027-01-01", last: "2027-01-01", span: 1 }, { start: "2026-12-31", last: "2026-12-31", span: 1 }],
  ["2026-12-31T17:00:00.000Z", "kemarin", { start: "2026-12-31", last: "2026-12-31", span: 1 }, { start: "2026-12-30", last: "2026-12-30", span: 1 }],
  ["2026-12-31T17:00:00.000Z", "7-hari", { start: "2026-12-26", last: "2027-01-01", span: 7 }, { start: "2026-12-19", last: "2026-12-25", span: 7 }],
  ["2026-12-31T17:00:00.000Z", "30-hari", { start: "2026-12-03", last: "2027-01-01", span: 30 }, { start: "2026-11-03", last: "2026-12-02", span: 30 }],
  ["2026-12-31T17:00:00.000Z", "bulan-ini", { start: "2027-01-01", last: "2027-01-01", span: 1 }, { start: "2026-12-31", last: "2026-12-31", span: 1 }],
  // Mid-month (the request date): month-to-date against the equal span before the 1st.
  ["2026-09-26T03:00:00.000Z", "bulan-ini", { start: "2026-09-01", last: "2026-09-26", span: 26 }, { start: "2026-08-06", last: "2026-08-31", span: 26 }],
];

describe("T-240 — the date-range picker presets", () => {
  it("lists exactly the owner's five presets, in order", () => {
    expect(PICKER_PRESETS.map(({ id, label }) => [id, label])).toEqual([
      ["hari-ini", "Hari ini"],
      ["kemarin", "Kemarin"],
      ["7-hari", "7 hari terakhir"],
      ["30-hari", "30 hari terakhir"],
      ["bulan-ini", "Bulan ini"],
    ]);
  });

  it.each(boundaries)("at %s resolves %s and its comparison in WIB calendar days", (now, id, current, previous) => {
    const range = at(id, now);
    expect(range.presetId).toBe(id);
    expect(range.issues).toEqual([]);
    expect(days(range)).toEqual(current);
    expect(range.startInclusive.toISOString()).toBe(wibMidnight(current.start));
    expect(range.endExclusive.getTime() - range.startInclusive.getTime()).toBe(current.span * 86_400_000);

    const compared = previousAnalyticsRange(range);
    expect(days(compared)).toEqual(previous);
    expect(compared.startInclusive.toISOString()).toBe(wibMidnight(previous.start));
    // The comparison ends exactly where the current window begins: no gap, no overlap.
    expect(compared.endExclusive.toISOString()).toBe(range.startInclusive.toISOString());
  });

  it.each(PICKER_PRESETS.map(({ id }) => id))("round-trips %s through the rentang URL parameter", (id) => {
    const now = new Date("2026-09-26T03:00:00.000Z");
    const range = parseAnalyticsRange({ rentang: id }, now);
    const params = serializeAnalyticsRange(range);
    expect(Object.fromEntries(params)).toEqual({ rentang: id, tz: "Asia/Jakarta" });
    const again = parseAnalyticsRange(Object.fromEntries(params), now);
    expect([again.presetId, again.startInclusive.toISOString(), again.endExclusive.toISOString()]).toEqual([
      range.presetId,
      range.startInclusive.toISOString(),
      range.endExclusive.toISOString(),
    ]);
  });

  it("keeps ids the list no longer offers working for bookmarked URLs", () => {
    const now = "2026-09-26T03:00:00.000Z";
    expect(days(at("minggu-ini", now))).toEqual({ start: "2026-09-21", last: "2026-09-26", span: 6 });
    expect(days(at("bulan-lalu", now))).toEqual({ start: "2026-08-01", last: "2026-08-31", span: 31 });
    expect(parseAnalyticsRange({ rentang: "kustom", dari: "2026-09-10", sampai: "2026-09-12" }, new Date(now))).toMatchObject({
      presetId: "kustom",
      startDate: "2026-09-10",
      lastIncludedDate: "2026-09-12",
      issues: [],
    });
  });

  it.each(["minggu-lalu", "HARI-INI", "7hari", "hari ini"])("falls back to 30 hari terakhir for unknown id %j", (id) => {
    expect(at(id, "2026-09-26T03:00:00.000Z")).toMatchObject({
      presetId: "30-hari",
      startDate: "2026-08-28",
      lastIncludedDate: "2026-09-26",
      issues: ["rentang_tidak_dikenal"],
    });
  });

  it("names the active preset on the trigger and the dates for a picked range", () => {
    const render = (presetId: AnalyticsRange["presetId"], startDate: string, endDate: string) =>
      renderToStaticMarkup(createElement(DateRangePicker, { endDate, presetId, startDate }));

    const preset = render("7-hari", "2026-09-20", "2026-09-26");
    expect(preset).toContain('aria-label="Periode: 7 hari terakhir"');
    expect(preset).toContain('type="hidden" name="rentang" value="7-hari"');
    expect(preset).not.toContain('name="dari"');

    const day = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
    const custom = render("kustom", "2026-09-10", "2026-09-12");
    expect(custom).toContain(`Periode: ${day.format(new Date(2026, 8, 10))} – ${day.format(new Date(2026, 8, 12))}`);
    expect(custom).toContain('type="hidden" name="dari" value="2026-09-10"');

    // A legacy preset the list no longer offers reads as its dates, not a name the list lacks.
    expect(render("bulan-lalu", "2026-08-01", "2026-08-31")).toContain(
      `Periode: ${day.format(new Date(2026, 7, 1))} – ${day.format(new Date(2026, 7, 31))}`,
    );
  });
});
