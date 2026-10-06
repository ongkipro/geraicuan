/**
 * T-287 (market scan 2026-10-06, gap 8): a counter quotes first ("berapa ke Medan?") and then takes
 * the customer's details, so Cek tarif hands its checked route and weight to Buat kiriman instead
 * of making the operator type them twice. The URL carries only non-personal values; nothing in it
 * is trusted: the outlet must be one the page lists, the area is re-validated against the outlet's
 * Mengantar account when the draft is saved (`validateMengantarDestinationAreaSelection`), and the
 * weight is only the form's starting value.
 */
export type ShipmentPrefill = {
  outletId: string;
  destination: { areaId: string; areaLabel: string; query: string };
  weightGrams: number | null;
};

const AREA_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const MAX_WEIGHT_GRAMS = 100_000;

export function shipmentPrefillHref(prefill: ShipmentPrefill) {
  const params = new URLSearchParams({
    area: prefill.destination.areaId,
    areaLabel: prefill.destination.areaLabel,
    outlet: prefill.outletId,
    q: prefill.destination.query,
  });
  if (prefill.weightGrams !== null) params.set("berat", String(prefill.weightGrams));
  return `/app/pengiriman/baru?${params.toString()}`;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function text(value: string | undefined, max: number) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= max && !CONTROL.test(trimmed) ? trimmed : null;
}

/** Null unless every value is well formed and the outlet is one the page offers. */
export function parseShipmentPrefill(
  params: Record<string, string | string[] | undefined>,
  outletIds: readonly string[],
): ShipmentPrefill | null {
  const outletId = first(params.outlet);
  const areaId = first(params.area);
  const areaLabel = text(first(params.areaLabel), 320);
  const query = text(first(params.q), 100);
  if (!outletId || !outletIds.includes(outletId) || !areaId || !AREA_ID.test(areaId) || !areaLabel || !query) return null;
  const raw = first(params.berat);
  const grams = raw !== undefined && /^\d{1,6}$/.test(raw) ? Number(raw) : null;
  return {
    destination: { areaId, areaLabel, query },
    outletId,
    weightGrams: grams !== null && grams >= 1 && grams <= MAX_WEIGHT_GRAMS ? grams : null,
  };
}

/** Grams → the form's kilogram text ("1,25"), the format `kilogramsToGrams` reads back. */
export function prefillWeightKg(grams: number | null) {
  if (grams === null) return "";
  const kilograms = Math.floor(grams / 1_000);
  const rest = String(grams % 1_000).padStart(3, "0").replace(/0+$/, "");
  return rest ? `${kilograms},${rest}` : String(kilograms);
}
