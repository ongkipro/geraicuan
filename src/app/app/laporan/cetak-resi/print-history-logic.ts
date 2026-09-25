import type { StatusTone } from "@/components/app/status-badge";
import { serializeAnalyticsRange, type AnalyticsRange } from "@/lib/analytics-range";
import { PRINT_OUTCOME_PRESENTATION } from "@/lib/print-history";

export const PRINT_HISTORY_PATH = "/app/laporan/cetak-resi";
export const PRINT_HISTORY_PAGE_SIZE = 20;

type Outcome = keyof typeof PRINT_OUTCOME_PRESENTATION;

export function printOutcomeBadge(outcome: Outcome): { label: string; tone: StatusTone } {
  const presentation = PRINT_OUTCOME_PRESENTATION[outcome];
  return { label: presentation.label, tone: presentation.tone === "ok" ? "success" : "danger" };
}

/** "Cetak pertama", "Cetak ulang #3"; a blocked attempt has no sequence and reads "—". */
export function printSequenceLabel(sequence: number | null) {
  if (sequence === null) return "—";
  return sequence <= 1 ? "Cetak pertama" : `Cetak ulang #${sequence}`;
}

/**
 * The page's URL state carried into pagination: the canonical range and the outlet, never the
 * page itself.
 */
export function printHistoryCarry(range: AnalyticsRange, outletId: string | null): Record<string, string> {
  const params = serializeAnalyticsRange(range);
  if (outletId) params.set("outlet", outletId);
  return Object.fromEntries(params);
}

export function printHistoryHref(page: number, carry: Readonly<Record<string, string>>) {
  const params = new URLSearchParams(carry);
  if (page > 1) params.set("halaman", String(page));
  const query = params.toString();
  return query ? `${PRINT_HISTORY_PATH}?${query}` : PRINT_HISTORY_PATH;
}

/**
 * The repository returns the newest rows up to its ceiling; the page shows them
 * `PRINT_HISTORY_PAGE_SIZE` at a time. A page past the end is clamped to the last one.
 */
export function paginateRows<T>(rows: readonly T[], requestedPage: number, pageSize = PRINT_HISTORY_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  return { page, rows: rows.slice((page - 1) * pageSize, page * pageSize), totalPages };
}
