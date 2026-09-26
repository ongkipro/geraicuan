import { mengantarCodFeeIdr } from "@/lib/mengantar-cod-fee";
import type { PaymentMethod } from "@/lib/payment-method";
import { SHIPMENT_STATUS_PRESENTATION, type ShipmentStatus, type TenantShipmentRole } from "@/lib/shipment-queue";

/**
 * T-213 pure rules of the shipment detail (spec 17 §UX-v3.6 `/app/pengiriman/[n]`): the rail's one
 * next step per status, the tracking timeline and the COD net amount. No database, no provider.
 */

/** Resi terbit and every later state: the resi exists, so label and invoice can be printed. */
const PRINTABLE_STATUSES: readonly ShipmentStatus[] = [
  "ISSUED",
  "IN_TRANSIT",
  "DELIVERED",
  "PROBLEM",
  "RTS_QUEUED",
  "RTS_IN_TRANSIT",
  "RTS_RECEIVED",
];

export type DetailNextStep =
  | { kind: "print"; invoiceHref: string; labelHref: string; printBothHref: string }
  | { kind: "issue"; reviewHref: string }
  | { kind: "review-estimate"; href: string }
  | { kind: "resume-draft"; href: string }
  | { kind: "recover" }
  | { kind: "reconcile" }
  | { kind: "new-draft"; href: string }
  | { kind: "none"; message: string };

export type DetailNextStepInput = {
  hasAwb: boolean;
  hasEstimate: boolean;
  /** `provider_batches.status` of the order attempt, when one exists. */
  batchStatus: string | null;
  /** `provider_unpaid_recoveries.status`, when a recovery was attempted. */
  recoveryStatus: string | null;
  role: TenantShipmentRole;
  shipmentId: string;
  /** Canonical tenant number, e.g. "10058" (PR-44). */
  shipmentNumber: string;
  status: ShipmentStatus;
};

/** A recovery attempt whose outcome is not known yet must be reconciled, never run again. */
export function recoveryNeedsReconciliation(recoveryStatus: string | null) {
  return recoveryStatus === "PAYING" || recoveryStatus === "PAYMENT_UNKNOWN";
}

/**
 * Spec 10 §4.11: the one filled primary on the page. Actions keep their server guards; this only
 * decides what the rail offers.
 */
export function detailNextStep(input: DetailNextStepInput): DetailNextStep {
  const draftHref = `/app/pengiriman/baru?draft=${encodeURIComponent(input.shipmentId)}`;
  const admin = input.role === "TENANT_ADMIN";
  if (PRINTABLE_STATUSES.includes(input.status)) {
    if (!input.hasAwb) return { kind: "none", message: "Resi belum tersimpan untuk kiriman ini." };
    const labelHref = `/app/label/${input.shipmentNumber}`;
    return {
      invoiceHref: `/app/invoice/${input.shipmentNumber}`,
      kind: "print",
      labelHref,
      printBothHref: `${labelHref}?invoice=1`,
    };
  }
  switch (input.status) {
    case "DRAFT":
      return { href: draftHref, kind: "resume-draft" };
    case "ESTIMATED":
      return input.hasEstimate ? { kind: "issue", reviewHref: draftHref } : { href: draftHref, kind: "review-estimate" };
    case "SUBMISSION_QUEUED":
      return { kind: "none", message: "Tidak ada tindakan manual selama kiriman diproses." };
    case "SUBMISSION_UNKNOWN":
      return admin
        ? { kind: "reconcile" }
        : { kind: "none", message: "Jangan kirim ulang. Minta pemilik gerai menjalankan rekonsiliasi." };
    case "AWAITING_UPSTREAM_PAYMENT":
      if (recoveryNeedsReconciliation(input.recoveryStatus)) {
        return { kind: "none", message: "Upaya pembayaran sebelumnya belum pasti. Jangan jalankan pemulihan ulang." };
      }
      return admin
        ? { kind: "recover" }
        : { kind: "none", message: "Jangan buat kiriman pengganti. Minta pemilik gerai memulihkan pembayaran." };
    case "FAILED":
      return { href: "/app/pengiriman/baru", kind: "new-draft" };
    default:
      return { kind: "none", message: "Tidak ada tindakan lanjutan untuk status ini." };
  }
}

/** The safe local check for an attempt stuck past its window (never re-sends anything). */
export function staleCheckAvailable(input: Pick<DetailNextStepInput, "batchStatus" | "recoveryStatus" | "role">) {
  return input.batchStatus === "SUBMITTING" || (input.recoveryStatus === "PAYING" && input.role === "TENANT_ADMIN");
}

export type StatusObservation = {
  lastHistoryAt: Date | null;
  lastHistoryDesc: string | null;
  mappedStatus: ShipmentStatus | null;
  observedAt: Date;
  providerStatus: string;
};

export type TrackingEntry = {
  at: Date;
  detail: string | null;
  key: string;
  title: string;
};

/**
 * "Detail pelacakan", newest first: Mengantar status observations (their own `lastHistory` time
 * and description when stored, else the pull time), then the local lifecycle facts (resi issued,
 * shipment created). A pull that saw nothing new is not a new event, so repeats collapse into
 * their earliest sighting.
 */
export function buildTrackingTimeline(input: {
  awb: string | null;
  createdAt: Date;
  issuedAt: Date | null;
  observations: readonly StatusObservation[];
}): TrackingEntry[] {
  const chronological = [...input.observations].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const entries: TrackingEntry[] = [];
  let previous: string | null = null;
  for (const observation of chronological) {
    const title = observation.mappedStatus
      ? SHIPMENT_STATUS_PRESENTATION[observation.mappedStatus].label
      : observation.providerStatus;
    const detail = observation.lastHistoryDesc?.trim() || null;
    const at = observation.lastHistoryAt ?? observation.observedAt;
    const signature = `${observation.providerStatus}|${detail ?? ""}|${observation.lastHistoryAt?.getTime() ?? ""}`;
    if (signature === previous) continue;
    previous = signature;
    entries.push({ at, detail, key: `obs-${observation.observedAt.getTime()}-${entries.length}`, title });
  }
  if (input.issuedAt && input.awb) {
    entries.push({ at: input.issuedAt, detail: `AWB ${input.awb} diterima dari Mengantar`, key: "issued", title: "Resi terbit" });
  }
  entries.push({ at: input.createdAt, detail: null, key: "created", title: "Kiriman dibuat" });
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * "Jumlah bersih" (estimasi pencairan) of a COD or COD Ongkir order: the amount the courier
 * collects, less the shipping Mengantar deducts at settlement and its 3.33% COD fee — the same
 * identity as COD-SELLER-PAYOUT-IDR (`deriveDraftProviderMoneyLines`). Null outside COD, before an
 * order exists, on legacy snapshots without the deducted shipping, or when it would be negative.
 */
export function codNetAmountIdr(input: {
  chargedShippingIdr: number | null;
  paymentMethod: PaymentMethod;
  providerCodAmountIdr: number | null;
}) {
  if (input.paymentMethod === "NON_COD" || input.providerCodAmountIdr === null || input.chargedShippingIdr === null) {
    return null;
  }
  const net = input.providerCodAmountIdr - input.chargedShippingIdr - mengantarCodFeeIdr(input.providerCodAmountIdr);
  return net < 0 ? null : net;
}

/** Only the queue's own range keys travel back, and only as single string values (PR-53). */
export function queueBackHref(searchParams: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams(
    Object.entries(searchParams)
      .filter(([name, value]) => ["rentang", "dari", "sampai", "tz"].includes(name) && typeof value === "string" && value !== "")
      .map(([name, value]) => [name, value as string]),
  ).toString();
  return `/app/pengiriman${query ? `?${query}` : ""}`;
}
