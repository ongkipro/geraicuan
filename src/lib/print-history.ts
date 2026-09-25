import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";

/**
 * PR-55 Riwayat cetak resi vocabulary.
 *
 * The record stores machine values (`PRINTED`, `NOT_ISSUED`, `OPERATOR`); the
 * page states them in the operator's own words. One table, so the page, the
 * empty state and the tests all read the same wording.
 */
export const PRINT_OUTCOME_PRESENTATION = {
  PRINTED: { label: "Berhasil dicetak", tone: "ok" },
  BLOCKED: { label: "Ditolak sistem", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: "danger" | "ok" }>;

/**
 * `AWAITING_UPSTREAM_PAYMENT` is also a lifecycle status, and the operator must
 * not meet two names for one state: its wording is read off the shared status
 * presentation rather than restated here. `NOT_ISSUED` is a print-block reason
 * with no lifecycle of its own.
 */
export const PRINT_REASON_PRESENTATION = {
  AWAITING_UPSTREAM_PAYMENT:
    SHIPMENT_STATUS_PRESENTATION.AWAITING_UPSTREAM_PAYMENT.label,
  NOT_ISSUED: "Nomor resi belum terbit",
} as const satisfies Record<string, string>;

export const PRINT_ACTOR_ROLE_PRESENTATION = {
  OPERATOR: "Operator",
  TENANT_ADMIN: "Tenant Admin",
} as const satisfies Record<string, string>;

export function printReasonLabel(reasonCode: string | null) {
  if (!reasonCode) return "—";
  return reasonCode in PRINT_REASON_PRESENTATION
    ? PRINT_REASON_PRESENTATION[reasonCode as keyof typeof PRINT_REASON_PRESENTATION]
    : reasonCode;
}
