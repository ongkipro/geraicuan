# Tenant Isolation: GeraiCUAN

- Status: Draft
- Decision: GeraiCUAN is a shared multi-tenant service. Super Admin is platform-scoped; all outlet operational data is tenant-scoped.

## TEN-1 — Tenant context
- Owner: Security owner

A request obtains active tenant context only from authenticated membership or explicit Super Admin platform action. Client-supplied tenant IDs never authorize access.

## TEN-2 — Isolation invariant
- Owner: Security owner

A tenant actor can access only rows whose `tenant_id` matches their membership. Tenant-scoped joins, mutations, background jobs, exports, print history, provider batches, and logs retain tenant identity. RLS enforces the same predicate as defense in depth.

## Tenant lifecycle
`PROVISIONING`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`. Suspension prevents new estimates, submissions, and prints, but retains data pending the privacy retention decision. Super Admin actions are audited. Tenant admins cannot create platform roles or alter another tenant.

## Tests
Cross-tenant list/read/update/delete, upstream retry, queued batch, and label/reprint tests must prove denial as well as same-tenant success.

## TEN-3 — Provider settlement evidence (T-146)

- `provider_settlement_pulls`, `provider_settlement_items` and `provider_order_status_observations` force RLS with Tenant Admin SELECT and INSERT policies; the pull policy also binds `actor_user_id` to `app.user_id`. The repository independently rejects non-admin contexts.
- A Mengantar account is not a tenant boundary: the platform-default key is shared. Matching is restricted to provider orders whose batch carries the pull's own account key inside the current tenant, and account-wide invoice/order totals plus unmatched AWB counts are stored only for a tenant's private account (database CHECK), so one tenant never learns another tenant's volume.
- Tests: `provider-settlement-repository.integration.test.ts` (cross-tenant read, operator read/insert under RLS, account-key restriction, no UPDATE grant) and `tenant-isolation-posture.integration.test.ts` (append-only grants).

## TEN-3b — Outlet pickup points (PR-46/PR-47, T-157)

- `outlet_pickup_points` forces RLS with select/insert/update/delete policies, all four requiring `tenant_id = app.tenant_id` plus an active membership in an active tenant. Identity and ownership columns hold no UPDATE grant, so a pickup point cannot be moved to another tenant or outlet by privilege, let alone by policy.
- Every repository read carries `tenant_id` in the statement itself. `outlet-pickup-points.integration.test.ts` asserts the emitted SQL contains `"outlet_pickup_points"."tenant_id" = $n`, because RLS masks a deleted application predicate: a cross-tenant read returns the same empty result either way.
- A pickup address is provider-opaque and shared across tenants on the platform-default account, so ownership is decided only by the row's own tenant and outlet. `resolveShipmentPickupPoint` refuses an id that is not one of that outlet's points before any shipment row is written.

## TEN-3c — Tenant-neutral wilayah reference (T-245, D-32, DATA-22)

- `wilayah_areas` is public Kemendagri reference data (kecamatan, kelurahan/desa, upstream kode pos). It has **no `tenant_id` by design** and holds no tenant content, so it is outside TEN-2's tenant-scoped set, like the platform tables. It is not a destination authority and no tenant table references it.
- FORCE RLS with `wilayah_areas_read` (every row readable) and an owner-only write policy; the runtime role `geraicuan_app` has SELECT only, and INSERT/UPDATE/DELETE fail `42501` (`tests/wilayah-t245.integration.test.ts`, `scripts/verify-migration-upgrade.mjs` 0067 probes). Rows are written only by `npm run wilayah:import` as the migration/owner role.
- Reads need an authenticated tenant principal (`searchWilayahDestinationAreas`, `resolveWilayahDestinationArea` call `requireCmsScope("tenant")`); nothing tenant-specific is read or cached with them. The provider lookup a pick triggers runs through the tenant-scoped Mengantar path unchanged (outlet authorised for the tenant, account authority rechecked).

## TEN-4 — Shipment numbers (PR-44, T-147)

- Numbers are unique per tenant only; `GC-10013` may exist in several tenants. Route resolution filters by the context tenant in the application and again by RLS; a number or UUID from another tenant is 404, never a redirect. A repository test proves the application predicate alone hides the row with RLS bypassed.
- `tenant_shipment_counters` carries `tenant_id` but grants the runtime role nothing; the posture test lists it under `INTERNAL_NO_RUNTIME_ACCESS` and asserts zero privileges.
- Prefix functions trust `app.tenant_id` / `app.user_id` exactly as RLS does (set only by `withTenantContext` / platform actions), check Tenant Admin, active member or active Super Admin themselves, and write their own audit rows; a RESTRICTIVE policy stops the runtime role from inserting prefix audit actions directly. The automatic implicit-lock row has `tenant_id` NULL and the tenant in `target_id`; per-tenant audit reads must include `target_id` to see it. A prefix save concurrent with a transaction that already holds shipment row locks for the same tenant can deadlock; PostgreSQL aborts one side and a retry succeeds.

## TEN-5 — Stores awaiting approval (PR-60, D-8, D-9, T-182, migration 0051)

- A self-registered store is `PROVISIONING` with `mengantar_credential_policy = PRIVATE_ONLY`. Its admin may sign in (`resolveCmsPrincipal` accepts `ACTIVE` or `PROVISIONING`; `SUSPENDED` and `ARCHIVED` stay refused) and set the store up; it ships nothing until a Super Admin approves it.
- **Application.** `requireCmsScope("tenant")` and `withTenantContext` refuse a `PROVISIONING` tenant by default. Only store-setup callers opt in (`allowPendingApproval`): `src/app/app/layout.tsx`, `src/app/app/page.tsx` (setup steps instead of figures), `src/app/app/pengaturan/{page,outlet/page,pickup/page,koneksi/page}.tsx` and `src/app/app/pengaturan/actions.ts`. `tests/tenant-approval-gate.integration.test.ts` walks `src/` and fails if any other file opts in.
- **Row-level security moved (only these):** `outlets_active_tenant`; `outlet_pickup_points_active_tenant_{select,insert,update,delete}`; `mengantar_connections_active_tenant_select`, `mengantar_connections_tenant_admin_{insert,update,delete}`; `managed_secret_payloads_active_tenant_select`, `managed_secret_payloads_tenant_admin_insert`; `mengantar_credential_rate_limits_tenant_admin`; the RESTRICTIVE `audit_events_mengantar_credential_guard`; and the profile functions `set_tenant_shipment_prefix` and `tenant_shipment_prefix_state` — each now requires `tenants.status IN ('ACTIVE','PROVISIONING')` where it required `ACTIVE`. Every other predicate is unchanged. Store setup added later with the same rule: `set_tenant_contact_whatsapp` (0058, DATA-16) and the `tenant_label_settings` policies (0059, DATA-17; write = Tenant Admin only).
- **Not moved:** every policy on `shipments`, `shipment_drafts`, `shipment_parties`, `shipment_estimate_*`, `shipment_cod_totals`, `provider_*`, `ledger_entries`, `reconciliation_runs`, `print_events`, `shipment_rts_events`, `shipment_rate_limits`, `contacts`, `contact_addresses`; `allocate_shipment_reference`; `tenant_member_governance_authorized` (a store awaiting approval invites no members). `scripts/verify-migration-upgrade.mjs` asserts exactly this set carries `PROVISIONING` and at least 30 shipping policies still require `ACTIVE`.
- A pre-existing `PROVISIONING` tenant (none is created by any application path before 0051) keeps `PLATFORM_DEFAULT_ALLOWED` and gains the same setup access.
- Tests: `tenant-approval-gate`, `tenant-approval-shipment-paths` (12 shipment Server Functions with a real session), `tenant-provisioning-access` (setup allowed; shipment, contact, rate-limit, batch and settlement writes refused by RLS; no self-approval), `tenant-registration`.
