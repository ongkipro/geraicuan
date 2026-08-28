# Tenant Isolation: GeraiCUAN

- Status: Draft
- Decision: GeraiCUAN is a shared multi-tenant service. Super Admin is platform-scoped; all outlet operational data is tenant-scoped.

## TEN-1 — Tenant context
A request obtains active tenant context only from authenticated membership or explicit Super Admin platform action. Client-supplied tenant IDs never authorize access.

## TEN-2 — Isolation invariant
A tenant actor can access only rows whose `tenant_id` matches their membership. Tenant-scoped joins, mutations, background jobs, exports, print history, provider batches, and logs retain tenant identity. RLS enforces the same predicate as defense in depth.

## Tenant lifecycle
`PROVISIONING`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`. Suspension prevents new estimates, submissions, and prints, but retains data pending the privacy retention decision. Super Admin actions are audited. Tenant admins cannot create platform roles or alter another tenant.

## Tests
Cross-tenant list/read/update/delete, upstream retry, queued batch, and label/reprint tests must prove denial as well as same-tenant success.
