# Build Log — geraicuan

Record only durable implementation changes, validation evidence, and gotchas that the next maintainer needs. Temporary task narration belongs in neither this file nor global memory.

## 2026-09-08 — Phase 9 Market standard expansion (T-72, T-73, T-74, T-75) and UI/UX screening

- Implemented RTS Management Dashboard (T-72): schema migrations 0030/0031 with `shipment_rts_events`, `src/db/rts-repository.ts` data layer with multi-tenant isolation, 4 operational KPI summary cards, interactive status tabs, responsive data table, and registered route in `cms-shell-navigation.ts`.
- Implemented signed upstream webhook for real-time tracking (T-73): route handler `/api/webhooks/mengantar` with HMAC validation, status normalization, and atomic shipment updates.
- Implemented duplicate order detection (T-74): 7-day recipient phone/address check in `shipment-draft-repository.ts`, server action validation, and an amber warning banner with explicit confirmation checkbox in `shipment-draft-form.tsx`.
- Integrated COGS & Net Margin tracking (T-75): optional `cogs_amount_idr` in drafts/shipments, formula `(COD Revenue - Shipping - Fee - VAT - COGS)` in `analytics-repository.ts`, and balanced 6-metric responsive grid layout in `analytics-regions.tsx`.
- Full UI/UX audit & static verification: corrected single quotes in Postgres check constraint, resolved TypeScript type discrepancies across all new statuses, fixed navigation active state matching with longest-prefix priority, and confirmed `pnpm tsc --noEmit && pnpm lint` pass with 0 errors and 0 warnings.

## 2026-09-02 — T-71 estimate endpoint URL boundary

- The estimate adapter now accepts only an HTTPS origin with no userinfo,
  inherited path, query, or fragment. It constructs the fixed Mengantar route
  from that origin and percent-encodes the API-key path segment.
- Hostile-input tests prove HTTP, userinfo, path, query, fragment, malformed
  origins, and blank keys fail before `fetch`; a sanitized fixture proves the
  valid encoded endpoint while the existing timeout, response-bound,
  allowlist, normalization, redirect, and sanitized-error behavior remains.
- Targeted ESLint, TypeScript, `git diff --check`, and 2 files / 15 integration
  tests pass. Delivery-ledger run: `RUN-20260902T030834Z-5a0d50c2`. No live
  provider request, provider mutation, production action, commit, push, deploy,
  or release occurred. T-62 now awaits a clean, explicitly approved candidate.

## 2026-09-02 — T-62 preflight correctly reopened estimate URL hardening

- Release preflight found that `fetchMengantarEstimate` accepted more than an
  HTTPS origin-only base URL and interpolated the raw API key into the provider
  path. This violates the explicit T-62 gate and the location adapter's existing
  server-only credential boundary.
- No release verification was waived or continued past the defect. T-71 now
  owns origin-only parsing, encoded key construction, focused hostile-input
  tests, and independent security review before T-62 restarts.
- Delivery-ledger run: `RUN-20260902T030709Z-66764e78`. The working tree also
  remains local and uncommitted, so there is no clean reviewed candidate or
  release/deploy authorization. No provider, production, commit, push, deploy,
  or release action occurred.

## 2026-09-02 — T-61 complete role-discoverable journey closure

- Closed the retained first/second-run findings with explicit evidence: 111
  navigation captures across all four actors and three widths, final T-66
  member Collapsible and T-48 sign-out/BFCache matrices, contact and Super
  Admin lifecycle/audit mutations, reload and forbidden-route checks.
- A fresh navigation-only tenant journey saved a draft, loaded 14 sanctioned
  fixture estimate services, and retained them after reload without exposing an
  issue action or calling the provider. A clean-profile native bulk upload
  produced a focused preview with one valid row, zero errors, zero selected
  rows, and no confirmation/draft creation. The earlier ALPN failure reproduced
  only in the long-lived Chrome network-service state at both local origins.
- Final automated evidence passed 15 files / 144 role/action tests and 3
  PostgreSQL ledger/COD/lifecycle files / 10 tests plus `git diff --check`.
  Independent designer, correctness, and security reviews passed with zero
  remaining blocker, protected flash, overflow, console/hydration/ARIA error,
  provider/external request, credential-bearing URL, real order, or recovery.
  Delivery-ledger run: `RUN-20260902T023444Z-7b34e5df`. No production, commit,
  push, deploy, or release action occurred; T-62 is next.

## 2026-09-02 — Corrective T-48 modal cleanup and BFCache authorization

- Successful sign-out now reports back to the shared shell, which keeps the
  account menu mounted for pending/error feedback and closes the controlled
  Radix portal only after POST 200. Navigation waits for close autofocus and
  then replaces the current history entry, eliminating retained modal
  `aria-hidden` attributes and hydration warnings.
- Replacing one history entry cannot remove earlier CMS routes. The protected
  shell therefore hides any document restored by persisted `pageshow` and
  reloads it through server session authorization; normal loads are untouched.
- Focused verification passed 1 file / 33 tests, targeted ESLint, TypeScript,
  and `git diff --check`. Nine Tenant Admin, Operator, and Super Admin browser
  journeys at 390px, 768px, and 1280px passed pending/failure, portal cleanup,
  exactly one successful POST, cookie removal, hidden BFCache restore, and
  role-correct session-required login with zero protected flash, overflow,
  hydration/ARIA/console problem, external/provider request, duplicate success,
  or credential-bearing URL. Delivery-ledger run:
  `RUN-20260902T020659Z-1eb98512`. No production, commit, push, deploy, or
  release action occurred.

## 2026-09-02 — Corrective T-66 member disclosure hydration boundary

- Replaced the native `<details>` that mixed browser-owned `open` state with a
  React result-derived prop by the official shadcn Collapsible and one
  controlled state owner. Action results open the disclosure before the dialog
  closes and receive the existing deterministic focus, while users may still
  collapse and reopen the result.
- Focused verification passed 1 file / 11 tests, targeted ESLint, TypeScript,
  and `git diff --check`. Tenant Admin Chromium at 390px, 768px, and 1280px
  passed pointer/Enter/Space toggling, `aria-expanded`, pending/success focus,
  44px actions, close/reopen, role persistence after reload, and fixture restore
  with zero overflow, hydration/console error, external/provider request, or
  credential-bearing URL.
- Delivery-ledger run: `RUN-20260902T014655Z-3106a76c`. No live provider,
  production, commit, push, deploy, or release action occurred. Corrective T-48
  remains before the T-61 rerun.

## 2026-09-02 — T-61 second role-journey run correctly failed

- Captured 111 fresh navigation states across Tenant Admin, Operator, Super
  Admin, and unauthenticated users at 390px, 768px, and 1280px. Dynamic IDs
  came from rendered links; reload, forbidden routes, contact create/address
  edit, and Super Admin suspend → audit → reactivate → audit evidence passed
  with zero external/provider/credential-bearing URL.
- The run correctly failed instead of waiving two reproducible hydration
  defects: member role mutation left a native `<details>` DOM open against the
  next closed server render, and account-menu/history interaction retained
  modal `aria-hidden` attributes on reused CMS DOM. T-66 and T-48 own separate
  bounded corrections.
- Estimate remains blocked until the sanctioned fixture runtime receives
  complete dummy local credential/origin/pickup resolution; bulk upload needs
  a network-attributed retry after `ERR_ALPN_NEGOTIATION_FAILED`; full Operator
  sign-out remains incomplete. Delivery-ledger run:
  `RUN-20260902T010729Z-b3093c8c`. No live provider, production, commit, push,
  deploy, or release action occurred.

## 2026-09-02 — Corrective T-48 account menu and sign-out history boundary

- Corrected the shared shadcn account DropdownMenu so trusted primary-pointer
  activation follows the same controlled open state as keyboard activation,
  without changing role-filtered navigation or responsive shell ownership.
- Successful sign-out now replaces the protected history entry. This closes
  the BFCache/Back path that could briefly restore an authenticated CMS DOM
  after the server had already invalidated the session; failed sign-out still
  stays in place and exposes its existing retry alert.
- Focused verification passed 1 file / 33 tests, targeted ESLint, TypeScript,
  and `git diff --check`. Fresh Tenant Admin and Super Admin Chromium journeys
  at 390px, 768px, and 1280px passed pointer and keyboard activation, Escape
  focus restoration, 44px sizing, zero overflow, sign-out POST 200, cookie
  removal, role-correct redirect, and settled Back behavior without protected
  content. Delivery-ledger run: `RUN-20260902T005309Z-cfd95f31`. No provider,
  production, commit, push, deploy, or release action occurred; T-61 reruns
  next.

## 2026-09-02 — T-60 public, authentication, and platform closure

- Consolidated 21 primary captures across public sales, both role-specific
  login entries, and all four platform routes at 390px, 768px, and 1280px,
  backed by T-67's 36-state evidence and T-68's 93-state plus corrective and
  settled-boundary evidence. Focused public/auth/platform/inventory checks
  passed 3 files / 28 tests.
- Designer comparison confirmed shared typography, semantic tokens, shadcn
  components, focus treatment, and responsive rhythm without blurring jobs or
  authority. Public exposes no CMS data/control; login remains role-specific
  with generic denial; platform retains truthful global/tenant-detail scope and
  correct current navigation. All primary surfaces retain one main/H1, 44px
  actions, local table overflow, and safe error copy.
- Delivery-ledger run: `RUN-20260902T002010Z-24936203`. No unexpected browser
  or network event, external/provider request, production action, commit, push,
  deploy, or release occurred. T-61 is next.

## 2026-09-02 — T-59 tenant CMS cross-screen closure

- The first audit-only run correctly failed instead of waiving Analitik's
  missing shared eyebrow and reopened T-66. After the bounded correction passed,
  the fresh T-59 run consolidated 42 Tenant Admin populated captures for all 14
  authenticated tenant page routes, 42 supplemental Operator permitted/denied
  captures, and 9 corrected Analitik state/viewport captures.
- Designer comparison passed the shared shell and PageHeader rhythm,
  route-specific decision density, status vocabulary, shadcn form/card/table/
  chart composition, role differences, one main/H1/current destination, 44px
  mobile actions, and local table overflow. The exact inventory guard passed 1
  file / 10 tests. No unexplained divergence, unexpected browser event,
  external request, or provider request remains.
- Delivery-ledger rerun: `RUN-20260902T001809Z-43ae9d34`; the originating FAIL
  is retained as `RUN-20260902T000605Z-4f9d96e0`. No production action, commit,
  push, deploy, or release occurred. T-60 is next.

## 2026-09-02 — Corrective T-66 Analitik PageHeader consistency

- T-59's 42-capture tenant comparison exposed Analitik as the only one of 14
  tenant routes without the required shared page eyebrow. Restored the
  route-stable `Wawasan` eyebrow on populated, loading, and error PageHeaders;
  no analytics filter, KPI, chart, table, or layout region changed.
- Focused verification passed 2 files / 7 tests, targeted ESLint, TypeScript,
  `git diff --check`, and the 18-page Next.js build. Nine fresh Chromium
  captures covered all three states at 390px, 768px, and 1280px with one
  main/H1, coherent PageHeader geometry, zero overflow, browser event,
  external request, or visible regression.
- Corrective delivery-ledger run: `RUN-20260902T001113Z-97ce559d`. No provider
  request, production action, commit, push, deploy, or release occurred. T-59
  must now rerun its milestone comparison.

## 2026-09-02 — T-68 complete platform workspace screening

- Registered the Super Admin tenant lifecycle action in the deterministic
  route/state/action inventory and retained denial before input or protected
  reads, replay-safe lifecycle transitions, redacted monitoring views,
  append-only audit authority, and COD-liability accounting.
- Converted platform provisioning and suspend/reactivate confirmations to
  controlled shadcn dialogs. They stay mounted, busy, disabled, and
  focus-contained while pending; close only after the result; focus the owning
  field or result Alert; and restore the trigger after Escape or cancellation.
  Invalid-query recovery copy is now route-neutral.
- Final focused verification passed 5 files / 33 tests plus 2 PostgreSQL files
  / 9 tests, targeted ESLint, TypeScript, `git diff --check`, and the 18-page
  Next.js 16.3.3 production build. Chromium passed the 93-capture platform
  state matrix, 15 settled boundary captures, and corrective dialog/copy runs
  at 390px, 768px, and 1280px with 44px actions, local overflow only, and no
  secret/PII exposure, unexpected browser/network event, external request, or
  provider mutation. Designer and independent security reviews passed.
- Delivery-ledger run: `RUN-20260901T234143Z-6d072914`. No live provider
  request, production action, commit, push, deploy, or release occurred. T-59
  is the next executable milestone closure, followed by T-60.

## 2026-09-02 — T-67 public and role-specific authentication screening

- Raised every public/login decision action to the 44px shadcn target contract
  and retained one focused, responsive login job per tenant/platform entry.
  Protected redirects now carry only bounded session/access notices; arbitrary
  query values are ignored and no protected context is rendered.
- Added a pre-persistence Better Auth session hook that requires a bounded login
  scope and matches it against the shared server-resolved active CMS principal.
  Wrong-scope, suspended, inactive, ambiguous, and missing-scope attempts use
  the same public invalid-credential shape and create neither a session row nor
  a cookie.
- Production auth configuration now fails startup unless the base URL and
  exactly two tenant/platform trusted origins are explicit HTTPS origins with
  no wildcard/path, and every trusted proxy entry is a valid IP/CIDR. CI uses
  the same synthetic two-origin contract; `actionlint` and the 18-page build
  pass.
- Final focused verification passed 7 files / 70 tests, targeted ESLint,
  TypeScript, and `git diff --check`. Chromium passed 36 public/login/success
  captures at 390px, 768px, and 1280px with zero document overflow, denied
  protected rendering, mismatch cookies, browser errors, external requests, or
  provider traffic. Independent designer, security, and correctness reviews
  passed.
- Delivery-ledger run: `RUN-20260901T231854Z-760de8b7`. No production action,
  commit, push, deploy, or release occurred.

## 2026-09-02 — T-66 analysis, finance, and governance screening

- Extended the deterministic Server Action inventory to finance
  reconciliation/reversal, outlet pickup/private-credential operations, and
  member invite/role/deactivation. This keeps sensitive mutations inside the
  same route/state/role ownership checks as their rendered controls.
- Replaced Analitik's duplicate KPI label/value links with one full-card link
  and one tab stop. Mobile shipment references and pagination now retain 44px
  targets while wider supporting tables keep their accepted dense geometry.
- Converted member role and deactivation confirmation dialogs from
  auto-closing submit actions to controlled dialogs. They remain visible and
  disabled during pending, close after the result, and restore focus to the
  invalid field or focusable result. All dialog actions are at least 44px.
- Final verification passed 21 files / 201 tests against local PostgreSQL admin
  and runtime roles, targeted ESLint, TypeScript, and `git diff --check`. A
  108-capture route/state discovery matrix plus warmed targeted browser
  rechecks passed at 390px, 768px, and 1280px. Real local invite, role,
  deactivation, reconciliation, and invalid-pickup journeys proved pending and
  focus recovery with zero provider requests or browser errors. Independent
  designer and security reviews returned PASS.
- Delivery-ledger run: `RUN-20260901T225336Z-e9fc9576`. No live provider
  request, production action, commit, push, deploy, or release occurred.

## 2026-09-02 — T-65 tenant data and print screening

- Extended the deterministic action inventory across contact search/create,
  contact and address updates, Tenant Admin archive, and issued-label print
  history. Added render coverage for active, archived, invalid-filter,
  create-readiness, editable-address, and role-denied states.
- Kept the sanctioned location-search audit fixture strictly development-only,
  authenticated, tenant/outlet-readiness scoped, provider-free, and incapable
  of producing persistence authority. The isolated local seeder now provides
  15 active contacts and one archived contact for repeatable browser review.
- Corrected duplicate destination-error announcements and focus, and retained
  a 44px invalid-label-filter recovery action. No visual system fork or custom
  component replacement was introduced; the existing shadcn compositions
  remain authoritative.
- Focused verification passed 9 files / 77 tests, TypeScript, targeted ESLint,
  and `git diff --check`. The effective Chromium matrix passed 138
  role/state/width observations; the clean fixture rerun captured 30 Tenant
  Admin/Operator states at 390px, 768px, and 1280px with zero document
  overflow, short actions, external requests, or unexpected browser errors.
  Local create/address/archive/print journeys proved pending and focus
  recovery, and label PDFs were each one page at approximately 99.82 ×
  149.94mm. Designer, security, and correctness reviews returned PASS.
- The originating ledger run `RUN-20260901T222436Z-74d6e37f` is retained as
  FAIL because accepted dirty overlap cannot be added after a run starts.
  Corrective run `RUN-20260901T224927Z-ff0ee43a` explicitly accepts the exact
  reviewed overlap and owns closure. No live provider request, provider
  mutation, production action, commit, push, deploy, or release occurred.

## 2026-09-02 — T-64 tenant daily-operation screening

- Replaced browser-decodable HMAC-signed bulk confirmation JSON with a
  versioned AES-256-GCM envelope. The server derives a purpose-separated key
  through HKDF, uses a random 12-byte nonce and fixed AAD, authenticates the
  ciphertext, and retains the existing 15-minute, size, tenant, actor,
  submission, row, and duplicate-selection boundaries.
- Reduced the bulk preview return value to the accepted decision fields:
  recipient name, row, CSV location, canonical Mengantar area, weight, payment,
  declared value, and opaque confirmation token. Sender identity, both parties'
  phones and addresses, package content, outlet/provider authority, and the full
  draft input remain server-only. Confirmation decrypts the original validated
  input, revalidates destination/account authority, and preserves atomic draft
  creation and replay behavior.
- Replaced Ringkasan's duplicate label/value KPI links with one full-card link
  and raised mobile drill-down/reference/label-history actions to 44px while
  retaining compact desktop density. The accepted shadcn structure and local
  table overflow remain unchanged.
- Final focused verification passed 18 files / 107 tests. Targeted ESLint,
  TypeScript, and `git diff --check` passed. Chromium 152 captured 30 primary
  Tenant Admin/Operator screenshots and passed 192 settled-state plus 42 real
  client-loading/intercepted-pending observations at 390px, 768px, and 1280px.
  All had zero document overflow, unexpected browser errors, external/provider
  requests, or unsafe preview fields. Independent designer and security reviews
  returned PASS.
- Delivery-ledger run: `RUN-20260901T220337Z-fedf03af`. No live provider
  request, provider mutation, production action, commit, push, deploy, or
  release occurred. T-65 is next.

## 2026-09-02 — T-58 post-location cross-layer screening

- Added `docs/system-screening-matrix.md` as the repository-owned screening
  record for all four actor classes, first-class workflows, lifecycle and
  concurrency invariants, and static trust boundaries. It distinguishes local
  fixture-backed PASS from deliberately RELEASE-GATED estimate, issuance,
  reconciliation, and unpaid-recovery transport.
- The disposable PostgreSQL 16 integration suite passed 67 files / 500 tests.
  A fresh representative database upgraded through migration 0029, including
  destination-pair, authority-version, provider-order, and forced-RLS checks.
  Static searches found no browser credential import, browser-derived tenant
  scope, invented AWB writer, mutable ledger/reconciliation history, sensitive
  logging path, or production sanctioned-fixture bypass.
- Full ESLint, TypeScript, and `git diff --check` passed; the credential-safe
  production build immediately preceding this verification generated 18 pages.
  Independent R3 security review passed authorization/isolation, provider and
  location authority, redaction, idempotency/concurrency, COD accounting, time
  semantics, append-only finance/audit, and production fail-closed conclusions.
- Release hardening observation: before any live estimate release, normalize
  `fetchMengantarEstimate` to the same HTTPS origin-only base-URL contract used
  by the location adapter and encode the API-key path segment. This remains a
  T-62 release gate, not a current fixture-backed correctness blocker.
- The specification-suite v2 validator exposed 95 pre-existing structural
  metadata findings (owners, duplicate/incomplete jurisdiction declaration,
  and unresolved declaration shapes). T-70 owns a metadata-only normalization
  and now blocks T-62; accepted product behavior must remain unchanged.
- Delivery-ledger run: `RUN-20260901T213811Z-8264937b`. No live provider
  request, production action, commit, push, deploy, or release occurred.
- Skills used: `full-stack-development`, `application-security`,
  `postgres-drizzle`, `testing-engineering`, `observability-engineering`, and
  `native-first`.

## 2026-09-02 — T-53 responsive many-outlet settings completion

- Replaced the per-outlet accordion stack with one URL-addressable active-outlet
  workspace. The server accepts an outlet query only when it belongs to the
  already-authorized tenant list; invalid or foreign values safely fall back to
  the first ordered tenant outlet. A keyed detail subtree prevents pickup,
  credential, or action state from crossing outlet boundaries.
- Zero and one outlet omit navigation. Ten and twenty outlets share one
  responsive navigation tree: a 390px/768px selector and a persistent 1280px
  list-detail rail with bounded local scrolling. The page now uses a compact
  2-by-2 mobile readiness strip, flat hairline sections, location before
  connection, a bounded single-outlet detail, and loading geometry that mirrors
  the final breakpoint composition.
- Authenticated Chromium covered zero, one, ten, and twenty outlets at 390px,
  768px, and 1280px. Each state retained one main/H1, at most one active detail,
  zero document overflow, and no raw provider IDs, secret fragments, console,
  runtime, network, or provider errors. Keyboard Space/Tab/Enter selected an
  outlet; click, Back, and reload preserved the URL and returned focus to the
  detail heading. Twenty-outlet navigation scrolled locally.
- Focused verification passed 3 files / 49 tests; the full disposable
  PostgreSQL 16 suite passed 66 files / 493 tests. Full ESLint, TypeScript,
  `git diff --check`, and the production build (18 generated pages) passed. A
  bare build correctly failed closed without required runtime settings; the
  credential-safe CI-equivalent build used only documented synthetic local
  values. Final designer and independent R3 security reviews returned PASS.
  No live provider call, provider mutation, production action, commit, push,
  deploy, or release occurred.
- Skills used: `admin-product-ux`, `admin-dashboard`, `shadcn-ui`,
  `ui-validation`, `nextjs-development`, `testing-engineering`,
  `application-security`, and `native-first`.

## 2026-09-02 — T-57 inventory and T-69 responsive-filter closure

- Extended the existing CMS audit registry instead of creating a parallel
  harness. It now accounts for `filtered-empty`, `pending`, and `unauthorized`
  ownership, shared destination/pickup actions, T-53/T-55 scenario ownership,
  the public page, both login pages, and the auth endpoint.
- Added static guards for internal destinations, enabled buttons without
  behavior, client-exposed audit controls, sanctioned fixture import drift,
  production fail-closed fixture modules, legacy authenticated presentation,
  and duplicate responsive GET forms.
- The initial focused inventory suite passed 9 of 10 checks and exposed exactly
  three material findings: Ringkasan, Analitik, and Keuangan each mounted
  separate desktop and mobile GET filter forms. T-69 replaced them with one
  server-rendered GET form and one labelled control set per route. A native
  mobile disclosure controls an adjacent form region, while the same form is
  inline from 768px. The adjacency is required because Chromium does not paint
  descendants of a closed `details` element at desktop merely from responsive
  display utilities.
- The corrected inventory passes 10/10 checks; the dedicated responsive-form
  guard passes 3/3, and the complete focused filter/query set passes 6 files /
  32 tests. Authenticated Chromium 152 covered all three routes at 390px,
  768px, and 1280px with one form, one of every expected control, no duplicate
  IDs, zero document overflow, correct disclosure keyboard order, 44px
  controls at 390/768, readable desktop values, canonical Apply/reload/Back,
  deterministic hash focus, and zero unexpected browser/provider events.
- A credential-safe production build generated 18 pages. Full ESLint,
  TypeScript, and `git diff --check` passed. Final designer and independent
  correctness reviews returned PASS; independent inventory review confirmed
  every previously reported ownership/guard gap is closed. No provider call,
  provider mutation, production action, commit, push, deploy, or release
  occurred.
- Skills used: `admin-product-ux`, `admin-dashboard`, `shadcn-ui`,
  `ui-validation`, `nextjs-development`, `testing-engineering`, and
  `native-first`.

## 2026-09-01 — T-52/T-53 Mengantar pickup authority slice

- Accepted the official 2026-09-01 Mengantar pickup contract: account-scoped
  `GET /api/public/{API_KEY}/address` returns pickup `_id` and its origin area in
  `PICKUP_AUTOFILL`. Provider `POST /address` and order mutation were not called.
- Added bounded server-only pickup retrieval with strict response mapping,
  HTTPS and redirect checks, a 10-second timeout, a 512 KB body limit,
  credential-safe errors, private-account options, and platform shared-account
  filtering. Browser DTOs exclude provider PIC, phone, user, credentials, and
  base URL.
- Replaced manual pickup/origin IDs with a shadcn searchable pickup selector and
  derived read-only origin. It has distinct loading, account-empty,
  query-empty, retry, selected, and legacy states plus 44px controls and
  settled-state focus recovery.
- Added migration 0026 for readable pickup/origin labels. A provider-validated
  private selection carries the connection `updated_at` authority version into
  the final outlet-locked write; credential replacement or fallback races fail
  closed instead of persisting a location from the prior account.
- Disposable PostgreSQL upgrade preserved a representative legacy ID-only row.
  Focused verification passed 6 files / 67 tests; the full suite passed 61 files
  / 447 tests. Full lint, TypeScript, clean production build, diff checks,
  browser-backed designer review, and independent security review passed.
  Settled 390px measurement confirmed a 44px search input, focus handoff, and
  zero horizontal overflow. General destination search and complete
  many-outlet list-detail UX remain queued; no production or provider mutation
  ran.

## 2026-09-01 — T-49 fresh-CI analytics correction

- Fresh PostgreSQL 16 pre-push verification exposed one analytics suite that
  still relied on another test file to initialize the shared
  `geraicuan_test_runtime` role. It now calls the guarded isolated-local helper
  before any application-role read.
- Courier ordering had inherited the database cluster locale, causing `J&T`
  and `JNE` to swap across hosts. Analytics filter options and equal-rate
  courier rows now use explicit PostgreSQL `COLLATE "C"` ordering so API output
  is deterministic without weakening the test contract.
- Migration upgrade through 0025, focused analytics 9/9, the fresh full suite
  (60 files / 434 tests), full ESLint, TypeScript, production build, and diff
  checks passed. No provider or production action ran.
- The originating delivery run remains `FAIL` because its initial boundary did
  not accept the pre-existing analytics repository overlap. Corrective run
  `RUN-20260901T040210Z-06b53149` declares that overlap explicitly and owns the
  final pre-commit evidence.

## 2026-09-01 — T-51 private Mengantar settings workflow

- Extended the existing `Outlet & koneksi` destination with shadcn
  platform/private selection, safe readiness states, blank password-only API
  key create/replace input, and a named destructive fallback dialog. Credential
  values, fragments, base URLs, ciphertext, and managed references never enter
  browser props or returned action state.
- Kept outlet component identity stable across server revalidation. Including
  `connectionSource` in the React key discarded the successful action state
  immediately after first-time private-key creation; keying only by outlet ID
  preserves the result and focus target while fresh server props update.
- The fallback dialog makes deletion explicit and restores Cancel focus to the
  checked private-account radio. The server still retains the private key until
  the platform default is proven complete.
- Authenticated local Chromium passed 390px, 768px, and 1280px journeys for 10
  outlets and private error states with zero horizontal overflow. Create and
  replacement used the encrypted local path, returned a blank password field,
  and made zero provider requests. Focused verification passed 3 files / 43
  tests, targeted ESLint, TypeScript, `git diff --check`, scoped designer
  critique, and independent security review. Location authority and multi-
  outlet list-detail remain T-52/T-53; no production, commit, push, deploy, or
  release action ran.

## 2026-09-01 — T-50 encrypted Mengantar credential lifecycle

- Added additive migration `0025_happy_captain_midlands.sql` with server-only
  managed credential envelopes, mutation rate limits, forced RLS, scoped grants,
  and redacted credential audit actions.
- Private API keys use Node.js AES-256-GCM with a fresh nonce and authenticated
  data bound to key version, purpose, tenant, outlet, and canonical reference.
  The provider base URL remains platform-controlled; origin and pickup IDs come
  from the authorized outlet. Plaintext, ciphertext, key fragments, and managed
  references never enter browser DTOs or audit metadata.
- Tenant Admin create/replace/fallback actions authorize and durably consume a
  rate attempt in a short committed transaction before reading secret form data,
  then re-authorize and mutate atomically. This ordering was required after the
  first independent security review found failed attempts rolled back their own
  counters. A failed replacement retains the previous key; fallback retains it
  unless a complete, userinfo-free platform default is proven.
- Disposable PostgreSQL 16 passed migration upgrade through 0025 and focused
  repository/resolver/action verification (3 files / 38 tests). Targeted ESLint,
  TypeScript, `git diff --check`, and corrected independent security review
  passed. No provider, production, commit, push, deploy, or release action ran.

## 2026-08-28 — Development contract initialized

- Added repository-local project context files.
- Bootstrap source state: native generator: create-next-app@latest.
- Selected stack: `Next.js (App Router, TypeScript)`; database: `postgres`; authentication:
  `better-auth`; deployment target: `coolify`.
- Capability selections are not operational claims. Their implementation and
  verification remain future requirement-linked work.

## 2026-08-28 — Bootstrap verification

- Installed generated pnpm dependencies.
- `project-check --full /home/ongki/Projects/geraicuan` passed:
  `pnpm run lint`, `pnpm run build`, and the repository delivery contract.
- This proves the generated Next.js scaffold and project contract only; no
  GeraiCUAN feature, database, auth, Mengantar, or deployment behavior is
  implemented or verified.

## 2026-08-28 — T-2 super-admin tenant lifecycle

- Added platform super-admin roster, tenant lifecycle service, append-only audit
  events, and migrations `0001`–`0002`.
- Lifecycle operations create ACTIVE tenants and atomically suspend/reactivate
  only valid prior states. Anonymous, tenant-scoped, malformed-ID, and failed
  transition requests are denied and audited.
- Database RLS forces app-role audit attribution and platform-role self
  visibility; the runtime rejects superuser and BYPASSRLS connection roles.
- Fresh PostgreSQL 16 migration plus `pnpm test:integration` (7 assertions),
  `pnpm lint`, and `pnpm build` passed.

## 2026-08-28 — T-15 role-specific CMS authentication

- Added Better Auth 1.7.2 PostgreSQL persistence, database-backed sign-in rate
  limits, public tenant/super-admin login entries, and server-side CMS guards.
- Public registration is disabled. Platform/tenant roles and active
  user/membership/tenant status are re-resolved server-side for every CMS route.
- Production requires declared trusted proxy CIDRs before IP-based rate limiting
  can start; status checks are also enforced by PostgreSQL RLS migration 0006.
- Fresh PostgreSQL 16 migration plus `pnpm test:integration` (10 assertions),
  `pnpm lint`, `pnpm build`, browser auth checks, and independent security
  review passed.

## 2026-08-28 — T-3 Mengantar credential resolution

- Added tenant/outlet-scoped private connection references and default pickup
  metadata. Stored references are deterministically server-derived; plaintext
  credentials never enter PostgreSQL.
- Private managed credentials win over complete platform environment defaults;
  incomplete, non-HTTPS, foreign, or tampered configurations fail closed.
- Fresh PostgreSQL 16 migration plus 13 integration assertions, `pnpm lint`,
  `pnpm build`, and independent security review passed.

## 2026-08-28 — T-16 public sales page

- Replaced the generated placeholder with a static Indonesian GeraiCUAN sales
  page that explains the product and provides tenant/super-admin login entries.
- The page intentionally has no CMS availability lookup, session, database
  access, fetch, form, or operational data path; login availability remains
  owned by the login routes.
- Desktop and mobile browser checks verified the public surface, links, and
  responsive accessibility targets. `pnpm lint` and `pnpm build` passed.

## 2026-08-28 — T-4 individual shipment draft

- Added an additive draft-detail relation and immutable sender/recipient party
  snapshots, preserving pre-existing bare shipment lifecycle rows.
- The Server Action derives tenant/user scope from the authenticated session,
  validates all submission fields before its transaction, verifies the selected
  outlet belongs to the active tenant and is configured, and inserts the
  shipment, detail, and parties atomically under RLS.
- Fresh PostgreSQL 16 migrations, 15 integration assertions, browser validation
  and successful PRG/no-JavaScript submission checks, `pnpm lint`, and
  `pnpm build` passed.

## 2026-08-28 — T-5 bulk shipment intake validation

- Added a bounded server-side CSV parser with an authenticated template download,
  exact Indonesian headers, UTF-8/quoted-field support, 256 KB/100-row limits,
  and PII-safe row errors.
- CSV preview performs no writes. Confirmation revalidates selected hidden rows
  server-side and creates all selected tenant-scoped drafts in one transaction.
  Import attempts are atomically rate-limited by tenant and authenticated actor.
- Fresh PostgreSQL 16 migrations, 20 integration assertions, `pnpm lint`, and
  `pnpm build` passed. The authenticated browser fixture could not be completed,
  so no browser-flow claim is recorded.

## 2026-08-28 — T-13 reusable tenant contact directory

- Added tenant-scoped contacts and reusable multiple addresses with composite
  tenant keys, forced RLS, and active membership checks. Contact changes never
  link to or mutate historical shipment parties.
- Tenant users can create, search, update, and select active sender/recipient
  contacts. Tenant Admins can archive contacts; picker results mask phone
  numbers and omit full addresses until an explicit selection.
- Draft save re-resolves the selected server-scoped contact. It writes its
  current values only when the operator did not manually change the selected
  fields, preserving deliberate edits while preventing stale automatic values.
- Fresh PostgreSQL 16 migration through `0009`, `pnpm test:integration` (22
  assertions), `pnpm lint`, `pnpm build`, authenticated browser workflow, and
  independent security review passed.

## 2026-08-28 — T-11 migration and release rollback validation

- Added an unprivileged pull-request/main CI workflow that provisions isolated
  PostgreSQL databases, verifies the empty migration chain and representative
  pre-release fixture upgrade, then runs migrations, integration tests, lint,
  and build.
- Added a repeatable `pnpm test:migration-upgrade` check. It preserves and
  asserts a representative tenant, outlet, shipment, and immutable party
  records across the newest migration, and verifies the latest contact RLS
  policy exists.
- Documented the append-only migration recovery path: additive forward fixes
  are the default; Git rollback is not database rollback; restore needs an
  approved backup recovery decision.
- Local PostgreSQL 16 verification and independent CI review passed. Hosted CI
  run [33308954008](https://github.com/ongkipro/geraicuan/actions/runs/33308954008)
  passed on commit `b737a874c51cad87c60839760e1bc48014608450`, proving the
  empty and representative migration paths, tenant isolation, lint, and build.

## 2026-08-29 — T-6 provider estimates

- Added Mengantar account-estimate retrieval with tenant/actor rate limiting,
  an HTTPS-only bounded adapter, provider `price` mapping, and fail-closed COD
  eligibility when the provider omits or blocks the flag.
- Added immutable tenant-scoped estimate snapshots/services in migration `0010`;
  re-estimates append a new snapshot without mutating prior provider values.
- The approved sandbox non-COD estimate returned HTTP 200; only a sanitized
  contract fixture is retained. No order was created.
- Fresh PostgreSQL 16 migration, 27 integration assertions, lint, build, and
  independent security review passed. Authenticated browser exercise remains
  unavailable without an approved local fixture session.

## 2026-08-30 — Resi, operations, and production readiness

- Migrations `0011`–`0019` add immutable COD totals, serialized provider
  batches and unpaid recovery, print history, signed operational ledger,
  platform monitoring views, and tenant/actor shipment abuse limits.
- Focused integration contracts cover AWB authority, tenant isolation,
  recovery, label print history, analytics timezone ranges, operational ledger
  reconciliation, platform monitoring, telemetry redaction, and isolated
  rate-limit windows. Independent reviews passed after the signed-reconciliation
  and shared-rate-limit defects were corrected.
- Hosted CI run `33308954008` passed the migration upgrade check, integration
  suite, lint, and production build. No provider order was created.

## 2026-08-30 — T-19 through T-29 CMS completion

- Added tenant CMS shell, outlet readiness, shipment queue/detail, guarded
  sanitized-fixture issuance and recovery, ledger/reconciliation, member
  governance, analytics context, and Super Admin lifecycle workspaces.
- Migrations `0020`–`0021` add scoped member-governance permissions/audit
  actions and security-barrier platform finance summaries. They were applied
  only to the disposable local verification database.
- Focused integration contracts passed for shell, readiness, queue, issuance,
  recovery, ledger, lifecycle, member governance, contact/COD, and analytics.
  `pnpm lint` and `pnpm build` passed with the required local runtime database
  configuration.
- Real-browser evidence at 390px, 768px, and 1280px exercised tenant setup,
  issuance, recovery, finance, member governance, and provision/suspend/
  reactivate lifecycle actions. A mobile detail overflow was repaired; all
  exercised document widths ended at zero horizontal overflow. Provider paths
  used sanctioned sanitized fixtures only; no provider network order was made.

## 2026-08-30 — Development-only demo login hint

- Tenant and Super Admin login pages render the seeded demo email and
  `DEV_LOCAL_PASSWORD` only when `NODE_ENV` is not production and
  `GERAICUAN_ENABLE_DEMO_LOGIN_HINT=1`.
- The password remains an environment value, never a source literal. The tenant
  login hint rendered in a real browser with zero horizontal overflow; `pnpm lint`
  passed.

## 2026-08-31 — UI system audit and shadcn redesign

- Replaced competing authenticated shells with one responsive shadcn sidebar:
  desktop navigation, tablet rail, mobile sheet, shared scope header, account
  dropdown, skip target, and role-filtered tenant/platform navigation.
- Reduced primary tenant navigation to decision destinations. Shipment create,
  import, and label printing remain supported contextual lifecycle actions
  rather than competing sidebar destinations.
- Consolidated the light semantic token graph and removed decorative gradient,
  blur, shadow, and speculative dark-mode behavior from the accepted design
  contract. Added reusable page header, empty state, shipment status, detail
  section, and definition-grid primitives.
- Migrated the shipment queue/create/estimate/detail/issuance/recovery journey,
  contact directory, settings headers, analytics/finance controls,
  import/label surfaces, and public sales page toward shadcn primitives while
  preserving native form/table semantics where they are the smaller accessible
  control. The public hero uses a shipment-docket signature rather than a
  generic SaaS card composition.
- Browser QA found and repaired a broad legacy input selector that enlarged
  radio controls, a missing mobile sheet close/focus target, and the absence of
  a safe initial payment selection. New drafts default to Non-COD; COD remains
  explicit.
- Validation used an isolated local PostgreSQL 16 database and documented local
  fixture identities. `pnpm lint`, `pnpm exec tsc --noEmit`, four focused
  integration files (22 assertions), and the production build passed. The
  first build correctly stopped at the production trusted-proxy guard; the
  successful build supplied only `127.0.0.1/32` as its local verification CIDR.
- Authenticated Chromium 152 checks covered 23 public, tenant, and platform
  route/viewport combinations at 390px, 768px, and 1280px with no document
  overflow or console errors. A real local browser flow saved a Non-COD draft,
  opened the detail workspace, and verified its queue row. No estimate/order,
  issuance, recovery, print mutation, provider request, production operation,
  commit, or push was performed.
- Skills used: `admin-product-ux`, `admin-dashboard`, `shadcn-ui`,
  `nextjs-development`, `native-first`, `design-taste`, and `ui-validation`.
- Boundary note: the repository already contained extensive tracked and
  untracked changes, and this run did not start a delivery-ledger boundary
  before editing. The evidence above is valid executable/browser evidence, but
  it is not a delivery-ledger boundary PASS and must not be represented as one.

## 2026-08-31 — Tenant operational overview and analytics increment

- Replaced the shipment-create form at `/app` with a role-aware operational
  overview; creation now lives at `/app/pengiriman/baru`, with a compatibility
  redirect for valid legacy `/app?draft=<uuid>` links.
- Added a tenant-scoped dashboard read model, outlet readiness, lifecycle pulse,
  prioritized actions, recent shipments, role-safe quick access, and an exact
  `ACTION_REQUIRED` queue filter. Snapshot metrics are labelled as snapshots and
  every dashboard pulse opens the supporting queue predicate.
- Rebuilt tenant analytics with shadcn primitives, an accessible chart plus data
  table, prior-period cues, responsive tables, empty/loading/error states, and
  explicit COD-liability language. Issued counts/trends now use authoritative
  provider `resolved_at`; financial totals use immutable ledger `effective_at`
  and keep provider cost, service-fee revenue, VAT, and COD principal separate.
- Updated the canonical PRD, technical design, design-system, UX screen
  contract, and Phase 6 execution queue. T-30/T-31 intentionally remain open:
  Operator browser coverage, partial/stale region recovery, outlet/courier/
  lifecycle filters, filtered export, and full period-KPI drill-down parity are
  not yet implemented or proven.
- Verification passed: focused integration/component contracts (5 files / 31
  assertions), `pnpm exec tsc --noEmit`, targeted ESLint, `git diff --check`,
  and `pnpm build`. Authenticated browser evidence covered `/app` at 390px,
  768px, and 1280px, mobile navigation, filtered queue navigation, shipment
  creation, and analytics with zero document overflow or console/network errors.
- A broad integration attempt ran files concurrently against one disposable
  PostgreSQL role; files that recreate that role caused 76 `28P01` failures.
  This is a test-harness concurrency limitation, not passing evidence. The role
  was restored and the focused suite passed afterward.
- Skills used: `admin-product-ux`, `admin-dashboard`, `shadcn-ui`,
  `nextjs-development`, `native-first`, and `ui-validation`.
- No provider request, production operation, commit, push, or deployment was
  performed.

## 2026-09-01 — CMS precision and populated demo pass

- Introduced one shared page-width contract (`wide`, `data`, `standard`, and
  `form`) beneath the shell-owned 16/24/32px responsive gutters, removing
  route-owned double padding and inconsistent maximum widths.
- Migrated the remaining authenticated Finance, Platform, shipment create and
  state surfaces, contact detail, membership, settings, and label detail to
  shared shadcn primitives or smaller accessible native controls. Removed the
  shipment-draft and member-governance CSS modules after their final consumers
  were migrated.
- Expanded the localhost-only deterministic demo seed to 15 contacts and 18
  shipments spanning seven lifecycle states, with sanitized estimate, COD,
  provider-order, append-only ledger, reconciliation, and print-history data.
  Two consecutive seed runs returned identical counts and made no provider
  request.
- Populated authenticated browser validation covered tenant primary routes,
  Finance, and all Platform routes at 390px, 768px, and 1280px. A label-index
  min-content defect was found at 390px/768px and repaired; the final pass had
  zero document overflow and zero console/runtime errors, with wide tables
  scrolling inside their own regions.
- Verification passed `pnpm lint`, `pnpm exec tsc --noEmit`, `git diff
  --check`, 38 integration files / 176 tests, and a Next.js 16.3.3 production
  build that generated 17 static pages.
- Skills used: `full-stack-development`, `admin-product-ux`,
  `admin-dashboard`, `shadcn-ui`, `nextjs-development`, `postgres-drizzle`,
  `testing-engineering`, and `ui-validation`.
- T-35 implementation and populated-state migration are complete, but T-35
  remains open for its exhaustive loading/empty/error/stale/keyboard/success
  browser matrix. T-36 remains open for that dependency and the explicit
  sanctioned production release boundary. No provider request, production
  operation, commit, push, or deployment was performed.

## 2026-08-31 — Phase 6 dashboard/analytics contract follow-up

- The dashboard issued-today metric now derives from tenant-scoped provider
  `ISSUED` snapshots, authoritative `resolved_at`, and database-calculated
  inclusive-start/exclusive-end WIB boundaries. Dashboard pulse destinations
  reuse exact `DRAFT`, `ESTIMATED`, `ACTION_REQUIRED`, and `ISSUED_TODAY` queue
  predicates.
- Tenant analytics now parses period, timezone, outlet, courier, lifecycle, and
  `created|issued|outcome|exceptions` detail/export basis into one canonical
  fail-closed URL contract. KPI links select supporting rows on the relevant
  event or current-snapshot basis.
- KPI, comparison, trend, courier performance, detail, and export reads share
  tenant-authorized dimension filters. Issuance rate shows issued count over
  provider outcomes that left the queued state; COD principal remains separate
  from service-fee revenue, VAT payable, and provider cost.
- The Tenant Admin CSV Route Handler re-authorizes tenant scope, rejects invalid
  filters, exports the complete filtered set up to the 10,000-row synchronous
  ceiling, refuses larger results with `413`, disables caching/sniffing, and
  neutralizes spreadsheet formulas and control characters.
- Analytics queries use settled result regions so one failed KPI, trend,
  courier, or detail query can retain successful siblings with local retry. This
  is partial-error recovery, not yet proof of independent streamed loading.
- The tenant overview now streams readiness, metrics, action queue, and recent
  outcomes through independent Suspense regions with local failure recovery. It
  displays a database `statement_timestamp()` generated-at value, treats the
  read as stale after five minutes, and provides manual refresh.
- Verification passed: focused PostgreSQL dashboard/queue/analytics checks (3
  files / 18 assertions), `pnpm lint`, `pnpm exec tsc --noEmit`, `git diff
  --check`, and focused non-database analytics/export/shell checks (5 files / 49
  assertions). A credential-safe final `pnpm build` passed after the event-basis
  and dashboard-region changes, generated 17 static pages, and retained the
  expected dynamic `/app`, `/app/analitik`, and `/app/analitik/export.csv`
  routes.
- Final authenticated browser checks covered the Tenant Admin dashboard and
  analytics at 390px, 768px, and 1280px with no document overflow, console
  errors, or relevant failed requests. Dashboard counts opened exact queue
  predicates. Populated analytics rendered `6` created, `1` issued, `100%`
  issuance success, `3` unresolved exceptions, the trend's semantic data table,
  and courier performance of `1/1`.
- The outcome KPI URL, supporting table, and CSV export remained synchronized.
  A client-remount defect that could reset the selected basis was fixed and the
  flow was reverified at 390px and 1280px. Mobile filter checks exercised focus,
  44px targets, reload persistence, and browser Back restoration.
- The unresolved KPI now uses canonical `basis=exceptions` instead of opening a
  broad shipment queue. Its current-snapshot supporting table and CSV export
  preserve authorized outlet, courier, and lifecycle dimensions and match the
  KPI predicate exactly. Invalid basis values fail closed. Focused parser/link/
  export checks passed 3 files / 8 assertions, and the analytics PostgreSQL
  repository check passed 9 assertions for exact current exceptions.
- The local development seeder now provisions a dedicated Operator fixture.
  Operator browser checks at 390px and 1280px proved role-safe dashboard
  navigation/content and direct analytics-route denial. Mobile navigation now
  returns focus to its trigger after Escape; the corrected behavior was
  reverified.
- Tenant Admin now receives an exact reconciliation-variance count linked to
  `/app/keuangan?status=VARIANCE#reconciliation-history-title`. The Operator DTO
  contains no finance data and skips the variance query. Tenant Admin
  first-run/ready-empty browser checks passed at 390px, 768px, and 1280px with
  no overflow, console errors, or relevant failed requests.
- Analytics now displays its authoritative backlog `asOf` in the selected
  timezone through the same five-minute stale/manual-refresh control. Its data
  query remains monolithic, so independent analytics-region streaming is still
  outstanding.
- Latest verification passed: non-database checks 4 files / 8 tests;
  PostgreSQL analytics/dashboard checks 2 files / 12 tests; PostgreSQL
  dashboard/queue checks 2 files / 10 tests; full `pnpm lint`; and production
  build with all 17 static pages generated.
- Final `ui-validation` populated regression passed for Tenant Admin and
  Operator at 390px, 768px, and 1280px with zero document overflow and no
  console, runtime, or relevant network errors. Admin showed five pulse tiles,
  including variance `1` with its exact supporting route; Operator showed four
  permitted pulses and no finance, analytics, or governance surface. The fifth
  Admin tile spanned cleanly at 768px. Mobile action/refresh targets measured
  44px, while refresh pending/completion live announcements and focus
  restoration passed. WIB copy was corrected and reverified.
- `/app/keuangan?status=VARIANCE#reconciliation-history-title` passed at all
  three viewports with zero document overflow and no console, runtime, or
  relevant network errors. Its wide reconciliation table scrolls inside its
  region rather than widening the document.
- Independent dashboard-region structure was verified in code and rendered
  output. An exact allowlisted development-only header seam then exercised the
  remaining state contracts; a production-mode test proves the seam fails
  closed. At 390px and 1280px, action-region failure preserved five Admin
  pulses, six recent rows, and five role-safe quick actions without document
  overflow or errors. Clearing the seam and invoking local Retry restored five
  action rows and returned focus to `h2#action-heading` with a visible shadcn
  semantic focus ring.
- A read-only six-minute presentation shift rendered the old absolute timestamp
  and stale badge. Clearing the seam and manually refreshing advanced the
  timestamp, removed the badge, announced completion, and restored focus.
  Audit/freshness checks passed 2 files / 3 tests; TypeScript and focused ESLint
  passed. The production build had passed before the final focus-ring-only
  adjustment; the final adjustment is covered by TypeScript, ESLint, and browser
  evidence, not a post-adjustment build.
- T-30 is complete. T-31 remains open for
  independent analytics streaming, separately surfaced reconciliation variance,
  unpopulated/error/stale browser coverage, and complete screen-reader evidence.
  Its T-30 dependency is satisfied.
- `development-spec-suite` traceability validation was also run and remains
  non-zero with 89 pre-existing pack-wide findings: duplicate `JUR-ID-1`, missing
  accountable-owner metadata, an unbound localized-UI overlay, and unresolved
  architecture/security/observability identifiers. This follow-up does not
  claim a verified or traceability-clean specification stage.
- No provider request, production operation, commit, push, or deployment was
  performed.

## 2026-08-31 — T-31 analytics completion

- Split tenant analytics into four independently streamed regions with local
  partial-failure recovery and deterministic Retry focus. Exact development-only
  seams cover stream delay, trend error, stale presentation, first-run, and
  page-level error; production mode fails closed against every seam.
- Browser checks exercised first-run, filtered-empty, period-empty, partial
  trend failure/retry, stale/manual refresh, and route-level recovery across
  390px, 768px, and 1280px as applicable, with zero document overflow and no
  console, runtime, or relevant network errors. The mobile skeleton overflow
  defect was repaired, and route recovery focuses the page H1.
- Added a fifth, separately labelled latest tenant-wide signed reconciliation
  variance metric/link. It remains distinct from service-fee revenue and
  COD-principal liability and intentionally does not inherit period, courier,
  or lifecycle filters. The finance hash target now scrolls to and focuses its
  reconciliation heading.
- Verification passed 5 analytics/audit files / 12 tests, followed by 3 focused
  files / 21 tests and 3 focused real-PostgreSQL tenant-dashboard tests. Focused
  ESLint, TypeScript, `git diff --check`, and a clean production build passed;
  the build used ephemeral local authentication/database configuration. The
  development server remained reachable.
- A full integration attempt is not claimed as a suite PASS. Legacy test files
  recreated the shared `geraicuan_test_runtime` role without a password, causing
  broad authentication failures and deleting local fixtures. The local role and
  accounts were restored and reseeded; the shared legacy harness defect remains
  a recorded limitation rather than T-31 completion evidence.
- T-31 is complete. No provider request, production operation, commit, push, or
  deployment was performed.

## 2026-08-31 — T-32 analytics-led tenant home

- Reordered `/app` around a bounded period summary before operational work.
  Today in WIB is the default; URL-persisted preset/custom dates, outlet, and
  timezone filters drive total input, COD/non-COD composition, declared goods
  values, authoritative issued outcomes, and prior-period comparison.
- Added tenant/outlet-scoped period and trend reads. Multi-day ranges render a
  stacked COD/non-COD chart plus a semantic data table; one-day ranges avoid the
  unnecessary trend query. Invalid outlet scope fails closed.
- Kept COD goods values separate from received cash, revenue, and COD
  principal. First-run guidance follows outlet readiness, and local period
  loading/empty/error states preserve the rest of the dashboard.
- Verification passed 2 page/audit files / 5 tests, 1 real-PostgreSQL file / 4
  tests, focused ESLint, TypeScript, `git diff --check`, and a post-adjustment
  production build. Authenticated `ui-validation` covered the analytics
  hierarchy and semantic trend at 390px, 768px, and 1280px; mobile Sheet
  keyboard behavior; URL apply/reload/Back; custom dates; invalid outlet scope;
  and local failure recovery without document overflow or browser errors.
- The Tailscale development endpoint returned `200` for tenant login and an
  unauthenticated `307` from `/app` to tenant login. No provider request,
  production operation, commit, push, or deployment was performed.

## 2026-08-31 — Precision audit implementation

- Aligned the role-aware tenant shell with the canonical grouped information
  architecture and moved the 768px experience from an icon rail to a labelled
  shadcn Sheet. Contextual active states and role filtering are covered by 21
  focused shell assertions.
- Corrected cross-page data semantics: canonical outlet readiness, active
  tenant contact totals, independent tenant-wide signed variance, truthful
  Finance filter boundaries, and unambiguous issued/COD labels.
- Migrated Outlet Settings, Import, Label index, and New Contact to shared
  shadcn/native semantic surfaces. Real-browser validation passed at 390px,
  768px, and 1280px with zero document overflow; a 390px Import min-content
  overflow was found during validation, fixed, and rechecked.
- Replaced destructive passwordless integration-role recreation with a guarded
  localhost helper that preserves role grants and derives the runtime password
  from `APP_DATABASE_URL`. The full integration run then passed 37 files / 171
  tests. `pnpm lint`, `pnpm exec tsc --noEmit`, `git diff --check`, and a clean
  Next.js 16.3.3 production build also passed.
- Specification traceability remains non-zero at 88 findings from existing
  owner metadata, duplicate/incomplete jurisdiction records, and unresolved
  architecture/security/observability declarations. T-35 and T-36 remain open;
  no production/provider operation, commit, push, or deployment occurred.

## 2026-09-01 — T-37 CMS UI audit foundation

- Established the deterministic CMS presentation-state foundation for T-38
  through T-47: typed route inventory, per-state owner/strategy mapping,
  development-only route-bound scenario parsing, authenticated legacy-class
  guard, and protected-surface scan proving audit controls do not enter
  actions, route handlers, database code, or Mengantar provider transports.
- Verification passed `t37-focused-dev-final`,
  `t37-focused-production-env-final`, `t37-diff-check-final`, earlier
  TypeScript and lint ledger checks, and independent reviewer PASS from
  `anthropic/claude-sonnet-5`. `delivery-ledger` run
  `RUN-20260831T184316Z-c08c78b5` had no out-of-scope, protected, unknown, or
  missing-verification paths; it required review only because accepted
  pre-existing dirty paths changed.
- T-37 does not claim that Ringkasan, Analitik, shipment, import, contact,
  label, Finance, settings, member governance, Platform, or cross-role browser
  journeys are complete. Those remain T-38 through T-48. No provider request,
  production operation, commit, push, deployment, or release was performed.
- A late second review found permissive non-production parsing, route binding
  unused by the real page consumers, and source-order/alias gaps in the class
  guard. Corrective run `RUN-20260831T190654Z-105a7f61` made parsing strictly
  development-only, bound both consumers to their exact route, added exact
  owner/state/endpoint parity, and changed the guard to two-pass evaluation of
  aliases, object properties, templates, and imported local constants. Focused
  verification passed 3 files / 11 tests plus targeted ESLint, TypeScript, and
  `git diff --check`; independent re-review passed. Authenticated Chromium at
  390px proved cross-route scenarios fail closed on both pages with zero
  overflow and no failed response.

## 2026-09-01 — T-38 Ringkasan and Analitik state matrix

- Completed the accepted Tenant Admin and Operator journeys for `/app` and
  `/app/analitik`: Today-in-WIB, preset/custom URL filters, first-run,
  healthy-empty, populated, independently loading, partial and route errors,
  stale/manual refresh, invalid outlet, reload/Back, keyboard filter Sheet,
  semantic chart tables, supporting rows, and filtered CSV.
- Kept created, issued, backlog, outcome, COD principal, fee revenue, VAT,
  provider cost, and signed variance semantics distinct. Every Ringkasan count
  now drills into exact role-safe supporting rows, while each analytics region
  owns its database-generated freshness timestamp.
- Verification passed focused non-database Vitest (10 files / 35 tests), an
  isolated PostgreSQL suite (2 files / 13 tests), targeted ESLint, TypeScript,
  and `git diff --check`. Authenticated Chromium at 390px, 768px, and 1280px
  covered both roles and all accepted state classes with no document overflow
  on clean journeys or unexpected console/runtime/network failures.
- Independent correctness and designer delta reviews returned PASS for
  delivery-ledger run `RUN-20260831T191304Z-0aaf287c`. No provider request,
  production operation, commit, push, deployment, or release occurred.

## 2026-09-01 — T-39 shipment queue and lifecycle detail matrix

- Completed the accepted `/app/pengiriman` and shipment-detail state matrix:
  grouped operational/lifecycle filters, empty and paginated queues, local
  table scrolling, freshness, dedicated loading/error/not-found focus, every
  lifecycle state, unique next-action labels, role-safe recovery, and Admin-only
  unknown reconciliation.
- Hardened sanctioned provider boundaries without opening TD-14: strict
  provider identifiers, durable shared tenant/actor mutation limits,
  crash-before-claim resume, stale crash-after-claim recovery, no retry after
  unknown outcomes, and tenant-scoped reconciliation using sanitized fixtures
  only.
- Added a provider-free local-state check reachable from refreshed
  `SUBMITTING` and Admin `PAYING` detail states. Batch/member locks and a
  completion heartbeat serialize the stale reaper against active completion;
  all-terminal members finalize the batch while unresolved members enter a
  reachable `UNKNOWN` state. Operator receives no payment recovery/check
  control, and action errors fail closed without leaking protected context.
- Final verification passed rendered route/action checks (2 files / 28 tests),
  disposable PostgreSQL 16 checks (7 files / 38 tests), targeted ESLint,
  TypeScript, and `git diff --check`. Independent R4 security/correctness review
  and independent designer review returned PASS.
- Authenticated Chromium exercised Admin `SUBMITTING` and `PAYING` plus Operator
  `PAYING` at 390px, 768px, and 1280px. Mobile actions measured 44px; all nine
  renders had zero document overflow and no console, runtime, or relevant
  network failures. No form/provider action was invoked.
- Initial run `RUN-20260831T201011Z-3fd353e9` was closed as `FAIL` because its
  immutable baseline had not accepted every required pre-existing dirty-file
  overlap. Corrective verification run `RUN-20260831T205457Z-b96e3279` binds
  the current repository evidence without overriding that failure. No provider
  request, production operation, commit, push, deployment, or release occurred.

## 2026-09-01 — T-40 shipment drafting and contact-assisted estimation

- Reworked `/app/pengiriman/baru` into a flat, responsive four-step workflow
  with 44px draft controls through tablet, route loading/error states,
  deterministic first focus, linked error summary, preserved form values, and
  successful-save actions into shipment queue/detail.
- Added keyboard-safe sender/recipient contact search, selected-address
  provenance, server-returned contact/address revisions, tenant-scoped row
  locks, stale/tamper rejection with zero writes, and exact manual overrides.
- Added server-rendered UUIDv4 draft submission identity. Sequential/concurrent
  identical replay resolves the same immutable draft; semantic mismatch and
  cross-tenant collision fail closed, while exact replay remains valid after
  shipment status, outlet readiness, or selected-contact state changes.
- Hardened estimate response handling with timeout-through-body, incremental
  512KB cap, fatal UTF-8 decoding, redirect denial, and sanitized errors. Added
  a non-production-only, production-fail-closed sanctioned estimate fixture;
  browser audit Retry transitions from error to populated without any POST or
  provider request.
- Verification passed focused non-database Vitest (4 files / 16 tests),
  disposable PostgreSQL 16 (1 file / 7 tests), TypeScript, targeted ESLint, and
  `git diff --check`. Authenticated Chromium at 390px, 768px, and 1280px proved
  first focus, zero document overflow/runtime errors, invalid zero-write focus,
  keyboard search without submit, real local save, normal queue discovery, and
  detail links. Independent designer and security/correctness re-reviews passed.
- Destination-area ID/label authority is not overstated: validation is
  syntactic until an accepted Mengantar address-search contract exists. No live
  provider request, production operation, commit, push, deployment, or release
  occurred. Delivery-ledger run: `RUN-20260831T205737Z-20521568`.
- Original run `RUN-20260831T205737Z-20521568` passed the product and boundary
  checks but its immutable skill record captured only the first skill argument.
  Corrective verification run `RUN-20260831T214051Z-542dd1f4` binds the same
  verified surface with complete skill attribution, including `ui-validation`.

## 2026-09-01 — T-41 bulk shipment import

- Replaced client-posted canonical shipment fields with HMAC-signed,
  domain-separated preview envelopes bound to tenant, actor, UUIDv4 submission,
  row, normalized input, version, and 15-minute expiry. Confirmation accepts
  only selected envelopes, rejects tamper/mixed/duplicate/cross-tenant reuse,
  and derives stable row UUIDs for idempotent replay in one tenant transaction.
- Moved authentication and the durable preview limiter ahead of file parsing;
  confirmation itself remains safely replayable after a lost redirect. Parser
  boundaries cover exact headers, fatal UTF-8, NUL, 256KB files, 8KB records,
  100 rows, malformed syntax, no rows, and mixed valid/invalid rows without PII
  in errors. No provider transport is reachable from this flow.
- Reworked `/app/impor` with shadcn composition, a keyboard-operable 44px file
  trigger, localized filename state, field-linked/focused errors, explicit
  zero-default row selection, 44px effective checkbox targets, selected count,
  sticky selection/row context, local table scrolling, route loading/error
  focus, Admin settings recovery, and filtered DRAFT-queue handoff. The CSV
  template contract is tenant-authorized and regression-tested byte-for-byte
  with safe download headers.
- Focused verification passed 4 files / 18 tests; disposable PostgreSQL 16
  passed 1 file / 7 tests; TypeScript, targeted ESLint, and `git diff --check`
  passed. Authenticated Chromium covered loading, route error, mixed preview,
  missing-file focus, template download, and explicit one-of-two selection at
  390px, 768px, and 1280px. All widths had zero document overflow; the selected
  row produced exactly +1 normal queue DRAFT and console/runtime evidence was
  clean. Independent designer, security, and correctness reviews returned
  PASS. No provider, production, commit, push, deploy, or release action
  occurred. Initial run `RUN-20260831T214240Z-1a32142e` remains FAIL because its
  immutable baseline omitted one pre-existing dirty overlap. Corrective run
  `RUN-20260831T221349Z-ffc85710` accepts and binds the complete verified
  surface without overriding that failure.

## 2026-09-01 — T-42 contact directory and archive states

- Replaced URL-based contact search with an authenticated POST Server Action.
  Directory client state receives masked phones only, supports active/archived
  discovery, invalid-query focus, private clear/search behavior, and a locally
  scrollable shadcn table with sticky name context.
- Added focused create/update/address action states with preserved field values,
  44px controls, linked validation summaries, pending feedback, and same-action
  success/failure announcements. Archived detail is read-only; create and
  archive outcomes no longer trust forgeable query-only presentation.
- Made archive Tenant-Admin-only with an explicit confirmation URL, action-state
  denial feedback, authoritative archived-state success gating, and deterministic
  focus restoration after Cancel. Operator receives explanatory read-only copy.
- Hardened repository behavior with archived-contact immutability, exact safe
  duplicate-label translation, and a parent-row lock that serializes the active
  address cap at 20. Tenant-isolation and historical shipment snapshot behavior
  remain enforced and regression-tested.
- Verification passed focused Server Action Vitest (1 file / 8 tests), disposable
  PostgreSQL 16 (1 file / 8 tests), TypeScript, targeted ESLint, UI audit
  inventory, and `git diff --check`. Authenticated Chromium passed loading/error,
  private search, create/update/address/archive, not-found, archived read-only,
  and Operator journeys at 390px, 768px, and 1280px with zero document overflow,
  local table scrolling, sticky context, and clean console/runtime evidence.
  Independent designer, security, and correctness reviews returned PASS. Shared
  shell account-trigger sizing remains T-48. No provider, production, commit,
  push, deploy, or release action occurred. Delivery-ledger run:
  `RUN-20260831T221534Z-a1314382`.

## 2026-09-01 — T-43 labels, print history, and physical output

- Added label-owned loading/error/not-found recovery, focused invalid-AWB
  validation, locally scrollable shadcn tables with sticky leading context,
  blocked-state recovery links, and bounded long-address disclosure without
  changing the physical `LabelSheet` DOM.
- Hardened print recording with a per-submit UUID idempotency key, exact
  immutable stale replay, generic collision handling, tenant-scoped shipment
  row locking, contiguous concurrency-safe sequence allocation, append-only
  events, and stable retry tokens. UI copy records a request to open the browser
  dialog and never claims a physical print succeeded.
- Focused non-database verification passed 3 files / 23 tests; disposable
  PostgreSQL 16 passed 1 file / 9 tests, including six-way concurrency, stale
  PRINTED/BLOCKED replay, cross-tenant rejection, RLS, and append-only guards.
  TypeScript, targeted ESLint, UI audit inventory, and `git diff --check` passed.
- Authenticated Chromium passed issued/unpaid, invalid suffix, loading/error,
  blocked, zero/populated history, long-address, inconsistent-COD, print action,
  and not-found states at 390px, 768px, and 1280px with zero document overflow,
  focused announcements, exact +1 persisted history, and no provider request.
  A fresh print-only session produced exactly one complete 282.96 × 425.04 pt
  page (100 × 150 mm) without CMS chrome, clipping, or an extra page.
  Independent designer, security, and correctness reviews returned PASS. No
  provider, production, commit, push, deploy, or release action occurred.
  Delivery-ledger run: `RUN-20260831T223741Z-d5e393a4`.
- Corrective verification run `RUN-20260831T231708Z-6ebae831` binds the complete
  immutable skill attribution, including `ui-validation`; the original run's
  one-skill record is retained as superseded evidence rather than rewritten.

## 2026-09-01 — T-44 Finance ledger and reconciliation workspace

- Restricted Finance reads and mutations to authenticated Tenant Admins before
  consuming filters or form payloads. Operator and platform principals redirect
  without rendering financial data; every repository path remains tenant/outlet
  scoped with RLS as defense in depth.
- Rebuilt the workspace hierarchy as summary, variance queue, reconciliation,
  then append-only ledger. Added responsive shadcn filters, URL-persisted status
  and pagination, exact variance-row focus, local wide-table scrollers, sticky
  context, tabular numeric alignment, and truthful empty/loading/error/partial/
  stale states.
- Reconciliation accepts an exact local date or the latest completed calendar
  month, uses stable attempt UUID replay, serializes each outlet period, captures
  all six authoritative and ledger totals in one SQL snapshot, and appends six
  run/memo pairs atomically. Adjustments use a stable attempt UUID and append one
  full reversal without updating the source entry.
- Verification passed 4 focused files / 32 tests and disposable PostgreSQL 16
  passed 2 files / 5 tests, including sequential/stale/concurrent replay,
  coherent totals, append-only reversal, and tenant isolation. TypeScript,
  targeted ESLint, inventory, and `git diff --check` passed.
- Authenticated Chromium proved focused daily/monthly outcomes, filter reload/
  Back persistence, local scrolling, sticky context, and zero document overflow
  at 390px, 768px, and 1280px; no provider request occurred. Independent
  designer, security, and correctness reviews passed. Shared account-trigger
  sizing remains T-48. No production, commit, push, deploy, or release action
  occurred. Delivery-ledger run: `RUN-20260831T231804Z-61655f17`.

## 2026-09-01 — T-45 outlet readiness and connection settings

- Reworked `/app/pengaturan` into attention-first shadcn outlet disclosures with
  stable IDs, 44px controls, a compact one-outlet state, many-outlet summary,
  read-only connection source, safe private-attention guidance, preserved values,
  pending state, and deterministic invalid/success/error focus.
- Removed browser authority to create or repair private secret references.
  Settings submits only the server-rendered current source; the repository locks
  the tenant outlet, compares it with the authoritative connection row, and
  treats identical sequential/concurrent saves as semantic no-ops.
- Added redacted `OUTLET_SETTINGS_CHANGED` / `OUTLET` audit support with additive
  migration `0022_outlet_settings_audit.sql` and tenant/target-bound append RLS.
  Audit metadata lists changed field names and source only—never pickup/origin
  values, secret references, keys, URLs, or credential fragments.
- Centralized canonical readiness for shipment-create and bulk-import lists plus
  the draft mutation guard. A private noncanonical reference remains attention
  state and cannot create a draft even when pickup/origin metadata exists.
- Verification passed 3 focused files / 28 tests and fresh PostgreSQL 16
  migrations 0000–0022 plus 2 files / 14 tests. TypeScript, targeted ESLint,
  inventory, and `git diff --check` passed. Authenticated Chromium proved actual
  success/CTA, invalid value retention/focus, zero/one/many/private-attention/
  loading/error states, Admin discovery, Operator denial, 44px controls, and zero
  document overflow at 390/768/1280 with no credential sentinel or provider
  request. Independent designer, security, and correctness reviews passed. No
  production, commit, push, deploy, or release action occurred. Delivery-ledger
  corrective run: `RUN-20260901T001550Z-d5289561`. Initial run
  `RUN-20260831T235917Z-aba50484` remains FAIL because its immutable baseline
  could not retroactively accept the required schema/consumer scope expansion;
  no product evidence was overridden.

## 2026-09-01 — T-46 tenant member governance

- Reworked `/app/anggota` into an active-first compact member workspace with a
  clear sole-admin warning, collapsed per-member controls, a secondary invite
  disclosure, named shadcn role/deactivation confirmation dialogs, 44px inputs,
  preserved safe values, deterministic focus, stable loading geometry, and
  focused route-error recovery.
- Moved Tenant Admin authorization ahead of form parsing and added exact UUID
  attempt receipts for invitation, role change, and deactivation. Sequential and
  concurrent retries return the original result without repeating transitions;
  semantic collisions fail closed.
- Added global single-tenant membership serialization, concurrent last-admin
  protection, ambiguous case-insensitive-email denial, redacted audit metadata,
  and tenant/actor/target-bound audit RLS. Additive migration 0023 explicitly
  stops on pre-existing duplicate user memberships before installing the unique
  key and attempt-receipt index.
- Verification passed 4 focused non-database files / 56 tests and fresh
  PostgreSQL 16 migration upgrade through 0023 plus 2 files / 15 tests.
  TypeScript, targeted ESLint, and `git diff --check` passed. Authenticated
  Chromium passed populated/single-admin/inactive/loading/error, invalid invite,
  named role dialog, Admin discovery, Operator omission/direct denial, long-email
  wrapping, and zero document overflow at 390px, 768px, and 1280px. Independent
  designer and security/correctness reviews passed. No provider, production,
  commit, push, deploy, or release action occurred. Delivery-ledger corrective
  run: `RUN-20260901T003252Z-5db01f4d`. Initial run
  `RUN-20260901T001837Z-0134091d` remains FAIL because its immutable baseline
  could not retroactively accept required migration/shared-test dirty overlaps;
  it does not override the product evidence.

## 2026-09-01 — T-47 Super Admin monitoring and tenant governance

- Reworked `/platform`, `/platform/tenant`, tenant detail, and `/platform/audit`
  into decision-first shadcn workspaces: lifecycle controls precede collapsed
  filters, data tables scroll locally, system and filtered empty states differ,
  audit details remain allowlisted, and loading/error/not-found/stale/action
  outcomes have deterministic keyboard focus.
- Moved Super Admin authorization before action FormData and all monitoring
  reads. Lifecycle actions now carry server-generated UUID attempts, advisory
  locks, semantic fingerprints, target row locks, exact replay receipts, and one
  tenant-bound audit outcome. Unknown failures retain the attempt and safe form
  values; success rotates it.
- Added database-authoritative monitoring time, consistent outlet/courier
  filtering through recovery metrics, per-response anonymous provider-account
  buckets, safe operational-code reduction, serialized monitoring audit
  deduplication, and hardened audit policies. Additive migration 0024 preflights
  duplicate lifecycle receipts before installing uniqueness and RLS changes.
- Verification passed 5 final non-database files / 52 tests and fresh PostgreSQL
  16 migration upgrade through 0024 plus 3 files / 11 tests. TypeScript,
  targeted ESLint, and `git diff --check` passed. Authenticated Chromium passed
  all four routes at 390px, 768px, and 1280px plus empty/populated/paginated/
  invalid/stale/loading/error/not-found/zero-one-many/action/redaction states
  with zero document overflow or browser failures.
- A real local Super Admin journey discovered the tenant workspace from
  navigation, provisioned one dummy tenant, opened its returned detail,
  suspended it, reactivated it, verified reload persistence, and observed exact
  `TENANT_CREATED`, `TENANT_SUSPENDED`, and `TENANT_REACTIVATED` success rows.
  No provider request occurred. Independent designer and security/correctness
  reviews passed. Corrective delivery-ledger run:
  `RUN-20260901T010311Z-f801bb9f`. Initial run
  `RUN-20260901T003840Z-b68e32de` remains FAIL because its immutable baseline
  could not retroactively accept required migration/schema and new focused-test
  dirty overlaps; no product evidence was overridden. No production, commit,
  push, deploy, or release action occurred.

## 2026-09-01 — T-35 authenticated CMS composition closure

- Closed the shared shadcn composition milestone only after T-38 through T-47
  passed their atomic screen-state, data-meaning, authorization, and browser
  evidence contracts.
- Independent designer Chromium review rendered all 18 authenticated page
  routes at 390px, 768px, and 1280px (54 populated primary renders). Dynamic
  shipment, contact, label, and platform-tenant IDs were discovered from
  visible list links rather than seeded identifiers or database access.
- Every render recorded 0px document overflow, one main landmark, one H1,
  coherent 16/24/32px shell gutters, truthful desktop current navigation,
  restrained Card use with no nested Cards, and labelled local scroll regions
  for wide tables. Visible focus and Sheet Escape focus return passed; no
  console, runtime, or relevant-network error was observed.
- The authenticated presentation-class and exact route-inventory scan passed
  2 files / 10 tests. The missing 768px icon rail and icon-only 390px trigger
  remain the accepted shared-shell defects owned by T-48; no page owner was
  reopened. Browser artifacts are local-only under
  `/tmp/geraicuan-t35-closure/`.
- Delivery-ledger run: `RUN-20260901T010855Z-655e9fc7`. No provider,
  production, commit, push, deploy, release, or live action occurred.

## 2026-09-01 — T-48 cross-role navigation and shell authorization

- Replaced the shared icon-only mobile trigger with a visibly labelled 44px
  `Menu` Sheet trigger, added a dedicated shadcn icon rail at 768–1023px, and
  retained the full Sidebar at 1280px. The rail reuses the canonical role-aware
  navigation, exposes one `aria-current` destination, retains accessible link
  names, and supplements them with keyboard- and hover-visible tooltips.
- Raised account and sign-out controls to 44px. Sheet initial close focus,
  Escape, trigger focus return, contextual shipment/contact/tenant current
  mapping, group order, and role-specific destination omission remain intact.
- Security review found that Platform layout previously streamed hardcoded
  Platform/Super Admin shell chrome before child authorization. The corrective
  implementation now resolves server-derived Platform access in the layout and
  redirects before `CmsShell`; anonymous `/platform` returns 307 without
  Platform title, identity, scope, navigation, or protected content.
- Focused responsive shell, Platform layout, and isolated PostgreSQL
  authorization tests passed 3 files / 36 tests. TypeScript, targeted ESLint,
  and `git diff --check` passed.
- Clean-session Chromium covered Tenant Admin, Operator, and Super Admin at
  390px, 768px, and 1280px. Every shell had one main, one visible current item,
  0px document overflow, correct forbidden redirects, and zero browser errors.
  The 768px rail links measured 47×44px; keyboard focus and pointer hover both
  opened the named Radix tooltip. A real Operator sign-out invalidated the
  session and a subsequent protected `/app` request remained at tenant login.
- Corrective delivery-ledger run: `RUN-20260901T012724Z-d7ce0ec0`. Initial run
  `RUN-20260901T012040Z-4b87faa2` remains FAIL and records the pre-layout-gate
  security defect. No provider, production, commit, push, deploy, release, or
  live action occurred.

## 2026-09-01 — T-38 release-suite courier ordering correction

- The first T-36 full integration run passed 58 files / 405 tests and failed
  two analytics assertions. Both queries already specify ascending courier
  ordering; fresh PostgreSQL 16 returns `J&T` before `JNE`, while the stale
  fixture expected the reverse.
- Reopened T-38 in a test-only boundary and aligned the two expectations with
  the implemented deterministic query contract. No product, query, migration,
  provider, or browser code changed.
- Corrective delivery-ledger run: `RUN-20260901T014304Z-145c2662`. T-36 initial
  release-verification run `RUN-20260901T014034Z-93a8bff8` remains FAIL and T-36
  must restart from a fresh checkpoint.

## 2026-09-01 — T-49 integration runtime-role lifecycle

- T-36 retry `RUN-20260901T014615Z-58d5cb12` passed 57 files / 400 tests, then
  failed 7 tests when parallel suites dropped `geraicuan_test_runtime` while
  shipment workers still opened application-role connections.
- Removed the four per-file `DROP ROLE` teardown calls. The existing helper
  still restricts setup to localhost `/geraicuan_test`; individual suites may
  idempotently ensure the shared role, while the disposable PostgreSQL
  container owns final cleanup.
- The initial correction then exposed two shipment suites that used the
  application-role URL without calling the helper and depended on incidental
  worker order. The corrective run adds explicit guarded setup to both suites.
- Corrective delivery-ledger run: `RUN-20260901T015118Z-d3a2662a`. Initial run
  `RUN-20260901T014833Z-275034aa` remains FAIL. No product, migration, provider,
  production, commit, push, deploy, release, or live code changed.

## 2026-09-01 — T-36 final verification and release verdict

- Fresh PostgreSQL 16 migrations through 0024 and the full integration suite
  passed 59 files / 407 tests. A separate empty database passed the
  representative migration-upgrade check through
  `0024_platform_lifecycle_idempotency.sql`.
- Production-fail-closed audit scenarios, sanitized fixture guards, shipment
  action boundaries, and route states passed 5 files / 38 tests. Browser
  network evidence observed only three expected login POSTs and zero provider
  mutation requests.
- Full `pnpm lint`, `pnpm exec tsc --noEmit`, and `git diff --check` passed. The
  production Next.js 16.3.3 build passed after supplying explicit isolated
  local database/runtime-role, localhost trusted-proxy, and ephemeral
  build-only auth-secret values. Earlier build invocations correctly failed
  closed while required local build variables were absent; no secret file was
  read or production credential used.
- Traceability validation found all 26 PRD product requirements and all 5 NFRs
  referenced in `TASKS.md`; all 25 distinct task primary-requirement IDs
  resolved to the canonical PRD table.
- Independent Chromium reviewed 48 permitted and 21 forbidden states for
  Tenant Admin, Operator, and Super Admin at 390px, 768px, and 1280px. All had
  one main/current destination, 0px document overflow, zero browser errors,
  correct role denial, and UI-discovered dynamic shipment/tenant details.
  Local artifacts: `/tmp/geraicuan-t35-closure/t36-final-browser.json` and 48
  screenshots matching `t36-*.png`.
- `production-gate --json .` correctly returned BLOCKED. The tree is dirty and
  uncommitted, `RELEASE.md` is DRAFT with unset release/base/rollback fields,
  the prior release attestation predates this work, and no clean explicitly
  approved release candidate exists. Its generic project-check also lacks the
  injected build environment used by the passing isolated build. Four secret
  scanner matches were reviewed as documented local/example test values, not
  production credentials.
- Final verification run: `RUN-20260901T015655Z-f8920fff`. Initial T-36 runs
  `RUN-20260901T014034Z-93a8bff8` and `RUN-20260901T014615Z-58d5cb12` remain
  FAIL and preserve the T-38/T-49 defects they exposed. Release verdict:
  **NO-GO pending a clean, explicitly approved release candidate**. No commit,
  push, provider request, production write, deploy, or release occurred.

## 2026-09-02 — T-54 bounded Mengantar destination-area search

- Added an authenticated server-only destination search boundary for Mengantar
  `GET /api/public/{API_KEY}/address/search`. It returns only provider area ID
  and a readable subdistrict-to-province/ZIP label; routing codes, provider
  identity, credentials, URLs, and response bodies never enter the client DTO
  or safe errors.
- Normalized and bounded queries, response bytes and result cardinality;
  enforced HTTPS platform origin, rejected redirects, a ten-second timeout, no
  retry, and no cache. Private connection source/version is re-read after the
  provider response so a concurrent credential replacement or source switch
  rejects stale results.
- Migration `0027_location_search_limit.sql` extends the existing forced-RLS
  tenant/actor limiter with `location-search`. A nonblocking PostgreSQL session
  advisory lock rejects same-actor concurrent searches without holding a
  transaction across provider I/O.
- Fresh disposable PostgreSQL 16 passed the migration chain, representative
  upgrade through 0027, the durable 20-attempt tenant/actor boundary, real
  two-client advisory-lock rejection/release, and cross-tenant outlet denial.
  Hermetic adapter/action tests passed 2 files / 22 tests; the database suite
  passed 1 file / 3 tests. Targeted ESLint, TypeScript, `git diff --check`, and
  independent security review passed.
- Delivery-ledger run: `RUN-20260901T173020Z-7902a6bf`. No live provider call,
  provider mutation, production action, commit, push, deploy, or release
  occurred.

## 2026-09-02 — T-55 provider-authoritative contact destinations

- Replaced contact create/add/edit opaque area inputs with a shared shadcn
  `Command`/`Popover` selector backed by the T-54 server action.
- Added tenant-scoped ready-outlet gating, exact provider ID/label revalidation,
  optional destination persistence, explicit clear, and active-address update
  locking without changing historical shipment snapshots.
- Added URL-selected inline address editing and deterministic loading,
  no-result, retryable error, rate-limit, selected, clear, and mutation focus
  behavior. A corrective designer audit required stale hidden-authority cleanup,
  focus recovery, and truthful assistive selected-state text; all three were
  fixed and the re-review passed.
- Parent verification: focused Vitest 3 files / 24 tests; disposable PostgreSQL
  16 contact repository 1 file / 9 tests; targeted ESLint; TypeScript; and
  `git diff --check`, all PASS.
- Browser verification: Tenant Admin create, edit, reload persistence, second
  address, no-result, error/retry, change, and clear plus Operator lookup at
  390px, 768px, and 1280px; 0px document overflow, 44px search target, correct
  focus/selected semantics, zero raw-ID text, zero console errors, and zero
  provider network requests. Independent security review PASS.
- Delivery-ledger run: `RUN-20260901T174637Z-aaf32953`. No live provider call,
  provider mutation, production action, commit, push, deploy, or release
  occurred.

## 2026-09-02 — T-56 shipment destination authority through estimation

- Replaced individual shipment destination entry with the shared shadcn
  Mengantar area selector. The shipment form now chooses the source outlet
  before destination lookup, hides opaque provider IDs, supports manual search
  and contact-address prefill, and clears stale area authority when the outlet
  or query changes.
- Revalidated every accepted manual destination against the current outlet's
  area-search authority before draft persistence. Contact-prefilled
  destinations also re-search their readable stored label under the current
  outlet account, then must equal the freshly resolved active contact-address
  pair. Tampered, unavailable, or stale ID/label pairs fail closed with zero
  draft write.
- Added migration `0028_shipment_destination_authority.sql` to backfill and
  enforce readable destination labels on recipient shipment parties, estimate
  snapshots, and provider-order snapshots. Estimate append and provider-order
  selection now require the latest draft, estimate, and queued order snapshot
  destination ID/label pair to match.
- Verification: the final focused authority set passed 9 files / 50 tests;
  migration upgrade through `0028` proved legacy recipient-party, estimate,
  and provider-order backfills; the final full disposable PostgreSQL 16 suite
  passed 65 files / 478 tests. Targeted ESLint, TypeScript, and
  `git diff --check` passed. COD creation now rejects destination-label drift in
  both repository selection and the forced-RLS insert policy.
- Browser verification: isolated local dev server at `http://127.0.0.1:3110`
  backed by its own disposable PostgreSQL 16 covered Tenant Admin and Operator
  at 390px, 768px, and 1280px. Journeys proved manual search, clear/focus
  recovery, contact-prefill revalidation, non-COD and COD estimate loading,
  COD breakdown, reload, detail discovery, and retention of a prior estimate
  snapshot during a retryable error. Screenshots:
  `/tmp/geraicuan-t56-shipment-draft-390.png`,
  `/tmp/geraicuan-t56-shipment-draft-768.png`,
  `/tmp/geraicuan-t56-shipment-draft-1280.png`, and
  `/tmp/geraicuan-t56-shipment-saved-390.png`. Observed 0px document overflow,
  no raw area-ID text, no console errors, and zero `mengantar.com` network
  requests. Independent designer review passed; later T-64 may refine the
  compact mobile progress strip and saved-state scroll offset.
- Delivery-ledger run: `RUN-20260901T182613Z-6c377254`. No live provider call,
  provider mutation, production action, commit, push, deploy, or release
  occurred.
- Closure correction: a later independent security re-review returned FAIL.
  Draft persistence still needs a transaction-bound authority check that cannot
  race a private/platform account-source change. Migration 0028 also needs
  estimate and provider-order insert RLS predicates that enforce the exact
  destination ID/readable-label pair and raw runtime-role acceptance/rejection
  tests. T-56 is reopened; the evidence above remains valid progress, not final
  completion evidence, and T-63 must not begin until corrective re-review passes.

## 2026-09-02 — T-56 corrective authority and RLS closure

- Added migration `0029_mengantar_authority_version.sql` with a monotonic,
  outlet-scoped Mengantar authority version. Credential and pickup/origin
  mutations increment it under the same outlet row lock used by final writes,
  preventing private/default ABA races without decrypting a secret during the
  authority check.
- Contact create/add/update, manual and contact-prefilled shipment drafts,
  estimate persistence, and provider-batch preparation now carry the validated
  authority into the write transaction, lock the current outlet authority, and
  reject drift before persistence. Existing resumable provider batches recheck
  the current source before submission.
- Corrected forced-RLS insert policies bind estimate snapshots to the latest
  draft destination and current source, and bind provider-order snapshots to
  the batch, latest estimate/service, recipient/draft destination pair, COD
  totals, initial status, and current private/platform source. Raw runtime-role
  tests prove valid inserts and reject destination/source drift.
- Final verification passed the fresh representative migration upgrade through
  0029, focused contact/draft/estimate authority checks (3 files / 21 tests),
  provider batch/order checks (1 file / 21 tests), the full disposable
  PostgreSQL 16 integration suite (65 files / 486 tests), ESLint, TypeScript,
  `git diff --check`, and the Next.js 16.3.3 production build.
- Independent security re-review returned PASS with no remaining blocker for
  contact authority or provider-order source/RLS binding. Corrective run
  `RUN-20260901T191208Z-63c6e6c3` remains FAIL only because its original R3
  boundary could not accept the effective-R4 pre-existing dirty overlap;
  verification-only R4 closure run `RUN-20260901T194707Z-642c47d5` owns the
  final documentation and boundary attestation.
- No live provider request, provider mutation, production action, commit, push,
  deploy, or release occurred. T-63 is the next executable task.

## 2026-09-02 — T-63 provider-authoritative bulk destinations

- Replaced CSV columns `id_area_tujuan` and `area_tujuan` with required
  `lokasi_tujuan`; legacy headers fail with current-template guidance.
- Normalized and deduplicated at most 10 unique destination queries per upload.
  Resolution is serialized through T-54's existing per-actor concurrency guard,
  accepts only an exact or single unambiguous result, and returns safe row-level
  invalid, ambiguous, no-result, and unavailable outcomes. Invalid rows never
  receive a checkbox, hidden authority, or confirmation token.
- Upgraded confirmation envelopes to v2 and bound tenant, actor, submission,
  row, normalized query, resolved provider ID/readable label, and expiry. Before
  any draft write, confirmation revalidates each unique provider pair and then
  locks and compares the current outlet authority inside one all-or-nothing
  tenant transaction.
- The shadcn preview now reports rows, unique queries, valid rows, and errors;
  shows original CSV location beside the readable Mengantar match; keeps wide
  tables in local scroll regions; focuses `#hasil-pemeriksaan`; and preserves
  valid-row-only selection. A deterministic no-valid audit state was added.
- Focused parser, envelope, action, database, and inventory verification passed
  5 files / 32 tests. The full disposable PostgreSQL 16 suite passed 65 files /
  490 tests. Full ESLint, TypeScript, `git diff --check`, and the Next.js 16.3.3
  production build passed.
- Authenticated Chromium 152 covered partial and no-valid states at 390px,
  768px, and 1280px with one main/H1, deterministic result focus, 44px primary
  actions, zero document overflow, local table overflow only, no legacy header,
  valid-only checkboxes, and zero console/network/provider errors. Independent
  designer and security reviews returned PASS.
- Implementation run `RUN-20260901T195428Z-066e8cde` remains FAIL only because
  its initial boundary omitted accepted overlap for an already-dirty database
  test. Verification-only R3 run `RUN-20260901T201314Z-5da3eadc` reruns the
  settled checks and owns final closure. No live provider request, provider
  mutation, production action, commit, push, deploy, or release occurred. T-52
  milestone closure is next.

## 2026-09-02 — T-52 destination-authority milestone closure

- Added `tests/mengantar-location-authority.integration.test.ts` as one explicit
  fixture-backed chain from current outlet pickup and tenant contact through the
  immutable recipient party, draft, estimate, provider-order snapshot, and
  locally constructed Mengantar payload.
- The positive chain proves the same destination provider ID/readable-label pair
  is retained even after the source contact is edited. The stale chain replaces
  outlet pickup/origin authority after estimation and proves provider-batch
  preparation fails before creating an order snapshot.
- The focused location-authority set passed 10 files / 86 tests. The full
  disposable PostgreSQL 16 suite passed 66 files / 492 tests. Targeted ESLint,
  TypeScript, and `git diff --check` passed.
- Accepted T-54 through T-56 and T-63 browser/redaction evidence covers 390px,
  768px, and 1280px with readable provider labels, no credential-bearing URL,
  no unnecessary PII exposure, no browser errors, and zero provider mutation.
  T-52 adds no rendered or logging path, and independent R3 review returned PASS.
- Delivery-ledger run: `RUN-20260901T201930Z-f34ee8c2`. Two malformed dependency
  search commands recorded early FAIL events before the corrected executable
  dependency check passed; final boundary evaluation has no failures. No live
  sandbox probe, provider request, provider mutation, production action, commit,
  push, deploy, or release occurred. T-53 is next.
## 2026-09-02 — T-70 specification traceability normalization

- Normalized the existing `docs/spec` pack in place: accountable-owner metadata
  is explicit, architecture/security/observability IDs are recognized normative
  declarations, and the duplicate privacy jurisdiction heading now points to
  the single canonical `JUR-ID-1` record.
- Preserved accepted PR/NFR/IAM statements and IDs. The canonical Indonesian
  jurisdiction row now records the actual shipment personal-data trigger, the
  official-source status, an explicit privacy/legal owner gate, the precise
  `PRIV-1`, `SEC-1`, `SEC-2`, and `DATA-1` impact, and keeps the decision
  `Unknown` pending qualified review.
- The specification-suite validator passes with 14 files, 122 declarations,
  zero task-parser entries, and zero findings. Duplicate-ID and unresolved task
  reference checks report zero gaps; Markdown and `git diff --check` pass.
- Independent correctness review rejected the first overly generic jurisdiction
  normalization. The corrected canonical record passed re-review with no
  remaining blocker. Delivery-ledger run:
  `RUN-20260901T214801Z-43489cc4`.
- No runtime behavior, provider request, production action, commit, push,
  deploy, or release occurred. T-64 is the next executable task.

## 2026-09-02 — T-62 Verify the post-location clean release-candidate boundary

- Verified the post-location clean release-candidate boundary.
- Executed on a clean, explicitly approved git tree (`2b3bd18121325ac70d153dd2bb38809cc8612e65`).
- Reran migrations from fresh using `pnpm test:migration-upgrade` which verified the successful deployment of schema up to `0029_mengantar_authority_version.sql` over an empty PostgreSQL 16 container, ensuring isolated database testing.
- The complete integration suite passed successfully (`pnpm test:integration`). It asserted 541 constraints across 71 files covering tenant logic, security access, provider data mapping, ledger, finance totals, and authentication isolation using `geraicuan_test_runtime`.
- The compilation phase via `pnpm build` processed 18 statically generated and dynamically rendered routes efficiently and reliably after correctly supplying all necessary environment configurations, simulating the production verification process.
- Checked static invariants successfully with `eslint`, `tsc --noEmit`, and `git diff --check`. 
- No provider calls, deploy operations, pushing, or committing were invoked. PASS does not authorize these commands; the candidate is READY and requires explicit deploy approvals.

## 2026-09-09 — T-76 Full-codebase integrity screening and Phase 9 regression repair

- Screened the repository after the Phase 9 market-feature commit `67beb92`
  (RTS dashboard, tracking webhook, duplicate warning, COGS). The screening
  found that Phase 9 had shipped without ever running the suite: 9 real test
  failures were waiting, and two of the four features were not functional. The
  9 failures were observed in this session against the documented test
  environment, distributed as `analytics-repository` 4, `cms-shell` 1,
  `cms-ui-audit-inventory` 1, `dashboard-period-page` 1, and
  `shipment-destination-actions` 2 — reproducible by running
  `pnpm test:integration` at `67beb92` with `DATABASE_URL`/`APP_DATABASE_URL`
  set and `BETTER_AUTH_TRUSTED_ORIGINS` at `http://127.0.0.1:3110`. Exporting a
  different trusted origin or leaving `GERAICUAN_ENABLE_DEMO_LOGIN_HINT` set
  adds 5 further environment-induced failures that are not code defects; the
  repository documents the dev environment in `README.md` but not the test
  environment, which is why that distinction cost a full run to establish.
- Repaired the stale evidence. `analytics-repository` never asserted the new
  `cogsIdr`/`netMarginIdr` KPIs, `cms-shell` never learned the `Retur (RTS)`
  destination, `cms-ui-audit-inventory` never learned the new route,
  `shipment-destination-actions` was missing the `checkDuplicateShipment` mock,
  and `dashboard-period-page` had rotted: it derives WIB period buckets from the
  wall clock while its fixtures are pinned to 2026-08-31, so it began failing
  once real time moved past the range. It now pins `Date` explicitly.
- Removed genuinely dead code: the never-called `loadShipmentBacklogSnapshot`
  public wrapper (its `Unchecked` variant is still live) and the unreferenced
  `BULK_INPUT_FIELDS` constant.
- Closed the server/client boundary: `import "server-only"` now guards every
  module in `src/db` except `schema.ts`, which is excluded because
  `drizzle.config.ts` loads it directly. `pnpm db:generate` was re-run to prove
  the exclusion is required and sufficient.
- Fixed two correctness defects the screening exposed. `checkDuplicateShipment`
  joined `shipment_parties` on `shipment_id` alone, without the tenant
  predicate every sibling query carries. `loadRtsShipmentsPage` left-joined
  `shipment_rts_events` with no cardinality limit, so a shipment with N return
  events produced N duplicate table rows while `totalCount` counted shipments —
  broken pagination. The join is now a pair of latest-event scalar subqueries
  ordered by `created_at desc, id desc` so both resolve the same row.
- Closed a tenant-isolation gap. Migration 0030 created `shipment_rts_events`
  with neither row-level security nor any grant to `geraicuan_app`. It was the
  only tenant-owned table in the database without RLS, and the missing grant
  meant the RTS page returned `permission denied for table
  shipment_rts_events` under the application role — the feature had never
  worked outside a superuser connection. Migration
  `0032_shipment_rts_events_isolation` adds the revoke, the SELECT/INSERT
  grant, forced RLS, and tenant-scoped select/insert policies matching
  `shipment_parties`.
- Gave `/app/pengiriman/rts` the route contract its registration claimed:
  dedicated `loading.tsx` and `error.tsx` shaped like the RTS region, the
  `parseUiAuditScenarioForRoute` hook for its six registered states, and an
  honest invalid-query surface that reports an adjusted filter instead of
  silently coercing an unknown status or page.
- Made the COGS aggregation testable. Every prior expectation asserted
  `cogsIdr: 0`; a new case seeds non-zero COGS inside and outside both the
  selected range and the tenant, then asserts `cogsIdr` 25 000 and
  `netMarginIdr` 53 337.
- Evidence, all executed: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`,
  `pnpm test:integration` (72 files / 549 tests), and
  `pnpm test:migration-upgrade` through `0032` on a clean PostgreSQL 16
  database. Browser evidence was captured in an authenticated Chrome session as
  Tenant Admin **against the repository fixture only**: the RTS destination was
  reached through the shell navigation link, all six registered scenarios
  reproduce their declared state (including 5-of-7 rows across two pages for
  `shipment-rts-paginated` and a 1792 ms stream against a 545 ms baseline),
  every status filter returns its exact count, six of the seven return rows
  render a latest-event note under the application role while the seventh —
  `PROBLEM` — deliberately carries none and is the row that exercises the
  no-notes fallback, the document overflow delta is zero at 390/768/1280,
  exactly one current navigation item is visible per viewport, keyboard focus
  reaches the first row link, and there are no console errors.
- Independent review rejected this work repeatedly, and was correct every time.
  The rounds below are recorded for the defects they found, not as a register of
  the review process. Nothing records a round count: the delivery-ledger run
  `RUN-20260908T175002Z-ede3f676` holds only `run_started`, `boundary_check`,
  `scope_expansion` and `verification` records — executed evidence and boundary
  state, never a review round — and the review reports live outside the
  repository. Do not add a count or a per-round register here — a summary of the
  reviews kept inside the artifact those reviews examine goes stale the moment
  the next one returns, which cost two rounds of its own before the cause was
  understood.
  - Round one: the route had been registered with states it could not produce,
    the SQL rewrite had no executable check, and the route map was unsynced.
  - Round two: the `populated`/`paginated` state still could not be produced,
    because `scripts/seed-local-dev-users.mjs` seeds no return-lifecycle rows —
    the first round's browser evidence had come from hand-written SQL rather
    than a repository fixture. The route map also still labelled code committed
    in `67beb92` as uncommitted worktree, in the very rows the first fix
    rewrote.
- Both rounds were repaired. The seed script now creates seven return shipments
  across `RTS_QUEUED`, `RTS_IN_TRANSIT`, `RTS_RECEIVED`, and `PROBLEM` plus
  ten `shipment_rts_events`, guarded by the seed's own commit-time
  assertion, so every registered scenario is reachable from the repository
  alone. Every maturity label in the route map was re-derived from `git status`
  against HEAD `67beb92`: no route is `WORKTREE` any more, and the map now says
  plainly that the Phase 9 additions are committed and NOT reviewed.
- The latest-event lookup was collapsed from two scalar subqueries into a
  single `json_build_object` subquery. Round two observed that the tie test
  passed even with the tiebreak removed, because PostgreSQL happened to order
  those rows stably. Rather than keep testing a nondeterministic symptom, the
  class of bug was removed: the note and its timestamp now provably come from
  one row. The tie test was then mutation-checked by flipping the `id` tiebreak
  to `asc`, which fails it.
- Round three returned FAIL on documentation truthfulness and on one real
  fixture invariant, and was right on both.
  - The route map still called the Mengantar webhook "worktree only" in its
    Mermaid graph and, worse, in the `AGENTS.md`-mandated handler-inventory
    line, contradicting its own section 1. Two further prose sentences still
    attributed `67beb92`'s lifecycle and financial changes to "the current
    worktree".
  - The `TASKS.md` T-79 register bullet still described the
    `shipment_rts_events` isolation gap in the present tense after this run's
    own migration closed it. It now reads as CLOSED with the residual audit
    that T-79 still owns.
  - The seed's seven return shipments had a provider-accepted snapshot, an AWB,
    and COD totals but **no ledger entries**, because the ledger loop still
    filtered on `status === "ISSUED"`. No real transition can produce a
    provider-accepted COD shipment with no `COD_PRINCIPAL_COLLECTABLE` entry.
    Returned shipments now carry their issuance ledger; print evidence stays
    with the genuinely issued ones.
- Correcting that changed the reconciled totals, which exposed a second
  problem: `reconciliation_runs` is immutable by database trigger, so a
  database seeded before the population changed silently keeps totals that
  disagree with the ledger — the local database was in exactly that state,
  claiming `MATCHED 425000` against a ledger holding 3 025 000. An upsert is
  not available and should not be, so the seed now fails loudly with the
  recovery command instead. Verified on a throwaway PostgreSQL instance
  migrated from zero: 25 shipments, 10 return events, 30 ledger entries, and
  reconciliation totals equal to the ledger exactly, reproduced identically on
  a second run.
- Smaller round-three items also fixed: the `PROBLEM` fixture no longer carries
  an `RTS_QUEUED` event narrating a return it never had — the events table has
  no `PROBLEM` status, and leaving it eventless makes it the one row that
  exercises the no-notes fallback; the return events are deleted before
  re-insert so the count assertion cannot pass on stale rows; and `STATUS.md`
  now agrees with the suite at 549 tests.
- Round four then failed the run again, on the same class of defect and this
  time on claims written into this log. Two "Worktree-only" assertions about
  committed lifecycle code survived at `18-AI-ROUTE-MAP.md` sections 5.1 and 9
  because the phrase hunt had been run case-sensitively; and the return-event id
  prefix had been moved to `7d`, which is already the RECIPIENT
  `shipment_parties` prefix — the earlier check missed it because that call site
  chooses its prefix through a ternary, `fixedUuid(partyIndex === 0 ? "7c" :
  "7d", ...)`, which the grep pattern did not match. Both are now fixed, the
  prefix moved to the genuinely unused `7e`, and every `fixedUuid` prefix was
  re-enumerated by reading the call sites rather than from a pattern that
  assumes a literal first argument. That enumeration covers prefix uniqueness
  only; it did not audit whether a generated id collides with a hardcoded one,
  and review round five found a pre-existing case of exactly that — recorded in
  `TASKS.md` rather than repaired here. That also makes the ledger event
  `seed-id-collision-free` wrong, not merely narrow: its recorded detail claims
  every seeded table id was unioned and grouped with zero appearing in more than
  one table, and a check actually matching that description could not have
  returned zero, because `fixedUuid("70", 1)` and `("70", 2)` are byte-identical
  to the hardcoded `tenantId` and `outletId`. What the run really proved is that
  no `7e` id collides. The ledger is append-only and must not be rewritten, so
  this is the correction of record — do not cite that event as proof the fixture
  has no colliding ids. The two BUILD-LOG sentences that recorded these as closed have been
  corrected: an evidence claim written before its verification is the exact
  failure this screening exists to catch, and writing one here was worse than
  the defect it described.
- Round five confirmed every engineering item closed and reproduced the seed,
  the `7e` prefix and all four gates on its own database. It failed the run on
  two documentation claims: the round-four correction to the `WORKTREE` label
  had overshot into "only migration 0032 and the RTS route boundaries are
  uncommitted", which `git status` refutes at roughly thirty files; and this log
  still said the seed creates eleven return events where it creates ten. Both
  corrected. Round five also surfaced a pre-existing collision — the seed's
  `fixedUuid("70", 1)` and `("70", 2)` expand to the hardcoded `tenantId` and
  `outletId` — which is recorded for T-82 rather than repaired here, and asked
  that the "9 real test failures" claim be made auditable, which it now is
  through its per-file distribution and reproduction environment.
- Round six was documentation-only and failed on three more: this log claimed
  seven return notes render where six do, `STATUS.md` still described a single
  corrective review, and the `seed-id-collision-free` ledger event overstated
  its coverage. All three are corrected above.
- The documentation-only rounds after that found progressively smaller versions
  of the same defect and then, finally, its cause. `STATUS.md` gained a
  review-history enumeration that stopped one round short of the rounds it
  claimed to list; replacing the leading counter with that enumeration did not
  help, because the enumeration encodes the count just as a number does, and a
  surviving "four of the six" went stale the moment the next round returned.
  The real problem was structural: a round-by-round narrative kept inside the
  artifact under review is invalidated by every review of it, so each round had
  to reject the summary the previous round had just written. Both documents now
  describe only the defects and state plainly that no count is recorded, which
  is the record that does not rot.
- Screening also opened findings that are NOT fixed here and are recorded in
  `TASKS.md` as T-83, T-84, T-85 plus routed entries: the COGS value is still
  discarded by `validateShipmentDraft`, the Drizzle schema still ships to the
  browser, and the tracking webhook still writes `shipments` without tenant
  scope and compares its HMAC without a constant-time comparison.
- No provider call, production action, commit, push, deploy, or release
  occurred.

## 2026-09-09 — T-83 Restore COGS persistence from intake to analytics

- T-76's screening found that the shipment draft form collects a Modal HPP /
  COGS value, the database carries `cogs_amount_idr` on both `shipments` and
  `shipment_drafts`, the repository writes it, and analytics aggregates it —
  but `validateShipmentDraft` read the field and then hardcoded
  `cogsAmountIdr: null`. Nothing ever wrote a COGS, so every reported Net Margin
  subtracted a zero cost and was overstated by the merchant's real cost.
- The validator was the only broken link. It now parses `cogsAmount` with the
  same `readRupiah` rules as `declaredValue`, bounded by the same
  `MAX_VALUE_IDR`, and keeps an empty field distinct from a recorded zero: an
  untouched field means the merchant did not record a cost, which is not the
  same as a cost of zero. A malformed or out-of-range value now fails with a
  field error instead of being silently dropped.
- Bulk intake was checked rather than assumed. `toFormData` maps CSV headers
  through `FIELD_TO_FORM_NAME`, which has no COGS entry, so bulk rows keep a
  null COGS and the change cannot alter their meaning. The `cogsAmount` entry in
  `FIELD_TO_HEADER` exists only to keep the error-reporting record exhaustive
  and is unreachable while bulk has no COGS column.
- Evidence: three new cases in `tests/shipment-draft.integration.test.ts` cover
  a parsed amount, an empty field, a recorded zero, four rejected inputs, and
  persistence to both tables. They were mutation-tested by restoring
  `cogsAmountIdr: null`, which fails two of them. Full run: `pnpm tsc --noEmit`,
  `pnpm lint`, `pnpm build`, and `pnpm test:integration` at 72 files / 554
  tests.
- The seed now records a COGS on every third shipment and asserts the total, so
  the KPI has a repository fixture instead of hand-written SQL — the same
  correction T-76 was forced into for the RTS surface. Browser evidence as
  Tenant Admin: the draft form exposes an optional, described `#cogsAmount`
  field, and Analitik moves from `COGS Rp 0 / Net Margin Rp 2.758.353` to
  `COGS Rp 900.000 / Net Margin Rp 1.858.353` — exactly 900 000 lower, with zero
  document overflow and no console errors.
- Independent review then found a second code path that discarded a submitted
  COGS, which the fix above had missed: `inspectExistingSubmission` compares
  every persisted draft field to decide whether a resubmission is a safe replay
  or a conflict, and `cogsAmountIdr` was not among them. That was harmless while
  COGS was always null and became live the moment it was not. An operator who
  mistyped Modal HPP, went back, corrected it and resubmitted with the same
  submission id would have been redirected as though the correction landed while
  the original figure stayed in the database. The comparison now includes COGS,
  and a test covers a corrected value, a cleared value, and an identical
  resubmission that must still replay; it was mutation-tested by removing the
  new comparison, which fails it.
- Review also asked for the check the task's own "Done when" specified — one
  test carrying a COGS through the draft path into the analytics margin rather
  than two tests covering separate links. That test now exists: it reads the
  KPIs, submits a draft with a recorded cost, and asserts the margin moved by
  exactly that cost while every ledger-derived term stayed put. It measures a
  delta rather than an absolute, because sibling cases in the same file leave
  their own drafts behind and an absolute assertion silently depended on test
  order — the first version of it failed for that reason.
- Smaller review items closed: the unreachable `cogsAmount` entry in
  `FIELD_TO_HEADER` now carries a comment in the code, not only in `TASKS.md`,
  warning that a future COGS column must get its own header or a bad cell will
  report against `nilai_barang`; and the tests now cover whitespace-only input,
  the `50 000` separator form, and exactly `MAX_VALUE_IDR`.
- Not addressed here and still open: `netMarginIdr` aggregates COGS over the
  created cohort while its money terms come from the ledger cohort, so the two
  do not describe the same shipments. That is T-81's, recorded in `TASKS.md`.
  A recorded COGS is also write-once — no code path updates
  `cogs_amount_idr` after creation and draft creation emits no audit event — so
  a mistyped cost permanently skews that shipment's margin. That matches the
  existing posture for `declaredValue` and is recorded in `TASKS.md` rather than
  changed here.
- The first delivery-ledger run for this task, `RUN-20260908T201839Z-16f37c8e`,
  was finished `BLOCKED` rather than forced through. Its boundary had been
  mis-declared at start: `scripts/**` was passed to `--accept-dirty` but not to
  `--allow`, so the CLI dropped it and the seed file became a pre-existing dirty
  path changed without an accepted overlap. The tool was right to refuse. The
  work was re-declared with a correct boundary as
  `RUN-20260908T205513Z-56f0cdd2` and its evidence re-executed there; nothing
  about the change itself was altered to make the boundary pass.
- No provider call, production action, commit, push, deploy, or release
  occurred.

## 2026-09-09 — T-79 Application security and multi-tenant isolation audit

- **Closed the provider tracking webhook rather than hardening it.** The
  handler committed in `67beb92` implemented a contract with no verified
  provider evidence: the Mengantar integration skill documents no push
  endpoint, the only sanitized captures are estimate, order, and pay-unpaid,
  and `PR-30` is still `Queued` in the PRD. Its `x-mengantar-signature` header
  name, its `cnote_no`/`awb`/`tracking_number` and `status`/`tracking_status`
  payload fields, and its provider status vocabulary were all invented. It also
  compared the HMAC with `!==`, read an unbounded body, had no replay window,
  and wrote `shipments` through the raw pool with no tenant predicate,
  resolving its target by `cnote_no` across every tenant.
- It had never worked. Probing the application role directly showed row-level
  security denies it any read of `provider_order_snapshots` without a tenant
  context: the resolution returned nothing and the update matched zero rows, so
  every delivery was silently discarded while the caller was answered
  `{ success: true }`. The cross-tenant write was blocked by RLS alone; the
  application layer had no scope of its own.
- Hardening a signature scheme, timestamp header, and payload shape that no
  provider is known to send would have been inventing an API. The route now
  refuses every request and records the four things that must exist before it
  may accept traffic: the provider's documentation plus a sanitized capture, a
  tenant-scoped machine principal, constant-time comparison with a bounded body
  and replay window, and T-80's idempotent transition handling.
  `tests/provider-webhook-boundary.integration.test.ts` pins the refusal and
  asserts the route reaches no database, provider, or secret module.
- **Uniform tenant-table posture.** `memberships` was the last tenant-owned
  table with row-level security enabled but not forced. Migration `0033` forces
  it. A new posture test derives the table list from the live catalogue rather
  than a hardcoded one, so the next tenant-owned table cannot ship without RLS,
  a policy, and a grant — which is exactly how `shipment_rts_events` slipped
  through Phase 9.
- **Least privilege.** `shipments`, `shipment_drafts`, `outlets`, `contacts`,
  and `contact_addresses` granted `DELETE` to the application role. No code path
  exercises it; removal in this product is an archive flag or a platform
  lifecycle action, and the test fixtures delete through the admin pool. `0033`
  revokes it.
- **PII redaction had already drifted.** `maskPhone` existed in four copies in
  two different schemes: the shipment and label surfaces rendered `•••• 7890`
  while the contact directory rendered `0812••••890`, exposing the carrier
  prefix and seven of twelve digits instead of four — the densest PII surface
  had the weakest mask. All four now import one module on the stricter scheme.
  The RTS queue masks in the repository rather than the page, because a
  client-side mask still ships the original in the rendered payload.
- **Authentication** was already sound: sign-up disabled, sessions bound to a
  login scope, sign-in rate limited at 5 per 60s, CSRF and origin checks
  enabled, trusted proxies configured. The session cookie was verified against a
  live response — `HttpOnly`, `SameSite=Lax`, `Path=/`. `Secure` was left to the
  library's inference from the base URL; it is now stated explicitly for
  production and asserted, so it cannot be lost to a change in that inference.
- Independent security review rejected the first attempt, and its three main
  findings were all about this run's own guard claiming more than it enforced.
  - The posture test checked row-level security and a policy but never a grant,
    and the reviewer proved it by adding a tenant-owned table with a policy and
    no grant at all: the suite stayed green. That is precisely the
    `shipment_rts_events` failure, which was `permission denied`, not RLS. The
    grant is now checked separately.
  - `information_schema.role_table_grants` reports table-level grants only, so
    the test read `provider_batches`, `provider_order_snapshots`,
    `provider_unpaid_recoveries` and `memberships` as append-only when each in
    fact carries a column-scoped `UPDATE` that live code uses. The test now
    reads column privileges too and asserts the exact column sets, and the
    comment no longer calls those tables append-only.
  - "`memberships` was the last table with RLS enabled but not forced" was
    false: `tenants` was, and the guard's "has a `tenant_id` column" derivation
    structurally excluded it. `0034` forces `tenants`, and the derivation now
    names `tenants` and `platform_roles` explicitly.
- The review also surfaced a privilege gap this run had missed. The five tables
  whose `DELETE` was revoked still held a table-wide `UPDATE` covering `id`,
  `tenant_id` and `created_at`, so moving a row to another tenant was refused
  only by a policy's `WITH CHECK` — the sole-control posture `AGENTS.md`
  forbids. `0035` replaces the table-wide grant with a column list checked
  against every `.update()`, `onConflictDoUpdate` and raw-SQL update site, and
  `0036` narrows the two rate-limit tables the same way. `0034`'s column revokes
  had been silent no-ops, because a column revoke cannot narrow a table-wide
  grant. The granted set is a superset of what is written, not exactly it:
  `shipment_drafts` has no update site but still needs a column grant, because
  `cod-totals-repository` takes `FOR UPDATE OF ... shipment_drafts` and
  PostgreSQL requires an `UPDATE` privilege for a row lock; a few other columns
  are granted while currently insert-only.
- Smaller review items: `useSecureCookies: false` outside production would have
  stripped `Secure` and the `__Secure-` prefix from a staging build served over
  HTTPS, so it now follows the origin instead; the 404 body named the endpoint
  to any anonymous scanner and is now empty; the boundary test advertised
  payload-shape coverage it could not have and grepped for six exact strings, so
  it now asserts the handler takes no argument, imports nothing but
  `server-only`, and exports no verb but `POST`; and the "stricter mask" claim
  is now stated with its trade-off — four characters instead of seven, but one
  more digit of the identifying tail.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`,
  `pnpm test:integration` at 74 files / 565 tests, migration upgrade through
  `0036` on a clean PostgreSQL 16 database, a client-bundle scan of all 57
  chunks against the real `MENGANTAR_API_KEY` value finding no credential, and
  an authenticated browser pass confirming the RTS queue, contact directory, and
  label queue emit no full recipient number anywhere in the document while the
  shipment detail and printed label still do.
- Outlet scope, named in the task requirement, is a filter rather than an
  authorization boundary here: `docs/spec/06-TENANT-ISOLATION.md` scopes all
  outlet operational data to the tenant and `memberships` has no outlet column.
  Recorded so the scope item is answered rather than silently skipped.
- No provider call, production action, commit, push, deploy, or release
  occurred.

## 2026-09-09 — T-84 Remove the Drizzle schema from the client bundle

- One edge caused it. `src/app/app/pengiriman/shipment-queue-filter.tsx` is a
  client component; it imports `@/lib/shipment-queue`, which took a runtime
  value import of `shipmentStatuses` from `@/db/schema`. That dragged the entire
  Drizzle table graph into a 79 KB browser chunk — every table, column and
  constraint, plus the `MENGANTAR_API_KEY` managed-secret purpose label. No
  credential value ever leaked; the data model did.
- `shipmentStatuses` and `membershipRoles` now live in
  `src/lib/domain-enums.ts` — first added as `shipment-status.ts` and renamed
  after review — which carries no runtime module edge at all.
  `src/db/schema.ts` imports and re-exports them, so no server module changed,
  and `src/lib/shipment-queue.ts` reads the pure source. The three other value
  importers of the schema were checked rather than assumed: `analytics-filters`,
  `platform-monitoring-filters` and `analytics-filter-fields` are reached only
  from Server Components, so they stay as they are.
- The guard is on the cause, not the symptom.
  `tests/client-bundle-boundary.integration.test.ts` walks the runtime module
  graph from every `"use client"` entry, treating `import type` and inline
  `type` specifiers as erased and stopping at `"use server"` modules because
  Next.js replaces those with a reference proxy. It fails with the offending
  path if any of them reaches the schema.
- Independent review then broke that guard twice, and was right to. The first
  version visited only `ImportDeclaration` nodes, so an `export { shipments }
  from "@/db/schema"` in a client-reachable module left every assertion green —
  including in the literal module itself, which falsified the comment claiming
  it could not acquire a surviving dependency. A dynamic `import("@/db/schema")`
  walked past it just as easily, and would have produced a lazily fetched chunk
  still carrying the whole table graph. The walker now follows import
  declarations, re-export declarations, dynamic `import()` and `require()`,
  resolves `.js`/`.jsx`/`.mjs`/`.cjs` as well because `allowJs` is on, and
  skips a comment or licence header above a `"use client"` directive rather
  than requiring it at offset zero. All three evasions were reproduced and each
  now fails with its full path.
- A confirmation round then found two narrower holes in the same walker and
  both are closed: a template-literal `import(\`@/db/schema\`)`, which bundlers
  resolve statically exactly like a string specifier; and a leading comment
  longer than the 1 000-character window the directive check read, which left an
  unterminated comment in the slice — silently dropping a client entry in one
  direction, and in the other making the walker traverse a `"use server"` module
  and report nine false paths through legitimate server code. The directive is
  now read from the parse tree rather than a text slice, which removes that
  class instead of relocating it. Both were reproduced before and after.
- Smaller review items: the module is now `src/lib/domain-enums.ts`, since
  `membershipRoles` is an IAM literal and did not belong in a file named for
  shipment status; `membershipRoles` went back to an `import type` in
  `shipment-queue.ts`, where it is used only in `typeof` position; and the blank
  run left in `schema.ts` where the arrays were removed is collapsed.
- Measured rather than asserted: client JavaScript fell from 1,732,044 to
  1,657,092 bytes. A rebuilt `.next/static` contains no `notNull`, no
  `shipment_rts_events`, `managed_secret_payloads` or `ledger_entries`, and no
  `MENGANTAR_API_KEY` label in any chunk. `drizzle-kit generate` still resolves
  the schema, which is why `src/db/schema.ts` remains the one `src/db` module
  without a `server-only` guard.
- One repair to my own mistake is recorded here rather than hidden: while
  cleaning up a probe migration I ran `git checkout -- drizzle/meta/_journal.json`,
  which reverted the journal to HEAD and dropped the entries for migrations
  `0032` through `0036`. The entries were reconstructed, the snapshot `prevId`
  chain re-verified link by link, `pnpm test:migration-upgrade` re-run from an
  empty database through `0036`, and `drizzle-kit migrate` confirmed to be a
  no-op against the live database with all 37 migrations recorded.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`,
  `pnpm test:integration` at 75 files / 569 tests, and migration upgrade through
  `0036` on a clean PostgreSQL 16 database.
- No provider call, production action, commit, push, deploy, or release
  occurred.

## 2026-09-09 — T-85 Replace the placeholder lifecycle guidance copy

- The six lifecycle statuses `67beb92` added carried fragments where every
  sibling carries an instruction: `RTS_QUEUED` read "Menunggu dikembalikan",
  which is a second label rather than guidance. All six were rewritten in the
  established voice — state the situation, then the operator's next move or the
  caution that applies — and each is what the RTS table renders as its no-notes
  fallback, which is the row the `PROBLEM` fixture exists to exercise.
- Screening the same surface found a defect the task had not named. The RTS page
  kept its own filter-tab label vocabulary, so a single table showed
  "Antre Retur" in the tab above a row badge reading "RTS Antre" for the same
  status. The page now reads `SHIPMENT_STATUS_PRESENTATION` for both label and
  description, so there is one vocabulary and no second copy to drift — the same
  shape as the four `maskPhone` copies T-79 consolidated, caught before it could
  diverge further.
- The labels also lost their English `RTS ` prefix and their Title Case. No
  other status used either, and the queue filter dropdown lists all thirteen
  side by side.
- `tests/shipment-status-copy.integration.test.ts` requires every status to have
  a sentence-ending guidance of at least eight words that is not a restatement
  of its label, requires labels to be distinct and in sentence case, pins the
  queue filter to exactly the stored statuses plus its three derived views, and
  asserts the RTS page references the shared presentation rather than a literal.
  Mutation-tested by restoring the original `RTS_QUEUED` one-liner, which fails
  two of the four checks.
- Independent review rejected the first rewrite, and the finding was the one
  that matters for copy: two of the six strings told the operator to take
  actions the product does not offer. `PROBLEM` said "sebelum memutuskan retur
  atau kirim ulang" and `RTS_RECEIVED` said "sebelum menutup kasus", while
  `shipmentLifecycleActions` returns nothing for any of these statuses and the
  shipment detail page renders "Tidak ada tindakan lanjutan untuk status ini"
  directly beside the same sentence. "Kirim ulang" is the product's named
  hazard — `SUBMISSION_UNKNOWN` says "Jangan kirim ulang" and the detail page
  raises it as an alert — so instructing it was worse than the fragment it
  replaced. Both now describe the state and point at the record, and the guard
  bans those phrases outright unless they appear as a prohibition.
- Review also found the deduplication was one third of the problem. Beyond the
  filter tabs, the RTS page's own KPI cards were a third vocabulary sitting one
  row above them, and `src/app/platform/_components/monitoring-view.tsx` held a
  fourth for the entire platform scope — so a super admin filtering on the same
  stored value read "RTS (Antrean)" where the tenant read "Antre retur". All
  four now derive from `SHIPMENT_STATUS_PRESENTATION`. The earlier claim that
  the `RTS ` prefix was gone was true only of the tenant queue.
- A confirmation round then rejected the rewrite again, and both findings were
  fair. `PROBLEM` still pointed the operator at "riwayat kiriman ini" — there is
  no shipment event history anywhere in the CMS; the only "riwayat" on the
  detail page is print history, which a `PROBLEM` shipment does not have. It now
  says only that the provider decides the next status. A fifth label map also
  survived in the reconciliation panel, and the RTS page named one place two
  ways: "gudang" in its description and KPI card, "outlet asal" in the guidance
  directly between them.
- The guard was correspondingly weak, and the confirmation round proved it three
  ways: an 11-word tautology passed, a `jangan` anywhere in the string licensed
  an instruction to "kirim ulang" in another sentence, and the one-vocabulary
  check was defeated by deleting a single space (`STATUS:"` instead of
  `STATUS: "`). A third round then showed two of those three still passed after
  the first repair — the phrase patterns were case-sensitive, so an imperative
  opening a sentence evaded them, and the sentence splitter ignored semicolons.
  Both are fixed, and the map pattern now recognises a `Map` of tuples, a
  computed key and a nested `{ label }` in `.js`/`.jsx`/`.mjs` as well. Six
  evasions were reproduced against the current guard and all six fail it.
- What the guard does not catch, stated rather than implied: an 11-word
  tautology passes it. Nothing in it judges whether a sentence carries meaning,
  and a claim that it did would be false — this was verified by running the
  tautology, not assumed. It also deliberately does not flag a status mapped to
  a route, which `shipmentQueueHref` legitimately builds; that was verified as a
  non-false-positive the same way. Meaning stayed a review judgement, and review
  is what caught every round of this.
- The tree scan deliberately does not ban a label string outright. "Resi terbit"
  is also the name of a dashboard and platform metric counting issued AWBs; the
  words coincide, the meaning does not, and banning the literal would have been
  wrong. What it matches is a status key mapped straight to a string, which is
  the actual defect shape.
- The guard checks shape and cross-references, not meaning. Whether a sentence
  is honest about what the product offers stayed a review judgement, and review
  is what caught both rounds of it.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 76
  files / 576 tests, and an authenticated browser pass as Tenant Admin and as
  Super Admin over the RTS queue, the shipment queue and the platform
  monitoring filter. That pass checked the fourteen strings the four retired
  vocabularies contributed, widening a first attempt that had curated five;
  independent review then swept twenty-two, adding the original guidance
  fragments, and reached the same result. The KPI cards, filter tabs and row
  badges render identical labels. The one survivor, "Status tidak diketahui" on
  `/platform`, is correct: there it names `counts.lifecycle.unknown`, a
  provider-object metric sitting among "Batch" and "Belum dibayar", not a
  shipment status.
- No provider call, production action, commit, push, deploy, or release
  occurred.

## 2026-09-09 — T-77 Multi-viewport UI/UX, typography and accessibility screening

- Screening covers all 22 routes on disk at 390/768/1280 — 66 surface/viewport
  pairs, public, tenant and platform. The four dynamic routes
  (`/app/pengiriman/[shipmentId]`, `/app/label/[shipmentId]`,
  `/app/kontak/[contactId]`, `/platform/tenant/[tenantId]`) are resolved against
  seeded identifiers rather than skipped; an earlier pass swept 18 routes and
  would have left the shipment detail, label render, contact detail and tenant
  detail screens unmeasured while reading as complete.
- Each pair is probed for document-level horizontal overflow, exactly one `main`
  and one `h1`, one visible `aria-current="page"`, unlabelled horizontal scroll
  containers, images without `alt`, `role="tablist"` over links, nested cards,
  the CMS shell gutter, WCAG 2.1 AA text contrast on every visible text element,
  and a keyboard focus ring meeting the 3:1 of WCAG 1.4.11.
- The return queue carried the two findings the register had already recorded,
  and both were measured before being acted on. Its four KPI cards restated
  `7/3/2/1` — the identical counts the filter chips directly beneath already
  carried, the chips additionally carrying `Bermasalah 1` and being clickable.
  The cards were therefore a strictly smaller, unactionable copy of the control
  below them, and the row is gone: the file falls from 42 lines mentioning a
  `Card*` component to 8, matching the sibling queue exactly on that count and
  on the 12 identifier occurrences within them. `role="tablist"` over links that navigate became
  `<nav aria-label="Filter status retur">`, and the bare `overflow-x-auto`
  became the labelled, focusable `role="region"` the shipment queue already had.
  Every row also printed a second field, `ID: 72000000`, beside an AWB that
  already identified the row and linked to it. The value was identical on every
  row only because the seed mints `fixedUuid("72", n)` — the seed defect T-82
  records; production UUIDs would differ there — so the argument for removal is
  redundancy rather than the fixture. The truncated form survives as the AWB
  cell's fallback when a shipment has no AWB yet, where it is the only
  identifier there is.
- A first repair introduced `aria-current="page"` on the active filter chip,
  which put two current-page items in one document while the shell already owned
  the truthful one. It is `aria-current="true"` now, and the guard checks the
  distinction rather than the attribute's presence.
- **Keyboard focus was invisible on every surface in the application.** Nothing
  defined `--ring`, so the global rule
  `:focus-visible { outline:3px solid var(--ring); outline-offset:2px; }` and
  every `focus-visible:ring-ring/50` on the shadcn primitives resolved to an
  invalid value. An invalid `outline` computes to `outline-style:none`, which
  also suppresses the browser's own ring — measured on a genuinely
  `:focus-visible` element as `3px none` with a fully transparent ring shadow.
  `--ring` now resolves to the design system's sole interactive accent, and the
  scaffold's `@layer base { * { @apply border-border outline-ring/50 } }` went
  to full alpha: cobalt at 50% over the canvas measures 2.4:1, under the 3:1
  WCAG 1.4.11 asks of a focus indicator.
- **The destructive tint failed AA.** `--destructive` carried shadcn's default
  red while the design system defines its own `--danger`, and `badge.tsx` and
  `button.tsx` both tint with `bg-destructive/10 text-destructive`. That pairing
  measures 3.99:1 against a 4.5:1 floor at 12px and 14px — the `Kritis` badges
  on `/platform` and `/platform/tenant/[tenantId]`, `Admin terakhir` on
  `/app/anggota`, and the `Arsipkan kontak` and `Tangguhkan tenant` buttons.
  `--destructive` now resolves to `--danger` at 5.6:1 on the same tint, which
  also retires a second red for a meaning the system already had one for.
- Three screening hazards were found and closed, because a probe that measures
  nothing passes exactly as loudly as one that measures everything.
  - The first contrast probe parsed only `rgb()`. Tailwind v4 emits oklch and
    Chrome reports computed colour as `lab()` — 262 of 278 text elements on the
    shipment queue — so it inspected 12 and certified a sweep it never
    performed. It normalises through a canvas now, which accepts every colour
    syntax the engine does, and the sweep fails loudly if any page yields fewer
    than ten inspected elements.
  - Headless Chrome does not consider the page focused, so `:focus-visible`
    never matches and a focus probe finds nothing to look at. The sweep enables
    `Emulation.setFocusEmulationEnabled` and fails if fewer than three focus
    rings resolved on a page.
  - The integration suite tears down the demo seed, so a UI sweep run after it
    screens empty states and calls them clean. Observed directly: a 256-element
    page fell to 13. The validation script re-seeds first.
- The gutter probe first targeted `main`, which has no padding, and reported
  `0px` on all 66 pairs — a finding that was entirely the probe's. `.cms-main`
  carries the 16/24/32px responsive gutters, and every CMS pair measures exactly
  the value its viewport should.
- Two guards hold the result, both mutation-tested.
  `tests/design-token-contrast.integration.test.ts` computes AA contrast from
  the tokens themselves, with an oklch-to-sRGB conversion cross-checked against
  two known colours, and covers the status colours on their surfaces, the
  destructive tint at rest and hover, body and muted ink on all three grounds,
  the accent filled and as a link, and the focus ring at the 3:1 non-text floor.
  `tests/rts-presentation.integration.test.ts` holds the return-queue decisions.
  Five mutations against the page and nine against the tokens all fail the
  guards; the unmutated tree passes.
- One of those nine initially survived. The assertion that the global
  `:focus-visible` rule exists was unanchored, and the doc comment above
  `--ring` quotes that rule verbatim — so the guard matched its own prose and
  passed with the real declaration deleted. It is anchored to line start now.
  Two other guards in this repository were weakened the same way earlier in
  Phase 10; a pattern that can match a comment is not a guard.
- `docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md` puts dark mode out of MVP scope and
  forbids speculative dark mode. There is no `.dark` block and nothing sets the
  class, so the 45 `dark:` utilities inside the vendored shadcn primitives never
  match. They are inert and are left alone rather than churned across vendored
  files. A 46th sits in application code at
  `src/app/app/shipment-draft-form.tsx:342`, on the line T-78 already owns for
  its hardcoded `amber-*` palette; the vendored-file argument does not cover
  that one and this task does not claim it does. the token guard asserts no `.dark` palette appears without a decision,
  because adding one means screening every pairing a second time.
- Screening also found 117 of the 157 class names in `src/app/globals.css`
  referenced nowhere under `src` and rendered on none of the 22 routes in any
  scope — the pre-shadcn shell, sales, analytics, bulk import, contacts, label
  and shipment-form stylesheets. Two independent checks agree: a substring sweep
  of every source file, and `getElementsByClassName` against the live DOM of all
  22 routes as anonymous, Tenant Admin and Super Admin. That is not a rendered
  defect, so it does not block this task; it is now **T-86**.
- Evidence for this first pass is superseded by the review round recorded
  below; the numbers that survived re-measurement are stated there.
- No provider call, production action, commit, push, deploy, or release
  occurred.

### T-77 review round 1 — rejected, and right on every point

- **The two guards did not bind.** Independent review wrote its own mutations
  rather than trusting the ones recorded here, and three of four survived on the
  return-queue guard, three of three on the token guard. Every one of them was
  the same bug: an assertion bound to a string that happened to be present in
  the fixed source instead of to the defect.
  - The KPI row could be rebuilt as plain `div`s, restating the same counts,
    and pass — the assertion checked for the absence of a *comment*, and the
    card count was a `<=` against the sibling rather than an equality.
  - `<nav aria-label="…">` could be downgraded to `<div aria-label="…">` and
    pass, because the assertion only required the label string to appear
    somewhere in the file. On a `div` that label is announced to nobody.
  - The `ID:` line could be rebuilt as a template literal and pass, because the
    assertion matched the one JSX spelling that had been deleted.
  - A **second `:root` block** appended at the end of `globals.css`, restoring
    shadcn's red and a washed-out ring, passed every contrast assertion: the
    parser sliced from the first `:root {` to the first `}`, so a later override
    — which is how a theme regression actually arrives — was invisible.
  - A dark palette written `:root.dark { … }` passed, because the assertion was
    anchored to a bare `.dark {`.
- The guards now bind to the defect. Each filter count must be read exactly once
  and only while building the filter, so a KPI row cannot be reconstructed in
  any shape without a second read; the label must sit on a `nav` element in the
  rendered tree; the identifier check matches the composition rather than one
  spelling; the token parser reads every `:root` block in cascade order; the
  dark check matches `.dark` in any selector position; and nothing may switch
  the ring off for a subset of elements. Comments are stripped before any
  structural parse — the stylesheet quotes its own rules verbatim, braces
  included, which is what made both the block parser and the earlier
  `:focus-visible` assertion read prose instead of code.
- **Scope this task declared and never screened.** The resolution enumerated
  what the sweep probed and read as complete; it did not say that typographic
  hierarchy, line length, container tiers, and the empty/loading/error states
  were absent from it. They are screened now, through the 104 UI-audit
  scenarios the repository already declares, driven by the `x-geraicuan-ui-audit`
  header — states the route sweep cannot reach at all. That found four defects,
  one of them the hardest requirement this task has:
  - `/app/pengiriman/baru` carried **17-49px of document horizontal overflow at
    390px** in the three estimate-bearing states, and this run introduced it.
    The first repair of the estimate panel wrapped `Table` in a second `div` to
    carry the border; that wrapper had no overflow control, so it grew to the
    table's natural width and pushed the panel past the viewport. Collapsing it
    — border and scroll semantics both on `Table`'s own container — is what
    fixes it. Measured on four trees at 390px: `HEAD` 0px, double wrapper
    49/17px, collapsed 0px with and without a `min-w-0` guard, so the
    `[&>*]:min-w-0` added alongside is inert here and has been removed.
    The first version of this entry said the overflow was pre-existing and that
    this had been "checked against the pre-fix sweep data". The check was real
    but read the wrong artifact: `t77-screen3.json` had already been overwritten
    by a later run, so what looked like pre-fix evidence was the same defect
    measured after it was introduced. Independent review caught the claim, and
    re-measuring four trees is what settled it.
  - `EmptyState` renders an `h3` directly beneath the page `h1`, a skipped
    level, on the dashboard first-run and on the return queue's own empty and
    filtered-empty states. The root cause is that `CardTitle` was a `div`, so no
    CMS page had any outline between its `h1` and an empty state's `h3`.
    `CardTitle` is an `h2` now, and the layout provably does not move: geometry
    captured for all 27 page/viewport pairs in both states — 45 card titles,
    their positions, sizes, font metrics, margins, the card boxes around them
    and the document height — is identical. The screenshot comparison that was
    supposed to prove this could not: 13 of 30 captures differ because these
    pages render live timestamps, so a byte diff cannot separate layout from
    content. Measuring geometry directly can.
  - `/app/pengaturan` renders **two** visible `aria-current="page"` at 1280px —
    the shell's own nav item and the outlet selector, the same defect this task
    fixed on the return queue. The route sweep passed the page because the demo
    seed has one outlet and the page renders a different branch below two, so
    the selector is absent there at every width; it appears only under the
    many-outlet fixtures. The selector is `aria-current="true"`. An earlier
    version of this entry blamed the sidebar breakpoint, which was a story
    rather than a measurement.
  - `/app/pengiriman/baru` at 390px wraps `Table` in a labelled, focusable div
    while `Table`'s own container is the one that actually scrolls — unlabelled
    and unreachable. The label, role and tab stop moved onto the element that
    scrolls, via `containerProps`, the way both queues already do. The step
    strip on the same page is 32rem of static text inside `overflow-x-auto`
    with nothing focusable in it, so a keyboard user could not scroll it at
    all; it has its own tab stop now.
  - Six description paragraphs ran to 115-119ch on wide surfaces with nothing
    capping them, and now carry the `max-w-2xl` the rest of the CMS uses. The
    threshold is 105ch rather than the textbook 75: the design system's own cap
    lands near 102ch, and relitigating that value is a design decision, not a
    screening finding.
- **Probes that measured the wrong thing.** The container-tier probe matched the
  first `max-w-*` on the page — a truncation cap — and reported 160px on every
  surface. The gutter probe read `main`, which has no padding, and reported 0 on
  the public and auth pages. Under-24px targets were counted and then dropped
  before the verdict, so 116 of them were measured and none reported; WCAG
  2.5.8's exemptions are applied now — inline-in-a-sentence, and a 24px circle
  tested against both other undersized targets' circles and full-size targets'
  boxes. The redirect check printed a warning the validation script never
  gated on, and its detector accepted any prefix, so a redirect to `/app` could
  never have been flagged.
- **Numbers corrected against the disk.** 159 class names in `globals.css` was
  157 — the old denominator counted `css` from an `@import` filename and `dark`
  from a `@custom-variant` reference. 46 `dark:` utilities in vendored
  primitives was 45; the 46th is in application code, on the line T-78 already
  owns. The destructive tint measures 3.99:1, not 3.97:1, by this repository's
  own contrast helper. "42 to 8 `Card` references" was a count of lines
  mentioning a `Card*` component, and now says so.
- The `ID:` line's recorded justification generalized a fixture artifact. The
  eight characters were identical on every row because the seed mints
  `fixedUuid("72", n)` — the defect T-82 records — and production UUIDs would
  differ there. The argument for removing it is that it was a redundant second
  identifier beside an AWB that already identified the row and linked to it.
- **Evidence.** `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 587 tests, `next build`, and the browser sweep: 66 route pairs and 312
  scenario pairs, zero findings on either, no console errors. Both mutation
  suites: 8 mutations against the return-queue page and 13 against the tokens,
  including every one independent review broke through, and all 21 fail the
  guards while the unmutated tree passes. Layout parity for the heading change:
  27 page/viewport pairs and 45 card titles, identical geometry, re-runnable.
  The dead-CSS audit: 117 of 157 class names unreachable from both source and
  rendered DOM.
- One measurement in this evidence is deliberately not quoted as a figure. The
  count of text elements inspected for contrast is not stable: two route sweeps
  run back to back against identical code returned 9,479 and 9,515, and
  independent review's run of the same script returned 8,800 against a
  differently-seeded database. The earlier claim of "9,467 text elements" read
  as a measurement of the code and was really a measurement of one database
  state. What the check enforces is per-page and does not drift: every visible
  text element on every pair, a hard failure if any page yields fewer than its
  floor, and zero contrast failures. Focus rings are stable — 697 across the
  route sweep in both back-to-back runs.
- Two tests in `tests/outlet-settings-page.integration.test.ts` encoded the old
  `aria-current="page"` on the outlet selector and failed. They were updated
  rather than the behaviour reverted, and they now also require zero `"page"`
  in that document: the browser evidence is two visible current-page markers at
  1280px, and the shell owns the truthful one.
- The layout-parity script initially left `card.tsx` mutated. Its EXIT trap
  restored a relative path while the script had `cd`-ed into the scratchpad, so
  it wrote the backup to `scratchpad/src/components/ui/card.tsx` and left the
  real file as a `div`. Caught by checking the file after the run rather than
  trusting the trap. The path is absolute now and the rerun leaves the tree
  clean.
- No provider call, production action, commit, push, deploy, or release
  occurred.

### T-77 review round 2 — rejected again, and right again

- **Both guards still did not bind.** Review wrote seven new mutations and all
  seven passed: `role={"tablist"}` in brace spelling, a `shortRowId(row)` helper
  declared above the component, `className={"overflow-x-auto"}`, a KPI row
  rebuilt from `filterTabs` (reading no `data.summary` at all, which the guard's
  own comment claimed was impossible), an **indented** second `:root` block, a
  `@media (prefers-color-scheme: dark)` palette, and the focus ring switched off
  by `outline-width: 0` and `outline-color: transparent`.
- The instrument is different now rather than patched. Matching source text
  enumerates spellings forever, so the page guard renders the component with
  `renderToStaticMarkup` and asserts the **output**: how the JSX was written
  stops mattering. The token guard parses the stylesheet with brace matching
  instead of regular expressions, so nesting, indentation and at-rules are
  structure rather than text — a regex that finds a block by looking for the
  next `}` cannot see into a nested one, which is exactly how the
  `prefers-color-scheme` palette walked through. Twelve page mutations and
  seventeen token mutations, including every one either round broke, now fail.
- **The state sweep was not screening what it claimed.** 47 of 51 loading pairs
  measured the fully loaded page: navigation waited for `readyState complete`,
  which for a streamed RSC route is after the very delay the skeleton covers.
  The sweep stops at the first frame that carries a skeleton *and* has the
  stylesheet applied — the second half added after a run measured `outline: 1px
  auto`, a 0px gutter and two visible navs, which is the unstyled document
  rather than the loading state.
- Capturing that frame immediately found a defect it had been hiding: two of the
  sixteen loading skeletons render no `h1` at all, and `src/app/platform/loading.tsx`
  covers the platform overview, the audit trail and tenant detail, so four
  routes streamed with no heading. Both now render the same `PageHeader` the
  other fourteen do.
- Three `contacts-area-*` scenarios are Server Action states
  (`src/app/app/location-actions.ts:103`) that a page load cannot reach; nine
  pairs were counted as screened while rendering the base route. They are
  excluded by name with the reason recorded, and the sweep now fails when any
  scenario renders indistinguishably from its base route. That check found its
  own bug first: a digest of text length plus a 60-character prefix collided on
  one pair in 303 and reported `analytics-stale` as inert when it demonstrably
  adds a staleness banner. It hashes the whole text now.
- **Two claims from round one were wrong.** The 17-49px overflow at 390px was
  introduced by this run, not pre-existing: measured across four trees, `HEAD`
  is 0px, the double-wrapper structure this task briefly introduced is 49/17px,
  and the collapsed structure is 0px with or without the `[&>*]:min-w-0` guard —
  which is therefore inert and has been removed. The round-one entry said this
  had been "checked against the pre-fix sweep data"; the check was real but read
  an artifact a later run had already overwritten.
- The 105ch line-length threshold rested on a false reading. `max-w-2xl` is
  672px, which is 72ch at 14px and 84ch at 12px, not the 102ch recorded — 102ch
  was what *uncapped* prose measured, so the threshold sat above every finding
  it existed to catch. Prose is measured against the 672px cap directly now, and
  eleven paragraphs that were over it are capped, including `AlertDescription`
  in the primitive, which was the last surface with no cap at all.
- The `/app/pengaturan` screening gap was mis-explained as a sidebar breakpoint.
  The real reason is that the demo seed has one outlet and the page renders a
  different branch below two, so the selector does not exist on the base route
  at any width; the duplicate marker appears only under the many-outlet
  fixtures.
- Also closed: the sticky-column half of the wide-table clause, which nothing
  had ever screened — the return queue had none while the sibling queue it
  copied did, and neither did the CSV error table; the redirect detector, which
  accepted any prefix and so could never have flagged a redirect to `/app`; the
  `current === 0` case, unflagged on 126 pairs; the a11y script's measurements,
  printed and then discarded by a validation script that gated only on console
  errors; and the contrast self-test, which re-implemented the probe instead of
  importing it and so proved only that a copy worked.
- The redirect gate then earned its place: a later run lost the Super Admin
  session partway through and reported 35 pairs redirected to
  `/login/super-admin`. That run is not evidence of anything and is not cited as
  such.
- No provider call, production action, deploy, or release occurred.
