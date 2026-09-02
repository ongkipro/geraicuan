# Post-location Cross-layer System Screening Matrix

- Owner: T-58 / PR-24
- Evidence date: 2026-09-02
- Reviewed HEAD: `2b3bd18121325ac70d153dd2bb38809cc8612e65`
- Delivery run: `RUN-20260901T213811Z-8264937b`
- Scope: verification of the integrated local worktree after T-52 through T-57 and T-69; this document does not authorize provider traffic, production mutation, commit, push, deploy, or release.

## Verdict rules

`PASS` means the rendered entry point, server authorization, validated input,
repository transaction, database constraint/RLS defense, authoritative side
effect, and returned decision state agree. `RELEASE-GATED` means the workflow is
correct only through the sanctioned non-production fixture and intentionally
fails closed in production. A material contradiction must fail T-58 and open a
separate atomic repair task; it is never repaired inside this screening run.

## Actor and scope matrix

| Actor | Server-derived authority | Permitted first-class decisions | Denied boundary | Evidence | Verdict |
|---|---|---|---|---|---|
| Unauthenticated | Better Auth session is absent; no CMS principal | Public sales and role-specific login only | Tenant and platform layouts/actions redirect or deny before protected reads | `cms-auth`, `platform-layout`, `platform-monitoring-page`, `outlet-settings-page` | PASS |
| Operator | One active user + tenant membership resolves `tenantId` and `OPERATOR`; transaction sets `app.user_id` and `app.tenant_id` | Draft/contact/shipment queue/detail, estimate, permitted issuance, labels | Analytics, Finance, settings, members, reconciliation, unpaid recovery, and platform authority remain absent or denied | `cms-auth`, `tenant-isolation`, `shipment-actions`, `member-governance-actions`, `finance-actions`, `cms-shell` | PASS |
| Tenant Admin | One active user + tenant membership resolves `tenantId` and `TENANT_ADMIN`; transaction sets tenant scope | All tenant operations, private Mengantar settings, finance, reconciliation, members | Platform data and lifecycle operations deny before platform reads | `cms-auth`, `managed-secret-repository`, `member-governance`, `ledger-workspace`, `platform-layout` | PASS |
| Super Admin | Active `SUPER_ADMIN` platform role; transaction sets `app.platform_admin=true` only after restricted-role verification | Platform monitoring, tenant lifecycle, global audit/read models | Tenant CMS principal is not synthesized and tenant actions deny | `platform-monitoring`, `platform-tenant-lifecycle`, `platform-tenant-actions`, `cms-auth` | PASS |

## Object and workflow matrix

| Object / decision | Rendered or API entry | Server boundary and validation | Repository / database authority | Transition or side effect | Executable evidence | Verdict |
|---|---|---|---|---|---|---|
| Tenant lifecycle | Platform tenant list/detail confirmation | `resolvePlatformAccess`; UUID, explicit confirmation, expected-name, and attempt ID validation | restricted application role, platform context, RLS, lifecycle idempotency audit | create, suspend, or reactivate; append audit result | `tenant-lifecycle`, `platform-tenant-lifecycle`, `platform-tenant-actions` | PASS |
| Membership governance | `/app/anggota` | Tenant Admin role; UUID/role/confirmation/attempt validation | tenant transaction, membership RLS, last-admin and replay guards | invite, role change, deactivate; append attempt/outcome audit | `member-governance`, `member-governance-actions`, `member-governance-page` | PASS |
| Outlet readiness | `/app/pengaturan` and shipment creation | Tenant Admin mutation; submitted outlet must resolve inside the principal tenant | outlet readiness repository locks and derives tenant/outlet scope | location/configuration state changes; readiness governs downstream estimate/order eligibility | `outlet-readiness`, `outlet-settings-actions`, `outlet-settings-page` | PASS |
| Private Mengantar credential | Outlet connection form | Tenant Admin, explicit confirmation, bounded API key input; key exists only in the POST body | encrypted managed payload, non-secret reference, tenant/outlet RLS, rate limit, audit | replace private credential or restore platform default; authority version changes | `managed-secret-repository`, `mengantar-credentials`, `outlet-settings-actions` | PASS |
| Pickup authority | Outlet pickup selector | server-only account resolution; bounded provider response; selected pickup belongs to returned account options | tenant/outlet lock plus account authority version; readable ID/label pair | update pickup/origin only if credentials and authority remain current | `mengantar-locations`, `mengantar-location-authority`, `outlet-settings-actions` | PASS |
| Destination search | Contact, shipment, and bulk inputs | authenticated server action; outlet ownership/readiness, query normalization, actor rate and concurrency limits | provider-authoritative result DTO contains bounded readable IDs/labels only | no persistence and no estimate/order mutation during lookup | `location-search-actions`, `location-search-rate-limit`, `shipment-destination-actions` | PASS |
| Contact and address | Contact list/create/detail | tenant principal; input validation; provider selection rechecked against outlet authority | contact/address tenant RLS and active-record mutation predicates | create/update/archive contact; create/update address with readable destination authority | `contact-directory`, `contact-actions`, `mengantar-location-authority` | PASS |
| Shipment draft | `/app/pengiriman/baru` | tenant principal; outlet, party, package, COD, contact snapshot, and signed destination validation | configured-outlet check, tenant transaction/RLS, idempotent draft replay | create immutable party snapshots and a DRAFT shipment | `shipment-draft`, `shipment-draft-contact-cod`, `shipment-destination-actions` | PASS |
| Bulk draft intake | `/app/impor` and template route | authenticated template; bounded CSV; normalized/deduplicated search; signed envelope bound to actor, tenant, outlet, row, destination, authority, and expiry | outlet/authority lock and all-or-nothing draft transaction; invalid rows have no token | create only selected valid DRAFT rows; never estimate or issue | `bulk-shipment-intake`, `bulk-import-envelope`, `bulk-import-actions` | PASS |
| Estimate snapshot | Draft estimate action | tenant principal; current draft/outlet/destination authority; sanctioned estimate transport | append-only estimate snapshot/services, tenant RLS, COD eligibility and amount validation | DRAFT to ESTIMATED; persist authoritative service snapshot and COD totals | `mengantar-estimate`, `estimate-repository`, `shipment-estimate-authority-action`, `cod-totals-repository` | RELEASE-GATED |
| COD classification | Draft, estimate, dashboard, analytics, Finance | integer/bounds validation and courier COD eligibility | immutable COD totals snapshot; ledger separates principal, fee, tax, and cost entry kinds | COD principal remains liability; only service fee is revenue | `cod-totals-repository`, `ledger-repository`, `tenant-dashboard`, `analytics-repository` | PASS |
| Order batch / AWB issuance | Shipment detail confirmation | tenant principal, selected current estimate, explicit confirmation, rate limit, sanctioned order fixture | account-derived serialization key, advisory lock, idempotency key, queued/claim/unknown states, RLS | ESTIMATED to SUBMISSION_QUEUED to ISSUED / AWAITING_UPSTREAM_PAYMENT / FAILED / UNKNOWN; only normalized provider `cnote_no` becomes AWB | `order-batch`, `shipment-issuance`, `order-rate-limit` | RELEASE-GATED |
| Unknown submission reconciliation | Shipment detail reconciliation | Tenant Admin, explicit confirmation, sanctioned authoritative fixture, exact immutable lookup key | tenant-scoped target; unresolved-only update predicate; normalized provider result | SUBMISSION_UNKNOWN to ISSUED / AWAITING_UPSTREAM_PAYMENT / FAILED; append corresponding ledger only on authoritative transition | `shipment-reconciliation`, `ledger-repository` | RELEASE-GATED |
| Unpaid recovery | Shipment detail recovery | Tenant Admin, explicit confirmation, rate limit, sanctioned recovery fixture | serialized claim/stale/unknown handling, tenant RLS, immutable provider snapshot | AWAITING_UPSTREAM_PAYMENT to ISSUED or recovery UNKNOWN; append ledger once | `unpaid-recovery`, `shipment-unpaid-recovery`, `order-rate-limit` | RELEASE-GATED |
| Label and print history | Label index/detail and print action | tenant principal; issued-only record; bounded AWB suffix and shipment ID | provider snapshot `cnote_no` is read authority; append-only print event snapshot | render 100×150 mm label; append print attempt without changing shipment/AWB | `label-print`, `label-print-actions`, `label-render` | PASS |
| Analytics and export | `/app`, `/app/analitik`, CSV route | Tenant Admin for full Analytics; canonical URL filters, known outlet/courier/status/basis, range/timezone bounds | tenant read transaction/RLS; event-time basis is explicit | read-only KPIs/trend/table/export; exceptions remain tenant-wide and labelled | `analytics-range`, `analytics-filters`, `analytics-repository`, `analytics-export-route`, `tenant-dashboard` | PASS |
| Ledger reconciliation | `/app/keuangan` | Tenant Admin; explicit outlet/range/confirmation and adjustment validation | append-only ledger/reconciliation tables, immutable triggers, tenant RLS | append reconciliation and reversal/adjustment entries; never update or delete financial history | `ledger-repository`, `ledger-workspace`, `finance-actions` | PASS |
| Platform monitoring and audit | `/platform`, tenant detail, audit | active platform role before read; URL filters validated and scopes allowlisted | read-only platform context over redacted views; append denied/view/lifecycle audit | global decision views expose no credential payload and minimize PII | `platform-monitoring`, `platform-monitoring-page`, `platform-monitoring-filters` | PASS |

## Lifecycle and concurrency invariants

| Boundary | Enforced invariant | Evidence | Verdict |
|---|---|---|---|
| Shipment lifecycle | `DRAFT → ESTIMATED → SUBMISSION_QUEUED → ISSUED | AWAITING_UPSTREAM_PAYMENT | SUBMISSION_UNKNOWN | FAILED`; recovery/reconciliation are state-specific | schema checks plus shipment/order/reconciliation/recovery suites | PASS |
| Dynamic-AWB courier account | Batches that require dynamic AWB serialize per derived Mengantar account key; unrelated accounts may proceed independently | order-batch advisory-lock and concurrency tests | PASS |
| Duplicate submission | Stable attempt/idempotency keys replay the prior decision; UNKNOWN is not resubmitted before reconciliation | order-batch, shipment-issuance, platform/member idempotency tests | PASS |
| Authority race | Contact, bulk, draft, estimate, and order inputs bind the current destination/account authority; credential or location change fails stale work closed | location-authority, estimate-authority, bulk-import, order-batch tests | PASS |
| Append-only money/audit | Application role receives insert/select only where required; database triggers reject ledger/reconciliation mutation | migrations 0015/0020/0022/0024 and ledger/member/platform tests | PASS |
| Time semantics | Range parsing uses selected IANA timezone; created, issued, outcome, and current exception bases are never merged silently | analytics range/repository/dashboard/export tests | PASS |

## Static trust-boundary screening

| Search / question | Result | Disposition |
|---|---|---|
| Can browser code import stored Mengantar credentials, payload ciphertext, secret references, or platform API keys? | No client module imports the server-only credential repositories/resolvers. The settings client only posts a new password input and receives sanitized state. | PASS |
| Can a tenant/outlet ID supplied by the browser become authorization scope? | No. Tenant scope is always `principal.tenantId`; submitted outlet/contact/shipment IDs are targets resolved again inside that tenant transaction. Platform tenant IDs are targets after platform authorization, never actor scope. | PASS |
| Can application code invent or overwrite an AWB? | No persisted AWB writer accepts UI input. Order, reconciliation, and recovery normalize provider-shaped `cnote_no`; labels and reads consume that snapshot. The public sales-page AWB string is a non-persisted illustration only. | PASS |
| Can application code mutate historical ledger/reconciliation rows? | No application update/delete path exists. Database triggers reject update/delete; destructive statements occur only in isolated test cleanup/assertions. | PASS |
| Can production invoke an order, reconciliation, unpaid recovery, or estimate through the sanctioned fixture path? | No. Fixture modules require non-production plus an explicit enable flag; mutation actions return unavailable before orchestration when disabled. | PASS |
| Can logs/errors expose credentials, recipient PII, or credential-bearing provider URLs? | Provider/account failures collapse to safe codes/messages; platform views are redacted; telemetry tests reject forbidden fields. No browser/provider URL contains credentials in reviewed paths. | PASS |
| Is the local demo password a production credential path? | No. It is rendered only when `NODE_ENV !== production` and the explicit local hint flag is enabled. It is not a Mengantar credential and remains outside production builds. | PASS |

## Executed verification

- Full disposable PostgreSQL 16 integration suite: 67 files / 500 tests PASS.
- Representative upgrade: migrations through
  `0029_mengantar_authority_version.sql` PASS with preserved tenant, shipment,
  party, destination, estimate, provider-order, authority-version, and RLS
  fixture assertions.
- T-57 inventory: 10/10 PASS; exact route/action/state/fixture ownership and no
  duplicate responsive GET form remain enforced.
- Full ESLint, TypeScript, `git diff --check`, and the credential-safe
  production build are inherited from the immediately preceding T-69 closure
  and must be rerun at T-62 against the clean release candidate.
- The integration run emitted the existing `pg@8` deprecation warning for a
  test client that queues a query while another is active. It did not affect a
  product request, transaction result, or any of the 500 assertions; it is a
  compatibility observation, not a current correctness failure.

## Screening conclusion

No unowned actor, first-class object, sensitive action, lifecycle transition,
or trust boundary was found. The integrated system is internally consistent
for the accepted fixture-backed release state. Live estimate/order/recovery
transport remains deliberately unreleased; T-58 PASS does not convert those
`RELEASE-GATED` rows into production capability. T-64 through T-68 may proceed
to fresh browser-state screening, while T-62 remains the only clean
release-candidate verdict.

The specification-suite v2 structural validator separately reports 95 legacy
metadata findings: missing accountable owners, one duplicated `JUR-ID-1`,
incomplete jurisdiction metadata, and architecture/security/observability IDs
that are not parsed as declarations. These findings do not contradict the
runtime workflow matrix, but they prevent a clean traceability gate. T-70 owns
the metadata-only correction and is a mandatory dependency of T-62.

### Release hardening observation

The estimate adapter currently validates HTTPS and rejects URL credentials,
but it accepts a broader base-URL shape and interpolates the API key into the
path more directly than the location adapter. This is not a browser leak or a
fixture-backed correctness failure because the adapter is server-only and live
transport remains disabled. Before any live estimate release, T-62 must require
the same origin-only base-URL validation used by location requests, encode the
API-key path segment, and rerun credential-redaction and redirect checks.
