import type { LabelPrintStateFilter } from "@/db/label-print-repository";

/**
 * T-270 (owner 2026-10-01): Cetak resi's work queues — Belum dicetak, Siap diserahkan, Diserahkan —
 * are a state, not a period: they list and count every parcel in that state, whatever the page's
 * period. Semua resi and Dibatalkan are history and keep the period.
 */
export const QUEUE_PRINT_STATES: readonly LabelPrintStateFilter[] = ["belum", "sudah", "diserahkan"];

export function printStateIgnoresPeriod(printState: LabelPrintStateFilter | undefined) {
  return printState !== undefined && QUEUE_PRINT_STATES.includes(printState);
}
