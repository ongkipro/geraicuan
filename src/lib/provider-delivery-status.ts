// T-169 / PR-57. The only place that decides what a Mengantar-reported order
// status means for `shipments.status`. No database and no Drizzle import, so a
// client surface may state the same vocabulary the server transitions on.
import type { ShipmentStatus } from "@/lib/shipment-queue";

/**
 * Provider order-status vocabulary, **observed rather than guessed**: captured
 * from the owner's live Mengantar account on 2026-09-16 and recorded in
 * `tests/fixtures/mengantar-order-contract.shape.json`, where 100 stored orders
 * carried exactly these four `status` values.
 *
 * `null` means the value is recognised but reports no lifecycle state this
 * ingestion may write:
 *
 * - `PENDING PICKUP` says the AWB exists and nothing has moved yet, which is
 *   what `ISSUED` already records. Writing `ISSUED` from here would let a
 *   settlement pull complete an issuance that `SUBMISSION_UNKNOWN`
 *   reconciliation owns — and that path appends ledger entries. So the value is
 *   recognised, recorded, and left un-transitioned.
 *
 * **Known gap.** 96 of the 100 sampled orders were RTS and the list endpoint
 * would not page further, so **no in-transit value appeared in the sample**.
 * There is deliberately no entry here that produces `IN_TRANSIT`: inventing one
 * would put a state on a shipment that no provider record reported. Only the
 * unverified app vocabulary below (T-231) names in-transit words; when a real
 * in-transit value is captured, it is added here and to the mapping test.
 *
 * `RTS` is the provider's single return value; it does not distinguish queued,
 * moving, and received. It therefore maps to the *least advanced* return state,
 * `RTS_QUEUED`, and this ingestion never advances a return on its own.
 */
export const PROVIDER_DELIVERY_STATUS_MAP: Readonly<Record<string, ShipmentStatus | null>> = {
  DELIVERED: "DELIVERED",
  "DELIVERY PROBLEM": "PROBLEM",
  RTS: "RTS_QUEUED",
  "PENDING PICKUP": null,
};

/**
 * T-231 / PR-89 — **UNVERIFIED.** The "Status Parcel" vocabulary Mengantar's
 * web app *displays* (mengantar-app-ui-analysis §9.3, 2026-09-26), keyed in the
 * normalized form. None of these strings has been seen in an API `status` field:
 * the live captures carry only the four uppercase English values above, so the
 * display list may never arrive over the API at all. They are mapped anyway so a
 * pull that does return one is not refused, and conservatively:
 *
 * - anything that reads as trouble — including cancellation, loss, a return
 *   still leaving the origin and "Close by system" — maps to `PROBLEM`
 *   ("Perlu perhatian"), which still allows `DELIVERED` or `RTS_QUEUED` later;
 * - only "Terkirim (Completed)" is clearly terminal, so only it maps to
 *   `DELIVERED`; "Terkirim (Pending)" is not final and maps to `IN_TRANSIT`;
 * - movement words map to `IN_TRANSIT`;
 * - "Unpaid Order" and "Menunggu Penjemputan" report no state this ingestion
 *   may write (unpaid recovery and issuance own them), like `PENDING PICKUP`.
 *
 * The allowed-transition graph applies unchanged, and any value in neither map
 * stays `UNRECOGNISED`. When a value is captured live, move it to the verified
 * map above and to DATA-13.
 */
export const PROVIDER_DELIVERY_STATUS_UNVERIFIED_MAP: Readonly<Record<string, ShipmentStatus | null>> = {
  ERROR: "PROBLEM",
  "UNPAID ORDER": null,
  "MENUNGGU PENJEMPUTAN": null,
  "ORIGIN GATEWAY": "IN_TRANSIT",
  "CLOSE BY SYSTEM": "PROBLEM",
  "PROSES GATEWAY": "IN_TRANSIT",
  "PROSES MASUK": "IN_TRANSIT",
  "ON DELIVERY": "IN_TRANSIT",
  "TERKIRIM (PENDING)": "IN_TRANSIT",
  "SHIPMENT BREACH": "PROBLEM",
  "TERKIRIM (COMPLETED)": "DELIVERED",
  TERTAHAN: "PROBLEM",
  "KENDALA TRANSPORTASI": "PROBLEM",
  "PENGIRIMAN TERKENDALA": "PROBLEM",
  "RETURN ORIGIN": "PROBLEM",
  CANCELED: "PROBLEM",
  "GAGAL KIRIM": "PROBLEM",
  "MASALAH PENGIRIMAN": "PROBLEM",
  "PAKET HILANG": "PROBLEM",
};

/** Whether a normalized value is only known from the app's display vocabulary. */
export function isUnverifiedProviderDeliveryStatus(normalizedStatus: string) {
  return !Object.hasOwn(PROVIDER_DELIVERY_STATUS_MAP, normalizedStatus)
    && Object.hasOwn(PROVIDER_DELIVERY_STATUS_UNVERIFIED_MAP, normalizedStatus);
}

/**
 * The lifecycle meaning of a normalized provider value: `undefined` when it is
 * in neither vocabulary, `null` when it is recognised but names no state. The
 * verified map is consulted first.
 */
export function lookupProviderDeliveryStatus(normalizedStatus: string): ShipmentStatus | null | undefined {
  if (Object.hasOwn(PROVIDER_DELIVERY_STATUS_MAP, normalizedStatus)) return PROVIDER_DELIVERY_STATUS_MAP[normalizedStatus];
  if (Object.hasOwn(PROVIDER_DELIVERY_STATUS_UNVERIFIED_MAP, normalizedStatus)) {
    return PROVIDER_DELIVERY_STATUS_UNVERIFIED_MAP[normalizedStatus];
  }
  return undefined;
}

/**
 * `APPLIED` — the shipment moved to the mapped state.
 * `UNCHANGED` — it already stands where the provider says it does.
 * `REFUSED` — the mapped state is not reachable from where it stands.
 * `NO_LIFECYCLE_STATE` — recognised value that reports no state we may write.
 * `UNRECOGNISED` — outside both the observed and the (unverified) app
 * vocabulary: recorded and surfaced, never mapped to the nearest lifecycle state.
 */
export const PROVIDER_DELIVERY_TRANSITION_OUTCOMES = [
  "APPLIED",
  "UNCHANGED",
  "REFUSED",
  "NO_LIFECYCLE_STATE",
  "UNRECOGNISED",
] as const;

export type ProviderDeliveryTransitionOutcome =
  (typeof PROVIDER_DELIVERY_TRANSITION_OUTCOMES)[number];

/**
 * Which delivery states may follow which, as a plain graph rather than a rank:
 * "forward" is what this table says and nothing else. A state absent from the
 * keys is one this ingestion never transitions away from — `DRAFT`,
 * `ESTIMATED`, `SUBMISSION_QUEUED` and `SUBMISSION_UNKNOWN` because our own
 * issuance record does not yet say the order exists, and `FAILED`, `DELIVERED`
 * and `RTS_RECEIVED` because they are terminal. A return never becomes a
 * delivery: `RTS_QUEUED` leads only further into the return.
 */
const ALLOWED_TRANSITIONS: Readonly<Partial<Record<ShipmentStatus, readonly ShipmentStatus[]>>> = {
  ISSUED: ["IN_TRANSIT", "PROBLEM", "DELIVERED", "RTS_QUEUED"],
  AWAITING_UPSTREAM_PAYMENT: ["IN_TRANSIT", "PROBLEM", "DELIVERED", "RTS_QUEUED"],
  IN_TRANSIT: ["PROBLEM", "DELIVERED", "RTS_QUEUED"],
  PROBLEM: ["DELIVERED", "RTS_QUEUED"],
  RTS_QUEUED: ["RTS_IN_TRANSIT", "RTS_RECEIVED"],
  RTS_IN_TRANSIT: ["RTS_RECEIVED"],
};

/** Provider spellings vary in case and inner spacing; nothing else is rewritten. */
export function normalizeProviderDeliveryStatus(providerStatus: string) {
  return providerStatus.trim().toUpperCase().replace(/\s+/g, " ");
}

export type ProviderDeliveryDecision = {
  /** The lifecycle state the provider value means, or null when it means none. */
  mappedStatus: ShipmentStatus | null;
  normalizedStatus: string;
  outcome: ProviderDeliveryTransitionOutcome;
};

/**
 * Pure decision: given what the provider reported and where the shipment
 * stands, say what happens. Never returns `APPLIED` for a state the provider
 * did not report, and never for a move `ALLOWED_TRANSITIONS` does not name.
 */
export function decideProviderDeliveryTransition(
  providerStatus: string,
  currentStatus: ShipmentStatus,
): ProviderDeliveryDecision {
  const normalizedStatus = normalizeProviderDeliveryStatus(providerStatus);
  const mappedStatus = lookupProviderDeliveryStatus(normalizedStatus);
  if (mappedStatus === undefined) {
    return { mappedStatus: null, normalizedStatus, outcome: "UNRECOGNISED" };
  }
  if (mappedStatus === null) {
    return { mappedStatus: null, normalizedStatus, outcome: "NO_LIFECYCLE_STATE" };
  }
  if (mappedStatus === currentStatus) {
    return { mappedStatus, normalizedStatus, outcome: "UNCHANGED" };
  }
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
  return {
    mappedStatus,
    normalizedStatus,
    outcome: allowed.includes(mappedStatus) ? "APPLIED" : "REFUSED",
  };
}

/**
 * PR-57: every surface that shows a delivery outcome states that the outcome is
 * provider-reported and may lag. The provider evidence itself is Tenant Admin
 * only (T-146), so an operator is told the mechanism rather than a time we
 * would have to invent.
 */
export function providerDeliveryBasisSentence(input: {
  formattedObservedAt: string | null;
  observationVisible: boolean;
  subject: string;
}) {
  if (!input.observationVisible) {
    return `${input.subject} mengikuti status yang dilaporkan Mengantar dan hanya berubah saat Admin memperbarui status dari Mengantar di Histori kiriman atau Retur, jadi bisa tertinggal dari kondisi kurir.`;
  }
  return input.formattedObservedAt
    ? `${input.subject} mengikuti status yang dilaporkan Mengantar; tarikan terakhir ${input.formattedObservedAt} dan bisa tertinggal dari kondisi kurir.`
    : `${input.subject} mengikuti status yang dilaporkan Mengantar, dan data Mengantar belum pernah ditarik, jadi belum ada hasil yang berasal dari kurir.`;
}
