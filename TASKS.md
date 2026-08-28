# Tasks: GeraiCUAN

> Status: Planning draft. This queue becomes implementation authority only after the staged specification pack is accepted and promoted into the project repository.

## Rules

- Execute one task at a time and mark it complete only with fresh, recorded test evidence.
- Each task has one primary requirement. Cross-cutting obligations are constraints, not a second primary outcome.
- All Mengantar calls originate on the server. Never put the credential-bearing URL, key, or a request containing either into a client bundle, log, fixture, or error message.
- Every tenant-owned query and mutation requires an authenticated tenant context and must satisfy `TEN-1`, `TEN-2`, `IAM-2`, `IAM-3`, and `SEC-2` as applicable.

## Phase 1: Platform foundation

- [x] **T-1 — Create tenancy schema and tenant context**
  - Primary requirement: PR-1
  - Constraints: TEN-1, TEN-2, IAM-1, IAM-2, IAM-3, SEC-2
  - Dependencies: None
  - Done when: Apply the PostgreSQL migration, then execute an integration test proving tenant-owned queries cannot return another tenant's outlet or shipment records.

- [x] **T-2 — Implement super-admin tenant lifecycle**
  - Primary requirement: PR-1
  - Constraints: IAM-1, TEN-1, TEN-2, SEC-2, OBS-1
  - Dependencies: T-1
  - Done when: An authorized platform super-admin can create, suspend, and reactivate a tenant; an unauthenticated or tenant-scoped actor is denied; all outcomes are audit-recorded.

- [x] **T-15 — Implement role-specific CMS authentication**
  - Primary requirement: PR-13
  - Constraints: TD-8, IAM-1, IAM-2, IAM-3, TEN-1, SEC-2
  - Dependencies: T-1
  - Done when: Browser and integration tests prove Tenant Login only opens the authorized tenant CMS, Super Admin Login only opens platform admin, and suspended users/tenants cannot use either operational surface.

- [x] **T-3 — Configure private and default Mengantar resolution**
  - Primary requirement: PR-10
  - Constraints: PR-2, TD-5, TEN-2, IAM-2, SEC-1, SEC-2, PRIV-1
  - Dependencies: T-1
  - Done when: A tenant administrator configures one outlet default pickup address and a complete private credential reference; a resolver test proves private configuration wins and a missing private configuration uses only the platform environment defaults, without exposing either source.

- [x] **T-16 — Build public GeraiCUAN sales page**
  - Primary requirement: PR-14
  - Constraints: TD-8, SEC-2, UX-1
  - Dependencies: T-15
  - Done when: An unauthenticated browser can load the sales page and reach both login entry points, while protected CMS routes redirect/deny without rendering operational data.

## Phase 2: Shipment preparation

- [x] **T-4 — Build validated individual shipment draft**
  - Primary requirement: PR-3
  - Constraints: TEN-2, IAM-3, PRIV-1, UX-1
  - Dependencies: T-1, T-3
  - Done when: An operator saves a valid tenant-scoped draft with sender, recipient, package, declared value, and COD/non-COD data; invalid phone, address selection, package, or COD values prevent submission and preserve no invalid shipment.

- [ ] **T-5 — Build bulk shipment intake validation**
  - Primary requirement: PR-4
  - Constraints: TEN-2, IAM-3, PRIV-1, UX-2, RATE-1
  - Dependencies: T-4
  - Done when: A tenant operator uploads a documented CSV template, receives row-level validation errors without order creation, and can create only the valid rows as tenant-scoped drafts.

- [ ] **T-6 — Fetch provider estimates and enforce COD eligibility**
  - Primary requirement: PR-5
  - Constraints: TD-2, SEC-1, RATE-1, OBS-2
  - Dependencies: T-4
  - Done when: A server integration test using a Mengantar contract fixture displays only supported services, disables COD when `unsupported_cod` is true, and persists provider-returned shipping and insurance values without custom price calculation.


- [ ] **T-12 — Calculate and persist COD collection totals**
  - Primary requirement: PR-9
  - Constraints: PR-5, TD-2, DATA-3, TEN-2
  - Dependencies: T-6
  - Done when: A deterministic IDR test proves that goods Rp100.000 plus Mengantar shipping Rp10.000 produces service fee Rp3.300, VAT Rp363, and provider COD amount Rp113.663; unsupported COD remains unselectable.

- [ ] **T-13 — Build tenant reusable contact directory**
  - Primary requirement: PR-12
  - Constraints: TD-6, DATA-1, TEN-2, IAM-2, IAM-3, PRIV-1
  - Dependencies: T-1
  - Done when: A tenant user can create, search, update, archive, and select sender/recipient contacts with multiple addresses; cross-tenant access is denied and historical shipment snapshots remain unchanged after contact edits.

## Phase 3: Resi and label

- [ ] **T-7 — Create serialized Mengantar order batches**
  - Primary requirement: PR-6
  - Constraints: TD-3, SEC-1, TEN-2, OBS-2, RATE-1
  - Dependencies: T-5, T-6
  - Done when: A contract test proves individual and bulk drafts become one provider batch per courier/pickup context, dynamic-AWB courier requests are serialized per account, duplicate submission is idempotent, and returned `cnote_no` values are persisted as provider AWBs.

- [ ] **T-8 — Recover unpaid non-COD provider batches**
  - Primary requirement: PR-8
  - Constraints: TD-4, SEC-1, TEN-2, IAM-2, OBS-2
  - Dependencies: T-7
  - Done when: A test fixture with `isPaid:false` and no AWB leaves the shipment awaiting payment; an authorized retry invokes `pay-unpaid`, persists returned AWBs, and rejects any cross-tenant retry.

- [ ] **T-9 — Render and record provider AWB labels**
  - Primary requirement: PR-7
  - Constraints: TEN-2, IAM-3, PRIV-1, UX-3, OBS-3
  - Dependencies: T-7
  - Done when: A browser test prints a 100x150mm label using the provider AWB, selected courier, sender, recipient, package, COD/non-COD, and provider insurance data; each print/reprint increments a tenant-scoped history record.

- [ ] **T-14 — Build Super Admin operations monitoring**
  - Primary requirement: PR-11
  - Constraints: TD-7, IAM-1, OBS-1, OBS-2, OBS-4, SEC-1, SEC-2
  - Dependencies: T-1, T-2, T-3, T-7
  - Done when: A browser and integration check show filtered global/per-tenant counts, provider/queue/unpaid/error health, usage, and audit records with URL-addressable filters, selected timezone, and no credentials or unnecessary PII.

- [ ] **T-17 — Add timezone-safe analytics filters**
  - Primary requirement: PR-15
  - Constraints: TD-9, IAM-1, IAM-2, OBS-4, UX-1
  - Dependencies: T-7, T-8
  - Done when: Browser and integration checks prove URL-addressable preset/custom ranges, identical timezone boundaries across KPI/trend/table views, and tenant scope enforcement.

- [ ] **T-18 — Implement tenant operational ledger**
  - Primary requirement: PR-16
  - Constraints: TD-10, DATA-4, TEN-2, IAM-1, IAM-2, SEC-2
  - Dependencies: T-7, T-8, T-12
  - Done when: State-transition tests append immutable entries for COD principal, provider cost, COD fee, VAT, unpaid/recovery, and adjustments; reconciliation reports show variance without treating COD principal as revenue.

## Phase 4: Production readiness

- [ ] **T-10 — Add tenant-safe telemetry and abuse limits**
  - Primary requirement: PR-6
  - Constraints: OBS-1, OBS-2, OBS-3, RATE-1, SEC-1, PRIV-1
  - Dependencies: T-7
  - Done when: A smoke test emits structured, redacted shipment lifecycle events with tenant and correlation IDs, while rate-limit tests reject abusive estimate/order retries without leaking PII or credentials.

- [ ] **T-11 — Validate migration and release rollback path**
  - Primary requirement: PR-1
  - Constraints: DEL-1, MIG-1, TEN-2, SEC-2
  - Dependencies: T-1, T-2
  - Done when: CI applies the migration to an empty database and a representative pre-release fixture, verifies tenant isolation, and demonstrates the documented rollback or forward-fix path without data loss.
