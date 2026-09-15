import "server-only";

export const UI_AUDIT_HEADER = "x-geraicuan-ui-audit";

export type UiAuditScenario =
  | "quick-rate-demo"
  | "quick-rate-empty"
  | "quick-rate-provider-error"
  | "quick-rate-error"
  | "quick-rate-stale"
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
  | "settings-twenty"
  | "bulk-import-error"
  | "bulk-import-mixed"
  | "bulk-import-no-valid"
  | "bulk-import-stream"
  | "bulk-import-unconfigured"
  | "contacts-error"
  | "contacts-area-error"
  | "contacts-area-no-result"
  | "contacts-area-results"
  | "contacts-stream"
  | "contacts-new-error"
  | "contact-detail-outlet-error"
  | "contact-detail-route-error"
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
  | "shipment-queue-stream"
  | "shipment-rts-empty"
  | "shipment-rts-error"
  | "shipment-rts-filtered-empty"
  | "shipment-rts-invalid-query"
  | "shipment-rts-paginated"
  | "shipment-rts-stream";

export type CmsUiAuditState =
  | "first-run"
  | "filtered-empty"
  | "healthy-empty"
  | "invalid-query"
  | "loading"
  | "not-found"
  | "partial-error"
  | "pending"
  | "populated"
  | "primary-success"
  | "route-error"
  | "stale"
  | "unauthorized";

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
  consumers?: readonly string[];
  mode: "read-only";
  ownerTask?: `T-${number}`;
  route:
    | "/app/cek-tarif"
    | "/app"
    | "/app/analitik"
    | "/app/impor"
    | "/app/keuangan"
    | "/app/anggota"
    | "/app/pengaturan"
    | "/app/kontak"
    | "/app/kontak/baru"
    | "/app/kontak/[contactId]"
    | "/app/label"
    | "/app/label/[shipmentId]"
    | "/app/pengiriman"
    | "/app/pengiriman/baru"
    | "/app/pengiriman/rts"
    | "/app/pengiriman/[shipmentId]"
    | "/platform"
    | "/platform/audit"
    | "/platform/tenant"
    | "/platform/tenant/[tenantId]";
  state: CmsUiAuditState;
};

export const UI_AUDIT_SCENARIO_CONTRACTS = {
  "quick-rate-demo": { mode: "read-only", ownerTask: "T-143", route: "/app/cek-tarif", state: "populated" },
  "quick-rate-empty": { mode: "read-only", ownerTask: "T-143", route: "/app/cek-tarif", state: "healthy-empty" },
  "quick-rate-provider-error": { mode: "read-only", ownerTask: "T-143", route: "/app/cek-tarif", state: "partial-error" },
  "quick-rate-error": { mode: "read-only", ownerTask: "T-143", route: "/app/cek-tarif", state: "route-error" },
  "quick-rate-stale": { mode: "read-only", ownerTask: "T-143", route: "/app/cek-tarif", state: "stale" },
  "bulk-import-error": { mode: "read-only", route: "/app/impor", state: "route-error" },
  "bulk-import-mixed": { mode: "read-only", route: "/app/impor", state: "partial-error" },
  "bulk-import-no-valid": { mode: "read-only", route: "/app/impor", state: "partial-error" },
  "bulk-import-stream": { mode: "read-only", route: "/app/impor", state: "loading" },
  "bulk-import-unconfigured": { mode: "read-only", route: "/app/impor", state: "healthy-empty" },
  "contacts-error": { mode: "read-only", route: "/app/kontak", state: "route-error" },
  "contacts-area-error": { consumers: ["/app/kontak/[contactId]", "/app/pengiriman/baru"], mode: "read-only", ownerTask: "T-55", route: "/app/kontak/baru", state: "partial-error" },
  "contacts-area-no-result": { consumers: ["/app/kontak/[contactId]", "/app/pengiriman/baru"], mode: "read-only", ownerTask: "T-55", route: "/app/kontak/baru", state: "healthy-empty" },
  "contacts-area-results": { consumers: ["/app/kontak/[contactId]", "/app/pengiriman/baru"], mode: "read-only", ownerTask: "T-55", route: "/app/kontak/baru", state: "populated" },
  "contacts-new-error": { mode: "read-only", ownerTask: "T-77", route: "/app/kontak/baru", state: "route-error" },
  "contact-detail-outlet-error": { mode: "read-only", ownerTask: "T-77", route: "/app/kontak/[contactId]", state: "partial-error" },
  "contact-detail-route-error": { mode: "read-only", ownerTask: "T-77", route: "/app/kontak/[contactId]", state: "route-error" },
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
  "settings-many": { mode: "read-only", ownerTask: "T-53", route: "/app/pengaturan", state: "populated" },
  "settings-private-auth-error": { mode: "read-only", route: "/app/pengaturan", state: "partial-error" },
  "settings-private-attention": { mode: "read-only", route: "/app/pengaturan", state: "partial-error" },
  "settings-provider-error": { mode: "read-only", route: "/app/pengaturan", state: "partial-error" },
  "settings-stream": { mode: "read-only", route: "/app/pengaturan", state: "loading" },
  "settings-twenty": { mode: "read-only", ownerTask: "T-53", route: "/app/pengaturan", state: "populated" },
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
  "shipment-rts-empty": { mode: "read-only", ownerTask: "T-72", route: "/app/pengiriman/rts", state: "healthy-empty" },
  "shipment-rts-error": { mode: "read-only", ownerTask: "T-72", route: "/app/pengiriman/rts", state: "route-error" },
  "shipment-rts-filtered-empty": { mode: "read-only", ownerTask: "T-72", route: "/app/pengiriman/rts", state: "filtered-empty" },
  "shipment-rts-invalid-query": { mode: "read-only", ownerTask: "T-72", route: "/app/pengiriman/rts", state: "invalid-query" },
  "shipment-rts-paginated": { mode: "read-only", ownerTask: "T-72", route: "/app/pengiriman/rts", state: "populated" },
  "shipment-rts-stream": { mode: "read-only", ownerTask: "T-72", route: "/app/pengiriman/rts", state: "loading" },
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
  "filtered-empty": "query",
  "healthy-empty": "local-fixture",
  "invalid-query": "query",
  loading: "route-boundary",
  "not-found": "route-boundary",
  "partial-error": "scenario",
  pending: "action-state",
  populated: "local-fixture",
  "primary-success": "action-state",
  "route-error": "route-boundary",
  stale: "scenario",
  unauthorized: "route-boundary",
} as const satisfies Record<CmsUiAuditState, CmsUiAuditStateStrategy>;

const COMMON_PAGE_STATES = [
  "healthy-empty",
  "loading",
  "populated",
  "route-error",
] as const satisfies readonly CmsUiAuditState[];

export const CMS_UI_AUDIT_ROUTE_CONTRACTS = [
  {
    kind: "page", ownerTask: "T-143", roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/cek-tarif", source: "src/app/app/cek-tarif/page.tsx",
    states: [...COMMON_PAGE_STATES, "partial-error", "pending", "primary-success", "stale", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-38",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app",
    source: "src/app/app/page.tsx",
    states: ["first-run", ...COMMON_PAGE_STATES, "partial-error", "stale", "filtered-empty", "invalid-query", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-38",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/analitik",
    source: "src/app/app/analitik/page.tsx",
    states: ["first-run", ...COMMON_PAGE_STATES, "partial-error", "stale", "filtered-empty", "invalid-query", "unauthorized"],
  },
  {
    kind: "endpoint",
    ownerTask: "T-38",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/analitik/export.csv",
    source: "src/app/app/analitik/export.csv/route.ts",
    states: ["invalid-query", "primary-success", "route-error", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-39",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/pengiriman",
    source: "src/app/app/pengiriman/page.tsx",
    states: [...COMMON_PAGE_STATES, "filtered-empty", "invalid-query", "stale", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-72",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/pengiriman/rts",
    source: "src/app/app/pengiriman/rts/page.tsx",
    states: [...COMMON_PAGE_STATES, "filtered-empty", "invalid-query", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-39",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/pengiriman/[shipmentId]",
    source: "src/app/app/pengiriman/[shipmentId]/page.tsx",
    states: [...COMMON_PAGE_STATES, "partial-error", "pending", "primary-success", "stale", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-40",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/pengiriman/baru",
    source: "src/app/app/pengiriman/baru/page.tsx",
    states: ["healthy-empty", "loading", "populated", "partial-error", "pending", "primary-success", "route-error", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-41",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/impor",
    source: "src/app/app/impor/page.tsx",
    states: ["healthy-empty", "loading", "partial-error", "pending", "populated", "primary-success", "route-error", "unauthorized"],
  },
  {
    kind: "endpoint",
    ownerTask: "T-41",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/impor/template.csv",
    source: "src/app/app/impor/template.csv/route.ts",
    states: ["primary-success", "route-error", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-42",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/kontak",
    source: "src/app/app/kontak/page.tsx",
    states: [...COMMON_PAGE_STATES, "filtered-empty", "invalid-query", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-42",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/kontak/baru",
    source: "src/app/app/kontak/baru/page.tsx",
    states: ["healthy-empty", "loading", "populated", "partial-error", "pending", "primary-success", "route-error", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-42",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/kontak/[contactId]",
    source: "src/app/app/kontak/[contactId]/page.tsx",
    states: [...COMMON_PAGE_STATES, "partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-43",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/label",
    source: "src/app/app/label/page.tsx",
    states: [...COMMON_PAGE_STATES, "filtered-empty", "invalid-query", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-43",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    route: "/app/label/[shipmentId]",
    source: "src/app/app/label/[shipmentId]/page.tsx",
    states: [...COMMON_PAGE_STATES, "partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-44",
    roles: ["TENANT_ADMIN"],
    route: "/app/keuangan",
    source: "src/app/app/keuangan/page.tsx",
    states: [...COMMON_PAGE_STATES, "filtered-empty", "invalid-query", "partial-error", "pending", "primary-success", "stale", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-45",
    roles: ["TENANT_ADMIN"],
    route: "/app/pengaturan",
    source: "src/app/app/pengaturan/page.tsx",
    states: ["first-run", ...COMMON_PAGE_STATES, "partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-46",
    roles: ["TENANT_ADMIN"],
    route: "/app/anggota",
    source: "src/app/app/anggota/page.tsx",
    states: [...COMMON_PAGE_STATES, "partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-47",
    roles: ["SUPER_ADMIN"],
    route: "/platform",
    source: "src/app/platform/page.tsx",
    states: [...COMMON_PAGE_STATES, "filtered-empty", "invalid-query", "stale", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-47",
    roles: ["SUPER_ADMIN"],
    route: "/platform/tenant",
    source: "src/app/platform/tenant/page.tsx",
    states: [...COMMON_PAGE_STATES, "filtered-empty", "invalid-query", "partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-47",
    roles: ["SUPER_ADMIN"],
    route: "/platform/tenant/[tenantId]",
    source: "src/app/platform/tenant/[tenantId]/page.tsx",
    states: [...COMMON_PAGE_STATES, "not-found", "partial-error", "pending", "primary-success", "stale", "unauthorized"],
  },
  {
    kind: "page",
    ownerTask: "T-47",
    roles: ["SUPER_ADMIN"],
    route: "/platform/audit",
    source: "src/app/platform/audit/page.tsx",
    states: [...COMMON_PAGE_STATES, "filtered-empty", "invalid-query", "stale", "unauthorized"],
  },
] as const satisfies readonly CmsUiAuditRouteContract[];

export const CMS_UI_AUDIT_ACTION_CONTRACTS = [
  {
    consumers: ["/app/cek-tarif"], exportName: "checkShippingRates", ownerTask: "T-143",
    roles: ["TENANT_ADMIN", "OPERATOR"], source: "src/app/app/cek-tarif/actions.ts",
    states: ["healthy-empty", "partial-error", "pending", "primary-success", "stale", "unauthorized"],
  },
  {
    consumers: ["/app/kontak"],
    exportName: "searchContacts",
    ownerTask: "T-42",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    source: "src/app/app/kontak/actions.ts",
    states: ["filtered-empty", "invalid-query", "loading", "partial-error", "populated", "unauthorized"],
  },
  {
    consumers: ["/app/kontak/baru"],
    exportName: "saveContact",
    ownerTask: "T-42",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    source: "src/app/app/kontak/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: ["/app/kontak/[contactId]"],
    exportName: "updateContactAction",
    ownerTask: "T-42",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    source: "src/app/app/kontak/[contactId]/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: ["/app/kontak/[contactId]"],
    exportName: "addContactAddressAction",
    ownerTask: "T-42",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    source: "src/app/app/kontak/[contactId]/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: ["/app/kontak/[contactId]"],
    exportName: "updateContactAddressAction",
    ownerTask: "T-42",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    source: "src/app/app/kontak/[contactId]/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: ["/app/kontak/[contactId]"],
    exportName: "archiveContactAction",
    ownerTask: "T-42",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    source: "src/app/app/kontak/[contactId]/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: ["/app/label/[shipmentId]"],
    exportName: "recordLabelPrint",
    ownerTask: "T-43",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    source: "src/app/app/label/[shipmentId]/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: [
      "/app/kontak/baru",
      "/app/kontak/[contactId]",
      "/app/pengiriman/baru",
    ],
    exportName: "searchMengantarDestinationAreas",
    ownerTask: "T-54",
    roles: ["TENANT_ADMIN", "OPERATOR"],
    source: "src/app/app/location-actions.ts",
    states: ["healthy-empty", "loading", "partial-error", "populated", "unauthorized"],
  },
  {
    consumers: ["/app/pengaturan"],
    exportName: "loadMengantarPickupOptions",
    ownerTask: "T-52",
    roles: ["TENANT_ADMIN"],
    source: "src/app/app/pengaturan/actions.ts",
    states: ["healthy-empty", "loading", "partial-error", "populated", "unauthorized"],
  },
  {
    consumers: ["/app/keuangan"],
    exportName: "runLedgerReconciliation",
    ownerTask: "T-44",
    roles: ["TENANT_ADMIN"],
    source: "src/app/app/keuangan/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: ["/app/keuangan"],
    exportName: "reverseLedgerEntry",
    ownerTask: "T-44",
    roles: ["TENANT_ADMIN"],
    source: "src/app/app/keuangan/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: ["/app/pengaturan"],
    exportName: "savePrivateMengantarCredential",
    ownerTask: "T-45",
    roles: ["TENANT_ADMIN"],
    source: "src/app/app/pengaturan/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: ["/app/pengaturan"],
    exportName: "switchMengantarToPlatformDefault",
    ownerTask: "T-45",
    roles: ["TENANT_ADMIN"],
    source: "src/app/app/pengaturan/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: ["/app/pengaturan"],
    exportName: "saveOutletSettings",
    ownerTask: "T-45",
    roles: ["TENANT_ADMIN"],
    source: "src/app/app/pengaturan/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: ["/app/anggota"],
    exportName: "inviteMemberAction",
    ownerTask: "T-46",
    roles: ["TENANT_ADMIN"],
    source: "src/app/app/anggota/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: ["/app/anggota"],
    exportName: "changeMemberRoleAction",
    ownerTask: "T-46",
    roles: ["TENANT_ADMIN"],
    source: "src/app/app/anggota/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: ["/app/anggota"],
    exportName: "deactivateMemberAction",
    ownerTask: "T-46",
    roles: ["TENANT_ADMIN"],
    source: "src/app/app/anggota/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
  {
    consumers: ["/platform/tenant", "/platform/tenant/[tenantId]"],
    exportName: "submitPlatformTenantLifecycle",
    ownerTask: "T-47",
    roles: ["SUPER_ADMIN"],
    source: "src/app/platform/tenant/actions.ts",
    states: ["partial-error", "pending", "primary-success", "unauthorized"],
  },
] as const satisfies readonly {
  consumers: readonly string[];
  exportName: string;
  ownerTask: `T-${number}`;
  roles: readonly CmsUiAuditRole[];
  source: `src/${string}`;
  states: readonly CmsUiAuditState[];
}[];

export const PUBLIC_UI_AUDIT_ROUTE_CONTRACTS = [
  {
    cases: ["normal"],
    kind: "page",
    ownerTask: "T-67",
    route: "/",
    source: "src/app/page.tsx",
  },
  {
    cases: [
      "normal",
      "pending",
      "invalid-credentials",
      "role-mismatch",
      "suspended",
      "session-expired",
      "success",
    ],
    kind: "page",
    ownerTask: "T-67",
    route: "/login/tenant",
    source: "src/app/login/tenant/page.tsx",
  },
  {
    cases: [
      "normal",
      "pending",
      "invalid-credentials",
      "role-mismatch",
      "suspended",
      "session-expired",
      "success",
    ],
    kind: "page",
    ownerTask: "T-67",
    route: "/login/super-admin",
    source: "src/app/login/super-admin/page.tsx",
  },
  {
    cases: ["unauthorized", "pending", "success", "safe-error"],
    kind: "endpoint",
    ownerTask: "T-67",
    route: "/api/auth/[...all]",
    source: "src/app/api/auth/[...all]/route.ts",
  },
] as const;

export function uiAuditScenarioOwner(scenario: UiAuditScenario) {
  const scenarioContract = UI_AUDIT_SCENARIO_CONTRACTS[scenario];
  const routeContract = CMS_UI_AUDIT_ROUTE_CONTRACTS.find(
    ({ route }) => route === scenarioContract.route,
  );
  if (!routeContract) throw new Error(`No UI audit route owns ${scenario}.`);
  return {
    ownerTask: "ownerTask" in scenarioContract
      ? scenarioContract.ownerTask
      : routeContract.ownerTask,
    strategy: STATE_STRATEGY[scenarioContract.state],
  } as const;
}

export function uiAuditStateOwner<
  Contract extends { ownerTask: `T-${number}`; states: readonly CmsUiAuditState[] },
>(contract: Contract, state: Contract["states"][number]) {
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
