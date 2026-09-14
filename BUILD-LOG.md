# Build Log — geraicuan

Record only durable implementation changes, validation evidence, and gotchas that the next maintainer needs. Temporary task narration belongs in neither this file nor global memory.

## 2026-09-14 — T-117 client bundle schema regression

- T-113 had made `src/app/app/analitik/analytics-filter-fields.tsx` a client component while it imported `shipmentStatuses` from `@/db/schema`, reintroducing the T-84 table-graph leak. It now imports `@/lib/domain-enums`. Evidence: `tests/client-bundle-boundary` (mutation-checked), tsc, eslint, browser status options. No commit.

## 2026-09-14 — T-116 shell on the shadcn-admin pattern

- One shadcn `Sidebar` (inset, icon-collapsible) replaces separate sidebar/rail/sheet mounts: GeraiCUAN brand header, grouped icon navigation, footer account menu with sign-out, labelled trigger and separator in the header. Tablet starts on the icon rail; mobile uses the Sidebar Sheet.
- Gotchas: `SidebarMenuButton` keeps hidden tooltips mounted, and each is an Escape layer — the mobile Sheet needed two Escapes until tooltips were limited to the collapsed desktop rail. A footer dropdown with `side="right"` opens past the mobile Sheet edge; use `side={isMobile ? "bottom" : "right"}`. The Sidebar's stock Sheet close is 28px and English-labelled; the shell supplies a 44px "Tutup navigasi". A mounted Radix tooltip marks its trigger with `data-state`, not `data-slot="tooltip-trigger"`.
- Evidence: `tests/cms-shell` and new `tests/cms-shell-render` (rendered markup), mutation checks, tsc, eslint, Chromium at 1440/900/390 including real sign-out and Back. Independent review PASS after one FAIL (mobile sign-out off-screen). No commit.
- Inherited finding routed to T-117: `analytics-filter-fields.tsx` is a client component importing `@/db/schema`.

## 2026-09-14 — T-115 inherited render guards and page eyebrows

- Gotcha: the six "inherited" render failures masked four more assertions behind their first failure; an `expect.soft` scratch copy listed them all at once (deleted after use).
- T-113 had dropped the spec 10 shared page eyebrow from five tenant page families and `/platform`; restored from HEAD. Loading/error headers now repeat their page's eyebrow, title, and width, enforced by a TypeScript-AST guard in `tests/dashboard-error-loading.integration.test.ts` (skeleton order derived from each page's Suspense fallbacks). RTS no longer wraps its queue in Card.
- Evidence: 9 focused suites / 70 tests, tsc, eslint, mutation checks for every rebound guard, Chromium capture of `/app/pengiriman` and `/platform` eyebrows. Independent review PASS after two FAIL rounds. Ledger `RUN-20260914T035112Z-efcb5fea`. No commit.

## 2026-09-14 — T-114 Ringkasan polish and shared shipment reference

- Gotcha: every tenant surface printed `shipmentId.slice(0, 8)`; local fixture ids all start `72000000-`, so every row read the same reference. `src/lib/shipment-reference.ts` (id tail) is now the single source, guarded by `tests/shipment-reference.integration.test.ts` (mutation-tested).
- Ringkasan: chart action in card header, left legend, all daily ticks for ranges up to seven days (monthly keeps the year), KPI comparison under value, caption + freshness in one row, bottom-aligned current-work values, recent shipments as a row list below 640px.
- Evidence: tsc, eslint, reference test; Chromium at 1440/768/390 on port 3125 with zero document overflow. Focused render run 38 pass / 6 fail — the six assert inherited T-113 container class, copy, and Card counts and stay open. Independent review PASS. Ledger `RUN-20260914T021327Z-adae5a88`. No commit.
- Follow-up: `formatShortId` prints provider batch id prefixes on `/platform`.

## 2026-09-13 — Phase 12 contracts and T-87 metric decisions

- Added spec 10 § CMS page patterns (foundation plus six patterns and a route
  coverage table for all 19 CMS page routes), spec 19 metrics/analytics
  contract (metric IDs, severity rules, chart catalogue, lineage diagrams,
  drift register), and the Phase 12 queue T-87 through T-108.
- Gotcha for T-88: the Kiriman `ACTION_REQUIRED` queue and the tested
  `summary.actionRequired` count `AWAITING_UPSTREAM_PAYMENT + SUBMISSION_UNKNOWN
  + FAILED` for every role, while the `/app` "Perlu tindakan" tile correctly
  sums unknown + failed (UX-8) but links to the mixed queue. ACT-NEEDED is
  unknown + failed for both roles; awaiting payment is the Tenant Admin-only
  ACT-UNPAID. A second review caught that defining ACT-NEEDED as the queue
  predicate would have leaked the admin-only count to Operators.
- Gotcha: platform severity labels are threshold-derived
  (`PLATFORM_HEALTH_THRESHOLDS`); only the queue critical-by-age case is tested.
- T-87 recorded D-1, D-2, D-4 from a blanket "follow the recommendations"
  instruction; D-3 (net margin) stays Pending because withdrawing the KPI would
  amend PR-33. Independent review returned FAIL on the first draft (unmapped
  routes, `/app` order against PR-25, violet on an interactive nav item,
  nonexistent constraint IDs) and the findings were corrected in the same run.
  Documentation only; no code, test, provider, or production action.

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
  covers all four platform routes — none of them has a loading file
  of its own — so four routes streamed with no heading. Both now render the same `PageHeader` the
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
- The redirect gate then earned its place: a run lost the Super Admin session
  partway through and reported 35 pairs redirected to `/login/super-admin`. That
  run is not evidence of anything and is not cited as such. A sweep that takes
  half an hour outlives its session, so the sweep now re-authenticates once and
  retries the surface rather than recording a login page as a screened route.
- Evidence after both rounds: `pnpm tsc --noEmit`, `pnpm lint`,
  `pnpm test:integration` at 78 files / 588 tests, `next build`, and a clean
  browser sweep — 66 route pairs and 303 scenario pairs, zero findings on
  either, 51 of 51 loading skeletons captured, zero scenarios rendering
  indistinguishably from their base route, zero redirects, no console errors,
  49 observations of an opaque sticky identifying column across seven distinct
  wide tables and three viewports, shell gutters measured at exactly 16/24/32px
  and container tiers at exactly the four `PageContainer` widths. Three
  scenarios are excluded from the sweep by name and reason, being Server Action
  states a page load cannot reach; four more are swept but exempt from the
  effect check, asking for a populated state the seeded database is already in
  — two different exemptions, not summable into one "nine". Twelve page
  mutations and seventeen token mutations all fail the guards; the unmutated
  tree passes.
- The count of text elements inspected for contrast is still not quoted as a
  measurement. It moved between 38,040 and 43,205 across runs of identical code
  while the focus-ring count stayed within three of 3,609, so it describes a
  database state rather than this tree.
- One more measurement error of my own, caught by checking rather than
  trusting: `pgrep -f "node t77-screen3"` matches the shell wrapper that
  launched it as well as the process itself, so a finished sweep read as still
  running for half an hour. The result had been sitting in the log the whole
  time.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 3 — rejected again, and it found a shipped defect

- **A real product defect, not a guard gap.** The sticky identifying column went
  translucent under row hover. `group-hover:bg-muted/50` compiles to a
  `:is(:where(.group):hover *)` selector at specificity (0,2,0), which beats
  `bg-card` at (0,1,0), so the cell the seven scrolled columns pass beneath
  became see-through exactly when a user pointed at the row. The two tables this
  task had just given a sticky column carried it. They use an opaque
  `color-mix(in oklab, var(--muted) 50%, var(--card))` now — the same colour,
  composited rather than blended at paint time.
- The probe could not have seen it: it read `thead th` and never a body cell, so
  all 49 observations were header-only. It reads the first body cells as well
  now, and rejects a sticky cell whose class carries a fractional-opacity hover
  — and, once that class-name check itself was replaced with one that reads the
  actual cascade (below), rejects a sticky cell that paints translucent for any
  reason at all.
- **The scenario-effect check was vacuous on every tenant route**, and for two
  reasons stacked on each other. `document.body.textContent` includes the
  contents of every `<script>`, so the digest was hashing the RSC flight payload
  — a fresh `self.__next_r` nonce, module ids and per-request UUIDs on every
  load. And the whitespace collapse never ran: this probe is a template literal,
  so `/\s+/` reached the browser as `/s+/` and had been replacing the letter
  "s". Two loads of the same page therefore never agreed, and review measured
  all nine tenant routes drifting. The digest now hashes visible text only, with
  clock-derived strings normalised out, and `digest-stability.mjs` proves nine
  routes are stable across two loads before the check is trusted.
- **The token guard leaked through inheritance and through media context.**
  Custom properties inherit, so `body { --destructive: … }` reaches every
  element the primitives render; the guard matched only `:root` and `html`, and
  review restored shadcn's red with it green — confirmed in a browser, not
  argued. Separately, `painter` matched on selector alone, so moving the one
  global focus rule into `@media print` kept the guard green while removing the
  ring from every screen surface. The token map now honours inheritance and
  ignores rules that cannot apply on screen.
- Whether a focus ring is visible is a measurement now, not a list of spellings:
  the rule's width and colour are resolved and the colour is judged against the
  3:1 floor, which kills `outline-width: 0.5px` and `outline-color: var(--canvas)`
  — a white ring on the white canvas — that an enumerated check passed. The
  theme check matches any colour-scheme query and any selector naming a theme,
  which closes `@media not all and (prefers-color-scheme: light)` and
  `[data-theme="dark"]`. What the parser still cannot see is an `@import`, so
  the file's three imports are asserted exactly.
- Rewriting that check regressed two mutations an earlier version had killed:
  `outline-width: 0` has no unit and did not match a `Npx` pattern, and
  `transparent` threw in the colour parser and was swallowed by its own
  `catch`. Both are handled explicitly. Caught by re-running the whole suite
  rather than only the new cases.
- **The page guard was still bound to spellings.** The restated-counts check
  required the number to be a whole text node, so a tile printing
  `{count} kiriman` passed while restating every count above the chips. The
  second-identifier check was bound to the literal `ID:` and an exactly
  eight-character slice, so `Ref {shipmentId.slice(0, 7)}` passed. The scroller
  check matched `overflow-x-auto` and not `overflow-auto`. All three are bound
  to the defect now: counts are matched anywhere in the rendered text with
  fixture values chosen to be distinctive, id prefixes are counted across all
  rows at every slice length from six characters up, and any horizontal
  scrolling utility counts.
- Fifteen page mutations and twenty-six token mutations now fail the guards,
  including all eleven independent review broke across rounds two and three.
- **A new guard for the guards.** Three separate edits shipped a probe that
  could not run — a backtick inside its template literal, and single backslashes
  the template swallowed — each discovered only when a sweep died half an hour
  in. `probe-lint.mjs` checks both and compiles the probe, and the validation
  script runs it first.
- Six documented numbers were wrong. "Nine of the 104 scenarios are excluded"
  added three excluded from the sweep to four exempt from the effect check —
  two different exemptions, and neither the scenario count nor the pair count.
  `TASKS.md` still carried the 105ch threshold whose rationale `BUILD-LOG.md`
  had already retracted. `src/app/platform/loading.tsx` covers four platform
  routes, not three. "49 wide tables" is 49 observations across seven tables and
  three viewports. And the route map still described the tree at `67beb92` with
  T-77 uncommitted and once-reviewed.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 589 tests, `next build`, and a clean sweep — 66 route pairs and 303
  scenario pairs with zero findings, 51 of 51 loading skeletons captured, zero
  scenarios indistinguishable from their base route, zero redirects, no console
  errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 4 — rejected again, and half the sticky-column fix was wrong

- **The "four tables carried it" claim in the round-3 section was wrong; two
  of them never had the defect.** `group-hover:*` only matches inside an
  ancestor carrying the literal `group` class. `/app/pengiriman` and
  `/app/kontak` used `group-hover:bg-muted/50` on the sticky cell but their
  `TableRow` had no `group` class — the utility never matched, before the
  round-3 repair or after it, so both the pre-existing class and its
  `color-mix` replacement were dead code on those two files. Only the RTS
  table and the CSV error table, both marked `group` in the same repair,
  actually carried the defect. Both files now carry `group` on the row
  regardless, so the rule the RTS fix established applies uniformly across
  all four sticky tables rather than two of them by name only.
- **The probe's own hover check repeated the mistake it was written to stop
  repeating: a class-name regex, moved from the test into the probe.**
  `/(?:group-)?hover:bg-[a-z-]+\/[0-9]+/` missed `bg-transparent`,
  `bg-muted/[40%]`, and any plain-CSS hover rule. It now reads the CSSOM and
  resolves what actually gets painted, and building that correctly took three
  wrong turns worth recording:
  - The first attempt walked `sheet.cssRules` recursively but classed a rule
    as "a container to recurse into, not a leaf" by testing `if (rule.cssRules)`.
    CSS nesting means every `CSSStyleRule` now exposes `.cssRules` — an empty
    list, absent a nested child — so that test is true for nearly every leaf
    rule in the sheet. 1018 of 1091 style rules in the utilities layer were
    silently dropped this way; the walk pushed only 96 of what a plain
    `[...sheet.cssRules]` on the same sheet showed as 417 top-level rules. A
    rule with `.selectorText` and `.style` is a leaf regardless of what else
    it exposes, and is pushed before ever checking whether it also has
    children to recurse into.
  - The second attempt, once rules were actually found, matched a candidate
    rule to the cell with `cell.matches(selector) || cell.closest(selector)`.
    The `closest()` half is wrong: every `TableRow` already carries its own
    `hover:bg-muted/50` from the shadcn primitive, an ancestor rule that
    genuinely does paint the row translucent on hover — by design, that is
    the row-highlight effect — and `closest()` found that ancestor match and
    reported it as if it painted the sticky cell sitting opaquely on top of
    it. `matches()` alone already evaluates a full selector, ancestor
    combinators included, exactly as `querySelectorAll` would; the fallback
    was unnecessary and wrong.
  - The third: Tailwind emits a plain fallback (`background-color: var(--muted)`)
    beside an `@supports (color: color-mix(...))` block carrying the enhanced
    value, for browsers without the feature. Resolving a candidate's colour
    requires the cascade, which a canvas — used by the browser-visible
    contrast probe — cannot evaluate: `var()` and `color-mix()` read back as
    the canvas's previous fill, silently "resolving" every translucent value
    to opaque. A hidden `<span>` placed inside the cell and given the
    candidate value via `element.style`, then read back through
    `getComputedStyle`, lets the engine resolve it properly.
  - Mutation-tested against the four spellings review used to break it —
    `bg-muted/50`, `bg-transparent`, `bg-muted/[40%]`, an arbitrary `rgba()` —
    plus removing `sticky` itself; all five now fail, and the unmutated tree
    passes.
- **The token guard's colour parser treated "cannot parse" as "assume safe".**
  `outline-color: white` and `outline-color: rgb(255 255 255)` — a white ring
  on the white canvas — passed because `parse()` only understood hex and
  `oklch()`, and the catch around it returned `null`, meaning "not flagged."
  The parser now covers a small set of named colours, `rgb()`/`rgba()`, and
  the two-argument `color-mix()` form the stylesheet itself uses; anything it
  still cannot read now fails the check with the parse error attached, rather
  than passing silently. The suppressor scan itself was also narrower than
  its own purpose: it matched only selectors containing the literal text
  `:focus-visible`, so `:focus { outline: none }` — equal specificity to the
  global rule, later in source order, so it wins outright — passed. It now
  matches any rule capable of drawing an outline on a focused element. A large
  negative `outline-offset` (`-9999px`, drawn but pushed off-screen) is
  checked as well. `targetsRoot` unwrapped `:where()` but not `:is()`, so
  `:is(:root) { --destructive: … }` restored shadcn's red past the guard; both
  wrappers are stripped now. The `@import` assertion matched only the quoted
  form the file happens to use, missing `@import url("...")`; both are
  recognised now.
- Rewriting the sticky probe's rule walk needed its own guard: the fix
  itself, mid-edit, twice hit the same template-literal trap this session
  already has a lint for — a stray backtick inside a code comment ending the
  template early. `probe-lint.mjs` caught both immediately rather than
  letting a sweep discover them thirty minutes in.
- Sixteen page mutations and thirty-two token mutations now fail the guards,
  including all fifteen independent review has broken across four rounds. Two
  new mutations found a real regression in the immediately preceding fix
  itself and were fixed in the same pass: the restated-count check was scoped
  to text outside the literal `<nav>…</nav>` region, and moving a KPI tile
  *inside* that region evaded it by DOM position rather than by not restating
  anything; it now counts total occurrences of each distinctive fixture value
  anywhere in the document, which no amount of repositioning can evade. The
  second-identifier check counted only prefixes; suffixes are counted too, and
  two ids that happen to share a prefix or suffix are pooled into one shared
  budget (equal to how many of them lack an AWB) rather than skipped outright,
  because skipping let a mutation on one row hide behind the other's
  legitimate rendering at exactly the shared length.
- Two more document numbers were wrong, both freshly written by the round-3
  repair rather than inherited: "nine scenarios are excluded" repeated the
  arithmetic error round 3 had just flagged (3 + 4, two different kinds of
  exclusion), and "49 wide tables" repeated round 3's own correction to "49
  observations across seven tables" seventeen lines later in the same file.
  Both are fixed at the point they were wrong, not only at the point that
  already had the correction. The route map's worktree note and one route row
  still described the tree before this session's commit; both are updated
  for `69e6be6` and for three rounds of review, not one.
- The digest's own normalisation is described more precisely: it strips
  clock-like and currency-like digit runs, not only "clock strings" — Rupiah's
  thousands-separator dot reads like a truncated time otherwise, and while
  that miscategorisation did not produce a wrong verdict (a money-only change
  still reads as "no effect" and correctly fails the check, not passes it),
  the comment describing what it does is now accurate rather than narrower
  than the code.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 589 tests, `next build`, and a clean sweep — 66 route pairs and 303
  scenario pairs with zero findings, 51 of 51 loading skeletons captured, zero
  scenarios indistinguishable from their base route, no console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 5 — rejected again, all three findings real and browser-confirmed

- **`targetsRoot` split on commas before unwrapping `:is()`/`:where()`.**
  `:is(:root, .never-matches-anything)` was shredded into `:is(:root` and
  `.never-matches-anything)` by a plain `.split(",")` before either piece
  reached the unwrap regex, so neither matched and the rule's `--destructive`
  never entered `tokens` — confirmed live: `getComputedStyle(documentElement)`
  resolved shadcn's red while the guard still passed 8/8. The comma split is
  depth-aware now (splits only outside parentheses) and the unwrap is
  recursive, so a selector list nested inside a wrapper re-splits and
  re-checks each branch.
- **The second-identifier check only looked at the two ends of the UUID.**
  `shipmentId.slice(9, 17)` — a slice from the middle — printed a second
  identifier on every row and passed both the guard and its own comment's
  claim to check "any slice length." Every contiguous substring at each
  length 6-12 is checked now, not only the prefix and the suffix.
- **A third, real product-visible way to defeat the sticky-column probe:
  `background-image` was never read.** A hover rule painting
  `linear-gradient(var(--muted), transparent)` — a gradient fading to
  see-through — passed silently, because the check only ever inspected
  `background-color`/the `background` shorthand.
- **Chasing this one cost a wrong turn worth recording.** The obvious fix
  looked like forcing genuine `:hover` via CDP and reading whatever the
  browser's own cascade produces, sidestepping declared-CSS inspection
  altogether. Both available forcing mechanisms were tried —
  `CSS.forcePseudoState` on the `.group` ancestor, and a real
  `Input.dispatchMouseEvent` at the cell's own coordinates — and both leave
  `element.matches(':hover')` reporting `true` while `getComputedStyle` never
  applies a single `:hover`-scoped rule: a row's own built-in
  `hover:bg-muted/50` computed as fully transparent (its resting default)
  under either. `matches()` reflects DevTools' forced state for inspector
  purposes; this headless Chrome's actual style recalculation does not follow
  it. There is no way to observe a genuine hover-time computed style here, so
  the check reads declared rules after all, this time including
  `background-image`: any `:hover`-matching rule affecting the cell (matched
  with `matches()` only, leaf rules detected the way round 4 fixed) is
  checked for a `background-color`/`background` resolved inside the cell's own
  subtree, and separately for a `background-image` whose colour stops include
  a transparent or partial-alpha value.
- Seventeen page mutations and thirty-three token mutations now fail,
  including all eighteen independent review has broken across five rounds,
  and the sticky probe carries its own six-mutation suite
  (`scratchpad/sticky-mutate.sh`), including the gradient case.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 589 tests, `next build`, and a clean sweep — 66 route pairs and 303
  scenario pairs with zero findings, 51 of 51 loading skeletons captured, zero
  scenarios indistinguishable from their base route, no console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 6 — rejected again, three real gaps plus a missing evidence footer

- **The pooled-budget identifier check only checked lengths 6-12.** A 5-character
  middle slice (`shipmentId.slice(9, 14)`) evaded it entirely — outside the
  window, not inside it and pooled wrong. The floor is 5 now, not lower: at 4
  characters `"0003"` collides with the unrelated fixture AWB
  `"SANITIZED-CNOTE-0003"`, and the check cannot tell that legitimate
  coincidence from a real second identifier, so a lower floor fails on the very
  fixture that has no defect.
- **`splitTopLevel` tracked only paren depth**, so a comma inside a quoted
  attribute value — `[data-x="a,b"]:root` — was still split at the comma,
  breaking `:root` off from its attribute selector so neither fragment
  matched. Confirmed live: Chrome parses and applies that selector as written
  (`document.documentElement.setAttribute('data-x','a,b')` plus the rule both
  resolve), so it is valid CSS that would have silently redefined a token past
  the guard. Bracket depth and quote state are tracked now, alongside parens.
  A second, related gap surfaced in the same area: the root-detection regex
  anchored `:root`/`html`/`body`/`*` to the start of the compound, but `:root`
  is a pseudo-class and may legally appear anywhere in one (`[data-theme]:root`
  is exactly how a themed root is usually written) — `html`/`body` are type
  selectors and genuinely can only lead a compound, so those two stay anchored,
  and `:root` is now matched anywhere in the compound as a whole token.
- **The sticky probe's gradient check still had a real hole: a stop expressed
  through a `var()` indirection.** `parse()` only understands literal colour
  syntax, so `linear-gradient(var(--muted), var(--some-token))` — with the
  token itself defined elsewhere as a transparent colour — extracted no stops
  at all and passed. Confirmed live with `--review-ghost: rgba(0,0,0,0)` and a
  gradient referencing it. Each matched stop, `var()` references included, is
  now resolved through the cell's own cascade via the existing hidden-span
  technique rather than parsed as literal text.
- **This section had no evidence footer** in its first pass — no test count,
  no `tsc`/`lint`/`build` confirmation. The claim that every round before it
  had one was itself wrong: rounds 4 and 5 were missing the same thing, caught
  by review round 7 checking the exact thing this round claimed to have fixed
  file-wide and finding it had only fixed its own section. Both are filled in
  now, and so is this one: `pnpm tsc --noEmit`, `pnpm lint`,
  `pnpm test:integration` at 78 files / 589 tests, `next build`. Eighteen page
  mutations, thirty-four token mutations, and seven sticky-probe mutations now
  fail, including all
  twenty-one independent review has broken across six rounds.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 7 — rejected again, the token map's merge model itself was wrong

- **The root-token map merged rules by "whichever matches and is textually
  last in the file wins," and that is not how CSS resolves an inherited
  custom property against a directly-set one.** `:root { --ring: red }` sets
  a value every element *inherits*; `body { --ring: transparent }` sets the
  property *directly* on `<body>` and everything under it, which overrides
  whatever it would otherwise have inherited — **regardless of which rule is
  later in the file**. The token map treated both the same way, keyed by
  property name with the last write winning by source position. Independent
  review demonstrated this twice, live: `body { --ring: transparent }`
  inserted *before* `:root`'s own `--ring` declaration passed the guard while
  the real page rendered an invisible focus ring everywhere under `<body>`;
  and `:not(html) { --destructive: … }` — a selector matching every rendered
  element except `<html>` itself — was never classified as root-reaching at
  all, because `targetsThisCompound` only recognised `html`/`body` anchored at
  the compound's start and a literal `:root` substring, missing a negation
  that reaches the same audience by exclusion instead of by name.
- Token collection now runs in two passes rather than one flat merge:
  `:root`/`html` values go into a "root" map (the inherited baseline), `body`,
  `*`, and a bare `:not(...)` (matching everything except what it negates —
  scoped narrower, like `.foo:not(.bar)`, does not qualify, which keeps this
  from ingesting unrelated component selectors that happen to use `:not()`)
  go into a "direct" map, and the direct map is layered on top of the root
  map regardless of source order, because that is the one fact about the real
  cascade this guard was getting backwards. This is a two-tier model, not a
  full CSS specificity engine — the file has no competing rules within either
  tier for the same property, so source order deciding ties within a tier is
  sufficient for what this stylesheet actually does.
- **Round 6's own correction was itself incomplete.** It said the round-5
  section was the only one missing an evidence footer, "unlike every round
  before it." Rounds 4 and 5 were both missing one — round 6 only fixed its
  own section and asserted a broader claim than it had verified. All three are
  filled in now.
- Thirty-six token mutations now fail, including all twenty-three independent
  review has broken across seven rounds.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 589 tests, `next build`, and a clean sweep — 66 route pairs and 303
  scenario pairs with zero findings, 51 of 51 loading skeletons captured, zero
  scenarios indistinguishable from their base route, no console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 8 — rejected again, one finding: the sticky probe never looked at the table it claimed to cover

- **The sticky-column opacity-on-hover check reused a design-contract
  threshold as a correctness-check gate, and the two are different
  questions.** `min-width >= 600px` answers "is this table deliberately wide
  enough that it must carry a sticky first column" — the right gate for that
  question. The same threshold also gated "given a table that already has a
  sticky column, does it stay opaque on hover" — a question about styling a
  table already carries, independent of its own declared width. `/app/kontak`'s
  table (`min-w-[34rem]` = 544px) is narrower than 600px but was one of the
  four tables round 3/4's fix explicitly touched, and this file's own
  round-4 section claimed the fix "applies uniformly across all four sticky
  tables." At 544px the table sat under the gate and was never examined, at
  any viewport, by any round's sweep — the claim was never actually checked
  for this table.
- Fixed by admitting a table into the opacity check when it EITHER meets the
  600px "must have a sticky column" threshold OR already has a
  `position: sticky` first header cell, regardless of its own width:
  ```js
  const isDeclaredWide = Number.isFinite(declared) && declared >= 600;
  const firstHeaderSticky = getComputedStyle(table.querySelector('thead th') || table).position === 'sticky';
  if (!isDeclaredWide && !firstHeaderSticky) continue;
  ```
  This separates "must this table have a sticky column" (still gated at
  600px) from "does an existing sticky column stay opaque" (now checked
  wherever one exists, whatever the table's declared width).
- Verified live: baseline at 390px now examines `/app/kontak` and passes
  (`ok=1 []`, previously never entered the check at all). A live mutation —
  changing the table's opaque `group-hover:bg-[color-mix(...)]` class to
  `group-hover:bg-transparent` — now correctly fails with
  `ok=0 ["min-w-[34rem]: sticky column paints a translucent background on
  hover: rgba(0, 0, 0, 0)"]`. The mutation was folded into the permanent
  suite (`sticky-mutate.sh`, now 8 mutations across two files, all killed)
  rather than left as a one-off spot check.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 589 tests, `next build`, all three T-77 mutation suites (18 page +
  36 token + 8 sticky-column mutations, all killed, baselines PASS), and a
  clean sweep — 66 route pairs and 303 scenario pairs with zero findings, 51
  of 51 loading skeletons captured, zero scenarios indistinguishable from
  their base route, no console errors. (An intervening sweep run immediately
  after restarting a long-lived dev server — reclaiming 10GB of accumulated
  Turbopack memory under sustained host memory pressure — showed 21 findings,
  nearly all viewport-inconsistent focus-ring readings for the same scenario
  plus one page that failed to render; a warm re-run against the same code
  showed zero findings, confirming the first run was a cold-start artifact of
  the restart, not a regression.)
- No provider call, production action, deploy, or release occurred.

### T-77 review round 9 — rejected again, a keyword the width check couldn't read, plus an environment quirk it doesn't need to

- **The focus-ring width check required a literal digit, so a CSS width
  keyword silently read as "no width found" rather than as the pixel value
  it resolves to.** `lengthOf`'s regex was `(?:^|\s)(-?[\d.]+)(?:px)?(?:\s|$)`
  — it cannot match `thin`, `medium`, or `thick`, the three keywords
  `outline-width` legally accepts, nor any length in a unit other than `px`
  (`em`, `rem`, `%`, ...). Independent review added
  `.cms-main a:focus-visible { outline-width: thin; }` to the live
  stylesheet — `.cms-main` is the real, live CMS shell wrapper class, not a
  test fixture — and ran `vitest run tests/design-token-contrast.integration.test.ts`:
  all 8 tests passed against a ring narrowed to roughly 1px. The comment
  directly above this code already claimed "whether a ring is visible is a
  measurement, not a list of spellings," which was true for colour but not
  for width.
- Fixed by resolving every whitespace-separated token in the shorthand or
  longhand against the three keywords (mapped to their standard browser
  pixel widths: thin=1, medium=3, thick=5) or a plain `px`/bare number as
  before, and by failing closed — the same posture this function already
  takes for an unparseable colour — when a token carries a length unit this
  static parser cannot resolve to pixels without the element's live cascade,
  rather than silently treating it as "no width found, ring is fine."
  Verified live: the exact reported mutation now fails with
  `outline 1px is not a visible ring`; the unmutated tree still passes
  cleanly. Folded into the permanent suite as its own mutation (now 37 token
  mutations, all killed).
- **A second, more tentative finding does not change any code.** Review
  separately reported that measuring `getComputedStyle` immediately after
  `.focus()` in the same script can miss a just-changed `outline-width`,
  flagging it explicitly as medium confidence and asking for independent
  re-verification before hardening any fix around it. Reproducing this
  directly: the real page, with only the one rule that actually ships
  setting `outline-width`, reads correctly and instantly in every trial, no
  delay needed. The unreliable readback only appears once a *second*,
  competing `outline-width` rule is introduced on an element carrying
  Tailwind's `transition-all` — confirmed by injecting a second rule with
  overwhelming specificity (`[data-probe-test="1"]:focus-visible { outline-width: 37px; }`)
  on an already-rendered real element and watching the computed value settle
  to neither the old nor the new value (1px, then 2px across trials) even
  500ms after focus, well past the element's own 150ms transition duration —
  a genuine Blink/headless rendering quirk, in the same family as the
  already-documented inability to force real `:hover` state in this browser,
  rather than a timing bug a delay can paper over. This scenario does not
  exist in the shipped stylesheet today — nothing else sets `outline-width`
  on a focus-visible selector — and the guard fixed above is exactly what
  stops such a second rule from shipping in the first place, at the source
  level, without depending on live browser rendering timing at all. No probe
  change was made; making one against data that does not converge to either
  candidate value would trade a real, working measurement for a fabricated
  sense of precision.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 589 tests, `next build`, all three T-77 mutation suites (18 page +
  37 token + 8 sticky-column mutations, all killed, baselines PASS), and a
  clean sweep — 66 route pairs and 303 scenario pairs with zero findings, 51
  of 51 loading skeletons captured, zero scenarios indistinguishable from
  their base route, no console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 10 — rejected again, the focus check never looked past the nav bar on most CMS pages

- **The keyboard-focus check capped itself at the first 14 focusable elements
  per page, with no documented rationale anywhere in nine prior rounds, and
  on every real CMS route at 768px/1280px those 14 slots are consumed almost
  entirely by the persistent sidebar shell** — the skip link, the ten nav
  links, "Toggle Sidebar," and the account menu button repeat identically on
  every page and occupy tab stops 0 through roughly 13. Independent review
  measured real focusable-element counts across all 12 tenant routes at
  1280px with the probe's own exact selector and visibility filter:
  `/app/keuangan`=82, `/app/analitik`=60, `/app`=56, `/app/pengiriman`=39,
  down to 17 on the smallest pages — every route exceeded the cap. It then
  injected a live stylesheet rule suppressing the focus ring on the real
  "Buat pembalik" (create reconciliation reversal) button — a financial
  action at focusable-index 25 of 82, no fixture involved — and re-ran the
  exact shared probe: `focusProbed: 14, weakFocusRing: 0`, no finding, on
  every viewport and every round since this check was written. At 390px the
  nav collapses off-canvas, so the cap happened to reach page content there;
  at the two viewports most CMS operators actually use, it was structurally
  "re-verify the nav bar" on the majority of routes.
- Fixed by removing the cap: every focusable element on the page is checked
  now, the same way the contrast check above it already inspects every text
  element with no cap of its own — focus and `getComputedStyle` per element
  are equally cheap, and a fixed prefix of tab order was never justified by
  anything but an unexamined assumption. Verified live: the exact reported
  mutation (outline suppressed on the real reversal button) now fails with
  `weakFocusRing: 1`. A permanent regression case was added to
  `t77-contrast-selftest.mjs`: twenty offscreen dummy links are inserted
  before the test's existing unfocusable-button injection so it lands well
  past the old cap position; reverting the fix locally and re-running the
  selftest reproduces `SELFTEST FAIL`, confirming the new case actually
  binds rather than merely re-testing what already worked. A full sweep with
  the fix live found zero real regressions elsewhere in the app — focus
  rings probed rose from 3,616 to 6,267 (confirming the added coverage is
  real, not cosmetic) while route and state sweep findings stayed at zero —
  so the missing coverage had been hiding no live defect, only leaving one
  open on every future change.
- This fix touched only the scratchpad browser probe, not any repository
  source or test file, so the tsc/eslint/integration-suite/production-build
  and mutation-suite evidence already recorded for round 9 still describes
  the current tree unchanged; only `probe-lint` and a fresh full sweep were
  re-run for this round.
- Evidence: `probe-lint` clean, `t77-contrast-selftest.mjs` SELFTEST PASS
  with the new past-cap regression case verified to bind, and a clean sweep
  — 66 route pairs and 303 scenario pairs with zero findings, 51 of 51
  loading skeletons captured, focus rings probed 6,267 (up from 3,616), no
  console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 11 — rejected again, and this time the gap was one level up: the whole instrument was never part of the deliverable

- **Every script that produced ten rounds of browser-confirmed evidence —
  `t77-probe.mjs`, `t77-screen3.mjs`, `t77-contrast-selftest.mjs`,
  `t77-scenarios.json`, `probe-lint.mjs`, all three mutation suites — existed
  only under this AI session's ephemeral scratchpad, never in the
  repository.** Independent review confirmed this three ways:
  `git ls-files | grep -i t77` and a filesystem `find` both returned nothing,
  and `git log --all --diff-filter=A` showed these files were never
  committed at any point. `package.json` never referenced `scratchpad/`.
  The only committed guards are two vitest files
  (`tests/design-token-contrast.integration.test.ts`,
  `tests/rts-presentation.integration.test.ts`) plus a static-analysis test
  (`tests/cms-ui-audit-inventory.integration.test.ts`) that checks scenario
  *taxonomy* consistency, never rendering or computed style. Review proved
  the consequence concretely: round 3's shipped, browser-confirmed defect
  (`group-hover:bg-muted/50` making the RTS sticky column translucent on
  hover) has zero matching text in either committed test file — `grep -n
  "group-hover\|color-mix\|sticky\|bg-card\|bg-muted"
  tests/rts-presentation.integration.test.ts` returns nothing — so if that
  exact defect reappeared today, `tsc`, `lint`, `test:integration`, and
  `next build`, the four checks every round's evidence footer cites, would
  all still pass. This is the same shape as rounds 8-10 (a claim of coverage
  narrower than stated) one level up the stack: the narrowing wasn't inside
  a measurement, it was that the measurement itself never outlived the
  conversation that wrote it.
- Fixed by porting the load-bearing scripts into the repository at
  `scripts/ui-audit/` (kept as a close-to-direct port, not a rewrite:
  renamed for clarity — `t77-probe.mjs` to `probe.mjs`, `t77-screen3.mjs` to
  `sweep.mjs` — internal cross-file imports and backup-file paths updated to
  be repo-relative rather than pointing at an absolute scratchpad path that
  will not exist for anyone else), wiring `pnpm test:ui-audit` (the full
  sweep) and `pnpm test:ui-audit:mutations` (all three mutation suites) in
  `package.json`, and documenting both in root `README.md` and a new
  `scripts/ui-audit/README.md`. A Chrome launcher
  (`scripts/ui-audit/start-chrome.sh`) was added since nothing had
  previously scripted starting the headless browser this instrument needs —
  it had only ever been started by hand.
- `t77-scenarios.json` (now `scripts/ui-audit/scenarios.json`) remains a
  hand-maintained snapshot of `src/lib/ui-audit-scenario.ts`'s declarations
  rather than a generated one: these scripts run under plain `node` with no
  TypeScript loader, and that module transitively imports `server-only`,
  which throws outside a Server Component. This is a known, documented
  limit, not a silent one — `scripts/ui-audit/README.md` names it and points
  at `sweep.mjs`'s own coverage assertions (`run.sh` fails if the route-pair
  or scenario-pair count moves) as the tripwire for the two files drifting
  apart.
- Verified by running the entire ported suite from its new repository
  location end to end — `pnpm test:ui-audit` and `pnpm
  test:ui-audit:mutations` both pass — and confirming parity with the
  scratchpad originals: same 66+303 zero-finding sweep, same 18+37+8
  mutations all killed, same RTS a11y assertions passing, files restored
  clean after every mutation run (`git diff --stat` empty on every touched
  source file once each script exits).
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 589 tests, `next build`, all three T-77 mutation suites now run
  from `scripts/ui-audit/` (18 page + 37 token + 8 sticky-column mutations,
  all killed, baselines PASS), and a clean `pnpm test:ui-audit` run — 66
  route pairs and 303 scenario pairs with zero findings, 51 of 51 loading
  skeletons captured, RTS a11y assertions passing, no console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 12 — the port verified clean; one process question addressed, not treated as a defect

- Independent review spent this round two ways. First, verifying round 11's
  port is faithful rather than merely present: it re-ran `pnpm test:ui-audit`
  and `pnpm test:ui-audit:mutations` live end to end and got the exact
  evidence footer round 11 claimed, number for number; independently
  extracted `scripts/ui-audit/scenarios.json` and
  `src/lib/ui-audit-scenario.ts`'s declarations and diffed all 104 scenario
  keys with zero mismatches; confirmed every mutation script restores its
  target file byte-for-byte (`git diff --stat` identical before and after);
  and cross-checked every scratchpad filename BUILD-LOG's ten prior rounds
  named against the renamed files now in `scripts/ui-audit/`, finding all of
  them present under their new names. It found one real but cosmetic leftover
  — a comment in `cdp.mjs` still said `` `t77-probe.mjs` `` after the file was
  renamed to `probe.mjs` — fixed. Second, it re-read the full probe and sweep
  orchestration hunting for a twelfth instance of the round 8/9/10 pattern
  (a check claiming broader coverage than it delivers) and found none: every
  numeric threshold traced to a documented, prior-round-justified constant.
- **The one substantive objection it raised does not hold up as a new
  defect.** It reported that `scripts/ui-audit/` (and every other file this
  task has touched) is uncommitted — `git ls-files` and `git log --all
  --diff-filter=A` both show nothing has landed in a commit — and called
  this the same failure round 11 fixed, recurring one level down. It is not
  the same failure. Round 11's actual finding was that the verification
  apparatus lived in a path outside the project entirely
  (`/tmp/claude-.../scratchpad/`, a directory this session's own tooling
  documents as ephemeral and tied to the session's lifetime) — nothing about
  the repository's git state could have made that apparatus discoverable,
  because it was never inside the repository at all. `scripts/ui-audit/`
  now sits inside `/home/ongki/Projects/geraicuan`, the actual project
  directory, where `git status`, `git diff`, and every tool this task uses
  already show it. Whether it is *committed* is a different question, and
  this task has answered it the same way since round 3: every fix from
  round 3 onward has been left uncommitted, by design, per the standing
  instruction to commit once the whole queue — T-77 and the rest of Phase
  10 — is genuinely done, not after each review round. Committing
  `scripts/ui-audit/` alone, mid-review, ahead of the rest of the queue,
  would be a scope decision this task does not get to make unilaterally.
  Treating "not yet committed" as a rejection would have rejected every one
  of the previous eleven rounds' fixes on the same basis, since none of them
  were committed either — it is a property of the whole task's agreed
  workflow, not a gap round 11 introduced or missed.
- Evidence: `pnpm test:ui-audit` and `pnpm test:ui-audit:mutations` both
  re-run clean after the `cdp.mjs` comment fix (66+303 pairs, 0 findings;
  18+37+8 mutations, all killed).
- No provider call, production action, deploy, or release occurred.

### T-77 review round 13 — rejected again: the "N mutations, all killed" count was never proof the whole assertion surface had been exercised

- Independent review engaged with round 12's committed-state reasoning on
  its own judgment and agreed with it without being asked to; it is settled
  and not revisited here.
- **Several individual token-pair and page assertions inside the two
  committed vitest guards had zero mutation coverage across all twelve
  prior rounds, even though the guards themselves, tested live, correctly
  catch a break of each one.** In
  `tests/design-token-contrast.integration.test.ts`: the "every semantic
  status colour on its own surface" loop asserts `--danger`/`--ok`/`--warn`,
  but only `--warn` had ever been mutated; "body and muted text on every
  ground" loops `--ink`/`--ink-muted` across three grounds, but only
  `--ink-muted` had ever been mutated, and that single mutation breaks all
  three grounds in the same test run, so the loop's early exit at the first
  failing ground (`--canvas`) meant `--surface` and `--surface-sunken` were
  never independently proven to catch anything on their own; "the one
  interactive accent" asserts `--primary-foreground`/`--primary`,
  `--accent`/`--canvas`, and `--accent-hover`/`--canvas`, but only
  `--accent-hover` had ever been mutated. In
  `tests/rts-presentation.integration.test.ts`, "keeps the wide table
  scrollable rather than clipped" asserts a literal `min-w-[70rem]` and had
  never been mutated at all. Review proved each guard still catches a live
  break of every one of these — hand-mutating `--ok` and `--primary-foreground`
  in `globals.css` and the table's `min-w-[70rem]` in the RTS page, running
  the vitest files directly, confirming each failed correctly, then
  restoring and confirming a clean diff and a passing re-run — so this was
  never a broken guard. It was the mutation suites' framing ("37 mutations,
  all killed," narrated round-by-round and cited in
  `scripts/ui-audit/README.md` as the reason to trust the guards) implying
  the whole assertion surface had been exercised, when in practice coverage
  concentrated on the specific tokens implicated in past incidents. This is
  the standing meta-pattern one level removed: not the guard claiming
  broader coverage than it delivers, but the *proof of the guard's
  hardening* doing so.
- Fixed by adding one mutation per previously-untested pair: `--danger`,
  `--ok`, `--primary-foreground`, and `--accent` each lightened/darkened
  independently of the token they alias underneath (`--accent` is itself
  `var(--primary)`; overriding the alias directly breaks only the named
  pair, not every consumer of `--primary`), `--ink` lightened on its own
  (distinct from `--ink-muted`), and — to close the loop-early-exit gap
  properly rather than just re-mutating `--ink-muted` again — the *ground*
  `--surface-sunken` darkened toward `--ink-muted`'s own value, which
  leaves `--canvas` untouched and so can only be caught by the
  `--surface-sunken` pairing specifically. `mutate-page.sh` gained a mutation
  shrinking `min-w-[70rem]` to `min-w-[40rem]`. All seven mutations verified
  killed; token mutations are now 43, page mutations now 19.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 589 tests, `next build`, all three mutation suites (19 page + 43
  token + 8 sticky-column, all killed, baselines PASS), and a clean `pnpm
  test:ui-audit` run — 66 route pairs and 303 scenario pairs with zero
  findings, 51 of 51 loading skeletons captured, RTS a11y assertions
  passing, no console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 14 — rejected again: a third un-mutation-tested guard, and most of the browser probe's own checks had never been proven to catch anything

- Independent review engaged with round 12's committed-state reasoning on
  its own judgment, agreed, and did not re-flag it — the second reviewer in
  a row to do so.
- **Finding 1: `tests/outlet-settings-page.integration.test.ts`'s
  aria-current guard — added by this task's own commit specifically to fix
  a real double-`aria-current="page"` defect on `/app/pengaturan` — had
  never been wired into any mutation script,** unlike the two guards round
  13 hardened. Review proved live that reverting the fix
  (`aria-current={active ? "page" : undefined}`) makes two assertions fail
  correctly, then restored the file clean. Fixed by adding
  `mutate-outlet-settings.sh` (1 mutation, killed) and wiring it into `pnpm
  test:ui-audit:mutations`.
- **Finding 2: eight of the browser probe's ~eleven individual
  measurements had never been deliberately triggered and confirmed
  caught** — only contrast/focus (`contrast-selftest.mjs`) and sticky-column
  opacity (`sticky-check.mjs`/`mutate-sticky.sh`) had a committed proof.
  `headingSkips`, `titlesNotHeadings`, `imgNoAlt`, `tablistLinks`,
  `nestedCards`, `smallTargetCount`, `unlabelledScroll`, and `longLineCount`
  existed, were summed into the sweep's headline numbers, and were narrated
  throughout this task's evidence footers ("zero findings" across 369
  pairs) without ever having a tripwire proving any one of them could
  detect a real violation if it broke. Review verified live, with a
  throwaway script, that all eight currently work correctly — this was a
  missing-proof gap, not an active defect, the same shape as round 10's
  focus-ring cap but caught before it could hide a real regression rather
  than after. Fixed by adding `probe-coverage-selftest.mjs`, following
  `contrast-selftest.mjs`'s pattern: inject one violation per dimension
  into a real page's `<main>`, assert the probe's count for that dimension
  grows, restore nothing (the injected elements never touch a tracked
  file — they're added and read within the same page load). Wired into
  `run.sh` immediately after `contrast-selftest.mjs`.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 589 tests, `next build`, all four mutation suites now wired
  together via `pnpm test:ui-audit:mutations` (19 page + 43 token + 8
  sticky-column + 1 outlet-settings, all killed, baselines PASS), and a
  clean `pnpm test:ui-audit` run including the new probe-coverage selftest
  — 66 route pairs and 303 scenario pairs with zero findings, 51 of 51
  loading skeletons captured, RTS a11y assertions passing, no console
  errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 15 — rejected again: a route with no scenario at all, silently invisible to every prior round's own completeness checks

- Independent review agreed with rounds 12-14's committed-state reasoning
  without being asked to, a fourth reviewer in a row to do so.
- **`/app/kontak/[contactId]` declares a `partial-error` state — reachable
  only through a registered scenario, never through a route-level condition
  the sweep can land in on its own — with no scenario anywhere in
  `UI_AUDIT_SCENARIO_CONTRACTS` actually owning it.** Review cross-referenced
  every route declaring an action-state/scenario-strategy state against
  `scenarios.json` and `UI_AUDIT_SCENARIO_CONTRACTS`: all ten other routes
  with a declared `partial-error` had at least one scenario; this one had
  zero, and `src/app/app/kontak/[contactId]/page.tsx` had no
  `parseUiAuditScenarioForRoute`/`UI_AUDIT_HEADER` reference at all, unlike
  its sibling `/app/label/[shipmentId]`. This evaded fifteen rounds of
  "scenario taxonomy is exact" checks because those checks only verify the
  reverse direction — every scenario's route/state is registered — never
  the forward direction, that every route's own declared state has an
  owning scenario. A route that never gained one moves neither the 66-route
  nor the 303-scenario coverage count any prior round's completeness checks
  watch, so it was structurally invisible rather than merely untested.
- Fixed two ways. First, the capability gap: added a
  `contact-detail-outlet-error` scenario, mirroring `/app/label/[shipmentId]`'s
  pattern. The outlet-readiness lookup inside the page's data load was
  previously uncaught — a failure there would have thrown and failed the
  whole page rather than degrading gracefully — so it is now caught and
  renders a partial-degradation banner ("Pemilihan outlet tidak tersedia")
  while the rest of the page (identity, addresses, archive) stays usable;
  the scenario override forces the same path for screening. Second, the
  detection gap: added a forward-direction completeness test to
  `tests/cms-ui-audit-inventory.integration.test.ts` — for every route's own
  `partial-error`/`stale` states (the two states whose strategy is
  `"scenario"`, meaning genuinely unreachable without one; `pending`/
  `primary-success` are deliberately excluded, since those are verified
  through live interactive submission per task, recorded in this file, not
  the scenario-header mechanism, and are missing a scenario for nearly
  every route in the inventory by design) — at least one scenario must own
  it. Verified the new test fails exactly on this one route/state before
  the fix (`AssertionError: /app/kontak/[contactId]: partial-error:
  expected false to be true`) and passes clean after. State-pair coverage
  rose from 303 to 306 (one new scenario × 3 viewports); route-pair
  coverage stayed at 66 (no new route).
- **Two operational incidents surfaced during this round's verification,
  neither a T-77 code defect, both worth recording because they affected
  this round's own evidence trail.** First: an earlier attempt at this
  round stalled mid-investigation on its own background monitor and never
  delivered a report; separately, a *different* concurrent process wrote an
  incorrect "round 15 found nothing to reject, independent review now
  passes" conclusion directly into this file, `STATUS.md`, and `TASKS.md`
  — before the finding above had been made. Those entries have been
  replaced with what was actually found and fixed; T-77's independent
  review is not closed. Second: during this round's mutation-suite
  re-verification, `src/app/globals.css` was found truncated from 679 to
  331 lines — the T-86-scoped dead-CSS block (not due for removal until
  T-86 runs) had been silently deleted, most likely by a concurrent review
  agent's own token-mutation experiment left abandoned mid-run rather than
  cleanly restored. Caught by a routine post-mutation `git diff`/line-count
  check, not by any dedicated guard. Restored from a `/tmp/tmp.*` backup
  file the token-mutation script itself had made minutes earlier (confirmed
  byte-identical to `git show HEAD:src/app/globals.css` via `diff`), and
  the full verification pipeline — `tsc`, `lint`, integration suite,
  production build, all four mutation suites, and the complete sweep — was
  re-run afterward to confirm nothing else was affected. Running multiple
  file-editing review agents concurrently against the same working tree is
  the root cause of both incidents; this task's own review agents are
  dispatched one at a time specifically to avoid this, and will continue to
  be.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 590 tests, `next build`, all four mutation suites (19 page + 43
  token + 8 sticky-column + 1 outlet-settings, all killed, baselines PASS),
  and a clean `pnpm test:ui-audit` run — 66 route pairs and 306 scenario
  pairs with zero findings, 51 of 51 loading skeletons captured, RTS a11y
  assertions passing, no console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 16 — rejected again: round 15's own new banner used the wrong ARIA role

- Independent review agreed with rounds 12-15's committed-state reasoning
  without being asked to, a fifth reviewer in a row to do so. It verified
  round 15's fix live from both directions before looking for anything new:
  logged in and navigated to the real contact-detail route with and without
  the `contact-detail-outlet-error` header, confirming the degradation
  banner renders only under the scenario and the address list stays usable
  either way; and mutation-tested the new completeness test itself by
  temporarily removing the scenario contract entry, confirming the exact
  expected assertion failure, then restoring and confirming a clean
  `git diff --stat` and a passing re-run.
- **The banner round 15 added uses `role="status"` (a polite live region),
  inconsistent with every other structurally-identical banner in the
  codebase.** `src/app/app/keuangan/page.tsx`'s reconciliation-unavailable
  banner — the closest analog, same shape of "one lookup failed, the rest
  of the page stays usable and editable" — uses `role="alert"` (assertive),
  as does the shadcn `Alert` primitive's own default when no role is
  specified at all. `role="status"` only announces once a screen reader is
  idle, not immediately, and this banner appears on an unprompted page
  load rather than in response to a user action — an assistive-tech user
  could reach the address editor and start using the now-broken outlet
  picker before ever being told it was broken. Confirmed live: the shipped
  DOM node resolved to `role="status"` exactly as written, not a build
  artifact.
- Fixed by changing the one attribute to `role="alert"`, matching the
  finance banner's explicit pattern. Verified live with the scenario header
  applied: the DOM node holding "Pemilihan outlet tidak tersedia" now
  resolves to `role="alert"`.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 590 tests, `next build`, all four mutation suites (19 page + 43
  token + 8 sticky-column + 1 outlet-settings, all killed, baselines PASS),
  and a clean `pnpm test:ui-audit` run — 66 route pairs and 306 scenario
  pairs with zero findings, 51 of 51 loading skeletons captured, RTS a11y
  assertions passing, no console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 17 — rejected again: round 16's own completeness fix was itself too narrow

- Independent review agreed with rounds 12-16's committed-state reasoning
  without being asked to, a sixth reviewer in a row to do so, and confirmed
  round 16's `role="alert"` fix live — same CDP mechanism, scenario header
  applied, the outlet-error banner resolved to `role="alert"` in the DOM,
  not a build artifact.
- **Round 16's own forward-completeness test — written specifically to
  close round 15's class of bug — was itself too narrow.** It only checked
  `partial-error`/`stale`, the two states `STATE_STRATEGY` labels
  `"scenario"`. But `route-error` carries the label `"route-boundary"` — a
  different thing from whether a scenario is *needed to cause* the throw a
  boundary catches — and in this codebase, every one of the 17 other pages
  declaring `route-error` reaches it only through a
  `if (auditScenario === "...") throw new Error(...)` gate; none has any
  organic failure path. Review found two pages the check's narrower scope
  let through: `/app/kontak/baru` and `/app/kontak/[contactId]` both
  declare `route-error` (via `COMMON_PAGE_STATES`) with zero
  `parseUiAuditScenarioForRoute`/`UI_AUDIT_HEADER` wiring at all — the
  error boundary for each has never been rendered by any of seventeen
  prior rounds' sweeps, by any test, by any means.
- Fixed by adding a scenario-triggered throw to both pages
  (`contacts-new-error` for `/app/kontak/baru`,
  `contact-detail-route-error` for `/app/kontak/[contactId]`, mirroring
  the existing `contacts-error`/`label-detail-error` pattern exactly), and
  widening round 16's completeness check to include `route-error` —
  scoped to `kind: "page"` route contracts only, since `kind: "endpoint"`
  contracts (the `/app/analitik/export.csv` Route Handler) are not browser
  pages the sweep's scenario header ever renders and already have their
  own dedicated integration test (`tests/analytics-export-route.integration.test.ts`)
  exercising real request/error paths; the widened check's first version,
  before this exclusion, correctly failed on that endpoint too, which is
  what surfaced the distinction. Verified the widened test fails exactly on
  `/app/kontak/baru: route-error` before the fix, passes clean after, and
  `git diff --stat` matches the pre-mutation baseline. State-pair coverage
  rose from 306 to 312 (two new scenarios × 3 viewports).
- One self-caught slip during the fix, corrected before it reached
  evidence: the first edit to `scripts/ui-audit/scenarios.json` overwrote
  `/app/kontak/baru`'s existing three scenario entries
  (`contacts-area-error`/`-no-result`/`-results`) instead of appending to
  them — caught immediately by the sweep's own
  "scenarios excluded as server-action-only: none" line reading wrong
  (it should always list those three), not by any dedicated guard.
  Restored the three entries and re-ran the sweep clean.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 590 tests, `next build`, all four mutation suites (19 page + 43
  token + 8 sticky-column + 1 outlet-settings, all killed, baselines PASS),
  and a clean `pnpm test:ui-audit` run — 66 route pairs and 312 scenario
  pairs with zero findings, 51 of 51 loading skeletons captured, RTS a11y
  assertions passing, no console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 18 — rejected again: one more state left out of the same completeness check, found by the same mutation technique

- Independent review agreed with rounds 12-17's committed-state reasoning
  without being asked to, a seventh reviewer in a row to do so. It began
  by confirming `git diff --stat` matched the expected accumulated,
  intentionally-uncommitted state before touching anything, then verified
  round 17's fix live: navigated to `/app/kontak/baru` and
  `/app/kontak/[contactId]` with `contacts-new-error` and
  `contact-detail-route-error` respectively, and confirmed each renders
  the real Next.js `error.tsx` boundary — a genuine `role="alert"` banner
  with retry affordances, not a raw stack trace — matched against the
  no-header baseline rendering the real form/detail page.
- **Round 17's own widened completeness check was itself still one state
  short.** `not-found` carries the identical `STATE_STRATEGY` label,
  `"route-boundary"`, that justified adding `route-error` to the check's
  scope, and the one route that declares it
  (`/platform/tenant/[tenantId]`) reaches it only through the
  `platform-tenant-detail-not-found` scenario — there is a real organic
  path in the code (`monitoring-view.tsx`'s own `notFound()` call on a
  missing tenant), but nothing in the test suite or sweep ever exercises
  it with a bad ID, so in practice it is exactly as scenario-only as
  `route-error` was. Review proved the check's blindness by mutation:
  temporarily changed the one `not-found`-owning scenario's `state` field
  to something else, reran the completeness test, and it passed — 1
  passed, 10 skipped, zero failures — with the only verification path for
  that route's error boundary deleted. Restored immediately, confirmed
  byte-identical to the pre-mutation state.
- Fixed by adding `"not-found"` to the completeness check's
  `scenarioReachable` set. No application code changed — the one route
  declaring `not-found` already had its scenario correctly wired; the gap
  was purely in what the check verified, not in what the app does.
  Re-verified the same way as round 17's fix: mutation-tested by
  invalidating the same scenario's state field again, confirmed the
  widened check now fails with the exact expected assertion
  (`/platform/tenant/[tenantId]: not-found: expected false to be true`),
  restored, confirmed clean, reran green.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 590 tests, `next build`, all four mutation suites (19 page + 43
  token + 8 sticky-column + 1 outlet-settings, all killed, baselines PASS),
  and a clean `pnpm test:ui-audit` run — 66 route pairs and 312 scenario
  pairs with zero findings, 51 of 51 loading skeletons captured, RTS a11y
  assertions passing, no console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 19 — one claimed finding checked and found false; the completeness check confirmed exhaustive as a result

- Independent review agreed with rounds 12-18's committed-state reasoning
  without being asked to, an eighth reviewer in a row to do so, and was
  asked specifically to do a final, exhaustive audit of the completeness
  check's `scenarioReachable` set (now `partial-error`/`stale`/
  `route-error`/`not-found`) against every `CmsUiAuditState` value, rather
  than incrementally patch one more hole the way rounds 17 and 18 had.
- **It reported one candidate finding — that `/app`'s `first-run` state has
  zero owning scenario, the same class of gap as rounds 15/17/18 — and this
  claim does not hold up.** Direct verification against
  `src/lib/ui-audit-scenario.ts`: all three routes declaring `first-run`
  (`/app`, `/app/analitik`, `/app/pengaturan`) have a correctly matching,
  correctly wired scenario (`dashboard-first-run`, `analytics-first-run`,
  `settings-first-run` respectively) — confirmed both by direct `grep` and
  by adding `"first-run"` to the completeness check's set as a test: it
  passed trivially, 11/11, with zero failures, exactly as it should if
  every declaring route already has an owner. The claim is corrected here
  rather than accepted, per the standing rule that a claim is verified
  against the actual repository before being trusted, subagent or not.
  `first-run`'s own `STATE_STRATEGY` label is `"local-fixture"`, distinct
  from the `"route-boundary"` label that correctly motivated rounds 17/18's
  additions — a real category difference, not just a label technicality:
  a first-run state is reachable through a genuinely empty seed fixture, a
  scenario override is a convenience on top of that, not the only path — so
  even setting the false "zero owner" claim aside, `first-run` does not
  need the same treatment `route-error`/`not-found` did.
- **No code or test change made.** There was nothing to fix — the
  completeness check's current scope (`partial-error`, `stale`,
  `route-error`, `not-found`) is confirmed exhaustive against this specific
  false lead, and the false lead is documented here so it is not
  re-investigated identically by a future round.
- The same round's supplementary hunt across `scripts/ui-audit/probe.mjs`
  and `sweep.mjs` (display-truncation limits, the `SERVER_ACTION_ONLY`
  exclusion set, the container-tier list, an unexplained `r.tier < 2000`
  cap in the tier-mismatch check) found nothing that currently affects
  shipped code — the tier cap in particular was checked against every
  `mx-auto` container in `src/`, and none falls outside the four known
  tiers, so there is nothing live to mutation-test against it.
- Evidence: `pnpm exec tsc --noEmit`, `pnpm lint` unaffected (no source
  changed); the completeness test re-run with the hypothetical addition
  restored clean afterward, `git diff --stat` empty for the touched file.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 20 — rejected again: a static guard's own allowlist missed the newest route with the exact pattern it protects

- Independent review agreed with rounds 12-19's committed-state reasoning
  without being asked to, a ninth reviewer in a row to do so, and spot-checked
  round 19's correction (`first-run`'s three owning scenarios all still
  present) without re-investigating it. Given round 19's false lead, this
  round was explicitly held to a stricter bar: every claim had to be
  reproduced live against current file contents, not reasoned about from
  memory of a pattern.
- **"Keeps one responsive GET filter form tree per route" checks exactly
  three hardcoded routes, not "every route" the way its name reads.**
  `tests/cms-ui-audit-inventory.integration.test.ts`'s `surfaces` array
  (added to fix T-69's real shipped defect — Ringkasan, Analitik, and
  Keuangan each mounting separate desktop and mobile GET filter forms) only
  ever names `/app`, `/app/analitik`, and `/app/keuangan`. `/app/label`
  has the identical GET filter form shape (status select, AWB-suffix
  input, Apply/Clear buttons in a responsive grid) and post-dates T-69, so
  it was never added to either this guard or any browser-level check —
  `scripts/ui-audit/probe.mjs` and `sweep.mjs` were grepped for any form-
  count or duplicate-form logic and have none at all. Review proved this
  live: duplicated the entire filter form block in
  `src/app/app/label/page.tsx` — the exact T-69 defect shape — and the
  test passed unchanged, 1 passed, 10 skipped.
- Fixed by adding `/app/label` to the `surfaces` list. Verified the same
  way review found it: duplicated the filter form block, confirmed the
  test now fails with the expected `invalidCounts` assertion, restored the
  file, confirmed `git diff --stat` empty, reran green (11/11).
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 590 tests, `next build`, all four mutation suites (19 page + 43
  token + 8 sticky-column + 1 outlet-settings, all killed, baselines PASS),
  and a clean `pnpm test:ui-audit` run — 66 route pairs and 312 scenario
  pairs with zero findings, 51 of 51 loading skeletons captured, RTS a11y
  assertions passing, no console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 21 — rejected again: the same allowlist-drift pattern round 20 found, in a different guard

- Independent review agreed with rounds 12-20's committed-state reasoning
  without being asked to, a tenth reviewer in a row to do so. It also
  investigated, and ruled out, whether the four mutation suites' own
  `trap ... EXIT` restore logic is airtight under a mid-run signal kill —
  built a scratch copy of `mutate-page.sh` with a blocking, always-failing
  `run()`, launched it, confirmed the file was live-mutated, sent
  `SIGTERM`, and confirmed the trap fired and restored the file to its
  exact original checksum immediately. No gap found there; a `SIGKILL`
  couldn't be caught regardless, a universal bash limitation unrelated to
  these scripts specifically.
- **"Limits every audit-contract import to its route-bound read-only page
  consumers" carries a second hardcoded list — 13 `[file, route]` pairs
  asserting each page uses the safe, production-gated
  `parseUiAuditScenarioForRoute(` and never the legacy, unguarded
  `parseUiAuditScenario(` — that was never updated for three real
  consumers of the exact mechanism it checks.** `src/app/app/kontak/baru/page.tsx`
  and `src/app/app/kontak/[contactId]/page.tsx` both call
  `parseUiAuditScenarioForRoute` with a literal route string, identical to
  every entry already in the list; `src/app/platform/_components/monitoring-view.tsx`
  calls it with a route variable (it serves all four `/platform*` routes
  from one file), which needed its own check rather than joining the
  literal-string list. All three are present in the separate
  `allowedImporters` set two tests above — the guard already knew they
  import `@/lib/ui-audit-scenario`, it just never verified *how*. Review
  proved this live: replaced every `parseUiAuditScenarioForRoute(` call in
  `kontak/baru/page.tsx` with the legacy `parseUiAuditScenario(` and the
  suite passed unchanged, 11/11 — the regression from the safe,
  production-gated function to the unguarded one on a real authenticated
  page went completely undetected.
- Fixed by adding `/app/kontak/baru` and `/app/kontak/[contactId]` to the
  literal-string list, and a separate two-assertion check for
  `monitoring-view.tsx` (uses `parseUiAuditScenarioForRoute(`, never the
  legacy call, with no literal-route match since none applies). Verified
  the same way review found it: reproduced the exact mutation, confirmed
  the widened test now fails, restored, confirmed `git diff --stat` empty,
  reran green (11/11).
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 590 tests, `next build`, all four mutation suites (19 page + 43
  token + 8 sticky-column + 1 outlet-settings, all killed, baselines PASS),
  and a clean `pnpm test:ui-audit` run — 66 route pairs and 312 scenario
  pairs with zero findings, 51 of 51 loading skeletons captured, RTS a11y
  assertions passing, no console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 22 — rejected again: the same allowlist gap round 20/21 found, a third time, in the same guard round 20 already touched

- Independent review agreed with rounds 12-21's committed-state reasoning
  without being asked to, an eleventh reviewer in a row to do so. It then
  did a full systematic pass over every hardcoded list in
  `tests/cms-ui-audit-inventory.integration.test.ts`, checking each one
  bidirectionally or by live grep against the current repository, and
  found six of seven checked out complete — a full accounting is in the
  round's own report; the seventh is below.
- **The same "keeps one responsive GET filter form tree per route" guard
  round 20 fixed for `/app/label` was still missing all four `/platform*`
  routes.** `src/app/platform/_components/monitoring-view.tsx`'s shared
  `FilterPanel` renders exactly one `<form action={actualRoute}
  method="get">` and serves `/platform`, `/platform/tenant`,
  `/platform/tenant/[tenantId]`, and `/platform/audit` — the identical
  single-form-per-route shape every other `surfaces` entry protects — and
  was never added, even in round 20's own fix. Review proved this live:
  injected a second `<form ... method="get">` into `FilterPanel` and the
  test passed unchanged, 1 passed, 10 skipped.
- Fixed by adding all four `/platform*` routes to `surfaces`, each mapping
  to `monitoring-view.tsx` (the same file backs every one; `getFormCount`
  counts matching forms per invocation regardless, so four entries against
  one file is correct, not redundant). Verified the same way review found
  it: duplicated the form in `FilterPanel` again, confirmed the widened
  test now fails on all four routes at once, restored, confirmed
  `git diff --stat` empty, reran green (11/11). This is the third time
  this exact drift pattern has appeared in this one guard's route list
  (rounds 20, 21's related-but-different guard, and now this) — the
  allowlist is designed to require an explicit entry per route rather than
  deriving from the actual page inventory, which is why it drifts; that
  design tradeoff is noted here rather than restructured, since a broader
  rewrite of the guard's own mechanism is a larger change than this task's
  screening scope.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` at 78
  files / 590 tests, `next build`, all four mutation suites (19 page + 43
  token + 8 sticky-column + 1 outlet-settings, all killed, baselines PASS),
  and a clean `pnpm test:ui-audit` run — 66 route pairs and 312 scenario
  pairs with zero findings, 51 of 51 loading skeletons captured, RTS a11y
  assertions passing, no console errors.
- No provider call, production action, deploy, or release occurred.

### T-77 review round 23 — the first round to find nothing to reject

- Independent review agreed with rounds 12-22's committed-state reasoning
  without being asked to, a twelfth reviewer in a row to do so.
- **Re-verified round 22's fix live**: confirmed the `surfaces` array now
  lists all four `/platform*` routes mapped to `monitoring-view.tsx`, and
  reran the full suite directly — 11/11 passing, not merely claimed.
- **Given three consecutive rounds (20, 21, 22) had found the identical
  allowlist-drift pattern, this round did one final, fully exhaustive pass
  specifically for it**: enumerated every single hardcoded array/set of
  file paths or route strings anywhere in
  `tests/cms-ui-audit-inventory.integration.test.ts` — thirteen distinct
  lists — and accounted for every one individually, either by confirming
  it is bidirectionally cross-checked against a live-computed set (nine
  lists, structurally drift-proof) or by independently re-deriving the
  expected set via direct grep/find against the current repository and
  confirming an exact match (four lists, including the two rounds 20-22
  fixed). All thirteen check out. The full accounting is in the round's
  own report.
- Extended the same hunt to `scripts/ui-audit/sweep.mjs`'s own hardcoded
  route arrays (`TENANT`, `PLATFORM`, `PUBLIC`) — all three match the
  actual page inventory exactly, no missing route. Traced one lead that
  looked promising (`CMS_UI_AUDIT_ACTION_CONTRACTS` omits several real
  Server Actions) and ruled it out after verification: those actions
  predate the T-65/T-66 audit-scenario mechanism entirely and never used
  it, a pre-existing scope boundary from earlier tasks rather than
  something T-77 introduced, and no test claims "every action" — only
  "every scenario," a narrower and accurate claim.
- **No new finding.** This is the first of twenty-three rounds to close
  with nothing to reject, following a genuinely thorough effort (targeted
  re-verification, full exhaustive enumeration of the specific pattern
  that had recurred three times running, and a broader hunt outside the
  test file), documented in enough detail to distinguish it from round
  19's superficial, unverified claim.
- Evidence: `pnpm tsc --noEmit`, `pnpm lint`, all four mutation suites (19
  page + 43 token + 8 sticky-column + 1 outlet-settings, all killed), and
  a complete `pnpm test:ui-audit` run — 66 route pairs and 312 scenario
  pairs with zero findings, 51 of 51 loading skeletons captured, RTS a11y
  assertions passing, no console errors — all previously recorded this
  segment and unaffected by this round, which made no code or test
  changes.
- No provider call, production action, deploy, or release occurred.

### T-86 — dead CSS removal (pre-shadcn stylesheet)

- T-77's recorded finding of 117 dead class selectors in `src/app/globals.css`
  was itself one substring-sweep false positive short. The original
  "referenced nowhere under `src`" check was a naive whole-word grep that
  counted `cms-navigation` and `cms-shell` as live because both strings also
  occur inside import-path text (`from "@/app/_components/cms-navigation"`,
  and `cms-shell-navigation` containing `cms-shell` as a substring) — neither
  is ever the value of a real `className`. Restricting the sweep to actual
  class-token occurrences (excluding `import`/`from` lines) found 119 dead
  selectors. An independent live DOM sweep — `document.querySelectorAll('*')`
  classList union across all 22 routes at 390px and 1280px, as anonymous,
  Tenant Admin, and Super Admin — confirmed all 119 render on none of them,
  the same standard T-77's original check used.
- Deleted all 119 dead rules with a selector-aware script: every comma-
  separated selector in every rule was checked for any class token in the
  dead set (a compound or descendant selector needing an unreachable class
  can never match, regardless of any live class also present in the same
  chain); a rule loses only its dead selectors, and is dropped entirely
  once none remain. Verified by hand against every rule touching a live
  class token (`.cms-main`, `.cms-skip-link`, `.cms-signout`,
  `.cms-signout-button`, `.cms-control-error`, `.auth-*`, `.label-*`) to
  confirm none were caught by the generic pass.
- Deleted the "CMS migration bridge: shadcn owns shell geometry; legacy
  route classes retain domain semantics until each screen is migrated."
  comment — it no longer describes anything once `ship-shell`/`ops-*` are
  gone, per T-86's own scope note. A second comment, "Temporary visual
  normalization for routes still using legacy domain class names," had
  every one of its own rules deleted as dead (all targeted `cms-shell`,
  `cms-scopebar`, `cms-navigation-panel`, `an-*`, `bulk-*`, `ops-*`, or
  `cms-button`) and is deleted too, since nothing remained under it. The
  "Shared authenticated CMS shell and operational primitives" and
  "Professional CMS refinement" comments still introduce surviving live
  rules and are kept unchanged. `globals.css`: 679 lines before, 285 after.
- Geometry parity, proved two ways. Structurally: a CSS rule only applies
  to an element matching its full selector; every deleted rule required at
  least one class token proven absent from every route's rendered DOM, so
  no element anywhere could ever have matched it, and removing a rule
  nothing could match cannot change any element's computed style — this
  holds regardless of empirical sampling. Empirically: a full 66-route /
  312-scenario browser sweep run before and after the deletion (against the
  same running dev server, same seed) reports 0 findings both times,
  identical route/state pair counts, identical shell gutters
  (16/24/32px), identical container tiers, and an identical 191 sticky-
  column observations both runs. The only per-pair differences are on
  `"loading"` skeleton states' `cards`/`tier` fields; a live repeat check —
  five consecutive captures of `/app/analitik`'s loading skeleton against
  the identical post-deletion CSS with zero change between runs — produced
  the same fluctuation (`cards` 5/2/2/5/2), confirming this is the
  pre-existing Suspense-streaming timing race `sweep.mjs`'s own comments
  already document (the probe stops at the first frame carrying a skeleton,
  which lands at a different point in the stream every run), not a CSS
  effect.
- `pnpm tsc --noEmit` and `pnpm lint` are clean against the reduced file.
  `pnpm test:integration` was first run under `scripts/ui-audit/env.dev.sh`
  (the browser-sweep environment) and showed two files failing (5 tests) —
  a 401-vs-403 status mismatch and an `aria-describedby` mismatch. Re-run
  against the untouched HEAD `globals.css` to isolate the cause from CSS,
  the same two files failed identically there too, which looked like a
  pre-existing defect worth its own task. It was not one: dumping the raw
  response body directly showed `403 {"code":"INVALID_ORIGIN"}` —
  `env.dev.sh` sets `BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000`,
  but these two files construct every request against
  `http://127.0.0.1:3110`, the origin `scripts/ui-audit/env.integration.sh`
  actually declares trusted. Better Auth's own origin check was rejecting
  every request from these files before any application code ran; that is
  the wrong-status and wrong-`aria-describedby` reading, not a real defect.
  Re-running with `env.integration.sh` sourced instead: 590/590 tests pass.
  No unrelated defect, no task filed.
- Evidence: substring-sweep script and live-DOM sweep script (scratchpad,
  both independently re-run against `dead-classes2.txt`, 119/119 confirmed
  dead by both); `pnpm tsc --noEmit` clean; `pnpm lint` clean; before/after
  `pnpm test:ui-audit` full sweeps (`.output/sweep-output.json` captured
  both runs, 0 findings both), plus the 5-repeat same-CSS loading-skeleton
  check; `pnpm test:integration` 590/590 passing under the correct
  `env.integration.sh` environment.
- No provider call, production action, deploy, or release occurred.

### T-78 — action buttons, form interactions, loading states, double-submit prevention

- A full audit of the interactive surface (every mutating form/button/dialog
  under `src/app`, not scripted separately this round — see the round's own
  report) found the app already exemplary almost everywhere: `useFormStatus`/
  `isPending` pending states with Indonesian copy, `disabled` on submit,
  programmatic focus routing to error/result regions, `AlertDialog`
  confirmations naming the specific object (tenant, member, ledger entry) in
  every one of `tenant-lifecycle-controls.tsx`, `member-governance-forms.tsx`,
  `finance-action-panels.tsx`, `issuance-panel.tsx`,
  `unpaid-recovery-panel.tsx`, `reconciliation-panel.tsx`,
  `stale-operation-panel.tsx`, `outlet-settings-form.tsx`, and
  `bulk-intake-form.tsx`. Two real defects, both inside T-78's own named
  scope, were confirmed and fixed:
  1. `src/app/app/shipment-draft-form.tsx`'s duplicate-order warning banner
     was gated on `state.errors?.form?.includes("Ditemukan pesanan")` — a
     literal Indonesian sentence fragment. Any copy edit to that message in
     `src/app/app/actions.ts` would silently remove the operator's only way
     to clear the block, leaving a stuck form. Fixed by adding a structured
     `duplicateDetected?: boolean` field to `ShipmentDraftActionState`, set
     `true` alongside the message rather than derived from it; the component
     now checks `state.duplicateDetected`. Proved by mutation: with the fix
     in place, rewording the Indonesian message left the new integration
     test (`tests/shipment-draft.integration.test.ts`, "flags a recipient
     phone reused within the duplicate window until confirmed") passing
     unchanged; flipping `duplicateDetected` to `false` made it fail — the
     test is bound to the flag, not the wording, and both directions were
     verified live before being trusted.
  2. The same banner hardcoded `border-amber-500/40 bg-amber-500/10`,
     `text-amber-600`, and `text-amber-900 dark:text-amber-200` instead of
     the design system's `--warn`/`--warn-surface` tokens — the only warning
     surface in the app not using them (`shipment-status-badge.tsx` already
     established the `bg-[var(--warn-surface)] text-[var(--warn)]` Tailwind
     v4 arbitrary-value pattern this reuses). Its checkbox was also a raw
     `<input type="checkbox">` styled `focus:ring-primary` — firing the ring
     on every click, not just keyboard focus, unlike every other raw
     confirmation checkbox in the app (`issuance-panel.tsx`,
     `contact-form.tsx`), which use `accent-primary` alone and rely on the
     global `:focus-visible` rule. Both fixed to match the established
     pattern. Verified live: injecting the exact post-fix checkbox markup
     into a real page and calling `.focus()` shows `outline: 3px solid`,
     `:focus-visible` matching true — the keyboard-focus ring the
     `focus:`-prefixed version would have shown on every click, correct
     here; `getComputedStyle(document.documentElement).--warn` resolves to
     `#a15c07` in the live page.
  3. `src/app/app/kontak/[contactId]/page.tsx`'s archive confirmation dialog
     read the generic "Arsipkan kontak ini?" — the only destructive-action
     confirmation in the app that doesn't name the specific object, unlike
     every other one T-78 checked. Fixed to `` `Arsipkan {detail.item.name}?` ``.
     Verified live: navigating to a real contact's archive-confirm state now
     reads "Arsipkan Ayu Lestari?"; the corresponding
     `tests/contact-render.integration.test.ts` assertion updated to match.
- No other double-submit, focus-trap, or error-fidelity defect was found;
  GET-only filter forms across the app correctly lack `disabled={pending}`
  on their submit buttons, consistent with T-77's established GET-vs-POST
  distinction for double-submit protection.
- Evidence: `pnpm tsc --noEmit` clean, `pnpm lint` clean,
  `pnpm test:integration` 591/591 (new test added, all passing), the
  mutation pair above (message reworded → still passes; flag flipped →
  fails) reverted cleanly after both directions confirmed, live CDP checks
  of the archive dialog text, the `--warn` token resolution, and the
  checkbox's keyboard-focus outline, and a full `pnpm test:ui-audit`
  66-route/312-scenario sweep re-run after the fixes: 0 findings, no
  console errors. The first such re-run read 190 sticky-column
  observations instead of the established 191, isolated to
  `/platform/tenant/[tenantId]` at 390px (5 before, 4 that run) — traced to
  running `pnpm test:integration` (which shares `geraicuan_test` with the
  dev server the sweep points at, and truncates tables per-file) without
  re-seeding afterward, per `scripts/ui-audit/run.sh`'s own established
  reason for always re-seeding before a sweep. A 5-repeat same-code check
  of that one route read a steady 5 every time, ruling out a real
  regression; re-seeding (`pnpm db:seed-local`) and re-running the full
  sweep read 191 again, matching baseline.
- No provider call, production action, deploy, or release occurred.

### T-80 — provider resilience, concurrency, & exception state hardening

- Audited the real provider integration code directly (no scripted
  apparatus for this task, unlike T-77/T-78). Concurrency and ambiguous-
  state handling were both already correct: `withProviderAccountSerialization`
  (`src/lib/mengantar-order.ts`) takes a real Postgres advisory lock keyed
  by the Mengantar account, releases it in a `finally` without masking a
  work error, and correctly wraps only the `transport.submit()` call for
  the three dynamic-AWB couriers; `SUBMISSION_UNKNOWN` recovery's exact
  crash-window concern (provider succeeded, process died before local
  persistence) is already covered by two existing
  `tests/order-batch.integration.test.ts` cases, re-run and confirmed
  passing (21/21 in that file).
- Webhook idempotency is confirmed N/A: `/api/webhooks/mengantar` refuses
  every request (T-79), and no other code path anywhere writes to
  `shipments.status` or `shipment_rts_events` from a delivery/RTS signal.
  Nothing live to be non-idempotent.
- One real gap, fixed: `confirmShipmentIssuance`
  (`src/app/app/pengiriman/[shipmentId]/actions.ts`) already correctly
  refused issuance with a clear Indonesian error whenever the only
  order-submission transport (a sanitized fixture, disabled in production)
  is unavailable — that guard just had no comment explaining why at the
  call site, unlike the webhook route's self-documentation. Added one,
  pointing to `sanctioned-order-fixture.ts` and TASKS.md's T-80 entry.
  Deliberately did not add automatic retry/backoff to
  `fetchMengantarEstimate`/`fetchMengantarDestinationAreas` (both already
  have an `AbortController` timeout, bounded reads, and sanitized errors):
  both are idempotent reads with no double-charge risk, and a transient
  failure already surfaces a clear error the operator can retry by
  repeating the UI action — adding a retry loop is speculative complexity
  against a requirement this read-only surface cannot violate either way.
- Routed to T-81, not this task: reconciliation is entirely manual today
  (`applyAuthoritativeShipmentReconciliation` takes an already-known result
  as input; nothing polls a real Mengantar order-status endpoint), contrary
  to T-81's own "automated reconciliation" scope wording.
- Evidence: `pnpm tsc --noEmit` clean, `pnpm lint` clean,
  `tests/order-batch.integration.test.ts` 21/21 re-run and passing,
  `pnpm test:integration` 591/591 (comment-only application change, no
  logic touched in the concurrency/ambiguous-state paths since they were
  already correct).
- No provider call, production action, deploy, or release occurred.

### T-81 — financial ledger, COD segregation, & reconciliation integrity audit

- Adversarially audited every scope item directly against code and the
  existing test suite, given the financial stakes. Ledger immutability
  (DB-enforced via revoked grants plus a raising trigger, not just
  application convention), COD segregation (a DB check constraint forces
  the classification at insert time), integer money arithmetic (bigint
  columns, integer round-half-up generated columns, no floating point
  found), and reversal accounting (balanced-to-zero, replay-safe,
  no-double-reversal) are all already correct and already test-proven —
  no code change needed for any of them.
- One real bug, confirmed still present and fixed: `netMarginIdr`'s
  `cogsIdr` term was aggregated over the *created* shipment cohort while
  its other four terms were aggregated over the *ledger-effective* cohort,
  so the margin's terms described different shipment populations whenever
  creation and issuance straddled a period boundary. Fixed in
  `src/db/analytics-repository.ts`: COGS is now summed once per distinct
  shipment id in the same ledger-effective cohort as the other terms (a
  naive per-row sum over the existing flat join would have
  double/triple-counted a shipment recognized through multiple ledger
  entries, since COGS is a fixed per-shipment value, not a per-entry
  amount). This corrects both `netMarginIdr` and the standalone "COGS /
  Modal HPP" KPI card, not just the margin figure. Two existing tests
  encoded the old, wrong behavior from opposite directions and both needed
  correcting, not reverting: `tests/analytics-repository.integration.test.ts`'s
  straddling fixture (`createdBeforeIssuedInside`) was asserting the old
  numbers (25,000/53,337); now asserts the corrected ones (999,000/-920,663).
  `tests/shipment-draft.integration.test.ts` was asserting a draft's COGS
  moved the KPI immediately, before any ledger entry exists; now asserts it
  does not move until issuance. Mutation-verified: reverting just the
  cohort source back to the created-cohort sum makes the analytics test
  fail; reverted clean after confirming.
- Two pre-existing routed findings (write-once COGS with no correction
  path; reconciliation is entirely manual, not automated) were
  re-verified as still present and left as explicit product-scope
  decisions rather than implemented unilaterally — both require a human
  call on scope (a correction/audit UX for COGS; a real provider contract
  before automated polling can exist at all, the same evidence-boundary
  rule blocking the closed webhook).
- Evidence: `pnpm tsc --noEmit` clean, `pnpm lint` clean,
  `tests/ledger-repository.integration.test.ts` re-run and passing,
  `tests/analytics-repository.integration.test.ts` (10/10) and
  `tests/shipment-draft.integration.test.ts` (14/14) updated and passing,
  the mutation pair on the cohort fix (both directions verified, reverted
  clean), `pnpm test:integration` 591/591, a route-only `pnpm test:ui-audit`
  sweep (66/66 pairs, 0 findings, no console errors) after re-seeding, and
  a live CDP check of `/app/analitik` rendering correctly against real
  seeded data.
- No provider call, production action, deploy, or release occurred.

### T-82 — end-to-end release preflight, smoke proofing, & documentation harmonization

- Closed all six open routed findings. Three were real and fixed: (1)
  `docs/spec/17-UX-FLOWS-SCREEN-CONTRACTS.md`'s UX-2 navigation structure was
  stale against `src/lib/cms-shell-navigation.ts`; corrected the group names,
  item labels, and tenant-page count (14 → 15). (2) The local seed's
  `fixedUuid("70", 1)`/`fixedUuid("70", 16)` produced contact-address ids
  byte-identical to the hardcoded `tenantId`/`outletId`; moved to an unused
  `"7f"` prefix and re-ran a direct cross-table id-uniqueness query against
  a freshly reseeded database — zero collisions across all fourteen seeded
  tables. (3) `pnpm db:generate` emitted a spurious drop-and-recreate of
  `shipment_rts_events_status_valid` on every run since Phase 9, because the
  stored drizzle-kit snapshot serialized the CHECK's enum values unquoted
  while `schema.ts` writes them quoted; generated and applied the one-time
  normalizing migration `0037_perfect_psynapse.sql` (a semantic no-op —
  drops and re-adds the byte-identical constraint), confirmed via
  `pnpm test:migration-upgrade` passing through it on a clean database and
  `pnpm db:generate` afterward reporting "No schema changes, nothing to
  migrate".
- The other three open findings were already resolved before this task
  started and are closed as stale rather than re-fixed: README.md's
  "Running the checks" section already documents the test environment and
  the post-suite re-seed step, and `MENGANTAR_WEBHOOK_SECRET` is read by
  nothing in `src` (confirmed by grep) — both findings described states the
  repository had already moved past.
- Documentation harmonization: `docs/spec/18-AI-ROUTE-MAP.md`'s "Audited"
  line now summarizes the complete Phase 10 arc across all seven tasks;
  `RELEASE.md`'s narrative reflects Phase 10's actual completion and the new
  no-op migration, while `Status` deliberately stays `BLOCKED` — this
  manifest's own contract requires T-62's verification to rerun from a
  clean, committed tree before `READY`, which is outside this task's scope
  and has not happened; `OBSERVABILITY.md`'s `TBD` probe placeholders were
  checked and are a deliberate pre-deployment placeholder, not a defect;
  `docs/spec/02-PRD.md`'s `PR-30` already correctly reads `Queued`, matching
  the closed webhook.
- Full verification battery, all green: `pnpm tsc --noEmit`, `pnpm lint`,
  `pnpm build` (production env block, zero errors or warnings across all 27
  routes), `pnpm test:integration` (591/591), `pnpm test:migration-upgrade`
  (clean database, through `0037`), and a route-only `pnpm test:ui-audit`
  sweep (66/66 pairs, 0 findings, no console errors).
- T-81's two remaining routed findings (write-once COGS; manual-only
  reconciliation) are unchanged — confirmed product-scope decisions in
  T-81's own resolution, correctly left open rather than invented here.
- No provider call, production action, deploy, or release occurred.


## 2026-09-13 — T-109: Tokophi mapping and Mengantar-inspired blue design

- Executor: Codex main session; independent reviewer: separate `/root/designer` agent (read-only documentation review, PASS).
- Requirement: PR-17, with PR-22, PR-25, and PR-26. R0 documentation refinement authorized by Paduka Ongki's request for PRD/design architecture and blue visual direction.
- Base HEAD: `3e3ebf6a860a87c55b41f1e48f52c77362aa3032`, branch `feat/phase-12-admin-patterns`. Initial working tree already contained Phase 12 documentation, dashboard/repository/test edits, and an active T-88 run owned by another session. Pre-turn file snapshots and fingerprints were captured outside the repository at `/tmp/geraicuan-design-yrr29m26`; these temporary files are supporting session evidence, not durable product authority.
- Changed surface: `docs/spec/02-PRD.md`, `docs/spec/03-TECHNICAL-DESIGN.md`, `docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md`, `docs/spec/17-UX-FLOWS-SCREEN-CONTRACTS.md`, `TASKS.md`, and this log. Existing sections were retained; PRD updated date advanced. No application code, runtime architecture record, route inventory, or `.delivery/` file was edited.
- Result: documented reference-to-screen mapping, proposed blue semantic palette, UX-12 and TD-17 adaptation boundaries, and ownership in existing Phase 12 tasks. Preserve tenant summary-first and platform exception-first ordering, current-versus-period semantics, finance authority, and pending spec 19 M-5 D-3. Exact colours remain proposed until rendered acceptance.
- Reference checks: local Tokophi admin source inspection and official `https://www.mengantar.com/` homepage retrieval. Bare-domain web retrieval and Python urllib retrieval failed; www-domain web retrieval and `curl -fsSL --max-time 25 https://www.mengantar.com/` succeeded. The retrieved HTML contains `#2E47BA`, `#203551`, and `#F6F8FC`; this does not establish authenticated admin appearance.
- Executed validation: `python3 /tmp/geraicuan-design-yrr29m26/verify.py` passed. It checks the declared documentation-only boundary against pre-turn fingerprints, fixed HEAD, Markdown whitespace via `git diff --check`, local Markdown links, unique section/task IDs, preserved pending decision and tenant ordering, official reference colour presence, and six sRGB text contrast pairs. Calculated ratios: primary/white 7.70:1; hover/white 9.75:1; selected text/background 6.89:1; ink/canvas 11.69:1; muted/white 6.06:1; muted/canvas 5.70:1. All exceed 4.5:1. Final boundary verification includes this log.
- Independent review compared the five design/task files to pre-turn snapshots and found no material contradiction, lost pre-existing content, or scope expansion. This attests only to this documentation increment, not prior changes in the tree.
- Limitations: no browser, build, integration test, provider operation, deployment, commit, or push was performed. T-94 and the existing view/screening tasks still own computed-token, focus, responsive, state, and metric parity verification. T-88's active ledger and all pre-existing non-document edits remain unchanged.


## 2026-09-13 — T-110: Blue CMS foundation and dashboard hierarchy

- Executor: Codex main; designer implementation: separate `/root/designer` for six shared visual files; independent correctness reviewer: `/root/ui_review`, distinct from both implementers. Designer also inspected fresh 390/1280 Ringkasan screenshots; independent reviewer inspected those plus Analitik at 1280.
- Authorization: Paduka Ongki requested continued implementation and UI/UX refinement after T-109. Requirement PR-22, supporting PR-17/PR-25/PR-26. Base HEAD `3e3ebf6a860a87c55b41f1e48f52c77362aa3032`; isolated branch `feat/tokophi-blue-ui`, worktree `/home/ongki/Projects/geraicuan-blue-ui`. Initial Phase 12 dirty changes were carried forward as a baseline, not reclassified as T-110 work. The original T-88 ledger was not copied or altered.
- Ledger: `RUN-20260913T135619Z-cd03d322`. Declared R2; observed effective R3 requires independent review. Accepted dirty paths and the narrow outlet-page/type-test scope expansion are recorded in the run. This entry covers only the T-110 increment, not inherited uncommitted work.
- Visual changes: shared primary `#2E47BA`, hover `#243A9B`, light canvas and white shell, stronger accessible input borders, visible active-navigation bar, persistent 12px mobile role, constrained scope title, compact heading/section rhythm, and consolidated CMS spacing with print rules preserved. Ringkasan's existing COD/non-COD trend follows current work; existing metric grids lose redundant borders, and financial cells use at most three desktop columns. No new metric, query, provider operation, auth rule, or ledger meaning is introduced.
- Changed owners: `src/app/globals.css`; `src/components/ui/button.tsx`; CMS `page-header.tsx` and `page-container.tsx`; shell/navigation under `src/app/_components`; tenant `page.tsx` and `dashboard-regions.tsx`; analytics `page.tsx` and `analytics-regions.tsx`; outlet `page.tsx` and its existing page test; `scripts/ui-audit/blue-ui-check.mjs`; spec 10, route map, TASKS, STATUS, and this log.
- Compatibility repair: generated Next.js route types rejected the pre-existing optional default props argument on OutletSettingsPage. Removed only `= {}` from that argument and passed `{}` in two authorization-test calls; the searchParams fallback and runtime authorization are unchanged. `outlet-page-typecheck` passed and justified both scope-expansion events.
- Tooling: project pnpm commands refused the cross-worktree node_modules symlink (`ERR_PNPM_UNSAFE_MODULES_DIR`). Used installed binaries directly, without dependency installation: `node node_modules/next/dist/bin/next typegen`; `node node_modules/typescript/bin/tsc --noEmit`; pinned ESLint over the changed TSX/test/script files; and `node node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts tests/design-token-contrast.integration.test.ts tests/outlet-settings-page.integration.test.ts`. Final result: types and lint pass, 23/23 tests pass. No full database suite or reseed was run because the existing suite destroys shared local fixture data.
- Runtime: own Next webpack dev server at `http://localhost:3125`, using only documented local fixture credentials; separate Chrome profiles/ports 9415 and 9416 for the two browser checks. No existing dev server was stopped, no secret file was read, and no provider or production operation occurred.
- Route browser evidence: `CDP_PORT=9415 UI_AUDIT_ORIGIN=http://localhost:3125 T77_ROUTES_ONLY=1 node scripts/ui-audit/sweep.mjs` reported 66 surface/viewport pairs, zero findings, 9,012 contrast elements, 1,427 focus probes, 41 scrolling tables with sticky first columns, expected container tiers/gutters, and no console errors. This is the route-only sweep, not the 300+ scenario suite. Raw local artifact: `scripts/ui-audit/.output/sweep-output.json`.
- Targeted browser evidence: `CDP_PORT=9416 UI_AUDIT_ORIGIN=http://localhost:3125 node scripts/ui-audit/blue-ui-check.mjs` emitted `BLUE UI PASS`: 24 role/route/state/viewport checks across Operator, Tenant Admin, Super Admin, tenant home, analytics, platform home, first-run, partial error, and stale data at 390/768/1280. Checks include selected blue/background/indicator, actual contrast/focus, menu dismissal/focus return, retained URL filter after a completed new-document reload, and supporting-record link basis. Report and screenshots: `scripts/ui-audit/.output/blue-ui/` (ignored local artifacts).
- Verification corrections: initial login sweep lacked the documented demo-hint environment and triggered six probe-coverage findings; rerun with that fixture configuration passed all 66 pairs. New script initially mishandled the shared probe's JSON string and used generic state captions; review caught and corrected both. Fixed-delay reload inspection raced a changing document; it now waits for a new time origin, completed document, expected field, and resolved regions. Concurrent/hot-reloading dev checks also produced aborted navigations and a local login-rate 429; rate limits were not weakened. Final checks ran against stable source.
- Explicit limitations: native CDP Escape/Tab did not reach a document capture listener in the investigated mobile case, even with foreground/focus/keycode checks. A DOM-dispatched Escape reached the actual app handler, closed the sheet, and restored focus; the final report records this method for each role instead of claiming native-keyboard proof. Hover evidence is the compiled darker-hover CSS rule and resolved token, not a headless hover screenshot. No production build, deployment, commit, push, or complete Phase 12 claim is made. Pending metric work, including spec 19 M-5 D-3, remains unchanged.


## 2026-09-14 — T-111: Requested preset, seven-day comparison, and page audit

- Authorization: continued page-by-page UI/UX refinement, concise copy, seven-day line comparison with a demo, and explicit `pnpm dlx shadcn@latest apply --preset b1Ymqvgky`. Work remains isolated in `/home/ongki/Projects/geraicuan-blue-ui`, branch `feat/tokophi-blue-ui`, base HEAD `3e3ebf6a860a87c55b41f1e48f52c77362aa3032`. Inherited Phase 12 changes and the original worktree were preserved.
- Executed preset: shadcn 4.21.0 successfully applied `b1Ymqvgky` after creating independent worktree dependencies. Snapshot before application: `/tmp/geraicuan-before-b1Ymqvgky`. Result: Radix Nova, Inter, blue primary, neutral surfaces, 0.45rem radius. Preserved semantic headings, named table containers, mobile menu focus return, 44px controls, chart SSR dimensions, and light-only application behavior. Muted text, input borders, focus rings, destructive labels, primary hover, and essential chart strokes were adjusted for contrast. Analytics chart uses the darker preset chart-4 stroke and a fixed 288px height.
- Product changes: `/app` defaults to the latest seven WIB days; the previous daily period uses the same server-derived tenant/outlet scope. Explicit filters remain authoritative. Summary → line comparison → current work → recent shipments. Zero trends stay visible after successful reads; query errors stay errors. Custom periods over 31 days retain monthly totals without a misleading day comparison. `demo=grafik` supplies chart-only samples exclusively in development and labels them; summaries and records remain stored data. Existing page copy is shorter while preserving financial, authorization, and provider constraints.
- Browser evidence: existing system Chrome/CDP harness, not Playwright. Route sweep at 390/768/1280 covered 22 pages (66 pairs), 9,517 contrast elements, 1,450 focus probes, and 41 sticky tables, with no console errors. Its sole finding was the mobile comparison table lacking a named focusable scroll region; corrected and verified by the final targeted harness. Raw sweep retains that original finding rather than rewriting evidence. Desktop/mobile captures are under `scripts/ui-audit/.output/pages/` (44 screenshots, full-page capture capped at 4,000px).
- Final targeted command: `CDP_PORT=9415 UI_AUDIT_ORIGIN=http://100.127.67.86:3125 UI_AUDIT_TAILNET_HOST=100.127.67.86 node scripts/ui-audit/blue-ui-check.mjs` passed 24 role/route/state/viewport scenarios, default/demo comparison checks, mobile navigation/focus return, filter reload, and drill-down. Artifacts: `scripts/ui-audit/.output/blue-ui/`. Following the last analytics stroke/height edit, fresh 390/1280 captures showed two rendered lines, zero page overflow, and zero Runtime exceptions: `/tmp/geraicuan-preset-analytics-chart-{390,1280}.png`.
- Regression evidence: 62 tests passed across dashboard-period-page, design-token-contrast, shipment-route-states, platform-monitoring-page, and finance-page. TypeScript, targeted ESLint, and whitespace checks passed. The final ledger records executable checks. No destructive full database suite or fixture reseed was run.
- Harness corrections: navigation reads document readiness, URL, and time origin atomically; fixture login waits for its hydrated submit handler. An intermediate hydration mismatch was not reproduced in the independent four-navigation check or final targeted run; no broader absence-of-hydration-defects claim is made. An analytics screenshot taken during loading was replaced with captures asserting two rendered lines.
- Independent provenance: main Codex integrated changes; `/root/designer` supplied visual direction/analytics refinement and reviewed fresh dashboard/analytics captures; distinct `/root/ui_review` reviewed the composite implementation and final chart delta, independently reran all nine token tests, and returned PASS. Parent owns runtime integration and final boundary. Models: gpt-6; provider: openai; reasoning: unavailable:runtime-not-exposed.
- Ledger provenance: `RUN-20260913T171918Z-1c3cf576` remains FAIL because the later preset instruction introduced overlap with pre-existing dirty token/button files that its initial accepted boundary could not amend. No history was removed. Integration run `RUN-20260913T173605Z-ff8d8e78` explicitly accepts that overlap and reviews the composite earlier implementation; it does not relabel it as newly authored.
- Limits: native CDP keyboard delivery remains unverified where the harness records DOM-dispatched Escape; hover evidence is compiled CSS/resolved tokens, not a rendered hover screenshot. This is a bounded presentation audit, not completion of all Phase 12 workflows or whole-site WCAG certification. No production build/deploy, provider write, commit, or push. Development server remains available at `http://100.127.67.86:3125/app?demo=grafik`.


## 2026-09-14 — T-112: Exact supplied light/dark tokens

- User authorization: pasted complete root/dark palette after querying the apparent lack of change. This supersedes earlier token substitutions; no product toggle was requested. Base HEAD remains `3e3ebf6a860a87c55b41f1e48f52c77362aa3032`; same isolated worktree. Ledger `RUN-20260913T175355Z-d7c1c754` declares and accepts only globals, token test, and four canonical task/design/evidence files. Prior dirty changes preserved.
- Designer agent edited globals.css: restored five root token values, included all 31 supplied dark declarations, and scoped nine legacy aliases to both root/dark. Primary, radius, chart ramp, and other supplied root tokens already matched. Removed obsolete override comments. Main changed only the obsolete no-dark test into a test for explicit dark tokens without OS-preference activation; contrast assertions remain unchanged.
- Browser: system Chrome/CDP at the local Tailscale preview, Ringkasan demo at 390/1280, both default light and temporary explicit `.dark` class. Screenshots `/tmp/geraicuan-t112-{390,1280}-{light,dark}.png`. Browser checks confirm root background/canvas alias equality and zero page overflow. Explicit dark class is removed after inspection; no persistent user preference is changed.
- Contrast diagnostic: `pnpm exec vitest run --config vitest.integration.config.mts tests/design-token-contrast.integration.test.ts` returns exit 1: six tests pass, three fail. Exact values produce destructive tint 3.99:1, muted/sunken 4.34:1, and ring/canvas 2.59:1. These are known quality failures, not changed to expected-fail or skipped tests. Application request implemented; accessibility gate is FAIL. Type/ESLint/whitespace checks recorded in ledger separately.
- Provenance: designer performed visual CSS implementation; main integrated docs/tests/browser evidence; ui_review independently reviewed the final delta. Model gpt-6, provider openai, reasoning unavailable:runtime-not-exposed. No dependency installation, theme toggle, route addition, production action, commit, or push.

- Final designer inspection of all four captures confirms palette application and preserved layout. Dark native calendar icons and chart-axis labels remain low contrast; dark CSS support is not a fully audited dark-mode product. No additional color substitutions were made. Browser captured zero runtime exceptions.


## 2026-09-14 — T-113: Internal admin composition redesign

- Authorization: Paduka Ongki requested a substantial modern/professional shadcn redesign across the internal admin pages. Isolated worktree `/home/ongki/Projects/geraicuan-blue-ui`, branch `feat/tokophi-blue-ui`, base `3e3ebf6a860a87c55b41f1e48f52c77362aa3032`. Run `RUN-20260914T011345Z-79fc2fb6` declares R3, accepted pre-existing presentation paths, and the bounded change surface. The contact-render assertion received an explicit recorded scope expansion. Original worktree and inherited backend changes were preserved.
- Implementation: inset workspace and quiet role-aware navigation; shared page widths/headers/table gutters; flatter KPI, queue, contact, member, finance, and detail surfaces; divided form sections; compact primary period/outlet filters with native advanced disclosure in the same GET form. Selecting custom dates opens that disclosure after hydration. Hidden controls remain submitted. Existing filters, URL semantics, auth, metric formulas, and mutations are unchanged.
- Dashboard: default seven-day period, current/previous line series, chart-only development demo, and scoped analytics link retained; summary precedes chart, current work, and recent shipments. Removed redundant shortcut cards. Analytics now orders operational summary → trend → financial summary → reconciliation → detail; the financial region shares the existing summary promise and adds no query. Chart animation disabled for deterministic offscreen rendering. Loading skeletons follow the new composition.
- Review corrections: restored the scoped analytics link after the existing dashboard test caught its removal; preserved the contact-history guarantee while updating its text assertion; corrected definition-list markup; kept the legacy location warning in the description column; removed stretched contact detail headings and added the CSV disclosure chevron. Final product source froze before the final route shards and interaction phases.
- Executed static/regression checks: `pnpm exec next typegen`, `pnpm exec tsc --noEmit`, targeted ESLint, and Vitest integration checks covering dashboard-period-page, shipment-route-states, platform-monitoring-page, finance-page, and contact-render. Final focused result: five files, 57 tests passed. The separate reviewer independently ran 49 applicable tests and reviewed the final source changes. No destructive full-database suite or reseed was performed.
- Route screening: system Chromium/CDP, not Playwright, against the Tailscale preview. The union of the latest route/width rows in `.output/t113-operations.json`, `t113-reports-final.json`, `t113-contacts-final.json`, and `t113-platform-detail-final.json` covers 19 internal routes at 390/768/1280 (57 pairs). The last report supersedes the three shipment-detail rows in the operations report; one earlier detail row captured a dev 500 and is not accepted as route evidence. Every final row has one main, one h1, zero document overflow, no skipped headings, no unreachable scrolling regions, no small-target findings, and no nested cards. This does not mean zero accessibility findings: text/focus contrast remains deficient, and long-line probes flag six dashboard lines and one settings line at 1280.
- Visual evidence: fresh desktop/mobile screenshots under `scripts/ui-audit/.output/pages/`, full-page captures capped at 4,000px. Designer reviewed every tenant family and the four platform families. Final 12 platform/analytics/finance captures were accepted; both analytics lines are visible. Mobile metric pages remain long and dense tables scroll locally. Some platform desktop metric cards retain whitespace from equal-height rows. These are recorded density limits, not overflow defects.
- Interaction evidence: after source freeze, sequential `blue-ui-check.mjs` phases on `http://localhost:3125` with `CDP_PORT=9422`, `UI_AUDIT_PALETTE_DIAGNOSTICS=1`, and `UI_AUDIT_PHASE=filters|states|roles`. Filters passed six route/width combinations (dashboard, analytics, finance at 390/1280), closed FormData preservation, hydrated custom-date opening, default/demo/zero trends, new-document filter reload, and scoped supporting-record links. States passed 12 empty/error/stale scenarios; roles passed 12 route/width checks across Operator, Tenant Admin, and Super Admin, including mobile dismissal/focus return. Reports: `.output/blue-ui/report-{filters,states,roles}.json`. Palette diagnostics do not waive structural assertions or claim contrast success.
- Harness/runtime limits: early concurrent attempts were interrupted by Next dev HMR reloads and transient compilation JSON errors. Document initiator stacks identify Next's `web-socket.js` SYNC hash handler calling `window.location.reload()`; the reason for reconnect/hash churn was not established. No invalid JSON file was found at rest. Only the task-owned dev server was restarted; its old `.next` cache was preserved at `/tmp/geraicuan-t113-next-before-restart-1789349230`. Localhost sequential phases then passed. The initial custom-selection failure was an SSR/hydration race; the harness now waits for the real React onChange handler before dispatch, without weakening the behavior assertion. No Next package patch or suppression of HMR/errors was used.
- Evidence metadata: original phase reports predate a reporting-only fix and include an unconditional hoverEvidence label. Only filters actually tested compiled hover CSS and tokens; states/roles did not. The final harness emits origin, paletteProbed, and null hover evidence for those phases. Filter reports have no palette findings because they do not run that probe. No broad zero-Runtime-errors claim follows from the phase success reports. Native CDP keyboard delivery is unverified where `keyboardEvidence` says DOM-dispatched Escape; compiled hover evidence is not a rendered hover screenshot.
- Independent provenance: `/root/designer` supplied pre-edit visual direction, implemented shared composition, and inspected final captures. `/root/ui_review` separately reviewed source correctness, independently ran tests, diagnosed runtime evidence, and reviewed the final harness. Product review PASS, with the reporting correction above applied. Model gpt-6, provider openai, reasoning `unavailable:runtime-not-exposed`; main Codex owns integration and final task-boundary execution. Final boundary outcomes belong to the immutable ledger, not an assumed PASS in this log.
- Quality gate: the exact T-112 token declarations are unchanged. Token diagnostic remains six passed and three failed: destructive tint 3.99:1, muted/sunken 4.34:1, and ring/canvas 2.59:1. Failures are neither skipped nor converted to expected failures. Requested implementation is complete; overall delivery quality remains FAIL, not WCAG acceptance. T-112's old final review was stale after its last documentation change; this entry does not retroactively claim that boundary passed.
- No dependency addition, live provider request, order issuance, production build/deploy, commit, or push. The dev preview remains `http://100.127.67.86:3125/app?demo=grafik`. This presentation task does not close all Phase 12 work. In response to the user's API status question, disk confirms location/pickup and estimate adapters plus managed keys exist, while issuance/recovery actions use sanctioned non-production fixtures and the unverified tracking webhook returns 404; live end-to-end readiness was not asserted or tested here.


## 2026-09-14 — T-126: Phase 13 verification handoff (in progress)

- The owner authorized T-126 onward and Admin/Super Admin visual parity. Latest accepted Phase13 code lives in `geraicuan-blue-ui`; created `geraicuan-completion` / `feat/phase14-completion` at3e3ebf6 and copied155 changed non-secret files. Existing preview3125, settings3126 and source worktrees remain intact. Dependencies were installed offline from the frozen lockfile after pnpm correctly rejected a temporary cross-worktree node_modules symlink; no package versions changed.
- Historical umbrella `RUN-20260914T043942Z-5e1552c2` contained a start and failing boundary, with spec17/18 outside scope and missing accepted dirty overlap. Separate reviewer root.ui_review confirmed it. Closed that run as FAIL, preserving history. Successor `RUN-20260914T105602Z-2d584dc6` captures the reviewed snapshot and owns current documentation/verification; it does not reinterpret the old boundary as PASS.
- Full integration baseline on task-owned PostgreSQL16 at localhost55450:82 files,655 tests,653PASS/2FAIL,195.40s. Both failures were timeouts in ledger-repository while build ran under memory pressure. Repeated that entire file alone with original timeouts:4/4PASS,6.19s. The31 database-backed files and51 remaining files have passing evidence across those runs; failed original output is preserved. No assertion or timeout was relaxed. PG same-transaction deprecation warnings remain a known T133 preservation item from the earlier audit, not suppressed.
- Build: `pnpm build` exits0 in the isolated completion worktree (optimized build, TypeScript, route generation). `pnpm lint` and `git diff --check` pass. Logs `/tmp/geraicuan-t126-build-final.log`, `-lint.log`, `-baseline.log`, `-ledger-recheck.log`.
- Seed: `pnpm db:seed-local` ran only after tests on the task-owned audit DB. The seeder resets its runtime password to DEV_LOCAL_PASSWORD; the first browser attempt exposed this test/dev configuration mismatch and is retained as failed evidence. Restarted only our3127dev process with the seeded local runtime value; no auth policy or application source changed. Original previewDB55433 was preserved.
- Fresh browser sweep in progress: existing repository CDP/probe/scenario code copied to `/tmp/geraicuan-t126-audit`, with only viewport list changed to390/768/1440. Preview `http://100.127.67.86:3127`, ChromiumCDP9430. Screenshots/report are below that temporary audit directory. These are real browser measurements; DOM login events are not native keyboard certification.
- Independent designer inspected current `/app`390/1440 captures: no visual blocker or clipping, line comparison readable. Mobile decision content remains below the8recent-row list, an accepted Phase13 density limit. Other route captures and final boundary review remain pending; T-126 is not yet complete.


## 2026-09-14 — T-126 resumed verification after runtime restart

- Resumed the authoritative completion worktree and existing successor run; the original checkout still owns T-88. No source branch was overwritten. The task-owned audit PostgreSQL container was confirmed stopped, then restarted on 55450. Old temporary evidence and browser processes no longer existed, so browser checks are being recreated rather than inferred from stale status.
- Started a task-owned Next dev process at `http://localhost:3127` and Chrome CDP9430. An initial development configuration mistakenly made runtime and migration URLs equal; the application guard correctly rejected authentication. Removing the unnecessary migration URL from dev restored login without changing application code.
- Fresh independent correctness/security review verified 94 tests in five presentation/route files and later 26 action tests. Main `t126-static` ran TypeScript, project ESLint and whitespace checks successfully. Full database/build checks will be repeated because the old temporary logs are unavailable.
- Browser observations cover all 19 CMS routes and three public routes at 390/768/1440. The initial invocation incorrectly supplied an unsupported routes-only CLI argument and entered extra state scenarios; it was stopped after preserving observations. The platform shard completed separately. These partial/sharded observations remain diagnostic. The final complete route-only run subsequently finished with 66 pairs (45 tenant, 12 platform, nine public), 8,991 contrast measurements and 1,502 focus probes. No overflow, contrast/focus failure or console error occurred. Seven flagged pairs remain explicit: six public-login text-count diagnostics (seven actual text elements versus a generic floor of ten), and one Analytics desktop pair with three over-wide captions assigned to T-134. No state-scenario completion is claimed.
- Independent designer inspected all tenant/platform desktop and mobile route families. No clipping/overlap was found in the ordinary seeded states. Existing long-AWB and repeated batch-reference limits remain T-127/T-129. Compact-count mobile column, platform filter/card composition and value-baseline discrepancies are explicitly routed into T-134; conflicting historical design prose belongs to T-131. This is not final visual parity acceptance.
- Eighteen browser viewport observations exercise public login discovery, desktop sidebar navigation, three widths and Tenant Admin/Super Admin roles. They do not cover Operator, mobile drawer interaction, filter submission or native keyboard behavior. Every navigation set has at most one current item, document overflow is zero, and no Runtime exception occurred. `interactions.json` and screenshots are under `/tmp/geraicuan-t126-audit/.output/`. DOM-driven links/login are not native keyboard certification.
- Fresh audit exposed two instrumentation assumptions: whole-document current-page counting rejected valid independent pagination, and scalar KPI labels were treated as section headings. Before editing, the ledger expanded scope only to `scripts/ui-audit/probe.mjs` and `probe-coverage-selftest.mjs`. The probe now retains the CMS-current requirement, catches duplicates inside any navigation set, and recognizes existing StatCard scalar labels. Live selftests prove valid separate sets, missing CMS current despite active pagination, duplicate current in one set, valid scalar labels, and the original eight injected defects including a real non-heading section title. `t126-probe-selftest` PASS is executable ledger evidence. No application rendering changed.
- Original Phase13 failure remains preserved in the blue-ui worktree ledger. No production, provider, commit, push or release action occurred. T-126 remains open until the fresh full integration/build and independent boundary review finish. The independent designer reviewed all 38 desktop/mobile captures across 19 CMS routes and additional Analytics financial captures at 768. Review PASS is bounded to the existing Phase13 surfaces with the explicitly routed follow-ups; final Admin/Super Admin parity is not claimed.


### T-126 final verification and Phase13 gate

- Fresh full integration command: `python3 /tmp/geraicuan-completion-run.py` under the repository test environment, task-owned PostgreSQL55450 only. 82 files / 655 tests PASS, 115.86s. The temporary runner first failed before running tests due to an omitted-argument handling bug; that executable FAIL is preserved in the ledger, followed by the corrected runner and passing complete suite. Existing pg concurrent-query deprecation warnings remain unsuppressed and do not establish a new application defect.
- Fresh build command: `python3 /tmp/geraicuan-completion-run.py build`, using the documented local production-build environment. Exit0; optimized build, typechecking and route generation pass with task dev stopped. Logs: `/tmp/geraicuan-t126-integration-fresh.log`, `/tmp/geraicuan-t126-build-fresh.log`. The runner generates credentials only for this already-authorized disposable audit container; it reads no private environment file.
- Browser command: `T77_ROUTES_ONLY=1 CDP_PORT=9430 UI_AUDIT_ORIGIN=http://localhost:3127 UI_AUDIT_SCREENSHOTS=1 UI_AUDIT_REPORT=t126-final node /tmp/geraicuan-t126-audit/sweep.mjs`. The temporary copy changes only viewport1440 and matching expected gutter; it imports the corrected repository probe. Final report has `partial:false`, 45 tenant +12 platform +9 public observations, no state scenarios. The seven flagged pairs and T-134 prose finding are preserved rather than reported as zero findings.
- Independent provenance: Codex main executes/integrates; separate `/root/designer` reviewed all19 CMS screenshot families at390/1440 and Analytics768. Separate `/root/reviewer` reviewed the scoped audit correction, its regression injections and actual final JSON/script evidence; review accepts bounded Phase13 screening with explicit follow-ups. Provider openai, model inherited gpt-6, reasoning effort unavailable: runtime not exposed.
- T-118 through T-125 and the T-126 verification gate are closed on this evidence, subject to the matching final ledger boundary/review record. No application source changed in T-126: only three task/status/evidence documents and two audit scripts are task-owned. T-127/T-129/T-131/T-134 retain the discovered limitations; T-132 awaits a replacement identity decision. No final parity, all-state coverage, whole-site accessibility certification or production readiness is asserted.


## 2026-09-14 — T-127: Full provider AWBs stay inside queue cells

- Run `RUN-20260914T113912Z-76992cad`, requirement UX-3, R2; base3e3ebf6 on the completion worktree. Scope: two queue pages, their two existing render-test files, TASKS/STATUS/BUILD-LOG. All seven inherited dirty paths explicitly accepted before edits; no other source changed. Skills: nextjs-development (installed server-component guide), testing-engineering, ui-validation; native-first verification guidance; separate designer used admin-dashboard.
- Reproduced 40-character AWBs by substituting deterministic text into already-rendered local fixture cells, without changing stored provider authority. At1440, RTS scrollWidth1240 versus clientWidth1095; Kiriman misleadingly remained1095/1095 but AWB text overprinted its timestamp cell. Independent designer confirmed both defects before editing.
- Added `break-all` to the Kiriman AWB span. RTS identity cell now bounds width and permits normal whitespace; its link has bounded width and breaks long identifiers, retaining full text, touch height, target URL and opaque sticky background. No record, provider, query, auth or financial behavior changed.
- Existing focused baseline:26/26PASS. New rendered40-character guards initially failed twice; after the fix,28/28PASS, TypeScript and targeted ESLint PASS. A mistaken initial test expectation used48 rather than the actual44 recipient ceiling on Kiriman and was corrected to the existing contract. Tests also pin recipient/outlet wrapping and the merged RTS Status & Waktu heading.
- Browser layout proof: `/tmp/geraicuan-t126-audit/awb.mjs after`, ChromeCDP9430, local3127, Tenant Admin via queue navigation. Eight observations at390/768/1280/1440; all56 measured AWB text ranges remain inside their padded cells, all text is intact, document overflow0. At1440 both regions1095/1095; at390 client356 versus scroll896 (Kiriman) and1059 (RTS), each labelled and focusable. Reports and before/after images: `/tmp/geraicuan-t127-{before,after}.json`, `/tmp/geraicuan-t127-{before,after}-{queue,rts}-{390,1440}.png` (additional after768/1280).
- Keyboard: a resize-combined harness initially failed to observe scrolling. A separate fixed390 viewport check with the same40-character layout fixture observes trusted, unprevented native CDP ArrowRight events and scrollLeft40 on both regions. This is actual keyboard scrolling, not DOM-dispatched keyboard simulation. `/tmp/geraicuan-t127-keyboard.json` and `-keyboard.log`.
- Independent `/root/designer` compared four before/after captures and approved resolved overlap, all desktop columns, mobile sticky readability and intact values. Independent `/root/reviewer` reviewed the exact four-file source/test delta and ran28 tests successfully. Main owns final mutation/static checks and boundary approval. No production/provider operation, commit, push or deploy occurred.
- Final mutation proof: all four independent removals (Kiriman AWB wrapping, RTS AWB wrapping, Kiriman fact-cell ceilings, RTS recipient/outlet ceilings) make exactly the new owning test fail while27 others pass. Each source file is restored byte-identical; `/tmp/geraicuan-t127-mutations.json` records restored hashes. Fresh focused/static checks after restoration and final boundary are recorded in the ledger.


## 2026-09-14 — T-128: Import recovery and Select touch-target regression guards

- Run `RUN-20260914T114740Z-fb238ad6`, UX-7. Source behavior remains unchanged; added `scripts/ui-audit/form-validation.mjs` and updated the three canonical execution/evidence files. Initial boundary also accepted the two already-dirty application files solely for reversible mutation checks; final contents restore byte-identical. Risk expanded fromR2 toR3 before fixture execution review because the browser guard owns a temporary local database fixture.
- The existing seed has one ready outlet, which the form correctly auto-selects. The test adds one random-ID outlet only in `127.0.0.1:55450/geraicuan_test`, then deletes that exact row with tenant predicate. Nested finally blocks guarantee database cleanup even if browser cleanup fails, and always close the pool. Reviewer-requested corrections tightened the port guard and made fixture writes explicit in comments. No existing outlet is modified.
- Runtime flow: reuse or establish the sanctioned Tenant Admin session, discover Kiriman through navigation, then use its Impor CSV action. Two DOM-click submit attempts with no outlet must each restore trigger focus, expose aria-invalid, associate the exact alert, and make zero POST attempts. A browser-local fetch interceptor blocks uploads even during deliberate guard removal; no CSV/provider action is needed. Native Space opens Select and Escape returns focus at390 and767, with actual option-row heights at least44px. Four observations pass; Runtime exceptions0. This is not native Enter-submit evidence (the initial combined Enter driver did not trigger submission reliably).
- Executed browser command: `CDP_PORT=9430 UI_AUDIT_ORIGIN=http://localhost:3127 node scripts/ui-audit/form-validation.mjs`, with the runner injecting the approved local DATABASE_URL. Durable scenario script is repository-owned; generated report `scripts/ui-audit/.output/form-validation.json`. The task-specific environment runner reads no private file.
- Mutation checks independently replace the missing-outlet early guard and remove the SelectItem max-md height class. Each browser run fails on its intended assertion (missing-origin recovery; actual option height), then both source files restore byte-identical. Evidence `/tmp/geraicuan-t128-mutations.json` and two mutation logs. No assertion or timeout was relaxed to manufacture success.
- Skills: testing-engineering, ui-validation; native-first existing CDP/pg capabilities. Separate `/root/reviewer` owns security/correctness review; main owns executed browser checks, cleanup and integration. No product UI edit, dependency addition, live/provider operation, commit, push or deploy.


## 2026-09-14 — T-129: Distinguishable platform batch references

- Run `RUN-20260914T115618Z-cc562d14`, PR-17, R2. Reused `shipmentReference` in the existing platform formatter; its sole caller remains the batch-table row heading. No UUID, URL, provider/account scope or authority changes. The eight-hex suffix is a display reference, not a uniqueness key.
- Removed the entire prefix-slice allowlist and added20 shared-prefix batch fixtures. Baseline2PASS; changed tests before implementation2FAIL/1PASS; corrected source18/18PASS across reference and platform-page tests, independently repeated by `/root/reviewer`. TypeScript, targeted ESLint and whitespace checks pass. Existing shared-helper uppercase coverage remains.
- Real browser navigation: public Super Admin login → platform tenant list → discovered seeded tenant detail. All18 rendered batch references are distinct at1440/768/390; document overflow0 and Runtime exceptions0. `/tmp/geraicuan-t129-browser.json` and matching three screenshots. Initial harness asserted the destination before route transition settled; corrected it to wait for the target pathname, then the same interaction passed. No application workaround.
- Separate `/root/designer` approved the pre-edit suffix direction; final captures preserve table semantics, typography and spacing. `/root/reviewer` independently reviewed source and executed18tests; main owns final evidence/boundary. Model gpt-6/provider openai/reasoning unavailable:runtime-not-exposed. No dependency, database mutation, provider operation, commit, push or deploy.


## 2026-09-14 — T-130: Named native required confirmations

- Final run `RUN-20260914T120236Z-0ab9531f`, UX-7, R3. Chromium reproduced the real defect: unchecked Radix confirmation blocks submission but focuses its aria-hidden input, whose accessible name is empty. The visible labelled role-checkbox remains separately invalid=false. Native input restores browser validation and named focus together.
- Replaced only four required confirmations: issuance, unknown reconciliation, unpaid recovery, and finance reversal. Preserved exact ID/name/value, full domain copy, fixture/pending disabled expressions, and issuance key reset when the selected service changes. Native size/accent/focus ring match existing fields; general optional Radix Checkbox remains unchanged. No action, provider, ledger or authorization semantics change.
- Existing action baseline26PASS. New actual-panel render guards cover enabled/disabled/pending shipment confirmations and no-selected-service issuance; reversal form contents use a test-only portal stub. Four missing-confirmation action cases use otherwise valid identifiers and assert no domain write. All35testsPASS, independently repeated. One initial assertion assumed lowercase copy; corrected it to case-insensitive matching while retaining the confirmation requirement.
- Durable browser command: `CDP_PORT=9430 UI_AUDIT_ORIGIN=http://localhost:3127 node scripts/ui-audit/required-checkbox.mjs`. Public local tenant login → finance → real reversal dialog; native Enter triggers validation, native Space toggles, and checked FormData contains confirmed. Both1440/390 show focused named invalid checkbox, visible ring and browser validation reason. Capture-phase submission interception and POST blocking prevent writes; zeroPOST/Runtime exceptions. Initial rawKeyDown Enter did not activate Chromium buttons; proper CDP keyDown with carriage-return text did. This is actual native input delivery, not a product workaround or DOM keyboard event.
- Mutation evidence: removing required independently in all four callers fails the render guard; restoring Radix in reversal fails the browser's full-label assertion. `/tmp/geraicuan-t130-mutations.json` and matching logs; every source restored byte-identical before fresh positive verification. Designer inspected both reversal screenshots and all four caller styles, accepting native focus/label layout. Three other caller states have render/source evidence, not separate live provider interactions.
- Boundary history preserved: initial discovery run `RUN-20260914T115813Z-04044a31` failed before source edits because it had no accepted dirty application surface. Next `RUN-20260914T115917Z-e0d4cc44` failed because Next bracket paths were mistakenly escaped as shell/fnmatch patterns; ledger brackets are literal. Restored all task edits to baseline, verified the three inherited source hashes plus clean finance HEAD, captured correct literal paths and reapplied identical reviewed changes under the final run. No user changes discarded; no failed history rewritten.
- Separate reviewer `/root/reviewer` independently ran35tests and reviewed source, server guards and browser interception; `/root/designer` reviewed before/after direction and captures. Main owns final static/browser/mutation and boundary evidence. Provider openai/model gpt-6/reasoning unavailable:runtime-not-exposed. No dependency, database mutation, provider operation, commit, push or deploy.


## 2026-09-14 — T-131: Reconcile delivered presentation with residual Phase12 requirements

- Run `RUN-20260914T120406Z-4160481d`, docs-only R2. Reviewed TASKS T-88–T-108 against current source and independent reviewer findings. Each of21 open tasks now names delivered preservation evidence, residual work and a still-valid completion gate. No Phase12 feature checkbox was closed by visual acceptance. D-3 remains pending; spec19 metric drift is not erased.
- Spec10 now separates historical T-110/T-111/T-112 palettes from accepted neutral T-118, removes the obsolete violet-marker mandate, and reconciles shared StatCard summaries, visible primary filters, advanced controls and semantic mobile scroll tables. Compact count/mobile grid alignment stays explicitly pending T-134; money/detailed-current-work cards remain stacked.
- Source verification corrected initial review assumptions: platform Trend already owns a collapsed native data disclosure; platform adjustment types normalize through migration0021's view; analytics denominator/courier low-volume context belongs to analytics-regions/courier-volume. Actual dashboard DOM places trend/recent before current work; T-98 retains the urgent-work-before-long-table gap instead of claiming the target order shipped.
- Independent correctness review preserved the exact T-94 navigation metric list, all-chart parity for T-100 and explicit archival implementation/owner-deferral gate for T-105. Designer review corrected tenant inventory to15 plus4platform and labelled T-111 composition historical. Missing palette, breadcrumbs, navigation counts, ranked attention, remaining charts/flow interactions and state coverage remain in their existing owning tasks.
- Executed documentation check verifies21 unique open task blocks, delivered/remaining/done sections, pending D-3, current route inventory and no whitespace errors. No executable source change or browser revalidation is required for this documentation-only task. Independent reviewer/designer provenance: gpt-6/openai, reasoning unavailable:runtime-not-exposed. No commit, push or deploy.


## 2026-09-14 — T-134: Shared Admin/Super Admin visual system

- Final run `RUN-20260914T121656Z-9b593465`, PR-22, R2, authoritative completion worktree. Reused shared shell, font, neutral semantic tokens, shadcn StatCard/Table and Admin filter anatomy; no second platform theme or metric/query/auth change. Designer supplied direction before edits and reviewed 28 final settled/viewport captures, plus three loading captures. Existing Analytics desktop controls remain36px versus32px on home/platform, with44px mobile controls across them; this accepted local variation is not claimed pixel-identical.
- Platform now has one visible-primary native GET filter form and one Terapkan submit. The tiny PlatformPeriodSelect client leaf only opens custom-date disclosure; parser authority, forced tenant route scope, hidden facet values and reset behavior remain unchanged. Dates/timezone/search and relevant secondary dimensions use native details. Removed the redundant forced-custom submit, preserving legacy khusus=1 URL parsing. No client database import or fetch was added.
- Compact count summaries use two phone columns on home, operational Analytics and platform; full-IDR and detailed current-work cards remain stacked. Health value baselines align, grouped volume cards fit content and tenant-detail volume uses three desktop columns. Table headers reuse muted tint with opaque sticky equivalents. Three remaining Analytics/platform caption widths are capped at the existing2xl measure.
- Loading counts have4/2/2columns at1440/768/390. Generic platform loading contains two control placeholders while overview has three primary fields. The768loading capture catches the full sidebar before hydration, whereas settled768uses the icon rail; exact loading-shell/field geometry is not asserted. A blank sticky first column in an offscreen full-page capture proved to be a raster capture artifact: actual390viewport captures at scrollLeft0/160 show readable full text and opaque cells. No speculative app workaround was added.
- Source validation: existing focused baseline45tests passed; added guards cover all four routes' single GET form, visible primary controls, unique field/submit ownership and custom disclosure. Final six-file focused command, TypeScript, project ESLint and whitespace checks pass. Full integration suite exits0 across83files in109.77s; Vitest's per-file cache confirms zero failed files. The ledger retains executed exit status/duration, not a complete test-count transcript. Production build exits0 with the task dev process stopped. Only the disposable local55450DB was used and reseeded; no private environment file was read.
- Failed evidence remains explicit: initial run `RUN-20260914T120912Z-36538fb3` closed FAIL when final prose measurement required an inherited dirty Analytics page outside its accepted surface. The reviewed implementation was retained; the successor explicitly accepted that page and spec10 before the two final width caps. A mistyped python executable produced exit127 before tests; corrected python3 ran the full suite successfully. Repeated local browser logins returned429. After suite/build the task DB was reseeded and only the task preview restarted. A combined final browser chain then exceeded the existing database-backed five-login/60-second rule on its sixth login; parity and roles had already passed. The failed chain and failed premature retry remain explicit; the filter check waits for the real rate window rather than weakening auth policy.
- Independent source reviewer confirmed form/scope/client boundaries and separately ran23focused tests. Designer approved visual parity with the limits above. Main owns final browser, integration and boundary evidence. Model gpt-6/provider openai/reasoning unavailable:runtime-not-exposed. Route inventory remains22pages; spec18 records the new route-owned disclosure leaf. Neutral identity remains pending the separate T-132 owner decision. No provider operation, deployment, commit or push.

- Final interaction report: actual custom-date opening/submission and preset reset pass at390/1440; tenant/status/courier and audit-result facets survive GET application; mobile outlet/batch identity remains opaque/readable at scrollLeft0/160; three actual loading captures retain4/2/2count columns. Latest `/tmp/geraicuan-t134/flows.json` records DOM button clicks for six submissions because native CDP Enter did not reach the document. The harness first asserts valid form and focused enabled submit; fallback is permitted only when no native key event arrived. A preceding native-only navigation timeout is retained as failed driver evidence. No native Enter acceptance is claimed for this final run.
- Final role report covers nine observations across Operator/Tenant Admin/Super Admin at1440/768/390. Public auth returns200 for all three; navigation stays authorized with one current item, mobile dismissal returns trigger focus, and Runtime exceptions are zero. Escape uses a documented DOM-dispatched event because native CDP delivery did not reach the document. Final parity originally measured zero focus controls; independent review caught the missing focus-emulation setup. The corrected final run enables focus emulation and requires nonzero focus inspection on every route. All18observations pass with487actual focus probes and5214contrast measurements, no weak rings, contrast failures, long lines, small targets, sticky findings, document overflow or Runtime exceptions. Computed semantic tokens and heading typography match across Admin/Super Admin. Reports and screenshot artifacts are under `/tmp/geraicuan-t134/`; scripts are under `/tmp/geraicuan-t126-audit/parity*.mjs`.


## 2026-09-14 — T-133: Preserve both worktrees in one integration branch

- Run `RUN-20260914T122904Z-2daa4f9d`, repository contract, R2. Owner's T126-onward goal authorizes integration into `feat/phase14-completion`, leaving commits/push/deploy as separate actions. Declared task surface is TASKS/STATUS/BUILD-LOG; no executable source change. Both source worktrees remain intact.
- Independent comparison: platform-monitoring, shipment-queue and tenant-dashboard repositories plus metric-scope-parity, shipment-queue and tenant-dashboard tests are byte-identical across original, blue-ui and completion. Spec19 equals blue-ui; its differences from original are two Indonesian labels and accepted T111 current/prior chart/range refinements, with metric formulas and pending D3 retained. Dashboard preserves unknown+failed action count, Tenant Admin-only unpaid/reconciliation and separation of current-work snapshot from period summary. Original BUILD-LOG lines remain in order; new entries also occur between old sections, not only at the end.
- Both source ledgers verified before changes. Original T88 `RUN-20260913T123004Z-737a5ac1` contained only its start; root closed it through delivery-ledger as FAIL with partial implementation preserved and residual T88 still open. The historical Phase13 `RUN-20260914T043942Z-5e1552c2` already finished FAIL. These are honest history closures, not retroactive feature acceptance.
- Imported15missing run files (three original,12blue-ui) byte-for-byte after rejecting conflicts. Existing common histories matched; completion current.json retained its own active run. No event or provenance was rewritten. Import manifest `/tmp/geraicuan-t133-history-import.json` records original paths and hashes; delivery-ledger verify confirms every chain. The original checkout changed only through its authorized ledger finish.
- Executed preservation check `/tmp/geraicuan-t133-preservation.py` verifies six source/test matches, resolved spec19, all434executable/config hashes and exact inventory, all source histories, original log-line preservation, both FAIL closures and open residual T88. Its first attempt incorrectly assumed original log text was one contiguous substring; the corrected check requires every old line in order with no deletion/replacement and passes. No history content was changed to satisfy it.
- T134's fresh full integration (83files, exit0,109.77s) and production build apply to this identical executable tree; no duplicate test run is represented as new. Fresh TypeScript, project ESLint and whitespace checks plus preservation verification run for this final integration. Independent `/root/reviewer` owns final source/history and boundary acceptance; gpt-6/openai/reasoning unavailable:runtime-not-exposed. Main owns integration. No database/provider operation, dependency, commit, push or deployment in T133.
- Follow-up scope now leaves only T132 pending an explicit replacement palette. Accepted neutral Admin/Super Admin parity is delivered; no alternative brand choice or all-Phase12 completion is inferred.
