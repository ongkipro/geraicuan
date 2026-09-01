import { shipmentStatuses } from "@/db/schema";
import {
  parseAnalyticsRange,
  parsePageNumber,
  serializeAnalyticsRange,
  type AnalyticsIssue,
  type AnalyticsRange,
} from "@/lib/analytics-range";

export type AnalyticsShipmentStatus = (typeof shipmentStatuses)[number];
export type AnalyticsEventBasis = "created" | "issued" | "outcome" | "exceptions";
export type AnalyticsFilters = {
  courier: string | null;
  lifecycleStatus: AnalyticsShipmentStatus | null;
  outletId: string | null;
};

export const EMPTY_ANALYTICS_FILTERS: AnalyticsFilters = {
  courier: null,
  lifecycleStatus: null,
  outletId: null,
};

export type TenantAnalyticsQuery = {
  eventBasis: AnalyticsEventBasis;
  filters: AnalyticsFilters;
  page: number;
  range: AnalyticsRange;
};

export type TenantAnalyticsIssue =
  | AnalyticsIssue
  | "outlet_tidak_dikenal"
  | "kurir_tidak_dikenal"
  | "status_tidak_dikenal"
  | "basis_tidak_dikenal";

type SearchParams = Record<string, string | string[] | undefined>;
type ParseOptions = {
  knownCouriers: readonly string[];
  knownOutletIds: readonly string[];
  now: Date;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function serializeTenantAnalyticsQuery(
  query: TenantAnalyticsQuery,
): URLSearchParams {
  const rangeParams = serializeAnalyticsRange(query.range);
  const params = new URLSearchParams();
  params.set("rentang", rangeParams.get("rentang")!);
  if (rangeParams.has("dari")) params.set("dari", rangeParams.get("dari")!);
  if (rangeParams.has("sampai")) {
    params.set("sampai", rangeParams.get("sampai")!);
  }
  params.set("tz", rangeParams.get("tz")!);
  if (query.filters.outletId) params.set("outlet", query.filters.outletId);
  if (query.filters.courier) params.set("kurir", query.filters.courier);
  if (query.filters.lifecycleStatus) {
    params.set("status", query.filters.lifecycleStatus);
  }
  if (query.eventBasis !== "created") params.set("basis", query.eventBasis);
  if (query.page > 1) params.set("halaman", String(query.page));
  return params;
}

export function parseTenantAnalyticsQuery(
  params: SearchParams,
  options: ParseOptions,
): {
  canonicalQuery: URLSearchParams;
  filterRejected: boolean;
  issues: TenantAnalyticsIssue[];
  query: TenantAnalyticsQuery;
} {
  const range = parseAnalyticsRange(params, options.now);
  const page = parsePageNumber(params.halaman);
  const issues: TenantAnalyticsIssue[] = [...range.issues, ...page.issues];
  const knownOutlets = new Set(options.knownOutletIds);
  const courierByLower = new Map(
    options.knownCouriers.map((courier) => [
      courier.toLocaleLowerCase("id-ID"),
      courier,
    ]),
  );

  let outletId: string | null = null;
  const requestedOutlet = first(params.outlet);
  if (requestedOutlet) {
    if (knownOutlets.has(requestedOutlet)) outletId = requestedOutlet;
    else issues.push("outlet_tidak_dikenal");
  }

  let courier: string | null = null;
  const requestedCourier = first(params.kurir)?.trim();
  if (requestedCourier) {
    courier =
      courierByLower.get(requestedCourier.toLocaleLowerCase("id-ID")) ?? null;
    if (!courier) issues.push("kurir_tidak_dikenal");
  }

  let lifecycleStatus: AnalyticsShipmentStatus | null = null;
  const requestedStatus = first(params.status)?.toUpperCase();
  if (requestedStatus) {
    if ((shipmentStatuses as readonly string[]).includes(requestedStatus)) {
      lifecycleStatus = requestedStatus as AnalyticsShipmentStatus;
    } else {
      issues.push("status_tidak_dikenal");
    }
  }

  const requestedBasis = first(params.basis);
  let eventBasis: AnalyticsEventBasis = "created";
  if (requestedBasis) {
    if (requestedBasis === "created" || requestedBasis === "issued" || requestedBasis === "outcome" || requestedBasis === "exceptions") {
      eventBasis = requestedBasis;
    } else {
      issues.push("basis_tidak_dikenal");
    }
  }

  const query = {
    eventBasis,
    filters: { courier, lifecycleStatus, outletId },
    page: page.page,
    range,
  };
  return {
    canonicalQuery: serializeTenantAnalyticsQuery(query),
    filterRejected: issues.some(
      (issue) =>
        issue === "outlet_tidak_dikenal" ||
        issue === "kurir_tidak_dikenal" ||
        issue === "status_tidak_dikenal" ||
        issue === "basis_tidak_dikenal",
    ),
    issues,
    query,
  };
}
