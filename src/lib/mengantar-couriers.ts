/**
 * The couriers Mengantar offers, taken from the provider rather than kept by hand.
 *
 * `tests/fixtures/mengantar-couriers.catalogue.json` is the evidence:
 * `GET /order/estimate?courier=all` across three real routes (Jakarta Utara,
 * Bandung, Denpasar) on 2026-09-16 quotes **16 service keys** over these eleven
 * couriers. `scripts/capture-mengantar-couriers.mjs` re-records it, and
 * `tests/mengantar-courier-catalogue.integration.test.ts` fails when the
 * catalogue names a courier this list does not.
 *
 * That guard exists because the hand-kept version was wrong in two ways at once:
 * `spx` (Shopee Express) was never listed at all, and `iDexpressCargo` fell
 * through the service-to-courier ladder to become a courier of its own, so an
 * iDexpress cargo shipment would have been recapped as a separate carrier.
 *
 * An account may be quoted fewer of these than another — `paxel` is quoted on
 * every route sampled and serves none of them — so "offered" and "serves this
 * route" are different questions. This list answers the first.
 */
export const MENGANTAR_COURIERS = [
  "JNE",
  "JT",
  "SiCepat",
  "SAP",
  "iDexpress",
  "anteraja",
  "lion",
  "spx",
  "paxel",
  "pos",
] as const;

export type MengantarCourier = (typeof MENGANTAR_COURIERS)[number];

/** Display name for a courier key; unknown keys are shown exactly as stored. */
export function courierDisplayName(courier: string) {
  const known: Record<string, string> = {
    JT: "J&T",
    anteraja: "AnterAja",
    iDexpress: "ID Express",
    lion: "Lion Parcel",
    paxel: "Paxel",
    pos: "POS Indonesia",
    spx: "Shopee Express",
  };
  return known[courier] ?? courier;
}

/**
 * The courier a service key belongs to: `JNECargo` is JNE's cargo service, and
 * `SAPLite`, `SapCargo`, `SiCepatCargo` and `iDexpressCargo` are likewise their
 * courier's services, not couriers.
 *
 * Comparison ignores case, because the provider's own spelling is inconsistent
 * — `SapCargo` next to `SAPLite`, `spx` and `lion` lowercase, `iDexpress` mixed.
 * A plain prefix match is enough only while no courier's name is a prefix of
 * another's; the catalogue test asserts exactly that, so a future `SAPX` fails
 * there rather than silently resolving to `SAP` here. Returns `null` for a
 * service key no known courier claims, so the caller decides whether that is an
 * error or a courier to show as it came.
 */
export function mengantarCourierOfService(providerService: string): MengantarCourier | null {
  const normalized = providerService.trim().replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  if (!normalized) return null;
  return MENGANTAR_COURIERS.find((courier) => normalized.startsWith(courier.toLowerCase())) ?? null;
}

/**
 * D-29 (owner 2026-09-26: "ninja hapus aja"): service keys Mengantar still quotes
 * for a courier it discontinued. Ninja was discontinued on 2026-09-01 — the public
 * docs (api-public.mengantar.com/docs, read 2026-09-26) say "direct requests with
 * `courier=Ninja` return HTTP 400, `success: false`, `message: \"Courier is not
 * available\"`, and `code: \"COURIER_DISABLED\"`". It is removed from
 * `MENGANTAR_COURIERS`, the display map and the logos; this list exists only so
 * the estimate (Buat kiriman, Cek tarif) drops the quote. A historical shipment
 * stored as `Ninja` renders its plain name through `CourierLogo`'s text fallback
 * and appears as an extra column in `courierRecapOrder`.
 */
const DISCONTINUED_SERVICE_KEYS = ["ninja"];

/** Whether a quoted service may be offered for a new shipment (D-29). */
export function isMengantarServiceOffered(providerService: string) {
  const normalized = providerService.trim().replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return !DISCONTINUED_SERVICE_KEYS.some((key) => normalized.startsWith(key));
}

/**
 * D-26: the `courier` value `POST /order` documents — "JNE", "SiCepat", "Sap",
 * "iDexpress", "JT", "lion", "anteraja", or "pos" (api-public.mengantar.com/docs,
 * Create Order body table, read 2026-09-26). Our catalogue spells SAP in capitals
 * (the estimate key); the order body wants "Sap". A courier the table does not
 * list (spx, paxel) has no documented order value: null.
 */
const DOCUMENTED_ORDER_COURIERS: Partial<Record<MengantarCourier, string>> = {
  JNE: "JNE",
  JT: "JT",
  SAP: "Sap",
  SiCepat: "SiCepat",
  anteraja: "anteraja",
  iDexpress: "iDexpress",
  lion: "lion",
  pos: "pos",
};

export function mengantarDocumentedOrderCourier(courier: string): string | null {
  const known = MENGANTAR_COURIERS.find((candidate) => candidate.toLowerCase() === courier.trim().toLowerCase());
  return known ? DOCUMENTED_ORDER_COURIERS[known] ?? null : null;
}

/**
 * D-26: how a quoted service is ordered — the courier, its documented `courier` value and whether
 * it is the courier's cargo service — or null when the docs give no way to order it (spx, paxel,
 * SAPLite). Such a service is still quoted (Cek tarif, Buat kiriman); only its order is refused.
 * `buildMengantarOrderRequest` refuses with exactly this rule, so Cek tarif can say it upfront.
 */
export function mengantarOrderableService(providerService: string): { cargo: boolean; courier: MengantarCourier; documented: string } | null {
  const courier = mengantarCourierOfService(providerService);
  const documented = courier ? mengantarDocumentedOrderCourier(courier) : null;
  if (!courier || !documented) return null;
  const service = providerService.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  if (service === courier.toLowerCase()) return { cargo: false, courier, documented };
  if (service === `${courier.toLowerCase()}cargo`) return { cargo: true, courier, documented };
  return null;
}

/**
 * Every courier to show, in one stable order: the known list first, then any courier the
 * tenant actually shipped with that the list does not name — a new Mengantar courier must
 * never disappear from the recap just because this file has not been updated.
 */
export function courierRecapOrder(seen: readonly string[]) {
  const extras = [...new Set(seen)].filter((courier) => !MENGANTAR_COURIERS.includes(courier as MengantarCourier)).sort();
  return [...MENGANTAR_COURIERS, ...extras];
}
