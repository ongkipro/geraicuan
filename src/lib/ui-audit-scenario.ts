import "server-only";

export const UI_AUDIT_HEADER = "x-geraicuan-ui-audit";

export type UiAuditScenario =
  | "analytics-first-run"
  | "analytics-page-error"
  | "analytics-stale"
  | "analytics-stream"
  | "analytics-trend-error"
  | "dashboard-action-error"
  | "dashboard-action-empty"
  | "dashboard-first-run"
  | "dashboard-page-error"
  | "dashboard-period-demo"
  | "dashboard-period-empty"
  | "dashboard-period-error"
  | "dashboard-stream"
  | "dashboard-stale"
  | "finance-empty"
  | "finance-error"
  | "finance-partial-error"
  | "finance-stale"
  | "finance-stream"
  | "members-error"
  | "members-inactive"
  | "members-populated"
  | "members-single-admin"
  | "members-stream"
  | "platform-audit-empty"
  | "platform-audit-error"
  | "platform-audit-invalid-query"
  | "platform-audit-paginated"
  | "platform-audit-populated"
  | "platform-audit-redacted"
  | "platform-audit-stale"
  | "platform-audit-stream"
  | "platform-overview-empty"
  | "platform-overview-error"
  | "platform-overview-invalid-query"
  | "platform-overview-populated"
  | "platform-overview-stale"
  | "platform-overview-stream"
  | "platform-tenant-detail-error"
  | "platform-tenant-detail-lifecycle-error"
  | "platform-tenant-detail-lifecycle-success"
  | "platform-tenant-detail-many-outlets"
  | "platform-tenant-detail-not-found"
  | "platform-tenant-detail-one-outlet"
  | "platform-tenant-detail-stale"
  | "platform-tenant-detail-stream"
  | "platform-tenant-detail-zero-outlets"
  | "platform-tenant-empty"
  | "platform-tenant-error"
  | "platform-tenant-invalid-query"
  | "platform-tenant-paginated"
  | "platform-tenant-populated"
  | "platform-tenant-provision-error"
  | "platform-tenant-provision-success"
  | "platform-tenant-stream"
  | "settings-empty"
  | "settings-error"
  | "settings-first-run"
  | "settings-many"
  | "settings-private-auth-error"
  | "settings-private-attention"
  | "settings-provider-error"
  | "settings-stream"
  | "bulk-import-error"
  | "bulk-import-mixed"
  | "bulk-import-stream"
  | "bulk-import-unconfigured"
  | "contacts-error"
  | "contacts-stream"
  | "label-detail-error"
  | "label-detail-inconsistent-cod"
  | "label-detail-over-capacity"
  | "label-detail-stream"
  | "label-detail-zero-history"
  | "label-index-empty"
  | "label-index-error"
  | "label-index-stream"
  | "shipment-detail-error"
  | "shipment-detail-payment-paying"
  | "shipment-detail-stale"
  | "shipment-detail-stream"
  | "shipment-detail-submitting"
  | "shipment-draft-cod-ineligible"
  | "shipment-draft-error"
  | "shipment-draft-estimate-error"
  | "shipment-draft-saved"
  | "shipment-draft-stream"
  | "shipment-draft-unconfigured"
  | "shipment-queue-empty"
  | "shipment-queue-error"
  | "shipment-queue-paginated"
  | "shipment-queue-stale"
  | "shipment-queue-stream";

export type CmsUiAuditState =
  | "first-run"
  | "healthy-empty"
  | "invalid-query"
  | "loading"
  | "not-found"
  | "partial-error"
  | "populated"
  | "primary-success"
  | "route-error"
  | "stale";

export type CmsUiAuditRole =
  | "OPERATOR"
  | "SUPER_ADMIN"
  | "TENANT_ADMIN";

export type CmsUiAuditStateStrategy =
  | "action-state"
  | "local-fixture"
  | "query"
  | "route-boundary"
  | "scenario";

type UiAuditScenarioContract = {
  mode: "read-only";
  route:
    | "/app"
    | "/app/analitik"
    | "/app/impor"
    | "/app/keuangan"
    | "/app/anggota"
    | "/app/pengaturan"
    | "/app/kontak"
    | "/app/label"
    | "/app/label/[shipmentId]"
    | "/app/pengiriman"
    | "/app/pengiriman/baru"
    | "/app/pengiriman/[shipmentId]"
    | "/platform"
    | "/platform/audit"
    | "/platform/tenant"
    | "/platform/tenant/[tenantId]";
  state: CmsUiAuditState;
};

export const UI_AUDIT_SCENARIO_CONTRACTS = {
  "bulk-import-error": { mode: "read-only", route: "/app/impor", state: "route-error" },
  "bulk-import-mixed": { mode: "read-only", route: "/app/impor", state: "partial-error" },
  "bulk-import-stream": { mode: "read-only", route: "/app/impor", state: "loading" },
  "bulk-import-unconfigured": { mode: "read-only", route: "/app/impor", state: "healthy-empty" },
  "contacts-error": { mode: "read-only", route: "/app/kontak", state: "route-error" },
  "contacts-stream": { mode: "read-only", route: "/app/kontak", state: "loading" },
  "label-detail-error": { mode: "read-only", route: "/app/label/[shipmentId]", state: "route-error" },
  "label-detail-inconsistent-cod": { mode: "read-only", route: "/app/label/[shipmentId]", state: "partial-error" },
  "label-detail-over-capacity": { mode: "read-only", route: "/app/label/[shipmentId]", state: "partial-error" },
  "label-detail-stream": { mode: "read-only", route: "/app/label/[shipmentId]", state: "loading" },
  "label-detail-zero-history": { mode: "read-only", route: "/app/label/[shipmentId]", state: "healthy-empty" },
  "label-index-empty": { mode: "read-only", route: "/app/label", state: "healthy-empty" },
  "label-index-error": { mode: "read-only", route: "/app/label", state: "route-error" },
  "label-index-stream": { mode: "read-only", route: "/app/label", state: "loading" },
  "analytics-first-run": { mode: "read-only", route: "/app/analitik", state: "first-run" },
  "analytics-page-error": { mode: "read-only", route: "/app/analitik", state: "route-error" },
  "analytics-stale": { mode: "read-only", route: "/app/analitik", state: "stale" },
  "analytics-stream": { mode: "read-only", route: "/app/analitik", state: "loading" },
  "analytics-trend-error": { mode: "read-only", route: "/app/analitik", state: "partial-error" },
  "dashboard-action-error": { mode: "read-only", route: "/app", state: "partial-error" },
  "dashboard-action-empty": { mode: "read-only", route: "/app", state: "healthy-empty" },
  "dashboard-first-run": { mode: "read-only", route: "/app", state: "first-run" },
  "dashboard-page-error": { mode: "read-only", route: "/app", state: "route-error" },
  "dashboard-period-demo": { mode: "read-only", route: "/app", state: "populated" },
  "dashboard-period-empty": { mode: "read-only", route: "/app", state: "healthy-empty" },
  "dashboard-period-error": { mode: "read-only", route: "/app", state: "partial-error" },
  "dashboard-stream": { mode: "read-only", route: "/app", state: "loading" },
  "dashboard-stale": { mode: "read-only", route: "/app", state: "stale" },
  "finance-empty": { mode: "read-only", route: "/app/keuangan", state: "healthy-empty" },
  "finance-error": { mode: "read-only", route: "/app/keuangan", state: "route-error" },
  "finance-partial-error": { mode: "read-only", route: "/app/keuangan", state: "partial-error" },
  "finance-stale": { mode: "read-only", route: "/app/keuangan", state: "stale" },
  "finance-stream": { mode: "read-only", route: "/app/keuangan", state: "loading" },
  "members-error": { mode: "read-only", route: "/app/anggota", state: "route-error" },
  "members-inactive": { mode: "read-only", route: "/app/anggota", state: "partial-error" },
  "members-populated": { mode: "read-only", route: "/app/anggota", state: "populated" },
  "members-single-admin": { mode: "read-only", route: "/app/anggota", state: "healthy-empty" },
  "members-stream": { mode: "read-only", route: "/app/anggota", state: "loading" },
  "platform-audit-empty": { mode: "read-only", route: "/platform/audit", state: "healthy-empty" },
  "platform-audit-error": { mode: "read-only", route: "/platform/audit", state: "route-error" },
  "platform-audit-invalid-query": { mode: "read-only", route: "/platform/audit", state: "invalid-query" },
  "platform-audit-paginated": { mode: "read-only", route: "/platform/audit", state: "populated" },
  "platform-audit-populated": { mode: "read-only", route: "/platform/audit", state: "populated" },
  "platform-audit-redacted": { mode: "read-only", route: "/platform/audit", state: "populated" },
  "platform-audit-stale": { mode: "read-only", route: "/platform/audit", state: "stale" },
  "platform-audit-stream": { mode: "read-only", route: "/platform/audit", state: "loading" },
  "platform-overview-empty": { mode: "read-only", route: "/platform", state: "healthy-empty" },
  "platform-overview-error": { mode: "read-only", route: "/platform", state: "route-error" },
  "platform-overview-invalid-query": { mode: "read-only", route: "/platform", state: "invalid-query" },
  "platform-overview-populated": { mode: "read-only", route: "/platform", state: "populated" },
  "platform-overview-stale": { mode: "read-only", route: "/platform", state: "stale" },
  "platform-overview-stream": { mode: "read-only", route: "/platform", state: "loading" },
  "platform-tenant-detail-error": { mode: "read-only", route: "/platform/tenant/[tenantId]", state: "route-error" },
  "platform-tenant-detail-lifecycle-error": { mode: "read-only", route: "/platform/tenant/[tenantId]", state: "partial-error" },
  "platform-tenant-detail-lifecycle-success": { mode: "read-only", route: "/platform/tenant/[tenantId]", state: "primary-success" },
  "platform-tenant-detail-many-outlets": { mode: "read-only", route: "/platform/tenant/[tenantId]", state: "populated" },
  "platform-tenant-detail-not-found": { mode: "read-only", route: "/platform/tenant/[tenantId]", state: "not-found" },
  "platform-tenant-detail-one-outlet": { mode: "read-only", route: "/platform/tenant/[tenantId]", state: "populated" },
  "platform-tenant-detail-stale": { mode: "read-only", route: "/platform/tenant/[tenantId]", state: "stale" },
  "platform-tenant-detail-stream": { mode: "read-only", route: "/platform/tenant/[tenantId]", state: "loading" },
  "platform-tenant-detail-zero-outlets": { mode: "read-only", route: "/platform/tenant/[tenantId]", state: "healthy-empty" },
  "platform-tenant-empty": { mode: "read-only", route: "/platform/tenant", state: "healthy-empty" },
  "platform-tenant-error": { mode: "read-only", route: "/platform/tenant", state: "route-error" },
  "platform-tenant-invalid-query": { mode: "read-only", route: "/platform/tenant", state: "invalid-query" },
  "platform-tenant-paginated": { mode: "read-only", route: "/platform/tenant", state: "populated" },
  "platform-tenant-populated": { mode: "read-only", route: "/platform/tenant", state: "populated" },
  "platform-tenant-provision-error": { mode: "read-only", route: "/platform/tenant", state: "partial-error" },
  "platform-tenant-provision-success": { mode: "read-only", route: "/platform/tenant", state: "primary-success" },
  "platform-tenant-stream": { mode: "read-only", route: "/platform/tenant", state: "loading" },
  "settings-empty": { mode: "read-only", route: "/app/pengaturan", state: "healthy-empty" },
  "settings-error": { mode: "read-only", route: "/app/pengaturan", state: "route-error" },
  "settings-first-run": { mode: "read-only", route: "/app/pengaturan", state: "first-run" },
  "settings-many": { mode: "read-only", route: "/app/pengaturan", state: "populated" },
  "settings-private-auth-error": { mode: "read-only", route: "/app/pengaturan", state: "partial-error" },
  "settings-private-attention": { mode: "read-only", route: "/app/pengaturan", state: "partial-error" },
  "settings-provider-error": { mode: "read-only", route: "/app/pengaturan", state: "partial-error" },
  "settings-stream": { mode: "read-only", route: "/app/pengaturan", state: "loading" },
  "shipment-detail-error": { mode: "read-only", route: "/app/pengiriman/[shipmentId]", state: "route-error" },
  "shipment-detail-payment-paying": { mode: "read-only", route: "/app/pengiriman/[shipmentId]", state: "partial-error" },
  "shipment-detail-stale": { mode: "read-only", route: "/app/pengiriman/[shipmentId]", state: "stale" },
  "shipment-detail-stream": { mode: "read-only", route: "/app/pengiriman/[shipmentId]", state: "loading" },
  "shipment-detail-submitting": { mode: "read-only", route: "/app/pengiriman/[shipmentId]", state: "partial-error" },
  "shipment-draft-cod-ineligible": { mode: "read-only", route: "/app/pengiriman/baru", state: "populated" },
  "shipment-draft-error": { mode: "read-only", route: "/app/pengiriman/baru", state: "route-error" },
  "shipment-draft-estimate-error": { mode: "read-only", route: "/app/pengiriman/baru", state: "partial-error" },
  "shipment-draft-saved": { mode: "read-only", route: "/app/pengiriman/baru", state: "primary-success" },
  "shipment-draft-stream": { mode: "read-only", route: "/app/pengiriman/baru", state: "loading" },
  "shipment-draft-unconfigured": { mode: "read-only", route: "/app/pengiriman/baru", state: "healthy-empty" },
  "shipment-queue-empty": { mode: "read-only", route: "/app/pengiriman", state: "healthy-empty" },
  "shipment-queue-error": { mode: "read-only", route: "/app/pengiriman", state: "route-error" },
  "shipment-queue-paginated": { mode: "read-only", route: "/app/pengiriman", state: "populated" },
  "shipment-queue-stale": { mode: "read-only", route: "/app/pengiriman", state: "stale" },
  "shipment-queue-stream": { mode: "read-only", route: "/app/pengiriman", state: "loading" },
} as const satisfies Record<UiAuditScenario, UiAuditScenarioContract>;

const UI_AUDIT_SCENARIOS = new Set<UiAuditScenario>(
  Object.keys(UI_AUDIT_SCENARIO_CONTRACTS) as UiAuditScenario[],
);

type CmsUiAuditRouteContract = {
  kind: "endpoint" | "page";
  ownerTask: `T-${number}`;
  roles: readonly CmsUiAuditRole[];
  route: string;
  source: `src/${string}`;
  states: readonly CmsUiAuditState[];
};

const STATE_STRATEGY = {
  "first-run": "local-fixture",
  "healthy-empty": "local-fixture",
  "invalid-query": "query",
  loading: "route-boundary",
  "not-found": "route-boundary",
  "partial-error": "scenario",
  populated: "local-fixture",
  "primary-success": "action-state",
  "route-error": "route-boundary",
  stale: "scenario",
} as const satisfies Record<CmsUiAuditState, CmsUiAuditStateStrategy>;

const COMMON_PAGE_STATES = [
  "healthy-empty",
  "loading",
  "populated",
  "route-error",
] as const satisfies readonly CmsUiAuditState[];

export const CMS_UI_AUDIT_ROUTE_CONTRACTS = [
  {
    kind: "page",
    ownerTask: "T-38",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app",
    source: "src/app/app/page.tsx",
    states: ["first-run", ...COMMON_PAGE_STATES, "partial-error", "stale", "invalid-query"],
  },
  {
    kind: "page",
    ownerTask: "T-38",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/analitik",
    source: "src/app/app/analitik/page.tsx",
    states: ["first-run", ...COMMON_PAGE_STATES, "partial-error", "stale", "invalid-query"],
  },
  {
    kind: "endpoint",
    ownerTask: "T-38",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/analitik/export.csv",
    source: "src/app/app/analitik/export.csv/route.ts",
    states: ["invalid-query", "primary-success", "route-error"],
  },
  {
    kind: "page",
    ownerTask: "T-39",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/pengiriman",
    source: "src/app/app/pengiriman/page.tsx",
    states: [...COMMON_PAGE_STATES, "invalid-query", "stale"],
  },
  {
    kind: "page",
    ownerTask: "T-39",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/pengiriman/[shipmentId]",
    source: "src/app/app/pengiriman/[shipmentId]/page.tsx",
    states: [...COMMON_PAGE_STATES, "primary-success", "stale"],
  },
  {
    kind: "page",
    ownerTask: "T-40",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/pengiriman/baru",
    source: "src/app/app/pengiriman/baru/page.tsx",
    states: ["healthy-empty", "loading", "populated", "partial-error", "primary-success", "route-error"],
  },
  {
    kind: "page",
    ownerTask: "T-41",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/impor",
    source: "src/app/app/impor/page.tsx",
    states: ["healthy-empty", "loading", "partial-error", "populated", "primary-success", "route-error"],
  },
  {
    kind: "endpoint",
    ownerTask: "T-41",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/impor/template.csv",
    source: "src/app/app/impor/template.csv/route.ts",
    states: ["primary-success", "route-error"],
  },
  {
    kind: "page",
    ownerTask: "T-42",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/kontak",
    source: "src/app/app/kontak/page.tsx",
    states: [...COMMON_PAGE_STATES, "invalid-query"],
  },
  {
    kind: "page",
    ownerTask: "T-42",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/kontak/baru",
    source: "src/app/app/kontak/baru/page.tsx",
    states: ["loading", "populated", "partial-error", "primary-success", "route-error"],
  },
  {
    kind: "page",
    ownerTask: "T-42",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/kontak/[contactId]",
    source: "src/app/app/kontak/[contactId]/page.tsx",
    states: [...COMMON_PAGE_STATES, "partial-error", "primary-success"],
  },
  {
    kind: "page",
    ownerTask: "T-43",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/label",
    source: "src/app/app/label/page.tsx",
    states: [...COMMON_PAGE_STATES, "invalid-query"],
  },
  {
    kind: "page",
    ownerTask: "T-43",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/label/[shipmentId]",
    source: "src/app/app/label/[shipmentId]/page.tsx",
    states: [...COMMON_PAGE_STATES, "partial-error", "primary-success"],
  },
  {
    kind: "page",
    ownerTask: "T-44",
    roles: ["TENANT_ADMIN"],
    route: "/app/keuangan",
    source: "src/app/app/keuangan/page.tsx",
    states: [...COMMON_PAGE_STATES, "invalid-query", "partial-error", "primary-success", "stale"],
  },
  {
    kind: "page",
    ownerTask: "T-45",
    roles: ["TENANT_ADMIN"],
    route: "/app/pengaturan",
    source: "src/app/app/pengaturan/page.tsx",
    states: ["first-run", ...COMMON_PAGE_STATES, "partial-error", "primary-success"],
  },
  {
    kind: "page",
    ownerTask: "T-46",
    roles: ["TENANT_ADMIN"],
    route: "/app/anggota",
    source: "src/app/app/anggota/page.tsx",
    states: [...COMMON_PAGE_STATES, "partial-error", "primary-success"],
  },
  {
    kind: "page",
    ownerTask: "T-47",
    roles: ["SUPER_ADMIN"],
    route: "/platform",
    source: "src/app/platform/page.tsx",
    states: [...COMMON_PAGE_STATES, "invalid-query", "stale"],
  },
  {
    kind: "page",
    ownerTask: "T-47",
    roles: ["SUPER_ADMIN"],
    route: "/platform/tenant",
    source: "src/app/platform/tenant/page.tsx",
    states: [...COMMON_PAGE_STATES, "invalid-query", "partial-error", "primary-success"],
  },
  {
    kind: "page",
    ownerTask: "T-47",
    roles: ["SUPER_ADMIN"],
    route: "/platform/tenant/[tenantId]",
    source: "src/app/platform/tenant/[tenantId]/page.tsx",
    states: [...COMMON_PAGE_STATES, "not-found", "partial-error", "primary-success", "stale"],
  },
  {
    kind: "page",
    ownerTask: "T-47",
    roles: ["SUPER_ADMIN"],
    route: "/platform/audit",
    source: "src/app/platform/audit/page.tsx",
    states: [...COMMON_PAGE_STATES, "invalid-query", "stale"],
  },
] as const satisfies readonly CmsUiAuditRouteContract[];

export function uiAuditStateOwner(
  contract: (typeof CMS_UI_AUDIT_ROUTE_CONTRACTS)[number],
  state: (typeof contract.states)[number],
) {
  return {
    ownerTask: contract.ownerTask,
    strategy: STATE_STRATEGY[state],
  } as const;
}

export function parseUiAuditScenario(
  value: string | null,
  nodeEnv = process.env.NODE_ENV,
): UiAuditScenario | null {
  if (nodeEnv !== "development" || !value) return null;
  return UI_AUDIT_SCENARIOS.has(value as UiAuditScenario)
    ? value as UiAuditScenario
    : null;
}

export function parseUiAuditScenarioForRoute(
  value: string | null,
  route: UiAuditScenarioContract["route"],
  nodeEnv = process.env.NODE_ENV,
): UiAuditScenario | null {
  const scenario = parseUiAuditScenario(value, nodeEnv);
  if (!scenario) return null;

  return UI_AUDIT_SCENARIO_CONTRACTS[scenario].route === route
    ? scenario
    : null;
}
