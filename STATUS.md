# Status — geraicuan

Updated: 2026-09-01
Status: Active
State: INTEGRATING
Review-Risk: R4
Independent-Review: PENDING
Primary-Worker: Main
Independent-Reviewer: Pending clean release candidate
Independent-Review-Head: UNSET

## Delivery state machine

Allowed forward path:

`PLANNED -> READY -> IMPLEMENTING -> VERIFYING -> REVIEWING -> INTEGRATING -> PRODUCTION_READY -> AWAITING_DEPLOY_APPROVAL -> DEPLOYED -> SMOKE_TESTING -> VERIFIED`

Use `BLOCKED` only as an interruption state. Record the blocker and exact state to resume. Do not skip verification/review/integration states. `production-gate` proves the transition from `INTEGRATING` to `PRODUCTION_READY`; it never deploys.

`RELEASE.md` owns release-specific truth: release ID, base, declared risk, rollback reference/command, backup proof, and readiness status. `Review-Risk` is the highest semantic risk found during review. `production-gate` computes effective release risk as max(`RELEASE.md` Declared-Risk, deterministic `diff-risk`, `Review-Risk`). R3/R4 require `Independent-Review: PASS`, a reviewer distinct from `Primary-Worker`, and `Independent-Review-Head` bound to the reviewed release content. Only review-attestation files may change after that commit.

`OBSERVABILITY.md` owns post-deploy verification probes. After deployment, transition to `SMOKE_TESTING` and run `release-check`. Every configured observability probe must pass before transition to `VERIFIED`.

## Current state

T-50 and T-51 are complete locally. Tenant-managed Mengantar API keys now have an
encrypted-at-rest, server-only lifecycle backed by additive migration 0025,
forced RLS, tenant/outlet/purpose-bound AES-256-GCM envelopes, durable failed-
attempt rate limiting, Tenant Admin create/replace/fallback actions, redacted
audit outcomes, and private-first credential resolution with a platform-owned
base URL. The existing `Outlet & koneksi` page now exposes the shadcn
platform/private workflow without rendering credential material, preserves a
visible focused result across connection-source changes, and requires an
explicit destructive confirmation before a private key can be removed. Local
Chromium passed authenticated 390px, 768px, and 1280px settings journeys with
10 outlets, zero horizontal overflow, blank password fields after create and
replacement, and correct dialog focus restoration; focused T-51 verification
passed 3 files / 43 tests, targeted lint, TypeScript, designer review, and
independent security review. Provider-authoritative area/pickup search and the
10–20 outlet list-detail experience remain T-52/T-53. No provider or production
call occurred.

Pre-push verification on a fresh PostgreSQL 16 container also corrected the
last T-49 runtime-role setup dependency in the analytics suite and made courier
ordering independent of database locale. Migration upgrade through 0025,
focused analytics 9/9, the full 60-file / 434-test suite, lint, TypeScript, and
the production build now pass on the feature branch. This is verification and
source control preparation only; production remains untouched. The originating
boundary run is retained as `FAIL` for its missing accepted overlap; corrective
run `RUN-20260901T040210Z-06b53149` explicitly owns the reviewed analytics and
evidence-file overlap.

T-1 through T-32 are complete with recorded local verification. The earlier
complete integration suite passed 136 assertions; the T-30 delta evidence is
recorded below alongside the T-31 completion delta. Lint and production build
passed. Deployment remains explicitly unapproved.

The 2026-08-31 UI-system redesign is verified locally but remains uncommitted.
The existing production-readiness review SHA predates this work and MUST be
refreshed before a release gate treats the redesigned surface as reviewed.

Phase 6 is complete. The local tenant overview is analytics-led: it defaults to
Today in WIB and shows period input, COD/non-COD composition, declared goods
values, authoritative issued outcomes, prior-period context, and an accessible
multi-day trend before current work. Its date, outlet, and timezone filters are
URL-persisted and tenant/outlet scoped. Tenant analytics also
has fail-closed URL filters, canonical
`created|issued|outcome|exceptions` detail basis, supporting KPI links, settled
partial-error regions, an explicit issuance denominator and courier breakdown,
and a Tenant Admin-only filtered CSV export.
COD principal remains a liability and financial event totals remain ledger
derived.

T-30 is complete. It streams readiness, metrics, action queue,
and recent outcomes independently; uses a database-generated read timestamp,
five-minute stale policy, and manual refresh; and gives Tenant Admin an exact
reconciliation-variance count/link while omitting finance data and its query
from Operator. Populated regression for Tenant Admin and Operator now passes at
all three required widths, and the manual-refresh live/focus contract is proven.
Its fault-injected partial-region recovery and stale-after-five-minutes states
now have executable browser evidence. T-31 is also complete. Analytics streams
four independent regions with local retry/focus recovery, covers first-run and
empty/error/stale states, and exposes the latest tenant-wide signed
reconciliation variance as a fifth metric distinct from revenue and COD
liability. The variance intentionally does not inherit period, courier, or
lifecycle filters.

T-32 is complete. Focused real-PostgreSQL tests prove tenant/outlet isolation
and current/previous period aggregation. Streamed-render tests prove the
Today-in-WIB default, multi-day semantic trend, URL filter propagation,
readiness-aware first-run state, and fail-closed invalid outlet behavior. The
production build and final browser-visible checks passed without starting any
provider or production action.

## Active work

The accepted CMS precision and UI/UX goal is complete: T-35, its atomic queue
T-37 through T-47, T-48, the corrective T-49 test-harness task, and final T-36
verification all passed their recorded boundaries. T-47 corrective delivery-ledger run
`RUN-20260901T010311Z-f801bb9f` closed the complete Super Admin monitoring,
tenant list/detail, lifecycle, and audit workspace with exact mutation replay,
redacted monitoring views, hardened audit RLS, and real browser lifecycle proof.
T-35 delivery-ledger run `RUN-20260901T010855Z-655e9fc7` then passed the
independent 18-route cross-screen consistency closure at 390px, 768px, and
1280px. T-48 corrective run `RUN-20260901T012724Z-d7ce0ec0` completed the
labelled mobile Sheet, tablet icon rail, full desktop Sidebar, server-gated
Platform shell, cross-role discovery, forbidden-route, and real sign-out
contracts. T-36's first full-suite attempt exposed and corrected two
stale T-38 courier-order fixture expectations without changing product code;
the second attempt exposed a parallel test-harness race where four suites
dropped the shared runtime role while siblings still used it. T-49 now makes
the disposable database own that role lifecycle and makes every shipment suite
ensure the guarded role explicitly. Final T-36 verification run
`RUN-20260901T015655Z-f8920fff` passes the full automated, migration, build,
traceability, and browser boundary. The release verdict remains NO-GO because
the tree is uncommitted, the release manifest is DRAFT/UNSET, and no clean
release candidate or release approval exists. No implementation or verification
task remains in this goal; commit, release, live provider activity, and
deployment remain explicitly unapproved.

## Verification evidence

- 2026-08-31 UI-system redesign: accepted tenant/platform IA, one shadcn/Radix
  sidebar shell, semantic light tokens, shared page/status/detail/empty-state
  primitives, and a screen contract were applied across the public site and
  CMS. Shipment queue, create, estimate, detail, issuance, and unpaid recovery
  received targeted component migrations; contacts, outlet/member settings,
  analytics, finance, import, labels, and platform surfaces were aligned to the
  same hierarchy and visual vocabulary. No provider action was triggered.
- 2026-08-31 executable checks: `pnpm lint`, `pnpm exec tsc --noEmit`, a
  focused isolated-PostgreSQL suite (4 files / 22 assertions), and `pnpm build`
  passed. Authenticated Chromium 152 evidence covered 23 public, tenant, and
  platform route/viewport combinations at 390px, 768px, and 1280px. Every
  document reported one main landmark, zero horizontal overflow, and zero
  console errors. The browser flow created a local non-COD draft, opened its
  detail workspace, and verified the populated queue. The mobile navigation
  opened with its close control focused.
- Delivery boundary caveat: this redesign began on an already heavily dirty
  worktree without a `delivery-ledger start` event. No retroactive boundary
  `PASS` is claimed; a clean release run must capture the accepted surface and
  fresh review evidence before release.
- 2026-09-01 T-37 verification foundation: deterministic CMS UI audit scenario
  contracts and route inventory now cover 18 authenticated pages plus 2
  adjacent authenticated CSV endpoints. The corrective pass added exact route
  owners/state matrices, strict development-only route consumption, a two-pass
  alias/template/import-aware class guard, and static/dynamic import isolation.
  Focused Vitest passed 3 files / 11 tests; targeted ESLint, `pnpm exec tsc
  --noEmit`, and `git diff --check` passed; and an independent reviewer returned
  PASS with no blocking findings. Authenticated Chromium at 390px proved a
  scenario owned by the other route is rejected by each real page consumer,
  with zero document overflow and no failed response.
  The delivery boundary required review only for accepted pre-existing dirty
  paths and carried no out-of-scope, protected, unknown, or missing-verification
  changes. No provider request, production operation, commit, push, deployment,
  or release occurred.
- 2026-09-01 T-38 Ringkasan and Analitik: Today-in-WIB and URL-persisted date,
  outlet, and timezone filters now drive independently streamed dashboard and
  analytics regions. All four Ringkasan counts expose exact role-safe support
  rows, analytics trend freshness is independently database-generated, and
  Admin-only finance/governance data stays absent for Operator. Focused Vitest
  passed 10 files / 35 tests, isolated PostgreSQL verification passed 2 files /
  13 tests, and targeted ESLint, TypeScript, and `git diff --check` passed.
  Authenticated Chromium covered both roles and the accepted state matrix at
  390px, 768px, and 1280px, including keyboard, Retry/focus, reload/Back,
  semantic-table, supporting-row, and filtered-CSV journeys. Independent
  correctness and designer re-reviews returned PASS. No provider request,
  production operation, commit, push, deployment, or release occurred.
- 2026-09-01 T-39 shipment queue and lifecycle detail: grouped queue filters,
  local scrolling, pagination, freshness, route-specific loading/error/focus,
  every authoritative shipment state, role-safe actions, sanitized sanctioned
  issuance/recovery, and Admin-only unknown reconciliation are covered. A
  refreshed stale `SUBMITTING` or `PAYING` detail now exposes only a local-state
  safety check; it never calls the provider, serializes against active
  completion, finalizes terminal batches, and moves unresolved work to a
  reachable no-retry unknown state. Final route/action checks passed 2 files /
  28 tests; disposable PostgreSQL verification passed 7 files / 38 tests;
  targeted ESLint, TypeScript, and `git diff --check` passed. Independent R4
  security/correctness and designer reviews returned PASS. Authenticated
  Chromium covered the final stale-operation delta for both roles at 390px,
  768px, and 1280px with no overflow or browser failures. No provider request,
  production operation, commit, push, deployment, or release occurred.
- 2026-09-01 T-40 shipment drafting and estimation: the page now exposes one
  flat progress sequence, grouped 44px controls through tablet, deterministic
  error-summary focus/links, keyboard-safe contact search, immutable UUIDv4
  replay, revision-locked selected contacts, explicit manual overrides, and a
  successful save path into the normal queue/detail lifecycle. A sanctioned
  estimate fixture is non-production-only and production-fail-closed; the
  browser audit error/retry path issued zero POST/provider requests. Focused
  Vitest passed 4 files / 16 tests, disposable PostgreSQL 16 passed 1 file / 7
  tests, TypeScript/targeted ESLint/diff checks passed, authenticated Chromium
  passed at 390/768/1280, and independent security plus designer re-reviews
  returned PASS. Destination area remains syntactically validated only pending
  an accepted provider address-search contract. No provider request,
  production operation, commit, push, deployment, or release occurred.
  Corrective run `RUN-20260831T214051Z-542dd1f4` preserves the original PASS
  evidence while repairing its incomplete immutable skill attribution.
- 2026-09-01 T-46 tenant member governance: Tenant Admin authorization now
  precedes input consumption, every invite/role/deactivation mutation carries
  an exact UUID attempt receipt, single-tenant membership and last-admin
  invariants serialize under concurrency, and member audit inserts are
  tenant/target/role bound without PII. Migration 0023 preflights existing
  duplicate users before adding the global membership key. Focused Vitest
  passed 4 files / 56 tests; fresh PostgreSQL 16 migration upgrade and 2 files /
  15 tests passed; TypeScript, targeted ESLint, and `git diff --check` passed.
  Authenticated Chromium covered populated, sole-admin, inactive, loading,
  route-error, validation, confirmation, role-safe navigation, long-email, and
  responsive overflow states at 390px, 768px, and 1280px. Independent designer
  and security/correctness reviews returned PASS. Initial run
  `RUN-20260901T001837Z-0134091d` remains FAIL only because its immutable
  baseline could not accept required migration/shared-test dirty overlaps;
  corrective run `RUN-20260901T003252Z-5db01f4d` owns the complete surface. No provider request,
  production operation, commit, push, deployment, or release occurred.
- 2026-09-01 T-47 Super Admin monitoring and tenant governance: platform routes
  authorize before protected reads or FormData, monitoring uses a database read
  timestamp, filters/pagination remain canonical, and provider/account/error
  context is allowlisted and redacted. Lifecycle create/suspend/reactivate uses
  exact UUID receipts, fingerprint conflict detection, advisory and target row
  locks, and append-only tenant-bound audit outcomes. Migration 0024 preflights
  duplicate receipts before adding uniqueness and hardened RLS. Final focused
  checks passed 5 files / 52 tests; fresh PostgreSQL 16 migration upgrade and 3
  files / 11 tests passed; TypeScript, targeted ESLint, and diff checks passed.
  Authenticated Chromium passed four routes at 390/768/1280, the complete state
  matrix, and a real provision → suspend → reactivate → reload → audit journey
  with zero document overflow, browser failures, or provider requests.
  Independent designer and security/correctness reviews returned PASS. Initial
  run `RUN-20260901T003840Z-b68e32de` remains immutable FAIL for incomplete
  dirty-overlap declaration; corrective run `RUN-20260901T010311Z-f801bb9f`
  owns the complete verified surface. No production, commit, push, deployment,
  or release action occurred.
- 2026-08-31 tenant overview/analytics increment: focused PostgreSQL and
  component-contract verification passed 5 files / 31 assertions; TypeScript,
  targeted ESLint, `git diff --check`, and production build passed. Authenticated
  Chromium checked the tenant overview at 390px, 768px, and 1280px, the mobile
  navigation, draft/exception queue links, shipment-create route, and analytics
  route with zero document overflow, console errors, or relevant failed
  requests. A final delta check covers the remediated 44px mobile actions and
  full-tile pulse links. The attempted all-file integration run is not counted
  as passing evidence: concurrent files recreate the shared runtime database
  role and 76 tests failed with PostgreSQL `28P01`; focused tests passed again
  after restoring the disposable local fixture role.
- 2026-08-31 Phase 6 data/contract follow-up: focused PostgreSQL checks for
  dashboard, shipment-queue, and analytics repositories passed 3 files / 18
  assertions. The read-only documentation audit independently passed `pnpm
  lint`, `pnpm exec tsc --noEmit`, `git diff --check`, and 5 non-database files /
  49 assertions covering analytics range/filter/basis serialization, supporting
  links, export HTTP denial and CSV safety, and role-aware shell navigation. A
  credential-safe production build passed after the final basis/dashboard
  changes and generated all 17 static pages while retaining the dynamic tenant,
  analytics, and CSV export routes.
  Final authenticated browser evidence then covered the Tenant Admin dashboard
  and analytics at 390px, 768px, and 1280px with zero document overflow,
  console errors, or relevant failed requests. Dashboard queue links opened
  their exact predicates. Populated analytics showed `6` created, `1` issued,
  `100%` success, `3` unresolved, a semantic trend table, and courier `1/1`.
  Outcome KPI URL, supporting table, and CSV export parity were reverified at
  390px and 1280px after fixing a client-remount defect. Mobile filters retained
  focus and 44px targets across apply, reload, and browser Back. Operator checks
  at 390px and 1280px showed role-safe dashboard content and direct analytics
  denial; mobile navigation Escape returned focus to its trigger. The local
  seeder now includes a dedicated Operator fixture.
  A final contract correction added fail-closed `basis=exceptions` support. Its
  current-snapshot table and CSV export preserve outlet, courier, and lifecycle
  dimensions and match the unresolved KPI exactly; focused non-database checks
  passed 3 files / 8 assertions and the analytics PostgreSQL check passed 9
  assertions.
  The latest T-30 increment added an exact Tenant Admin variance link, an
  Operator-safe DTO/query path, four independently streamed dashboard regions,
  database-timestamp stale detection, and manual refresh. Tenant Admin
  first-run/ready-empty browser checks passed at 390px, 768px, and 1280px with
  no overflow, console errors, or relevant failed requests. Analytics now shows
  authoritative backlog `asOf` in the selected timezone through the same
  five-minute stale/manual-refresh control. Focused non-database checks passed 4
  files / 8 tests; PostgreSQL analytics/dashboard checks passed 2 files / 12
  tests; PostgreSQL dashboard/queue checks passed 2 files / 10 tests; full lint
  and production build passed, generating 17 static pages.
  Final `ui-validation` browser evidence passed for populated Tenant Admin and
  Operator dashboards at 390px, 768px, and 1280px with zero document overflow
  and zero console, runtime, or relevant network errors. Admin showed five
  pulses including variance `1` with its exact finance destination; Operator
  showed four permitted pulses and no finance, analytics, or governance UI. The
  Admin 768px fifth tile spanned without layout breakage. Mobile action and
  refresh targets measured 44px, and refresh pending/completion live
  announcements plus focus restoration passed. The exact finance variance route
  passed at all three widths with its wide reconciliation table scrolling
  locally and no document overflow or errors. WIB copy was corrected and
  rechecked.
  Final T-30 fault-state `ui-validation` at 390px and 1280px used an exact
  allowlisted development-only header seam; a production-mode test proves the
  seam fails closed. The failed action region retained five Admin pulses, six
  recent rows, and five role-safe quick actions with zero document overflow or
  errors. Clearing the seam and retrying restored five action rows, returned
  focus to `h2#action-heading`, and exposed the visible shadcn semantic ring.
  A read-only six-minute presentation shift showed the old absolute timestamp
  and stale badge; clearing it and manually refreshing advanced the timestamp,
  removed the badge, announced completion, and restored focus. Audit/freshness
  checks passed 2 files / 3 tests; TypeScript and focused ESLint passed. The
  production build passed before the final focus-ring-only adjustment, so that
  adjustment is covered by TypeScript, ESLint, and browser evidence rather than
  a post-adjustment build. T-30 is complete.
  T-31 completion evidence then verified four independently streamed analytics
  regions, local partial-failure Retry focus, and exact development-only seams
  for stream delay, trend error, stale, first-run, and page error. Production
  mode fails closed against those seams. Browser checks exercised first-run,
  filtered-empty, period-empty, partial trend failure/retry, stale/manual
  refresh, and route recovery across 390px, 768px, and 1280px as applicable,
  with zero document overflow and no console, runtime, or relevant network
  errors. The mobile skeleton overflow defect was repaired; route recovery
  focuses the page H1.
  Analytics now shows a fifth latest tenant-wide signed reconciliation variance
  metric/link, separate from revenue and COD-principal liability and explicitly
  unaffected by period, courier, or lifecycle filters. Its finance hash target
  scroll/focus behavior was repaired. Verification passed 5 analytics/audit
  files / 12 tests, then 3 focused files / 21 tests, 3 focused real-PostgreSQL
  tenant-dashboard tests, focused ESLint, TypeScript, `git diff --check`, and a
  clean production build with ephemeral local build authentication/database
  configuration. The development server remained reachable.
  The attempted full integration suite is not a PASS: legacy files recreated
  the shared `geraicuan_test_runtime` role without a password, causing broad
  authentication failures and deleting local fixtures. The local role and
  accounts were restored and reseeded. T-31 is complete on focused executable
  and browser evidence; the shared legacy test-harness defect remains recorded.
- The suite traceability checker remains red with 89 pre-existing structural
  findings: duplicate `JUR-ID-1`, missing accountable-owner metadata, one
  unbound localized-UI overlay, and unresolved architecture/security/
  observability identifiers. No verified-suite or traceability-clean claim is
  made by this documentation update.

- 2026-08-28 T-1: fresh PostgreSQL 16 migration, tenant isolation integration,
  lint, build, and independent security review passed.
- 2026-08-28 T-2: fresh PostgreSQL 16 applied migrations 0000–0002; seven
  integration assertions passed for lifecycle transitions, denial audit records,
  RLS attribution, and platform-role visibility. `pnpm lint` and `pnpm build`
  passed. Independent security review passed with no blocking/high finding.
- 2026-08-28 T-15: fresh PostgreSQL 16 applied migrations 0000–0006; ten
  integration assertions passed for active tenant/user/member authorization.
  Browser checks covered both public login entries, generic invalid credentials,
  successful email/password sign-in, authenticated tenant scope, and anonymous
  CMS redirects. `pnpm lint` and `pnpm build` passed with the required trusted
  proxy test contract. Independent security review passed.
- 2026-08-28 T-3: fresh PostgreSQL 16 applied migrations 0000–0007; private
  credential resolution precedence, platform fallback, tenant-admin-only
  configuration, and cross-tenant denial integration checks passed. `pnpm lint`
  and `pnpm build` passed. Independent security review passed.
- 2026-08-28 T-16: browser verified the static public page at desktop and
  mobile widths, its two login entry links, no operational controls/data path,
  one H1, no horizontal overflow, and 44px minimum interactive targets.
- 2026-08-28 T-4: fresh PostgreSQL 16 applied migrations 0000–0008;
  15 integration assertions proved draft persistence, immutable parties, input
  rejection, and cross-tenant outlet denial. Browser checks proved invalid
  server validation, PRG success, responsive layout, and a no-JavaScript
  submission. `pnpm lint` and `pnpm build` passed.
- 2026-08-28 T-5: CSV parser tests and a fresh PostgreSQL 16 integration
  suite (20 assertions) passed; the suite proved valid-row-only tenant draft
  persistence and tenant/actor import rate limiting. `pnpm lint` and
  `pnpm build` passed. Browser route access was not independently exercised
  because the local fixture session could not be authenticated.

- 2026-08-28 T-13: fresh PostgreSQL 16 migration through `0009`, contact
  directory integration assertions, `pnpm lint`, and `pnpm build` passed.
  Authenticated browser checks created a contact, added a second address, and
  searched/selected it from a draft with masked picker results. A contact edit
  between selection and save was server-re-resolved into the immutable party
  snapshot. Independent security review passed after the snapshot repair.

- 2026-08-30 T-7 through T-10, T-12, T-14, T-17, and T-18: focused
  integration evidence, lint/build, and independent reviews passed. Migrations
  `0011`–`0019` are additive and verified locally.
- 2026-08-30 T-11: hosted GitHub Actions run `33308954008` passed empty and
  representative migration upgrades, integration tests, lint, and build on
  commit `b737a874c51cad87c60839760e1bc48014608450`.

- 2026-08-29 T-6: one user-approved sandbox non-COD estimate returned HTTP
  200 and was captured only as a sanitized fixture. Migration `0010` persists
  immutable, tenant-scoped estimate snapshots and services. Fixture tests prove
  unsupported services are omitted, provider `price` is preserved without
  custom price calculation, absent/blocked COD support is unavailable, and
  re-estimates remain append-only. Fresh PostgreSQL 16 migration, 27 integration
  assertions, `pnpm lint`, `pnpm build`, and independent security review passed.
  The authenticated estimate panel could not be browser-exercised because no
  approved local authenticated fixture session was available; the protected
  route correctly redirected anonymous access to tenant login.

- 2026-08-30 T-19 through T-29: tenant shell, outlet settings, queue/detail,
  guarded fixture issuance/recovery, finance, membership governance, analytics,
  and platform lifecycle are complete. `pnpm test:integration` passed 29 files
  and 136 assertions; `pnpm lint` and `pnpm build` passed. Browser evidence at
  390px, 768px, and 1280px covered setup, issuance, recovery, finance, member
  governance, and provision/suspend/reactivate audit outcomes with no horizontal
  page overflow.
- 2026-08-30 demo login hint: local development login pages visibly show the
  seeded demo email and password only when `GERAICUAN_ENABLE_DEMO_LOGIN_HINT=1`
  and `DEV_LOCAL_PASSWORD` are set outside production. Browser evidence verified
  the tenant hint and zero horizontal overflow; `pnpm lint` passed.
- 2026-08-30 CMS visual refinement: initialized shadcn/Radix Nova with Tailwind
  v4 semantic tokens; added an accessible tenant shipment trend visualization
  while retaining its tabular detail; refreshed shared tenant/platform visual
  hierarchy, scope clarity, navigation icons, and narrow-table sticky leading
  columns. Independent UI review found and the final patch resolved token
  ownership, mobile-dialog semantics, visible skip-target focus, and sticky-cell
  state background preservation.
  An ephemeral isolated PostgreSQL 16 instance was migrated and seeded only with
  local verification fixtures. `pnpm test:integration` passed 29 files / 136
  tests; `pnpm lint`, `pnpm exec shadcn info --json`, and `pnpm build` passed
  with the isolated non-production environment.
  Authenticated browser evidence covered tenant draft creation, shipment
  analytics with chart/table/timezone semantics, the mobile drawer and keyboard
  skip link, and platform monitoring at 390px and 1280px. Each checked surface
  had zero horizontal page overflow. No provider order was submitted.
- 2026-08-30 local development runtime: `compose.yaml` now provides a
  persistent, localhost-only PostgreSQL 16 service and `pnpm db:seed-local`
  creates the local tenant and Super Admin fixtures. The documented local-only
  credentials are `tenant@geraicuan.com` and `super@geraicuan.com`; both use
  the password supplied as `DEV_LOCAL_PASSWORD`.
  The login pages use shadcn Input, Label, Button, and Alert primitives in a
  deliberately restrained, WordPress-like form-first layout: flat neutral
  canvas, compact 360px card, single wordmark, role-specific title/subtitle,
  local demo autofill, and a 44px return control. The form explicitly uses
  `POST` as its no-JavaScript fallback, so credentials are never placed in a
  query string. Local runtime origin settings now configure both Next.js
  `allowedDevOrigins` and Better Auth's exact trusted origin. Browser validation
  at the reachable development host confirmed authenticated Tenant redirect to
  `/app` and Super Admin redirect to `/platform`, with no password query
  parameter; `pnpm lint` passed.
- 2026-08-30 CMS shell unification: Super Admin now uses the shared
  `cms-shell`, responsive navigation, scope bar, account menu, typography, and
  page-surface rules already used by the tenant CMS. Scope-specific navigation
  remains server-authorized. Platform filter actions and tenant/platform status
  indicators use shadcn `Button` and `Badge` primitives; dashboard filters,
  cards, tables, pagers, and empty/error surfaces share the same semantic
  surface treatment. Browser evidence covered authenticated tenant draft and
  queue screens at 1280px, tenant mobile drawer at 390px, Super Admin overview,
  filter panel, mobile drawer, and audit table at 390px and 1280px. All checked
  documents had zero horizontal overflow; wide tables remained locally
  contained. `pnpm lint` and
  `pnpm exec vitest run --config vitest.integration.config.mts tests/cms-shell.integration.test.ts`
  passed (15 assertions).
- 2026-08-30 CMS review remediation: independent review caught and the final
  patch restored the tenant-to-Super-Admin redirect, so tenant principals never
  receive platform chrome or a misleading Super Admin badge. The platform
  filter actions now retain 44px targets and the outline treatment; mobile
  sticky table cells have an opaque surface while wide tables scroll locally.
  Browser verification confirmed tenant access to `/platform` redirects to
  `/login/super-admin` without platform chrome, platform filter actions measure
  44px, and document-level overflow is zero. `shadcn@4.19.0` is both installed
  and the current registry release; no package upgrade was necessary.
- 2026-08-30 CMS refinement pass: tenant layout now provides the sole
  `main#konten-utama` landmark; all child route wrappers are neutral containers,
  preventing nested landmarks while preserving their visual classes. Analytics,
  finance, reconciliation, and platform tenant lifecycle actions use shadcn
  `Button` with retained submit names/values, outline treatment, and 44px
  targets. Mobile wide tables keep an opaque, non-wrapping sticky reference
  column with matching hover state. Browser checks confirmed one main landmark,
  zero document overflow, 44px primary/outline filter actions, and the
  Super Admin provisioning action as a shadcn button. Print-media inspection
  confirmed `.cms-main` has `padding-top: 0px`, preserving the 100mm × 150mm
  label page origin. Independent review caught the print cascade and it was
  remediated before final `pnpm lint` and focused CMS-shell test passed
  (15 assertions).

T-30 and T-31 are complete. No implementation task is active. Deployment
remains an explicit approval gate.

## 2026-08-31 precision audit update

T-33 and T-34 are complete. Ringkasan, Analitik, and Keuangan now retain
explicit daily, historical, and authoritative-finance boundaries. Dashboard
outlet readiness and active-contact totals use canonical tenant-scoped reads;
the latest signed variance is isolated as a tenant-wide exception; and Finance
states which results do and do not follow its period/outlet filters.

The tenant shell now uses the canonical grouped navigation, a full labelled
Sidebar from 1024px, and a Sheet below 1024px. Contextual shipment/contact
routes retain truthful current locations and role filtering remains
server-derived. Outlet Settings, Import, Label index, and New Contact were
migrated to shared shadcn/native semantic composition. T-35 remains open because
Finance, Platform, shipment/contact detail, membership, and label detail still
contain legacy presentation classes.

Verification passed: 37 integration files / 171 tests, 21 focused shell tests,
8 focused semantic render tests, ESLint, TypeScript, `git diff --check`, and a
Next.js 16.3.3 production build. Authenticated browser checks at 390px, 768px,
and 1280px covered the four migrated pages with zero document overflow or
browser errors. The integration runtime-role harness was made password-safe and
the development fixtures were restored after the suite.

T-36 remains open on T-35 and the explicit production release boundary.
Production issuance/recovery is still fixture-only. No provider request,
production operation, commit, push, or deployment was performed.

## 2026-09-01 CMS precision and populated demo update

The authenticated CMS implementation now shares one width and rhythm contract:
the shell owns viewport gutters, while `PageContainer` selects the accepted
wide, data, standard, or form measure. The remaining Finance, Platform,
shipment, contact-detail, membership, settings, and label-detail surfaces use
shared shadcn composition or smaller accessible native controls; no migrated
legacy presentation class remains in their rendered JSX.

The local-only demo tenant now contains 15 contacts and 18 deterministic
shipments across draft, estimated, queued, unknown, issued, unpaid, and failed
states. It also includes sanitized estimate, COD, order, ledger,
reconciliation, and print-history fixtures. The seeder performs no provider
call, respects append-only financial records, and produced identical counts on
two consecutive runs.

Populated browser checks covered the tenant primary routes plus Finance and all
Platform routes at 390px, 768px, and 1280px. Document overflow and
console/runtime errors were zero after fixing the label-index table boundary;
wide tables remain locally scrollable. Verification passed 38 integration
files / 176 tests, ESLint, TypeScript, `git diff --check`, and a Next.js 16.3.3
production build with 17 static pages generated. T-35 stays open only for its
exhaustive non-populated and interaction-state browser matrix. T-36 remains
open for that dependency and the sanctioned production release boundary. No
provider request, production operation, commit, push, or deployment occurred.

## 2026-09-01 execution-queue decomposition

No implementation was performed in this planning pass. The remaining CMS
precision work is now decomposed in `TASKS.md` into T-37 through T-48. The queue
separates deterministic state fixtures, dashboard/analytics, shipment queue and
drafting, bulk import, contacts, labels, Finance, outlet settings, member
governance, Platform operations, and final cross-role navigation evidence.
Every task has one accepted primary requirement, explicit dependencies,
route/state scope, and a runnable Done-when contract. T-35 remains the parent
presentation milestone and may close only after T-37 through T-47; T-36 remains
the release-boundary gate and now also depends on the cross-role T-48 journey.

The queue is now OMP Goal Mode-ready: it includes a pasteable state-aware goal objective,
startup and approval gates, delivery-ledger boundaries, deterministic execution
order, per-task risk/capability/reviewer routing, allowed and protected change
surfaces, mandatory pre-edit and post-edit `designer`/`vision` critique, a
shared admin UI/UX rubric, browser evidence requirements, and independent
review rules and an explicit cross-screen consistency gate before T-35 can
close. Goal startup must always inspect live ledger state instead of trusting a
dated snapshot. At this update, T-40 has active run
`RUN-20260831T205737Z-20521568`; a resumed Goal must validate and continue that
immutable boundary rather than opening a competing run. It must not claim
retroactive PASS for any work outside the active boundary.

## 2026-09-01 T-41 bulk import completion

T-37 through T-41 are complete; T-42 is the next unblocked execution item.
Bulk import now authenticates and consumes its durable preview attempt before
file parsing, validates only configured tenant outlets, and returns signed
15-minute row envelopes bound to tenant, actor, submission, normalized input,
and row. Confirmation accepts only explicitly selected envelopes, sorts them
deterministically, and uses stable per-row UUIDs so exact replay creates one
semantic draft while tamper, mixed submission, duplicate row, expiry, and
cross-tenant/actor reuse fail closed.

The `/app/impor` surface now has route-specific loading/error focus, Admin
recovery for unconfigured outlets, a keyboard-operable 44px localized file
picker, field-linked errors, explicit zero-default row selection, local table
scrolling with sticky selection context, pending feedback, and direct return to
`/app/pengiriman?status=DRAFT`. Verification passed 4 focused files / 18 tests,
one disposable PostgreSQL file / 7 tests, TypeScript, targeted ESLint, and diff
checks. Authenticated Chromium passed at 390px, 768px, and 1280px with zero
document overflow, exact +1 draft creation from one selected row, and clean
console/runtime evidence. Independent designer, security, and correctness
reviews passed. No provider, production, commit, push, deploy, or release action
occurred. Initial run `RUN-20260831T214240Z-1a32142e` remains FAIL because its
immutable baseline omitted one pre-existing dirty overlap; corrective run
`RUN-20260831T221349Z-ffc85710` accepts and binds the complete verified surface.

## 2026-09-01 T-42 contact directory completion

T-37 through T-42 are complete; T-43 is the next unblocked execution item.
Contacts now use an authenticated POST search action so names and phone queries
do not enter the URL. Only masked phone values cross into directory client
state. Active and archived contacts are separately discoverable; archived
detail is read-only, while create, identity update, and address addition expose
field-linked validation, preserved values, pending state, and deterministic
success/failure focus. Archive remains Tenant-Admin-only with explicit URL
confirmation, focused cancel recovery, action-state failure, and success
presentation gated by the authoritative archived database state.

Repository enforcement now makes the 20-address cap concurrency-safe, rejects
all mutation of archived contacts, translates duplicate labels to a safe domain
error, preserves historical shipment-party snapshots, and keeps every read and
write tenant-scoped. Focused Server Action tests passed 8/8 and disposable
PostgreSQL tests passed 8/8. TypeScript, targeted ESLint, UI audit inventory,
and diff checks passed. Authenticated Chromium covered 390px, 768px, and 1280px
with local table scrolling, sticky name context, zero document overflow,
loading/error focus, actual create/update/address/archive journeys, safe
not-found state, and Operator restrictions. Independent designer, security,
and correctness reviews passed. Shared shell account-trigger sizing remains in
T-48. No provider, production, commit, push, deploy, or release action occurred.
Delivery-ledger run: `RUN-20260831T221534Z-a1314382`.

## 2026-09-01 T-43 label and physical print completion

T-37 through T-43 are complete; T-44 is the next unblocked execution item.
Label list/detail now expose route-owned loading, error, and not-found recovery,
focused invalid-filter feedback, local table scrolling with sticky context, safe
blocked-state recovery, bounded long-address disclosure, and truthful print
request feedback. Print attempts are append-only, tenant/actor/shipment scoped,
idempotent by stable attempt UUID, replay-safe across later lifecycle changes,
and serialized for contiguous sequences under concurrency.

Focused non-database verification passed 3 files / 23 tests and disposable
PostgreSQL 16 passed 1 file / 9 tests. TypeScript, targeted ESLint, UI audit
inventory, and diff checks passed. Authenticated Chromium covered 390px, 768px,
and 1280px with zero document overflow, blocked no-print behavior, exact +1
history, deterministic result focus, and clean console/provider evidence. A
fresh print-only browser session produced exactly one 100 × 150 mm PDF page
(282.96 × 425.04 pt), visually complete and without CMS chrome, clipping, or
extra whitespace/pages. Independent designer, security, and correctness reviews
passed. No provider, production, commit, push, deploy, or release action
occurred. Delivery-ledger run: `RUN-20260831T223741Z-d5e393a4`.
Corrective verification run `RUN-20260831T231708Z-6ebae831` records the complete
skill attribution, including `ui-validation`, after the original immutable
record captured only its first repeated argument.

## 2026-09-01 T-44 Finance workspace completion

T-37 through T-44 are complete; T-45 is the next unblocked execution item.
Finance is now Tenant-Admin-only before filter parsing or data access, with
URL-persisted and validated range/outlet/status/page state, exact variance-row
focus, truthful freshness and degraded states, and a decision hierarchy from
summary through variance, reconciliation, and append-only ledger evidence.

Reconciliation uses stable attempt UUIDs, exact replay, one coherent source and
ledger snapshot, and six atomic class pairs. Full adjustments append a reversal
without mutating the original row. Focused checks passed 4 files / 32 tests;
disposable PostgreSQL 16 passed 2 files / 5 tests; TypeScript, targeted ESLint,
inventory, and diff checks passed. Authenticated Chromium proved focused daily
and monthly outcomes, reload/Back filter persistence, local scrollers, sticky
context, and zero document overflow at 390px, 768px, and 1280px without a
provider request. Independent designer, security, and correctness reviews
passed. Shared account-trigger sizing remains T-48. No provider, production,
commit, push, deploy, or release action occurred. Delivery-ledger run:
`RUN-20260831T231804Z-61655f17`.

## 2026-09-01 T-45 outlet readiness completion

T-37 through T-45 are complete; T-46 is the next unblocked execution item.
Outlet settings now authenticate before input/read, preserve safe failed values,
focus deterministic outcomes, and expose a read-only connection source that
cannot create, repair, overwrite, or downgrade private secret references.
Actual pickup/origin changes lock the outlet, treat identical replay as a no-op,
and append one redacted tenant-bound audit event.

Canonical readiness now controls Settings, Ringkasan, shipment creation, bulk
import, and the draft write guard. Private-attention outlets remain blocked until
trusted server-side provisioning repairs them. Focused checks passed 3 files /
28 tests; fresh PostgreSQL 16 migrations 0000–0022 and 2 files / 14 tests passed;
TypeScript, targeted ESLint, inventory, and diff checks passed. Authenticated
Chromium passed success/invalid focus, value retention, draft handoff, all
settings scenarios, Admin discovery, Operator denial, and responsive checks at
390px, 768px, and 1280px with no overflow, credential sentinel, or provider
request. Independent designer, security, and correctness reviews passed. Shared
tablet shell behavior remains T-48. No provider, production, commit, push,
deploy, or release action occurred. Delivery-ledger run:
`RUN-20260901T001550Z-d5289561`. Initial run
`RUN-20260831T235917Z-aba50484` remains FAIL because its immutable baseline
could not retroactively accept the required schema/consumer scope expansion;
the corrective run accepts the complete already-verified surface.
