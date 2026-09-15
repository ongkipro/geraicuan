import { describe, expect, it } from "vitest";

import {
  ANALYTICS_PRESETS,
  ANALYTICS_TIMEZONES,
  analyticsIssueMessage,
  buildTrendBuckets,
  formatInZone,
  formatRangeLabel,
  parseAnalyticsRange,
  parsePageNumber,
  serializeAnalyticsRange,
  type AnalyticsIssue,
  type AnalyticsRange,
  type AnalyticsPresetId,
} from "@/lib/analytics-range";

const NOW = new Date("2026-08-30T17:30:00.000Z");

const presetExpectations: Record<
  Exclude<AnalyticsPresetId, "kustom">,
  {
    startDate: string;
    lastIncludedDate: string;
    spanDays: number;
    jakartaStart: string;
    jakartaEnd: string;
  }
> = {
  "hari-ini": {
    startDate: "2026-08-31",
    lastIncludedDate: "2026-08-31",
    spanDays: 1,
    jakartaStart: "2026-08-30T17:00:00.000Z",
    jakartaEnd: "2026-08-31T17:00:00.000Z",
  },
  kemarin: {
    startDate: "2026-08-30",
    lastIncludedDate: "2026-08-30",
    spanDays: 1,
    jakartaStart: "2026-08-29T17:00:00.000Z",
    jakartaEnd: "2026-08-30T17:00:00.000Z",
  },
  "minggu-ini": {
    startDate: "2026-08-31",
    lastIncludedDate: "2026-08-31",
    spanDays: 1,
    jakartaStart: "2026-08-30T17:00:00.000Z",
    jakartaEnd: "2026-08-31T17:00:00.000Z",
  },
  "bulan-ini": {
    startDate: "2026-08-01",
    lastIncludedDate: "2026-08-31",
    spanDays: 31,
    jakartaStart: "2026-07-31T17:00:00.000Z",
    jakartaEnd: "2026-08-31T17:00:00.000Z",
  },
  "7-hari": {
    startDate: "2026-08-25",
    lastIncludedDate: "2026-08-31",
    spanDays: 7,
    jakartaStart: "2026-08-24T17:00:00.000Z",
    jakartaEnd: "2026-08-31T17:00:00.000Z",
  },
  "30-hari": {
    startDate: "2026-08-02",
    lastIncludedDate: "2026-08-31",
    spanDays: 30,
    jakartaStart: "2026-08-01T17:00:00.000Z",
    jakartaEnd: "2026-08-31T17:00:00.000Z",
  },
};

function resolvedContract(range: AnalyticsRange) {
  return {
    presetId: range.presetId,
    timezone: range.timezone,
    startInclusive: range.startInclusive.toISOString(),
    endExclusive: range.endExclusive.toISOString(),
    startDate: range.startDate,
    lastIncludedDate: range.lastIncludedDate,
    spanDays: range.spanDays,
    granularity: range.granularity,
  };
}

describe("analytics URL range contract", () => {
  it("keeps the timezone allowlist closed and byte-stable", () => {
    expect(ANALYTICS_TIMEZONES).toEqual([
      {
        id: "Asia/Jakarta",
        label: "WIB (UTC+07:00)",
        utcOffsetMinutes: 420,
      },
    ]);
  });

  it.each(
    Object.entries(presetExpectations) as [
      Exclude<AnalyticsPresetId, "kustom">,
      (typeof presetExpectations)[Exclude<AnalyticsPresetId, "kustom">],
    ][],
  )("resolves %s at local calendar boundaries", (presetId, expected) => {
    const jakarta = parseAnalyticsRange(
      { rentang: presetId, tz: "Asia/Jakarta" },
      NOW,
    );
    const jayapura = parseAnalyticsRange(
      { rentang: presetId, tz: "Asia/Jayapura" },
      NOW,
    );

    expect(jakarta).toMatchObject({
      presetId,
      timezone: "Asia/Jakarta",
      startDate: expected.startDate,
      lastIncludedDate: expected.lastIncludedDate,
      spanDays: expected.spanDays,
      issues: [],
    });
    expect(jakarta.startInclusive.toISOString()).toBe(expected.jakartaStart);
    expect(jakarta.endExclusive.toISOString()).toBe(expected.jakartaEnd);
    expect(jayapura).toMatchObject({
      presetId,
      timezone: "Asia/Jakarta",
      startDate: expected.startDate,
      lastIncludedDate: expected.lastIncludedDate,
      spanDays: expected.spanDays,
      issues: [],
    });
    expect(jayapura.startInclusive.toISOString()).toBe(expected.jakartaStart);
    expect(jayapura.endExclusive.toISOString()).toBe(expected.jakartaEnd);
  });

  it.each(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "UTC"])(
    "locks %s links to WIB across midnight, month and year boundaries",
    (tz) => {
      for (const [instant, localDate] of [
        ["2026-08-31T16:59:59.999Z", "2026-08-31"],
        ["2026-08-31T17:00:00.000Z", "2026-09-01"],
        ["2026-12-31T16:59:59.999Z", "2026-12-31"],
        ["2026-12-31T17:00:00.000Z", "2027-01-01"],
      ]) {
        const range = parseAnalyticsRange({ rentang: "hari-ini", tz }, new Date(instant));
        expect(range).toMatchObject({ timezone: "Asia/Jakarta", startDate: localDate, lastIncludedDate: localDate, issues: [] });
        expect(range.startInclusive.toISOString()).toBe(new Date(`${localDate}T00:00:00+07:00`).toISOString());
        expect(range.endExclusive.getTime() - range.startInclusive.getTime()).toBe(86_400_000);
        expect(serializeAnalyticsRange(range).get("tz")).toBe("Asia/Jakarta");
      }
      const newYear = parseAnalyticsRange({ rentang: "bulan-ini", tz }, new Date("2026-12-31T17:00:00Z"));
      expect(newYear).toMatchObject({ startDate: "2027-01-01", lastIncludedDate: "2027-01-01", spanDays: 1 });
      const year = parseAnalyticsRange({ rentang: "kustom", dari: "2026-01-01", sampai: "2026-12-31", tz }, new Date("2026-12-31T17:00:00Z"));
      expect(year.startInclusive.toISOString()).toBe("2025-12-31T17:00:00.000Z");
      expect(year.endExclusive.toISOString()).toBe("2026-12-31T17:00:00.000Z");
      expect(year.spanDays).toBe(365);
    },
  );

  it("starts the current week on Monday and the current month on day one", () => {
    const sunday = new Date("2026-08-30T04:00:00.000Z");
    expect(
      parseAnalyticsRange(
        { rentang: "minggu-ini", tz: "Asia/Jakarta" },
        sunday,
      ),
    ).toMatchObject({
      startDate: "2026-08-24",
      lastIncludedDate: "2026-08-30",
      spanDays: 7,
    });
    expect(
      parseAnalyticsRange(
        { rentang: "bulan-ini", tz: "Asia/Jakarta" },
        sunday,
      ),
    ).toMatchObject({
      startDate: "2026-08-01",
      lastIncludedDate: "2026-08-30",
      spanDays: 30,
    });
  });

  it("uses the first repeated value and lets khusus force a custom range", () => {
    expect(
      parseAnalyticsRange(
        {
          rentang: ["7-hari", "30-hari"],
          tz: ["Asia/Makassar", "UTC"],
        },
        NOW,
      ),
    ).toMatchObject({
      presetId: "7-hari",
      timezone: "Asia/Jakarta",
      issues: [],
    });

    expect(
      parseAnalyticsRange(
        {
          rentang: "7-hari",
          khusus: "1",
          dari: "2026-08-10",
          sampai: "2026-08-12",
          tz: "Asia/Jakarta",
        },
        NOW,
      ),
    ).toMatchObject({
      presetId: "kustom",
      startDate: "2026-08-10",
      lastIncludedDate: "2026-08-12",
      spanDays: 3,
      issues: [],
    });
  });

  it.each([
    {
      name: "unknown preset",
      params: { rentang: "misteri" },
      issue: "rentang_tidak_dikenal",
    },
    {
      name: "missing custom date",
      params: { rentang: "kustom", dari: "2026-08-01" },
      issue: "tanggal_tidak_valid",
    },
    {
      name: "malformed custom date",
      params: {
        rentang: "kustom",
        dari: "2026-02-30",
        sampai: "2026-08-01",
      },
      issue: "tanggal_tidak_valid",
    },
    {
      name: "reversed custom dates",
      params: {
        rentang: "kustom",
        dari: "2026-08-20",
        sampai: "2026-08-10",
      },
      issue: "urutan_tanggal_terbalik",
    },
    {
      name: "custom span above 366 days",
      params: {
        rentang: "kustom",
        dari: "2025-08-30",
        sampai: "2026-08-31",
      },
      issue: "rentang_terlalu_panjang",
    },
  ] satisfies {
    name: string;
    params: Record<string, string>;
    issue: AnalyticsIssue;
  }[])('$name falls back without throwing', ({ params, issue }) => {
    expect(() => parseAnalyticsRange(params, NOW)).not.toThrow();
    expect(parseAnalyticsRange(params, NOW)).toMatchObject({
      presetId: "30-hari",
      startDate: "2026-08-02",
      lastIncludedDate: "2026-08-31",
      issues: [issue],
    });
  });

  it("defaults an unknown timezone and reports the degradation", () => {
    expect(
      parseAnalyticsRange(
        { rentang: "hari-ini", tz: "Europe/Amsterdam" },
        NOW,
      ),
    ).toMatchObject({
      presetId: "hari-ini",
      timezone: "Asia/Jakarta",
      issues: ["tz_tidak_dikenal"],
    });
  });

  it("clamps a future custom end to today", () => {
    expect(
      parseAnalyticsRange(
        {
          rentang: "kustom",
          dari: "2026-08-01",
          sampai: "2026-09-03",
          tz: "Asia/Jakarta",
        },
        NOW,
      ),
    ).toMatchObject({
      presetId: "kustom",
      startDate: "2026-08-01",
      lastIncludedDate: "2026-08-31",
      spanDays: 31,
      issues: ["tanggal_masa_depan"],
    });
  });

  it("treats empty range fields as absent defaults", () => {
    expect(
      parseAnalyticsRange(
        { rentang: "", dari: "", sampai: "", tz: "" },
        NOW,
      ),
    ).toMatchObject({
      presetId: "30-hari",
      timezone: "Asia/Jakarta",
      issues: [],
    });
  });

  it("serializes the minimal canonical URL and round-trips boundaries", () => {
    for (const preset of ANALYTICS_PRESETS.filter(
      ({ id }) => id !== "kustom",
    )) {
      const range = parseAnalyticsRange(
        { rentang: preset.id, tz: "Asia/Jayapura" },
        NOW,
      );
      const serialized = serializeAnalyticsRange(range);
      expect(serialized.has("dari")).toBe(false);
      expect(serialized.has("sampai")).toBe(false);
      expect(
        resolvedContract(
          parseAnalyticsRange(Object.fromEntries(serialized), NOW),
        ),
      ).toEqual(resolvedContract(range));
    }

    const custom = parseAnalyticsRange(
      {
        rentang: "kustom",
        dari: "2026-08-10",
        sampai: "2026-08-15",
        tz: "Asia/Jayapura",
      },
      NOW,
    );
    const serializedCustom = serializeAnalyticsRange(custom);
    expect(Object.fromEntries(serializedCustom)).toEqual({
      rentang: "kustom",
      tz: "Asia/Jakarta",
      dari: "2026-08-10",
      sampai: "2026-08-15",
    });
    expect(
      resolvedContract(
        parseAnalyticsRange(Object.fromEntries(serializedCustom), NOW),
      ),
    ).toEqual(resolvedContract(custom));
  });

  it("zero-fills daily and monthly trend buckets", () => {
    const daily = buildTrendBuckets(
      parseAnalyticsRange(
        { rentang: "30-hari", tz: "Asia/Jakarta" },
        NOW,
      ),
    );
    expect(daily).toHaveLength(30);
    expect(daily.map(({ key }) => key)).toEqual([
      "2026-08-02",
      ...Array.from({ length: 28 }, (_, index) =>
        `2026-08-${String(index + 3).padStart(2, "0")}`,
      ),
      "2026-08-31",
    ]);

    const monthlyRange = parseAnalyticsRange(
      {
        rentang: "kustom",
        dari: "2025-12-15",
        sampai: "2026-02-02",
        tz: "Asia/Jakarta",
      },
      NOW,
    );
    expect(monthlyRange.granularity).toBe("bulanan");
    expect(buildTrendBuckets(monthlyRange).map(({ key }) => key)).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("formats every timestamp in WIB even for former timezone options", () => {
    const range = parseAnalyticsRange(
      { rentang: "hari-ini", tz: "Asia/Jayapura" },
      NOW,
    );
    expect(formatRangeLabel(range)).toMatchObject({
      timezoneLabel: "WIB (UTC+07:00)",
      presetLabel: "Hari ini",
    });

    const instant = new Date("2026-08-30T16:30:00.000Z");
    expect(formatInZone(instant, "Asia/Jayapura")).toBe(
      new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(instant),
    );
  });

  it.each(["0", "-2", "abc", "1.5", ""])(
    "rejects invalid page value %j",
    (raw) => {
      expect(parsePageNumber(raw)).toEqual({
        page: 1,
        issues: ["halaman_tidak_valid"],
      });
    },
  );

  it("accepts a positive page and reports no issue for an absent page", () => {
    expect(parsePageNumber("3")).toEqual({ page: 3, issues: [] });
    expect(parsePageNumber(["4", "2"])).toEqual({ page: 4, issues: [] });
    expect(parsePageNumber(undefined)).toEqual({ page: 1, issues: [] });
    expect(analyticsIssueMessage("halaman_tidak_valid")).toBe(
      "Nomor halaman tidak valid, menampilkan halaman pertama.",
    );
  });
});
