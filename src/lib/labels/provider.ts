import { type providerBatchStatuses, providerOrderStatuses } from "@/db/schema";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";

/**
 * Spec 10 §8: provider statuses and stored response codes reach the page only through
 * these Indonesian labels (V-6). The vocabulary is the one the repositories write:
 * `src/db/schema.ts` status enums, `src/db/order-batch-repository.ts`,
 * `src/lib/mengantar-order.ts`, `src/lib/shipment-reconciliation.ts` and
 * `src/db/unpaid-recovery-repository.ts`. A status that is also a shipment status reads
 * as its shipment lifecycle label: one term per concept, one shared source
 * (`tests/shipment-status-copy` guards it).
 */
export const PROVIDER_ORDER_STATUS_LABELS = Object.fromEntries(
  providerOrderStatuses.map((status) => [status, SHIPMENT_STATUS_PRESENTATION[status].label]),
) as Record<(typeof providerOrderStatuses)[number], string>;

export const PROVIDER_BATCH_STATUS_LABELS: Record<(typeof providerBatchStatuses)[number], string> = {
  SUBMISSION_QUEUED: SHIPMENT_STATUS_PRESENTATION.SUBMISSION_QUEUED.label,
  SUBMITTING: "Sedang dikirim ke Mengantar",
  SUBMISSION_UNKNOWN: SHIPMENT_STATUS_PRESENTATION.SUBMISSION_UNKNOWN.label,
  COMPLETED: "Selesai",
  FAILED: SHIPMENT_STATUS_PRESENTATION.FAILED.label,
};

const PROVIDER_RESPONSE_CODE_LABELS: Record<string, string> = {
  ORDER_ACCEPTED: "Pesanan diterima Mengantar",
  ORDER_SUBMISSION_INTERRUPTED: "Pengiriman ke Mengantar terputus",
  ORDER_SUBMISSION_OUTCOME_UNKNOWN: "Hasil pengiriman ke Mengantar tidak diketahui",
  ORDER_RESPONSE_SCHEMA_UNKNOWN: "Format respons Mengantar tidak dikenali",
  ORDER_RESPONSE_IDENTITY_AMBIGUOUS: "Identitas pesanan pada respons tidak jelas",
  ORDER_RESPONSE_CARDINALITY_MISMATCH: "Jumlah pesanan pada respons tidak sesuai",
  ORDER_RESPONSE_CORRELATION_UNKNOWN: "Respons tidak dapat dicocokkan dengan kiriman",
  ORDER_RESPONSE_IDENTIFIER_UNSAFE: "Nomor pesanan pada respons tidak valid",
  ORDER_RESPONSE_CNOTE_UNSAFE: "Nomor resi pada respons tidak valid",
  RECONCILED_ISSUED: "Rekonsiliasi: resi terbit",
  RECONCILED_AWAITING_PAYMENT: "Rekonsiliasi: menunggu pelunasan",
  RECONCILED_FAILED: "Rekonsiliasi: pesanan gagal",
  PAY_UNPAID_ACCEPTED: "Pelunasan diterima Mengantar",
};

/**
 * A stored response code as a sentence. A code this map does not know keeps its raw value
 * in brackets: it is the only handle support has to trace it.
 */
export function providerResponseLabel(code: string | null | undefined): string {
  const value = code?.trim() ?? "";
  if (!value) return "Tidak ada";
  return PROVIDER_RESPONSE_CODE_LABELS[value] ?? `Respons lain dari Mengantar (kode ${value})`;
}
