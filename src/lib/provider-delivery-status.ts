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
 * `RTS_QUEUED`. T-238: only a return resi (`cnote_no_rts`) beside it advances
 * the return, to `RTS_IN_TRANSIT` (`ProviderDeliveryEvidence`).
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
 * - anything that reads as trouble — including loss, a return
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
  // T-238: **documented, not captured.** Mengantar Public API docs
  // (api-public.mengantar.com/docs/, read 2026-09-26): the webhook's
  // `status_category` values and the `GET /order` `status` filter values.
  // Same conservative rules: only a completed delivery is DELIVERED, a pending
  // one is still moving, and failure words are "Perlu perhatian". `RTS`,
  // `DELIVERED`, `PENDING PICKUP` are in the verified map already.
  "DELIVERED_PENDING": "IN_TRANSIT",
  "DELIVERED_COMPLETED": "DELIVERED",
  "PICKED UP": "IN_TRANSIT",
  UNDELIVERED: "PROBLEM",
  "PICKUP FAILED": "PROBLEM",
  // Owner 2026-09-26: a cancellation is its own terminal state, not "Perlu perhatian".
  CANCELED: "CANCELLED",
  CANCELLED: "CANCELLED",
  // The `GET /order` example's `status: "active"` and the webhook's
  // "ACTIVE/WAITING NEXT PROCESS": the order exists and waits, like PENDING PICKUP.
  ACTIVE: null,
  "ACTIVE/WAITING NEXT PROCESS": null,
  // T-231: the app's "Status Parcel" display vocabulary (§9.3).
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
 * `SUPERSEDED` — webhook only (T-238): an allowed move carried by a delivery
 * older than one already recorded; Mengantar says deliveries can arrive out of
 * order, so the older one is recorded and not applied.
 */
export const PROVIDER_DELIVERY_TRANSITION_OUTCOMES = [
  "APPLIED",
  "UNCHANGED",
  "REFUSED",
  "NO_LIFECYCLE_STATE",
  "UNRECOGNISED",
  "SUPERSEDED",
] as const;

export type ProviderDeliveryTransitionOutcome =
  (typeof PROVIDER_DELIVERY_TRANSITION_OUTCOMES)[number];

/**
 * Which delivery states may follow which, as a plain graph rather than a rank:
 * "forward" is what this table says and nothing else. A state absent from the
 * keys is one this ingestion never transitions away from — `DRAFT`,
 * `ESTIMATED`, `SUBMISSION_QUEUED` and `SUBMISSION_UNKNOWN` because our own
 * issuance record does not yet say the order exists, and `FAILED`, `DELIVERED`,
 * `RTS_RECEIVED` and `CANCELLED` because they are terminal. A return never becomes a
 * delivery: `RTS_QUEUED` leads only further into the return.
 */
export const ALLOWED_TRANSITIONS: Readonly<Partial<Record<ShipmentStatus, readonly ShipmentStatus[]>>> = {
  // T-238: a return first seen with its return resi may start at RTS_IN_TRANSIT.
  // Owner 2026-09-26: CANCELLED only before the parcel is delivered or returning.
  ISSUED: ["IN_TRANSIT", "PROBLEM", "DELIVERED", "RTS_QUEUED", "RTS_IN_TRANSIT", "CANCELLED"],
  // T-247 (review M1, coordinator 2026-09-26): Mengantar may cancel an order still unpaid; the
  // shipment follows it instead of staying "Menunggu pembayaran". Mirrored in 0068.
  AWAITING_UPSTREAM_PAYMENT: ["IN_TRANSIT", "PROBLEM", "DELIVERED", "RTS_QUEUED", "RTS_IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["PROBLEM", "DELIVERED", "RTS_QUEUED", "RTS_IN_TRANSIT", "CANCELLED"],
  PROBLEM: ["DELIVERED", "RTS_QUEUED", "RTS_IN_TRANSIT", "CANCELLED"],
  RTS_QUEUED: ["RTS_IN_TRANSIT", "RTS_RECEIVED"],
  RTS_IN_TRANSIT: ["RTS_RECEIVED"],
};

const RETURN_PROGRESS: readonly ShipmentStatus[] = ["RTS_QUEUED", "RTS_IN_TRANSIT", "RTS_RECEIVED"];

/** A return report at or behind where the return already stands says nothing new. */
function returnAlreadyAtOrPast(mapped: ShipmentStatus, current: ShipmentStatus) {
  const reported = RETURN_PROGRESS.indexOf(mapped);
  const standing = RETURN_PROGRESS.indexOf(current);
  return reported >= 0 && standing >= 0 && reported <= standing;
}

/**
 * T-238: what a Mengantar order record says beyond `status`. `returnCnoteNo` is
 * the live-observed `cnote_no_rts` key (present on 3 of 100 captured orders,
 * always null there): a return with its own courier resi has been handed back
 * into the courier network, so `RTS` plus a return resi is `RTS_IN_TRANSIT`.
 * Nothing documented or captured says a return was *received*; `RTS_RECEIVED`
 * therefore stays unreachable from provider data (DATA-13 gap).
 */
export type ProviderDeliveryEvidence = {
  returnCnoteNo?: string | null;
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
  evidence: ProviderDeliveryEvidence = {},
): ProviderDeliveryDecision {
  const normalizedStatus = normalizeProviderDeliveryStatus(providerStatus);
  const looked = lookupProviderDeliveryStatus(normalizedStatus);
  if (looked === undefined) {
    return { mappedStatus: null, normalizedStatus, outcome: "UNRECOGNISED" };
  }
  if (looked === null) {
    return { mappedStatus: null, normalizedStatus, outcome: "NO_LIFECYCLE_STATE" };
  }
  const mappedStatus: ShipmentStatus = looked === "RTS_QUEUED" && evidence.returnCnoteNo?.trim()
    ? "RTS_IN_TRANSIT"
    : looked;
  if (mappedStatus === currentStatus || returnAlreadyAtOrPast(mappedStatus, currentStatus)) {
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
