const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_DAY = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_PRESET_ID = "30-hari" as const;
const DEFAULT_TIMEZONE = "Asia/Jakarta";

export type AnalyticsPresetId =
  | "hari-ini"
  | "kemarin"
  | "minggu-ini"
  | "bulan-ini"
  | "7-hari"
  | "30-hari"
  | "kustom";

export type AnalyticsIssue =
  | "rentang_tidak_dikenal"
  | "tz_tidak_dikenal"
  | "tanggal_tidak_valid"
  | "urutan_tanggal_terbalik"
  | "rentang_terlalu_panjang"
  | "tanggal_masa_depan"
  | "halaman_tidak_valid";

export type AnalyticsRange = {
  presetId: AnalyticsPresetId;
  timezone: string;
  startInclusive: Date;
  endExclusive: Date;
  startDate: string;
  lastIncludedDate: string;
  spanDays: number;
  granularity: "harian" | "bulanan";
  issues: AnalyticsIssue[];
};

export const ANALYTICS_PRESETS = [
  { id: "hari-ini", label: "Hari ini" },
  { id: "kemarin", label: "Kemarin" },
  { id: "minggu-ini", label: "Minggu ini" },
  { id: "bulan-ini", label: "Bulan ini" },
  { id: "7-hari", label: "7 hari terakhir" },
  { id: "30-hari", label: "30 hari terakhir" },
  { id: "kustom", label: "Rentang khusus" },
] as const satisfies readonly { id: AnalyticsPresetId; label: string }[];

export const ANALYTICS_TIMEZONES = [
  {
    id: "Asia/Jakarta",
    label: "WIB (UTC+07:00)",
    utcOffsetMinutes: 420,
  },
  {
    id: "Asia/Makassar",
    label: "WITA (UTC+08:00)",
    utcOffsetMinutes: 480,
  },
  {
    id: "Asia/Jayapura",
    label: "WIT (UTC+09:00)",
    utcOffsetMinutes: 540,
  },
  { id: "UTC", label: "UTC (UTC+00:00)", utcOffsetMinutes: 0 },
] as const satisfies readonly {
  id: string;
  label: string;
  utcOffsetMinutes: number;
}[];

type AnalyticsTimezone = (typeof ANALYTICS_TIMEZONES)[number];
type CalendarDate = { year: number; month: number; day: number };
type SearchValue = string | string[] | undefined;

const presetById = Object.fromEntries(
  ANALYTICS_PRESETS.map((preset) => [preset.id, preset]),
) as Record<AnalyticsPresetId, (typeof ANALYTICS_PRESETS)[number]>;
const timezoneById = Object.fromEntries(
  ANALYTICS_TIMEZONES.map((timezone) => [timezone.id, timezone]),
) as Record<AnalyticsTimezone["id"], AnalyticsTimezone>;
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const bucketDayFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const bucketMonthFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const issueMessages: Record<AnalyticsIssue, string> = {
  rentang_tidak_dikenal:
    "Preset periode tidak dikenal, memakai 30 hari terakhir.",
  tz_tidak_dikenal:
    "Zona waktu tidak dikenal, memakai WIB (UTC+07:00).",
  tanggal_tidak_valid:
    "Tanggal rentang khusus tidak lengkap atau tidak valid, memakai 30 hari terakhir.",
  urutan_tanggal_terbalik:
    "Tanggal awal melewati tanggal akhir, memakai 30 hari terakhir.",
  rentang_terlalu_panjang:
    "Rentang melebihi 366 hari, memakai 30 hari terakhir.",
  tanggal_masa_depan:
    "Tanggal akhir melewati hari ini, disesuaikan ke hari ini.",
  halaman_tidak_valid:
    "Nomor halaman tidak valid, menampilkan halaman pertama.",
};
function isPresetId(value: string): value is AnalyticsPresetId {
  return Object.hasOwn(presetById, value);
}

function isTimezoneId(value: string): value is AnalyticsTimezone["id"] {
  return Object.hasOwn(timezoneById, value);
}


function firstValue(value: SearchValue): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "" ? undefined : first;
}

function calendarSerial({ year, month, day }: CalendarDate): number {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

function calendarFromSerial(serial: number): CalendarDate {
  const date = new Date(serial);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  return calendarFromSerial(calendarSerial(date) + days * MILLISECONDS_PER_DAY);
}

function parseCalendarDate(value: string | undefined): CalendarDate | null {
  if (!value || !DATE_PATTERN.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = calendarFromSerial(calendarSerial({ year, month, day }));
  return parsed.year === year && parsed.month === month && parsed.day === day
    ? parsed
    : null;
}

function calendarDateString({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function localCalendarDate(now: Date, timezone: AnalyticsTimezone): CalendarDate {
  return calendarFromSerial(
    now.getTime() + timezone.utcOffsetMinutes * MILLISECONDS_PER_MINUTE,
  );
}

function boundaryInstant(
  date: CalendarDate,
  timezone: AnalyticsTimezone,
): Date {
  // These allowlisted zones have fixed offsets and no DST. Admitting a DST zone
  // requires resolving local calendar boundaries with Intl.formatToParts.
  return new Date(
    calendarSerial(date) -
      timezone.utcOffsetMinutes * MILLISECONDS_PER_MINUTE,
  );
}

function makeRange(
  presetId: AnalyticsPresetId,
  timezone: AnalyticsTimezone,
  start: CalendarDate,
  endExclusive: CalendarDate,
  issues: AnalyticsIssue[],
): AnalyticsRange {
  const spanDays = Math.round(
    (calendarSerial(endExclusive) - calendarSerial(start)) /
      MILLISECONDS_PER_DAY,
  );

  return {
    presetId,
    timezone: timezone.id,
    startInclusive: boundaryInstant(start, timezone),
    endExclusive: boundaryInstant(endExclusive, timezone),
    startDate: calendarDateString(start),
    lastIncludedDate: calendarDateString(addCalendarDays(endExclusive, -1)),
    spanDays,
    granularity: spanDays <= 31 ? "harian" : "bulanan",
    issues,
  };
}

function makePresetRange(
  presetId: Exclude<AnalyticsPresetId, "kustom">,
  timezone: AnalyticsTimezone,
  today: CalendarDate,
  issues: AnalyticsIssue[],
): AnalyticsRange {
  const tomorrow = addCalendarDays(today, 1);

  switch (presetId) {
    case "hari-ini":
      return makeRange(presetId, timezone, today, tomorrow, issues);
    case "kemarin":
      return makeRange(
        presetId,
        timezone,
        addCalendarDays(today, -1),
        today,
        issues,
      );
    case "minggu-ini": {
      const dayOfWeek = new Date(calendarSerial(today)).getUTCDay();
      const daysSinceMonday = (dayOfWeek + 6) % 7;
      return makeRange(
        presetId,
        timezone,
        addCalendarDays(today, -daysSinceMonday),
        tomorrow,
        issues,
      );
    }
    case "bulan-ini":
      return makeRange(
        presetId,
        timezone,
        { year: today.year, month: today.month, day: 1 },
        tomorrow,
        issues,
      );
    case "7-hari":
      return makeRange(
        presetId,
        timezone,
        addCalendarDays(today, -6),
        tomorrow,
        issues,
      );
    case "30-hari":
      return makeRange(
        presetId,
        timezone,
        addCalendarDays(today, -29),
        tomorrow,
        issues,
      );
  }
}

function defaultRange(
  timezone: AnalyticsTimezone,
  today: CalendarDate,
  issues: AnalyticsIssue[],
): AnalyticsRange {
  return makePresetRange(DEFAULT_PRESET_ID, timezone, today, issues);
}

function resolveTimezone(
  value: string | undefined,
  issues: AnalyticsIssue[],
): AnalyticsTimezone {
  if (!value) return timezoneById[DEFAULT_TIMEZONE];

  if (isTimezoneId(value)) return timezoneById[value];

  issues.push("tz_tidak_dikenal");
  return timezoneById[DEFAULT_TIMEZONE];
}

function resolvePreset(
  value: string | undefined,
  forceCustom: boolean,
  issues: AnalyticsIssue[],
): AnalyticsPresetId {
  if (forceCustom) return "kustom";
  if (!value) return DEFAULT_PRESET_ID;
  if (isPresetId(value)) return value;

  issues.push("rentang_tidak_dikenal");
  return DEFAULT_PRESET_ID;
}

export function parseAnalyticsRange(
  params: Record<string, string | string[] | undefined>,
  now: Date,
): AnalyticsRange {
  const issues: AnalyticsIssue[] = [];
  const timezone = resolveTimezone(firstValue(params.tz), issues);
  const today = localCalendarDate(now, timezone);
  const presetId = resolvePreset(
    firstValue(params.rentang),
    firstValue(params.khusus) === "1",
    issues,
  );

  if (presetId !== "kustom") {
    return makePresetRange(presetId, timezone, today, issues);
  }

  const start = parseCalendarDate(firstValue(params.dari));
  const suppliedEnd = parseCalendarDate(firstValue(params.sampai));
  if (!start || !suppliedEnd) {
    issues.push("tanggal_tidak_valid");
    return defaultRange(timezone, today, issues);
  }

  const startSerial = calendarSerial(start);
  const suppliedEndSerial = calendarSerial(suppliedEnd);
  if (startSerial > suppliedEndSerial) {
    issues.push("urutan_tanggal_terbalik");
    return defaultRange(timezone, today, issues);
  }

  const suppliedSpanDays =
    Math.round(
      (suppliedEndSerial - startSerial) / MILLISECONDS_PER_DAY,
    ) + 1;
  if (suppliedSpanDays > 366) {
    issues.push("rentang_terlalu_panjang");
    return defaultRange(timezone, today, issues);
  }

  let end = suppliedEnd;
  if (suppliedEndSerial > calendarSerial(today)) {
    end = today;
    issues.push("tanggal_masa_depan");
  }

  if (startSerial > calendarSerial(end)) {
    issues.push("urutan_tanggal_terbalik");
    return defaultRange(timezone, today, issues);
  }

  return makeRange(
    "kustom",
    timezone,
    start,
    addCalendarDays(end, 1),
    issues,
  );
}

export function previousAnalyticsRange(
  range: AnalyticsRange,
): AnalyticsRange {
  const start = parseCalendarDate(range.startDate);
  if (!start) {
    throw new RangeError("Analytics range start date is invalid.");
  }

  return makeRange(
    "kustom",
    resolvedTimezone(range.timezone),
    addCalendarDays(start, -range.spanDays),
    start,
    [],
  );
}

export function serializeAnalyticsRange(
  range: AnalyticsRange,
): URLSearchParams {
  const params = new URLSearchParams({
    rentang: range.presetId,
    tz: range.timezone,
  });

  if (range.presetId === "kustom") {
    params.set("dari", range.startDate);
    params.set("sampai", range.lastIncludedDate);
  }

  return params;
}

function resolvedTimezone(timezone: string): AnalyticsTimezone {
  return isTimezoneId(timezone)
    ? timezoneById[timezone]
    : timezoneById[DEFAULT_TIMEZONE];
}

function dateFormatter(timezone: string): Intl.DateTimeFormat {
  const resolved = resolvedTimezone(timezone);
  let formatter = dateFormatters.get(resolved.id);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeZone: resolved.id,
    });
    dateFormatters.set(resolved.id, formatter);
  }
  return formatter;
}

export function formatRangeLabel(range: AnalyticsRange): {
  periodLabel: string;
  timezoneLabel: string;
  presetLabel: string;
} {
  const timezone = resolvedTimezone(range.timezone);
  const formatter = dateFormatter(timezone.id);
  const first = formatter.format(range.startInclusive);
  const last = formatter.format(new Date(range.endExclusive.getTime() - 1));

  return {
    periodLabel: first === last ? first : `${first} – ${last}`,
    timezoneLabel: timezone.label,
    presetLabel: presetById[range.presetId]?.label ??
      presetById[DEFAULT_PRESET_ID].label,
  };
}

export function formatInZone(instant: Date, timezone: string): string {
  const resolved = resolvedTimezone(timezone);
  let formatter = dateTimeFormatters.get(resolved.id);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: resolved.id,
    });
    dateTimeFormatters.set(resolved.id, formatter);
  }
  return formatter.format(instant);
}

function calendarForBucket(date: CalendarDate): Date {
  return new Date(calendarSerial(date) + 12 * 60 * MILLISECONDS_PER_MINUTE);
}

export function buildTrendBuckets(
  range: AnalyticsRange,
): { key: string; label: string }[] {
  const start = parseCalendarDate(range.startDate);
  const last = parseCalendarDate(range.lastIncludedDate);
  if (!start || !last) return [];

  if (range.granularity === "harian") {
    return Array.from({ length: range.spanDays }, (_, index) => {
      const date = addCalendarDays(start, index);
      return {
        key: calendarDateString(date),
        label: bucketDayFormatter.format(calendarForBucket(date)),
      };
    });
  }

  const monthCount =
    (last.year - start.year) * 12 + last.month - start.month + 1;
  return Array.from({ length: monthCount }, (_, index) => {
    const zeroBasedMonth = start.month - 1 + index;
    const date = {
      year: start.year + Math.floor(zeroBasedMonth / 12),
      month: (zeroBasedMonth % 12) + 1,
      day: 1,
    };
    return {
      key: `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}`,
      label: bucketMonthFormatter.format(calendarForBucket(date)),
    };
  });
}

export function parsePageNumber(raw: SearchValue): {
  page: number;
  issues: AnalyticsIssue[];
} {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return { page: 1, issues: [] };

  if (!/^[1-9]\d*$/.test(value)) {
    return { page: 1, issues: ["halaman_tidak_valid"] };
  }

  const page = Number(value);
  return Number.isSafeInteger(page)
    ? { page, issues: [] }
    : { page: 1, issues: ["halaman_tidak_valid"] };
}

export function analyticsIssueMessage(issue: AnalyticsIssue): string {
  return issueMessages[issue];
}
