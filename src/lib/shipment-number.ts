// PR-44: per-tenant shipment numbers displayed as `PREFIX-number` (e.g. GC-10013).
// The database owns allocation and format (shipments_public_reference_format);
// these helpers only parse route input and build canonical links from a stored reference.

export const DEFAULT_SHIPMENT_PREFIX = "GC";
export const SHIPMENT_PREFIX_PATTERN = /^[A-Z0-9]{2,5}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTE_NUMBER_PATTERN = /^(?:([A-Za-z0-9]{2,5})-)?([1-9][0-9]{4,9})$/;
const REFERENCE_PATTERN = /^[A-Z0-9]{2,5}-([0-9]{5,})$/;
const MAX_TENANT_NUMBER = 2_147_483_647;

export type ShipmentRouteKey =
  | { kind: "uuid"; shipmentId: string }
  | { kind: "number"; tenantNumber: number; canonical: boolean };

/** Accepts `10013`, `GC-10013` (any prefix, any case) or a legacy UUID; anything else is not a shipment. */
export function parseShipmentRouteKey(raw: string): ShipmentRouteKey | null {
  let value: string;
  try {
    // No trimming: "10013 " is not the canonical URL and must not be served as if it were.
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (UUID_PATTERN.test(value)) return { kind: "uuid", shipmentId: value.toLowerCase() };
  const match = ROUTE_NUMBER_PATTERN.exec(value);
  if (!match) return null;
  const tenantNumber = Number(match[2]);
  // The pattern already requires five or more digits without a leading zero, i.e. >= 10000.
  if (tenantNumber > MAX_TENANT_NUMBER) return null;
  return { kind: "number", tenantNumber, canonical: match[1] === undefined };
}

export function shipmentNumberFromReference(publicReference: string) {
  const match = REFERENCE_PATTERN.exec(publicReference);
  if (!match) throw new Error("Shipment reference is not in PREFIX-number form.");
  return match[1];
}

/**
 * `carry` replays the list's own URL state (PR-53's range) into the detail, so
 * the detail's "Kembali ke antrean" returns to the list the operator left
 * rather than to the default 30-day window, where the shipment just opened may
 * not appear at all. Callers with no list state omit it.
 */
export function shipmentDetailHref(
  publicReference: string,
  carry?: Readonly<Record<string, string>>,
) {
  const query = new URLSearchParams(
    Object.entries(carry ?? {}).filter(([, value]) => value !== ""),
  ).toString();
  return `/app/pengiriman/${shipmentNumberFromReference(publicReference)}${query ? `?${query}` : ""}`;
}

export function shipmentLabelHref(publicReference: string) {
  return `/app/label/${shipmentNumberFromReference(publicReference)}`;
}

/** Initials of the tenant name, e.g. "Toko Kopi Pagi" → "TKP"; falls back to GC. */
export function suggestShipmentPrefix(tenantName: string) {
  // Drop diacritic marks before splitting, so "Ölçü" stays one word (OLCU), not "O LC U".
  const words = tenantName.normalize("NFKD").replace(/\p{M}+/gu, "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const initials = words.map((word) => word[0]).join("").slice(0, 5);
  if (SHIPMENT_PREFIX_PATTERN.test(initials)) return initials;
  const compact = words.join("").slice(0, 3);
  return SHIPMENT_PREFIX_PATTERN.test(compact) ? compact : DEFAULT_SHIPMENT_PREFIX;
}

export function normalizeShipmentPrefixInput(value: string) {
  const normalized = value.trim().toUpperCase().replace(/-+$/, "");
  return SHIPMENT_PREFIX_PATTERN.test(normalized) ? normalized : null;
}
