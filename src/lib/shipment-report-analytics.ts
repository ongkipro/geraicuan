import { parseAreaRegion } from "@/lib/label-format";

/**
 * T-235 Laporan pengiriman analytics (spec 19 RPT-SHP-REGION-* and RPT-SHP-ROUTE-*). The repository
 * groups the filtered cohort in SQL by outlet and stored destination area label; this module folds
 * those rows into provinces, cities and outlet → city routes with the one area parser
 * (`parseAreaRegion`), so a label is read the same way everywhere and the groups always sum to the
 * cohort (RPT-SHP-ROWS) — an unreadable label lands in "Wilayah tidak dikenal", never nowhere.
 */

export const UNKNOWN_REGION_LABEL = "Wilayah tidak dikenal";
export const UNKNOWN_REGION_KEY = "__unknown__";

export type ShipmentReportAreaGroup = {
  areaLabel: string;
  deliveredCount: number;
  outletId: string;
  outletName: string;
  returnedCount: number;
  shipmentCount: number;
};

export type ShipmentOutcomeTally = {
  deliveredCount: number;
  returnedCount: number;
  shipmentCount: number;
};

export type RegionTotal = ShipmentOutcomeTally & {
  key: string;
  name: string;
  /** Province under a city, so "Kota Bogor" and "Kabupaten Bogor" read apart. */
  province: string | null;
};

export type RouteTotal = ShipmentOutcomeTally & {
  city: string;
  key: string;
  outletName: string;
};

/**
 * Spec 19 RPT-SHP-RETURN-RATE: returned ÷ (delivered + returned) — of the shipments whose outcome
 * is settled, the share that came back. `null` when nothing has settled (the page shows "—").
 */
export function returnRate(tally: Pick<ShipmentOutcomeTally, "deliveredCount" | "returnedCount">) {
  const finished = tally.deliveredCount + tally.returnedCount;
  return finished === 0 ? null : (tally.returnedCount / finished) * 100;
}

/** Spec 19 RPT-SHP-DELIVERED-RATE: delivered ÷ all shipments in the group. */
export function deliveredRate(tally: Pick<ShipmentOutcomeTally, "deliveredCount" | "shipmentCount">) {
  return tally.shipmentCount === 0 ? null : (tally.deliveredCount / tally.shipmentCount) * 100;
}

const percent = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Spec 19 M-0: one decimal ("66,7%"), "—" without a denominator. */
export function formatRate(rate: number | null) {
  return rate === null ? "—" : `${percent.format(rate)}%`;
}

function add<T extends ShipmentOutcomeTally>(map: Map<string, T>, key: string, create: () => T, row: ShipmentOutcomeTally) {
  const entry = map.get(key) ?? create();
  entry.shipmentCount += row.shipmentCount;
  entry.deliveredCount += row.deliveredCount;
  entry.returnedCount += row.returnedCount;
  map.set(key, entry);
}

/** Volume first, then name; the unknown group always last so it never reads as a real top wilayah. */
function byVolume<T extends ShipmentOutcomeTally & { key: string; name?: string; city?: string }>(rows: T[]) {
  return rows.sort((left, right) =>
    Number(left.key === UNKNOWN_REGION_KEY) - Number(right.key === UNKNOWN_REGION_KEY)
    || right.shipmentCount - left.shipmentCount
    || (left.name ?? left.city ?? "").localeCompare(right.name ?? right.city ?? "", "id-ID"));
}

const zero = () => ({ deliveredCount: 0, returnedCount: 0, shipmentCount: 0 });

export function groupRegions(rows: readonly ShipmentReportAreaGroup[]) {
  const provinces = new Map<string, RegionTotal>();
  const cities = new Map<string, RegionTotal>();
  for (const row of rows) {
    const region = parseAreaRegion(row.areaLabel);
    if (!region) {
      const unknown = () => ({ ...zero(), key: UNKNOWN_REGION_KEY, name: UNKNOWN_REGION_LABEL, province: null });
      add(provinces, UNKNOWN_REGION_KEY, unknown, row);
      add(cities, UNKNOWN_REGION_KEY, unknown, row);
      continue;
    }
    add(provinces, region.province.key, () => ({ ...zero(), key: region.province.key, name: region.province.name, province: null }), row);
    const cityKey = `${region.city.key}|${region.province.key}`;
    add(cities, cityKey, () => ({ ...zero(), key: cityKey, name: region.city.name, province: region.province.name }), row);
  }
  return { cities: byVolume([...cities.values()]), provinces: byVolume([...provinces.values()]) };
}

/** Spec 19 RPT-SHP-ROUTE-COUNT: outlet → destination city, by volume. */
export function groupRoutes(rows: readonly ShipmentReportAreaGroup[], limit = 5) {
  const routes = new Map<string, RouteTotal>();
  for (const row of rows) {
    const region = parseAreaRegion(row.areaLabel);
    const cityKey = region ? `${region.city.key}|${region.province.key}` : UNKNOWN_REGION_KEY;
    const key = `${row.outletId}>${cityKey}`;
    add(routes, key, () => ({ ...zero(), city: region?.city.name ?? UNKNOWN_REGION_LABEL, key, outletName: row.outletName }), row);
  }
  // A route into an unknown wilayah is not a route anyone can act on.
  return byVolume([...routes.values()].filter((route) => !route.key.endsWith(`>${UNKNOWN_REGION_KEY}`))).slice(0, limit);
}
