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

## TEN-4 — Shipment numbers (PR-44, T-147)

- Numbers are unique per tenant only; `GC-10013` may exist in several tenants. Route resolution filters by the context tenant in the application and again by RLS; a number or UUID from another tenant is 404, never a redirect. A repository test proves the application predicate alone hides the row with RLS bypassed.
- `tenant_shipment_counters` carries `tenant_id` but grants the runtime role nothing; the posture test lists it under `INTERNAL_NO_RUNTIME_ACCESS` and asserts zero privileges.
- Prefix functions trust `app.tenant_id` / `app.user_id` exactly as RLS does (set only by `withTenantContext` / platform actions), check Tenant Admin, active member or active Super Admin themselves, and write their own audit rows; a RESTRICTIVE policy stops the runtime role from inserting prefix audit actions directly. The automatic implicit-lock row has `tenant_id` NULL and the tenant in `target_id`; per-tenant audit reads must include `target_id` to see it. A prefix save concurrent with a transaction that already holds shipment row locks for the same tenant can deadlock; PostgreSQL aborts one side and a retry succeeds.
