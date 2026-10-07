const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar day number in WIB (UTC+7, no daylight saving). */
function wibDay(instant: Date) {
  return Math.floor((instant.getTime() + WIB_OFFSET_MS) / DAY_MS);
}

/**
 * One "how long ago" wording for every screen (T-256 Info terbaru, T-257 platform audit and
 * registrations), against the page's `now` so server and client agree: "baru saja", "n menit lalu",
 * "n jam lalu" under 24 hours, then by WIB calendar day "kemarin" and "n hari lalu" up to
 * `maxDays`; `null` beyond (or for a time over a minute in the future), where the caller shows a
 * date instead.
 */
export function formatRelativeAge(instant: Date, now: Date, maxDays: number): string | null {
  const minutes = Math.floor((now.getTime() - instant.getTime()) / 60_000);
  // T-289 (QA L13): a time more than a minute ahead of `now` (clock skew, bad data) is not
  // "baru saja"; the caller's date shows what it is. Seconds of skew still read as just now.
  if (minutes < -1) return null;
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = wibDay(now) - wibDay(instant);
  if (days <= 1) return "kemarin";
  return days <= maxDays ? `${days} hari lalu` : null;
}
