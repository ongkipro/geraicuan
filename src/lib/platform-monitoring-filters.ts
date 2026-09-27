import { auditEventActions, shipmentStatuses, tenantStatuses } from "@/db/schema";
import {
  analyticsIssueMessage,
  parseAnalyticsRange,
  parsePageNumber,
  serializeAnalyticsRange,
  type AnalyticsIssue,
  type AnalyticsRange,
} from "@/lib/analytics-range";

export type ShipmentStatus = (typeof shipmentStatuses)[number];
export type AuditAction = (typeof auditEventActions)[number];
export type TenantStatus = (typeof tenantStatuses)[number];
export type PlatformRoute =
  | "/platform"
  | "/platform/tenant"
  | "/platform/tenant/[tenantId]"
  | "/platform/audit";
export type PlatformScope =
  | { kind: "global" }
  | { kind: "tenant"; tenantId: string };
export type PlatformIssue =
  | AnalyticsIssue
  | "tenant_tidak_dikenal"
  | "outlet_tanpa_tenant"
  | "outlet_tidak_dikenal"
  | "kurir_tidak_dikenal"
  | "status_tidak_dikenal"
  | "hasil_tidak_dikenal"
  | "aksi_tidak_dikenal"
  | "status_gerai_tidak_dikenal"
  | "kata_kunci_terlalu_pendek"
  | "kata_kunci_terlalu_panjang"
  | "parameter_tidak_berlaku"
  | "parameter_tidak_dikenal";
export type PlatformFilters = {
  range: AnalyticsRange;
  scope: PlatformScope;
  outletId: string | null;
  courier: string | null;
  status: ShipmentStatus | null;
  outcome: "SUCCESS" | "DENIED" | null;
  query: string | null;
  page: number;
  /** `aksi` on /platform/audit (T-257): one stored audit action. */
  action?: AuditAction | null;
  /** `status-gerai` on /platform/tenant (T-257): one tenant status. */
  tenantStatus?: TenantStatus | null;
};

type SearchParams = Record<string, string | string[] | undefined>;
type ParseOptions = {
  route: PlatformRoute;
  now: Date;
  knownTenantIds: readonly string[];
  knownOutletIds: readonly string[];
  knownCouriers: readonly string[];
  forcedTenantId?: string;
};
type FilterOverrides = Partial<
  Omit<PlatformFilters, "range"> & { range: AnalyticsRange }
>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANALYTICS_KEYS: Record<string, true> = {
  rentang: true,
  dari: true,
  sampai: true,
  tz: true,
  khusus: true,
};
const PLATFORM_KEYS: Record<string, true> = {
  tenant: true,
  outlet: true,
  kurir: true,
  status: true,
  hasil: true,
  q: true,
  halaman: true,
  aksi: true,
  "status-gerai": true,
};
const issueMessages: Record<Exclude<PlatformIssue, AnalyticsIssue>, string> = {
  tenant_tidak_dikenal: "Gerai tidak dikenal, lingkup dikembalikan ke global.",
  outlet_tanpa_tenant: "Outlet memerlukan lingkup gerai dan telah dihapus.",
  outlet_tidak_dikenal: "Outlet tidak dikenal pada gerai terpilih dan telah dihapus.",
  kurir_tidak_dikenal: "Kurir tidak dikenal dan telah dihapus dari filter.",
  status_tidak_dikenal: "Status kiriman tidak dikenal dan telah dihapus dari filter.",
  hasil_tidak_dikenal: "Hasil audit tidak dikenal dan telah dihapus dari filter.",
  aksi_tidak_dikenal: "Aksi audit tidak dikenal dan telah dihapus dari filter.",
  status_gerai_tidak_dikenal: "Status gerai tidak dikenal dan telah dihapus dari filter.",
  kata_kunci_terlalu_pendek: "Kata kunci minimal 2 karakter dan telah dihapus.",
  kata_kunci_terlalu_panjang: "Kata kunci maksimal 80 karakter dan telah dihapus.",
  parameter_tidak_berlaku: "Parameter tidak berlaku pada halaman ini dan telah dihapus.",
  parameter_tidak_dikenal: "Parameter URL tidak dikenal dan telah diabaikan.",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function canonicalParams(filters: PlatformFilters, forcedTenant: boolean) {
  const analytics = serializeAnalyticsRange(filters.range);
  const params = new URLSearchParams();
  params.set("rentang", analytics.get("rentang")!);
  if (analytics.has("dari")) params.set("dari", analytics.get("dari")!);
  if (analytics.has("sampai")) params.set("sampai", analytics.get("sampai")!);
  params.set("tz", analytics.get("tz")!);
  if (!forcedTenant && filters.scope.kind === "tenant") {
    params.set("tenant", filters.scope.tenantId);
  }
  if (filters.outletId) params.set("outlet", filters.outletId);
  if (filters.courier) params.set("kurir", filters.courier);
  if (filters.status) params.set("status", filters.status);
  if (filters.outcome) params.set("hasil", filters.outcome);
  if (filters.query) params.set("q", filters.query);
  if (filters.action) params.set("aksi", filters.action);
  if (filters.tenantStatus) params.set("status-gerai", filters.tenantStatus);
  if (filters.page !== 1) params.set("halaman", String(filters.page));
  return params;
}

export function parsePlatformFilters(
  params: SearchParams,
  options: ParseOptions,
): { filters: PlatformFilters; canonicalQuery: URLSearchParams; issues: PlatformIssue[] } {
  const range = parseAnalyticsRange(params, options.now);
  const issues: PlatformIssue[] = [...range.issues];
  const knownTenants: Record<string, true> = Object.fromEntries(
    options.knownTenantIds.map((id) => [id, true]),
  );
  const knownOutlets: Record<string, true> = Object.fromEntries(
    options.knownOutletIds.map((id) => [id, true]),
  );
  const courierByLower = Object.fromEntries(
    options.knownCouriers.map((courier) => [courier.toLocaleLowerCase("id-ID"), courier]),
  );

  let scope: PlatformScope = { kind: "global" };
  if (options.forcedTenantId) {
    scope = { kind: "tenant", tenantId: options.forcedTenantId };
  } else {
    const tenant = first(params.tenant);
    if (tenant) {
      if (UUID_PATTERN.test(tenant) && knownTenants[tenant]) {
        scope = { kind: "tenant", tenantId: tenant };
      } else {
        issues.push("tenant_tidak_dikenal");
      }
    }
  }

  let outletId: string | null = null;
  const outlet = first(params.outlet);
  if (outlet) {
    if (scope.kind === "global") issues.push("outlet_tanpa_tenant");
    else if (!UUID_PATTERN.test(outlet) || !knownOutlets[outlet]) {
      issues.push("outlet_tidak_dikenal");
    } else outletId = outlet;
  }

  let courier: string | null = null;
  const requestedCourier = first(params.kurir)?.trim();
  if (requestedCourier) {
    courier = courierByLower[requestedCourier.toLocaleLowerCase("id-ID")] ?? null;
    if (!courier) issues.push("kurir_tidak_dikenal");
  }

  let status: ShipmentStatus | null = null;
  const requestedStatus = first(params.status)?.toUpperCase();
  if (requestedStatus) {
    status = shipmentStatuses.find((value) => value === requestedStatus) ?? null;
    if (!status) issues.push("status_tidak_dikenal");
  }

  let outcome: "SUCCESS" | "DENIED" | null = null;
  const requestedOutcome = first(params.hasil)?.toUpperCase();
  if (requestedOutcome) {
    if (options.route !== "/platform/audit") issues.push("parameter_tidak_berlaku");
    else if (requestedOutcome === "SUCCESS" || requestedOutcome === "DENIED") {
      outcome = requestedOutcome;
    } else issues.push("hasil_tidak_dikenal");
  }

  let query: string | null = null;
  const requestedQuery = first(params.q)?.trim();
  if (requestedQuery) {
    if (options.route !== "/platform/tenant") issues.push("parameter_tidak_berlaku");
    else if (requestedQuery.length < 2) issues.push("kata_kunci_terlalu_pendek");
    else if (requestedQuery.length > 80) issues.push("kata_kunci_terlalu_panjang");
    else query = requestedQuery;
  }

  let action: AuditAction | null = null;
  const requestedAction = first(params.aksi)?.trim().toUpperCase();
  if (requestedAction) {
    if (options.route !== "/platform/audit") issues.push("parameter_tidak_berlaku");
    else {
      action = auditEventActions.find((value) => value === requestedAction) ?? null;
      if (!action) issues.push("aksi_tidak_dikenal");
    }
  }

  let tenantStatus: TenantStatus | null = null;
  const requestedTenantStatus = first(params["status-gerai"])?.trim().toUpperCase();
  if (requestedTenantStatus) {
    if (options.route !== "/platform/tenant") issues.push("parameter_tidak_berlaku");
    else {
      tenantStatus = tenantStatuses.find((value) => value === requestedTenantStatus) ?? null;
      if (!tenantStatus) issues.push("status_gerai_tidak_dikenal");
    }
  }

  const parsedPage = parsePageNumber(params.halaman);
  issues.push(...parsedPage.issues);
  for (const key of Object.keys(params)) {
    if (!ANALYTICS_KEYS[key] && !PLATFORM_KEYS[key]) {
      issues.push("parameter_tidak_dikenal");
    }
  }

  const filters: PlatformFilters = {
    range,
    scope,
    outletId,
    courier,
    status,
    outcome,
    query,
    page: parsedPage.page,
    action,
    tenantStatus,
  };
  return {
    filters,
    canonicalQuery: canonicalParams(filters, Boolean(options.forcedTenantId)),
    issues,
  };
}

export function platformIssueMessage(issue: PlatformIssue): string {
  return issue in issueMessages
    ? issueMessages[issue as Exclude<PlatformIssue, AnalyticsIssue>]
    : analyticsIssueMessage(issue as AnalyticsIssue);
}

export function buildPlatformHref(
  route: string,
  filters: PlatformFilters,
  overrides: FilterOverrides = {},
): string {
  const next = { ...filters, ...overrides };
  const params = canonicalParams(
    next,
    route === "/platform/tenant/[tenantId]" ||
      /^\/platform\/tenant\/[^/?#]+$/.test(route),
  );
  const query = params.toString();
  return query ? `${route}?${query}` : route;
}
