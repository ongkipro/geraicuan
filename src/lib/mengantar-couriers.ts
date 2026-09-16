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
  "Ninja",
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
 * Every courier to show, in one stable order: the known list first, then any courier the
 * tenant actually shipped with that the list does not name — a new Mengantar courier must
 * never disappear from the recap just because this file has not been updated.
 */
export function courierRecapOrder(seen: readonly string[]) {
  const extras = [...new Set(seen)].filter((courier) => !MENGANTAR_COURIERS.includes(courier as MengantarCourier)).sort();
  return [...MENGANTAR_COURIERS, ...extras];
}
