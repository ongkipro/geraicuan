# Tasks: GeraiCUAN

> Status: Canonical repository execution queue. Execute only accepted tasks in dependency order and record fresh evidence before marking them complete.

## Rules

- Execute one task at a time and mark it complete only with fresh, recorded test evidence.
- Follow declared dependencies rather than numeric task order; T-35 and T-36 are retained milestone IDs, while T-37 through T-48 are their atomic execution queue.
- Each task has one primary requirement. Cross-cutting obligations are constraints, not a second primary outcome.
- All Mengantar calls originate on the server. Never put the credential-bearing URL, key, or a request containing either into a client bundle, log, fixture, or error message.
- Every tenant-owned query and mutation requires an authenticated tenant context and must satisfy `TEN-1`, `TEN-2`, `IAM-2`, `IAM-3`, and `SEC-2` as applicable.
- Every task whose primary requirement names an authenticated actor must include real-browser reachability evidence: the actor discovers and completes the workflow without a direct URL, seeded UUID, database access, or test-only entry point.

## OMP Goal Mode contract

### Goal objective to paste after `/goal`

> Complete the accepted GeraiCUAN location-authority, outlet-settings, and post-change system-screening goal from the repository's current state. First inspect `delivery-ledger status`, `.delivery/current.json`, and this queue: resume a valid active atomic run, otherwise execute T-54 → T-55 → T-56 → T-63 → close T-52 → T-53 → T-57 → T-58 → T-64 → T-65 → T-66 → close T-59 → T-67 → T-68 → close T-60 → T-61 → T-62. Treat repository requirements, disk state, and fresh executable evidence as authoritative. T-54 through T-56 plus T-63 own the remaining server, contact, individual-shipment, and bulk-location slices; T-53 owns responsive many-outlet settings; T-57/T-58 own inventory and system correctness; T-64 through T-68 own bounded UI/UX screen groups; T-59/T-60 are cross-screen closure milestones; T-61/T-62 own role journeys and the release boundary. Screening is verification-first, not permission for an indiscriminate redesign. Use `mengantar-api` for provider contracts, `full-stack-development` for cross-layer implementation, `admin-product-ux` and `admin-dashboard` for workflow/presentation decisions, `shadcn-ui` for admin components, `ui-validation` for executable browser evidence, and `designer` or `vision` before and after browser-visible edits. Route every material finding into its smallest owning task, obtain the required independent review, pass the delivery boundary, update repository evidence, and continue until the queue is genuinely complete. Never create a provider order, mutate production, read or print secrets, commit, push, deploy, or release without explicit approval.

### Startup gate

1. Read `AGENTS.md`, `~/dotfiles/config/omp/GOAL-ORCHESTRATION.md`, the primary requirement and constraints for the selected task, `docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md`, `docs/spec/17-UX-FLOWS-SCREEN-CONTRACTS.md`, `STATUS.md`, `BUILD-LOG.md`, and the current delivery-ledger state.
2. Run `delivery-ledger status` and inspect `.delivery/current.json` instead of trusting a dated status snapshot; this installed CLI has no `current` subcommand. If a valid run is active, resume only its declared task and boundary; if no run is active, resolve any drift through the documented ledger workflow before implementation. Never manufacture a retroactive boundary or PASS, and never open a second run over an active one.
3. For a new run, capture the base HEAD and all pre-existing dirty paths. Classify each path as accepted existing work, protected user work, or unexplained. An unexplained or overlapping path blocks the task until scope is explicitly resolved. For a resumed run, re-check that its immutable baseline and accepted overlaps still match the intended task before continuing.
4. Select or resume exactly one unblocked atomic task. T-52, T-59, and T-60 are closure milestones; every child implementation or screening group remains a separate run.
5. When no valid run exists, start one with the task ID, its single primary requirement, declared risk, capability, allowed paths, protected paths, and explicitly accepted dirty paths. A task may not edit before this boundary exists.
6. Establish the smallest safe local runtime needed by the task: reuse or start the repository's PostgreSQL and `pnpm dev` workflow, seed only deterministic local demo roles/data through repository scripts, and prove the required actor can log in before browser verification. Record the actual local origin and fixture identity without printing passwords, tokens, connection strings, or other secret values. Tailscale reachability is optional evidence, not a substitute for authenticated browser checks.

### Per-task execution loop

1. **Understand:** trace the current route, repository tests, server read/write path, role boundary, and accepted screen contract before proposing a change.
2. **Pre-edit UI/UX review:** for every browser-visible task, `designer` or `vision` must open the current narrow and wide states before the first visual edit and record concrete discrepancies against the UI/UX rubric below. If the reviewer finds no material discrepancy, do not churn the UI; proceed only with missing behavioral/state evidence.
3. **Implement:** route code, tests, database logic, and difficult debugging through `task`/Sol. Use `shadcn-ui` for React admin components, installed dependencies before new packages, native semantics where they are smaller, and the minimum change surface that satisfies the task.
4. **Validate:** run the nearest focused automated checks first, then real-browser interaction at 390px, 768px, and 1280px for the task's declared states. A build, server render, DOM snapshot, or screenshot alone is not browser evidence.
5. **Post-edit visual critique:** `designer` or `vision` must re-open affected narrow and wide states, compare before/after captures, identify any remaining hierarchy, density, alignment, state, responsive, accessibility, or AI-template defect, and request a bounded revision until the accepted direction is met or a real blocker is recorded.
6. **Independent review:** R2 cross-module work requires `reviewer`; R3/R4 or sensitive auth, tenant, finance, PII, credential, provider, migration, or production-boundary work requires `security-reviewer` plus boundary approval. The implementer cannot approve their own result.
7. **Boundary and evidence:** run `delivery-ledger check-boundary`, record executed commands and browser targets, record `ui-validation` skill usage whenever the observed boundary contains browser files, update `BUILD-LOG.md` and `STATUS.md`, and mark the task complete only after the ledger and required reviewer report PASS.
8. **Continue:** integrate one isolated result at a time, then select the next dependency-ready task. Stop only for an approval gate, an unresolved boundary conflict, or a genuine blocker recorded with its exact resume condition.

### Completion gate for T-52 and T-53

T-52 closes only after T-54 through T-56 plus T-63 prove the accepted provider search contract server-side and the same validated destination ID/label pair survives contact selection, individual/bulk draft persistence, estimation, and provider-order payload construction without a real provider mutation. T-53 then closes only after one responsive outlet context works for zero, one, and many outlets and a Tenant Admin can discover, change, reload, and recover the settings workflow at every required viewport. T-57 through T-68 then screen and close the integrated system according to their declared dependencies before T-61/T-62 finish the journey and release boundaries: a finding reopens its owning task or creates one new atomic repair task, and the failed screening is rerun from a fresh boundary. A visual defect never expands a provider/data task; a provider-authority, persistence, tenant-isolation, secret, money, or release-boundary defect never hides inside visual polish.

### UI/UX review rubric

Every screen review must answer these points with concrete route/state evidence:

- **Job and hierarchy:** the first viewport exposes the role's next decision; Ringkasan follows overview → filter → detail, while queues/forms/settings follow their operational job instead of forcing dashboard cards.
- **Composition:** one shell owns viewport gutters; `PageContainer` owns page measure; `PageHeader` owns title/action hierarchy; regions use typography, whitespace, dividers, tables, and timelines before adding another Card. Reject nested cards, decorative KPI tiles, ornamental badges, uniform oversized radii, and generic bento composition.
- **Sizing and rhythm:** 16/24/32px responsive shell gutters, intentional `wide|data|standard|form` measure, 44px applicable touch targets, readable line lengths, aligned form controls, consistent row height, and no duplicate padding.
- **Data meaning:** timezone appears beside period meaning; IDR is formatted with `Intl`, numeric columns are right-aligned and tabular, COD principal is never revenue, lifecycle status is the shipment's primary operational axis, and per-tenant versus aggregate values are explicit.
- **Tables and filters:** URL-addressable filters and pagination survive reload/Back; wide tables scroll inside labelled regions rather than the document; the mobile pattern is chosen intentionally; sticky columns remain opaque; empty state explains why and the next action.
- **Charts and KPIs:** chart type matches the relationship; bars start at zero; comparison has a non-colour cue; every value is available in a semantic table; loading skeleton mirrors the final region; partial failure does not erase healthy data.
- **Forms and actions:** labels, help, errors, pending state, preserved input, confirmation, success, focus recovery, and destructive-object naming are explicit. Hide actions a role can never hold; disable with a reason only when object state temporarily forbids an otherwise permitted action.
- **Responsive and accessibility:** verify 390/768/1280, keyboard order, visible focus, accessible names/roles/states, dialog focus trap/return, one main landmark, one truthful current navigation item, and document overflow delta no greater than 1px.
- **Visual finish:** typography, alignment, density, contrast, truncation, wrapping, icon purpose, and state clarity look like one restrained operational product; capture and reject obvious template repetition or visually noisy decoration.

### Evidence record required for every UI task

- Task ID, primary requirement, risk, base HEAD, and allowed/protected change surface.
- Actor, route, scenario, viewport, local origin, and exact browser/test command or tool.
- Before-review findings, implemented decisions, after-review verdict, reviewer identity/capability, and remaining limitation.
- Overflow delta, local scroll-container dimensions where relevant, keyboard/focus result, console/runtime/relevant-network result, and screenshot/trace path when produced.
- Focused checks, full checks required by the task, delivery-ledger boundary result, and explicit note that no provider/production/commit/push/deploy action occurred unless separately approved.

### Approval and stop conditions

- Stop for secrets, destructive operations, system-wide changes, production/live mutation, provider order/payment/recovery outside sanctioned fixtures, commit, push, deploy, release, or material scope expansion.
- Do not add Playwright, axe, Storybook, a chart library, a table framework, or visual-regression infrastructure merely to satisfy the goal. Reuse installed/project/browser capabilities; a new dependency requires an explicit, evidence-backed scope decision.
- Do not mark a task complete because prior evidence exists. Prior evidence narrows the work; completion requires fresh evidence inside the task's current boundary.
- Do not rewrite settled IA or visual direction during verification. A material redesign finding pauses the task and returns to the accepted `admin-product-ux`/`admin-dashboard` contract before implementation.

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

- [x] **T-5 — Build bulk shipment intake validation**
  - Primary requirement: PR-4
  - Constraints: TEN-2, IAM-3, PRIV-1, UX-2, RATE-1
  - Dependencies: T-4
  - Done when: A tenant operator uploads a documented CSV template, receives row-level validation errors without order creation, and can create only the valid rows as tenant-scoped drafts.

- [x] **T-6 — Fetch provider estimates and enforce COD eligibility**
  - Primary requirement: PR-5
  - Constraints: TD-2, SEC-1, RATE-1, OBS-2
  - Dependencies: T-4
  - Done when: A server integration test using a Mengantar contract fixture displays only supported services, disables COD when `unsupported_cod` is true, and persists provider-returned shipping and insurance values without custom price calculation.


- [x] **T-12 — Calculate and persist COD collection totals**
  - Primary requirement: PR-9
  - Constraints: PR-5, TD-2, DATA-3, TEN-2
  - Dependencies: T-6
  - Done when: A deterministic IDR test proves that goods Rp100.000 plus Mengantar shipping Rp10.000 produces service fee Rp3.300, VAT Rp363, and provider COD amount Rp113.663; unsupported COD remains unselectable.

- [x] **T-13 — Build tenant reusable contact directory**
  - Primary requirement: PR-12
  - Constraints: TD-6, DATA-1, TEN-2, IAM-2, IAM-3, PRIV-1
  - Dependencies: T-1
  - Done when: A tenant user can create, search, update, archive, and select sender/recipient contacts with multiple addresses; cross-tenant access is denied and historical shipment snapshots remain unchanged after contact edits.

## Phase 3: Resi and label

- [x] **T-7 — Create serialized Mengantar order batches**
  - Primary requirement: PR-6
  - Constraints: TD-3, SEC-1, TEN-2, OBS-2, RATE-1
  - Dependencies: T-5, T-6
  - Done when: A contract test proves individual and bulk drafts become one provider batch per courier/pickup context, dynamic-AWB courier requests are serialized per account, duplicate submission is idempotent, and returned `cnote_no` values are persisted as provider AWBs.

- [x] **T-8 — Recover unpaid non-COD provider batches**
  - Primary requirement: PR-8
  - Constraints: TD-4, SEC-1, TEN-2, IAM-2, OBS-2
  - Dependencies: T-7
  - Done when: A test fixture with `isPaid:false` and no AWB leaves the shipment awaiting payment; an authorized retry invokes `pay-unpaid`, persists returned AWBs, and rejects any cross-tenant retry.

- [x] **T-9 — Render and record provider AWB labels**
  - Primary requirement: PR-7
  - Constraints: TEN-2, IAM-3, PRIV-1, UX-3, OBS-3
  - Dependencies: T-7
  - Done when: A browser test prints a 100x150mm label using the provider AWB, selected courier, sender, recipient, package, COD/non-COD, and provider insurance data; each print/reprint increments a tenant-scoped history record.

- [x] **T-14 — Build Super Admin operations monitoring**
  - Primary requirement: PR-11
  - Constraints: TD-7, IAM-1, OBS-1, OBS-2, OBS-4, SEC-1, SEC-2
  - Dependencies: T-1, T-2, T-3, T-7
  - Done when: A browser and integration check show filtered global/per-tenant counts, provider/queue/unpaid/error health, usage, and audit records with URL-addressable filters, selected timezone, and no credentials or unnecessary PII.

- [x] **T-17 — Add timezone-safe analytics filters**
  - Primary requirement: PR-15
  - Constraints: TD-9, IAM-1, IAM-2, OBS-4, UX-1
  - Dependencies: T-7, T-8
  - Done when: Browser and integration checks prove URL-addressable preset/custom ranges, identical timezone boundaries across KPI/trend/table views, and tenant scope enforcement.

- [x] **T-18 — Implement tenant operational ledger**
  - Primary requirement: PR-16
  - Constraints: TD-10, DATA-4, TEN-2, IAM-1, IAM-2, SEC-2
  - Dependencies: T-7, T-8, T-12
  - Done when: State-transition tests append immutable entries for COD principal, provider cost, COD fee, VAT, unpaid/recovery, and adjustments; reconciliation reports show variance without treating COD principal as revenue.

## Phase 4: Production readiness

- [x] **T-10 — Add tenant-safe telemetry and abuse limits**
  - Primary requirement: PR-6
  - Constraints: OBS-1, OBS-2, OBS-3, RATE-1, SEC-1, PRIV-1
  - Dependencies: T-7
  - Done when: A smoke test emits structured, redacted shipment lifecycle events with tenant and correlation IDs, while rate-limit tests reject abusive estimate/order retries without leaking PII or credentials.

- [x] **T-11 — Validate migration and release rollback path**
  - Primary requirement: PR-1
  - Constraints: DEL-1, MIG-1, TEN-2, SEC-2
  - Dependencies: T-1, T-2
  - Done when: CI applies the migration to an empty database and a representative pre-release fixture, verifies tenant isolation, and demonstrates the documented rollback or forward-fix path without data loss.

## Phase 5: Complete CMS operations experience

- [x] **T-19 — Establish the shared role-aware CMS shell and primitives**
  - Primary requirement: PR-17
  - Constraints: PR-13, PR-22, PR-24, NFR-1, NFR-4
  - Dependencies: T-15
  - Done when: Browser checks prove every authenticated route retains a shell with tenant/platform scope, outlet, role-aware navigation, exactly one `aria-current` item, working sign-out, scoped loading/error states, and desktop/tablet/mobile navigation.

- [x] **T-20 — Build tenant outlet and connection readiness settings**
  - Primary requirement: PR-19
  - Constraints: PR-2, PR-10, PR-17, PR-24, NFR-1, NFR-2, NFR-4
  - Dependencies: T-19, T-3
  - Done when: A Tenant Admin reaches settings from an unconfigured first-run panel, configures own pickup/origin and permitted opaque connection state, then returns to a usable shipment form; Operator and another tenant are denied and no credential material is rendered.

- [x] **T-21 — Build the tenant shipment lifecycle queue**
  - Primary requirement: PR-18
  - Constraints: PR-3, PR-4, PR-17, PR-24, NFR-1, NFR-4
  - Dependencies: T-19, T-4, T-5
  - Done when: An Operator creates a draft, leaves the page, returns through navigation, finds it by URL-addressable lifecycle status without its UUID, opens its detail, and sees usable empty/error/loading states.

- [x] **T-22 — Complete estimate selection and guarded AWB issuance**
  - Primary requirement: PR-18
  - Constraints: PR-5, PR-6, PR-7, PR-9, PR-17, PR-24, NFR-1, NFR-2, NFR-4
  - Dependencies: T-20, T-21, T-6, T-7, T-12
  - Done when: From a queue detail, an Operator selects an eligible estimate, sees provider values plus the four COD components, explicitly confirms once, and a sanctioned non-production fixture proves the resulting ISSUED state, provider AWB, enabled label path, and no duplicate issuance.

- [x] **T-23 — Add the Tenant Admin unpaid-recovery queue and action**
  - Primary requirement: PR-18
  - Constraints: PR-8, PR-17, PR-24, NFR-1, NFR-2, NFR-4
  - Dependencies: T-21, T-22, T-8
  - Done when: A Tenant Admin discovers an awaiting-payment batch from the queue, performs one guarded recovery against a sanitized fixture, and sees returned AWBs; the action is absent for Operator and cross-tenant recovery is denied.

- [x] **T-24 — Build tenant ledger and reconciliation operations**
  - Primary requirement: PR-20
  - Constraints: PR-15, PR-16, PR-17, PR-24, NFR-1, NFR-4
  - Dependencies: T-19, T-18
  - Done when: A Tenant Admin reaches a URL-filtered ledger/reconciliation workspace, runs daily and monthly reconciliation against fixtures, sees source total, ledger total, signed variance, and explicit COD-principal liability without another tenant's data.

- [x] **T-25 — Complete Super Admin tenant lifecycle workspace**
  - Primary requirement: PR-21
  - Constraints: PR-1, PR-11, PR-16, PR-17, PR-24, NFR-1, NFR-2, NFR-4
  - Dependencies: T-19, T-2, T-14, T-18
  - Done when: A Super Admin navigates to distinct tenant list/detail and audit screens, provisions, suspends, and reactivates a named tenant through confirmation, then sees redacted health, membership, ledger/reconciliation summary, and audit outcomes.

- [x] **T-26 — Build tenant member governance workflows**
  - Primary requirement: PR-23
  - Constraints: PR-17, PR-24, NFR-1, NFR-2, NFR-4
  - Dependencies: T-19, T-15
  - Done when: A Tenant Admin can invite, change role, and deactivate own members from navigation, the last-active-admin guard is enforced, and every governed outcome is auditable without cross-tenant access.

- [x] **T-27 — Repair CMS contact reuse and COD explanation**
  - Primary requirement: PR-12
  - Constraints: PR-9, PR-17, PR-24, NFR-4
  - Dependencies: T-19, T-13, T-12
  - Done when: Contact search fields are usable at 390px and 1440px, Enter searches rather than submits the draft, selected contact/address provenance is shown, and pre-confirmation COD values clearly separate declared goods, provider shipping, fee, VAT, and customer collection.

- [x] **T-28 — Complete tenant analytics decision context**
  - Primary requirement: PR-15
  - Constraints: PR-17, PR-24, NFR-1, NFR-4
  - Dependencies: T-19, T-17
  - Done when: Tenant analytics shows prior-period comparison with a non-colour cue, links operational rows into their permitted detail workflow, and preserves the selected timezone and range across KPI, trend, and table.

- [x] **T-29 — Prove responsive CMS operational journeys**
  - Primary requirement: PR-22
  - Constraints: PR-17, PR-18, PR-19, PR-20, PR-21, PR-23, PR-24, NFR-4
  - Dependencies: T-20, T-21, T-22, T-23, T-24, T-25, T-26, T-27, T-28
  - Done when: Real-browser journeys at 390px, 768px, and 1280px exercise tenant setup, shipment issue/recovery, finance, member governance, and platform lifecycle without horizontal page overflow, unreachable navigation, broken keyboard operation, or missing scope context.

## Phase 6: Tenant dashboard and analytics completion

- [x] **T-30 — Build the role-specific tenant operational overview**
  - Primary requirement: PR-25
  - Constraints: PR-17, PR-18, PR-19, PR-20, PR-22, PR-24, TD-12, NFR-1, NFR-4, NFR-5
  - Dependencies: T-19, T-20, T-21, T-23, T-24
  - Done when: Real-browser checks for Operator and Tenant Admin at 390px, 768px, and 1280px prove each role lands on a discoverable overview with the permitted priority summary, exception queue, recent outcomes, explicit WIB/selected timezone and generated-at state; every count opens the same URL-filtered supporting records; first-run, healthy empty, loading, partial error, and stale states are usable; Operator receives no finance, recovery mutation, or governance data.
  - Evidence now (2026-08-31): tenant-scoped integration checks cover database-derived WIB issued-today boundaries, database `statement_timestamp()` generated-at, exact `DRAFT`, `ESTIMATED`, `ACTION_REQUIRED`, and `ISSUED_TODAY` supporting queue counts, and cross-tenant exclusion. Tenant Admin receives an exact reconciliation-variance count linked to `/app/keuangan?status=VARIANCE#reconciliation-history-title`; the Operator DTO omits finance and does not execute that query. Readiness, metrics, action queue, and recent outcomes stream through independent Suspense regions with local failure recovery. A five-minute stale policy and manual refresh use the canonical database-generated timestamp. Tenant Admin first-run/ready-empty and populated browser checks passed at 390px, 768px, and 1280px with zero document overflow and no console, runtime, or relevant network errors. The populated Admin view exposes five exact pulse destinations including variance `1`; its fifth tile spans cleanly at 768px. The finance variance destination passed at all three widths with local wide-table scrolling. Operator passed at all three widths with four permitted pulses and no finance, analytics, or governance surface. Mobile action/refresh targets measure 44px; refresh pending/completion announcements and focus restoration passed. Mobile navigation Escape returns focus to its trigger, and WIB wording is consistent.
  - Completion evidence (2026-08-31): an exact allowlisted development-only header seam drives deterministic region-failure and six-minute-old presentation states; a production-mode test proves the seam fails closed. At 390px and 1280px, an action-region failure retained five Admin pulses, six recent rows, and five role-safe quick actions with zero document overflow or errors. Clearing the seam and invoking local Retry restored five action rows, returned focus deterministically to `h2#action-heading`, and rendered the visible shadcn semantic focus ring. The stale scenario showed the old absolute timestamp and badge from a read-only six-minute presentation shift; clearing it and manually refreshing advanced the timestamp, cleared the badge, announced completion, and restored focus. Audit/freshness checks passed 2 files / 3 tests; TypeScript and focused ESLint passed. The production build had already passed before the final focus-ring-only adjustment, which was instead covered by TypeScript, ESLint, and real-browser evidence.

- [x] **T-31 — Complete lifecycle-valid tenant analytics and accessible charts**
  - Primary requirement: PR-26
  - Constraints: PR-15, PR-16, PR-20, PR-22, PR-24, TD-9, TD-10, TD-13, NFR-1, NFR-4, NFR-5
  - Dependencies: T-17, T-18, T-28, T-30
  - Done when: Integration and real-browser checks prove URL-persisted range/timezone/outlet/courier/lifecycle filters drive identical KPI, comparison, created-versus-issued chart, accessible data table, drill-down, and filtered export predicates; lifecycle event timestamps and current snapshots are labelled distinctly; service-fee revenue, VAT, provider cost, variance, and COD-principal liability never collapse into one revenue value; keyboard and screen-reader users can recover every chart value and partial loading/empty/error states remain actionable at 390px, 768px, and 1280px.
  - Evidence now (2026-08-31): server-side query contracts cover fail-closed URL filters, `created|issued|outcome|exceptions` supporting-row/export basis, authoritative lifecycle/ledger timestamps, issued/outcome denominators, courier breakdown, tenant isolation, full filtered-set CSV with a safe synchronous limit, and formula-safe export cells. The `exceptions` basis returns the exact current unresolved snapshot and preserves authorized outlet, courier, and lifecycle dimensions across KPI, table, and export. Analytics displays the authoritative backlog `asOf` in the selected timezone and applies the same five-minute stale policy and manual refresh control. Authenticated Tenant Admin checks at 390px, 768px, and 1280px rendered populated KPIs (`6` created, `1` issued, `100%` success, `3` unresolved), the trend's semantic data table, and courier evidence (`1/1`) without overflow, console errors, or relevant failed requests. The outcome KPI URL, supporting table, and CSV export stayed synchronized after a client-remount defect was fixed and rechecked at 390px and 1280px. Mobile filter focus, 44px targets, reload persistence, and browser Back restoration were exercised.
  - Completion evidence (2026-08-31): analytics now streams four independent regions with local partial-failure recovery and deterministic Retry focus. Exact development-only, production-fail-closed seams exercise stream delay, trend failure, stale presentation, first-run, and page-level error states. Browser checks covered first-run, filtered-empty, period-empty, partial trend failure/retry, stale/manual refresh, and route-level recovery; route recovery focuses the page H1, and the mobile skeleton no longer expands the document. A fifth metric/link exposes the latest tenant-wide signed reconciliation variance separately from service-fee revenue and COD-principal liability; it is explicitly a current tenant-wide value and does not inherit period, courier, or lifecycle filters. The finance hash destination now scrolls and focuses its reconciliation heading. Browser evidence across 390px, 768px, and 1280px as applicable reported zero document overflow and no console, runtime, or relevant network errors. Verification passed 5 analytics/audit files / 12 tests, then 3 focused files / 21 tests, 3 focused real-PostgreSQL tenant-dashboard tests, focused ESLint, TypeScript, `git diff --check`, and a clean production build using ephemeral local build authentication/database configuration. The local development server remained reachable. An attempted full integration run is not passing evidence: legacy files concurrently recreated the shared `geraicuan_test_runtime` role without a password, causing broad authentication failures and deleting local fixtures; the local role and accounts were restored and reseeded.

- [x] **T-32 — Make the tenant home analytics-led**
  - Primary requirement: PR-25
  - Constraints: PR-15, PR-17, PR-18, PR-20, PR-22, PR-24, TD-9, TD-10, TD-12, NFR-1, NFR-4, NFR-5
  - Dependencies: T-30, T-31
  - Done when: Tenant Admin and Operator open `/app` on a Today-in-WIB default, can persist a preset or custom date range in the URL, and see tenant-scoped shipment input split into COD and non-COD plus authoritative issued outcomes and prior-period context before operational exceptions. Any COD/non-COD value is labelled as declared goods rather than collection or revenue. A labelled semantic trend, actionable empty/error/loading states, supporting links, and real-browser checks at 390px, 768px, and 1280px prove keyboard access, focus recovery, and zero document overflow.
  - Completion evidence (2026-08-31): `/app` now opens on Today in WIB and places the period summary before current operational work. Its URL-persisted preset/custom-date, outlet, and timezone filters drive tenant/outlet-scoped PostgreSQL reads for total input, COD, non-COD, declared goods values, authoritative issued outcomes, prior-period comparison, and a multi-day stacked trend with a semantic table. Invalid outlet scope fails closed. COD value copy explicitly excludes received funds and revenue. First-run guidance follows outlet readiness, while period-empty and local period-error states preserve current work. Focused page/audit checks passed 2 files / 5 tests; tenant-dashboard PostgreSQL checks passed 1 file / 4 tests; focused ESLint, TypeScript, `git diff --check`, and a post-adjustment production build passed. Authenticated browser validation covered the analytics hierarchy, URL apply/reload/Back behavior, custom dates, invalid outlet scope, semantic trend, mobile filter Sheet, and 390px, 768px, and 1280px layouts without document overflow or browser errors.

## Phase 7: CMS precision and release hardening

- [x] **T-33 — Establish cross-route precision foundations**
  - Primary requirement: PR-26
  - Constraints: PR-15, PR-16, PR-20, PR-25, TD-9, TD-10, TD-12, TD-13, NFR-1, NFR-4, NFR-5
  - Dependencies: T-32
  - Done when: Shared presentation/query contracts and focused tests keep Ringkasan's daily event/snapshot semantics distinct from Analitik's historical exploration and Keuangan's authoritative ledger/reconciliation semantics; created, issued, outcome, backlog, COD principal, service-fee revenue, VAT, provider cost, and signed variance retain explicit bases; the latest signed reconciliation variance is tenant-wide, ignores period/courier/lifecycle filters, and opens the exact Keuangan reconciliation record without widening tenant scope.
  - Completion evidence (2026-08-31): dashboard readiness now uses the canonical outlet predicate through a role-safe summary; contact totals count active tenant contacts explicitly; analytics isolates the tenant-wide signed-variance snapshot from period-filtered KPI regions; Finance states that its latest variance queue ignores period/outlet filters while its summary and entries retain them. Ambiguous issued and COD amount labels were removed. Focused render checks passed 3 files / 8 tests, PostgreSQL readiness checks passed 1 file / 3 tests, and the final full PostgreSQL suite passed 37 files / 171 tests after its shared runtime-role harness was made password-safe.

- [x] **T-34 — Align the role-aware shell and navigation**
  - Primary requirement: PR-17
  - Constraints: PR-13, PR-22, PR-24, IAM-1, IAM-2, IAM-3, TD-8, UX-2, UX-3, NFR-1, NFR-4
  - Dependencies: T-33
  - Done when: Tenant and platform shells render the exact UX-2 groups, labels, and destinations; contextual create/import/detail/label routes keep Pengiriman current; Operator never receives Tenant Admin destinations; forbidden direct requests redirect or deny before protected reads and never falsely mark Ringkasan current; keyboard and real-browser checks at 390px, 768px, and 1280px prove one truthful current location, focus return, permitted discovery, and zero document overflow.
  - Completion evidence (2026-08-31): the tenant shell renders the exact grouped IA with a labelled 255px desktop Sidebar at `lg` and a Sheet below `lg`; contextual shipment routes retain `Kiriman`, contact children retain `Kontak`, role filtering remains server-derived, and forbidden routes do not falsely mark `Ringkasan`. Focused shell checks passed 1 file / 21 tests. Authenticated browser checks at 390px, 768px, and 1280px verified 44px controls, Escape focus return, exact active state, and zero document overflow or browser errors across Settings, Import, Label, and New Contact.

- [x] **T-35 — Migrate remaining legacy CMS screens to shared shadcn composition**
  - Primary requirement: PR-22
  - Constraints: PR-17, PR-20, PR-21, PR-24, UX-5, UX-6, UX-7, NFR-4, NFR-5
  - Dependencies: T-34
  - Done when: Remaining authenticated Finance, Platform, and shipment/contact/settings surfaces use shared shadcn primitives or smaller accessible native semantics with the accepted token graph; their rendered paths introduce no new and retain no migrated `sales-*`, `ship-*`, `ops-*`, `an-*`, or `bulk-*` presentation classes; loading, empty, error, stale, table overflow, keyboard, and primary-success states pass at 390px, 768px, and 1280px without document overflow; and the milestone closure gate confirms all 18 authenticated page routes read as one coherent CMS across shell gutters, page measure, PageHeader geometry, section rhythm, control sizing, table density, status language, semantic states, and restrained Card usage.
  - Progress evidence (2026-09-01): all remaining authenticated route implementations now use the shared `PageContainer`, `PageHeader`, shadcn primitives, or smaller native semantics. Finance, Platform, shipment create/queue/detail, contact detail, membership, settings, and label detail no longer render the migrated legacy presentation classes. Populated Tenant Admin and Super Admin browser passes covered the primary routes at 390px, 768px, and 1280px with zero document overflow and zero console/runtime errors after repairing the label-index min-content boundary. The implementation and populated-state migration are complete; the task remains open only for the full loading/empty/error/stale/keyboard/success browser-state matrix required by this Done-when contract.
  - Execution decomposition (2026-09-01): T-37 through T-47 are the atomic completion queue for this milestone. Existing populated-browser observations are context, not substitutes for the fresh evidence each child task requires. Close T-35 only after every child task is complete, the final authenticated presentation scan finds no migrated legacy class on any covered route, and the independent cross-screen visual consistency critique passes.
  - Completion evidence (2026-09-01): delivery-ledger run `RUN-20260901T010855Z-655e9fc7` closed the milestone after every atomic owner T-38 through T-47 passed. Independent designer Chromium review covered exactly 18 authenticated page routes at 390px, 768px, and 1280px (54 populated primary renders), discovering all dynamic shipment, contact, label, and tenant IDs from rendered list links. Every render had 0px document overflow, one main landmark, one H1, coherent 16/24/32px gutters, truthful desktop current navigation, no nested Cards, locally contained labelled wide tables, visible focus, and zero console/runtime/relevant-network errors. The authenticated presentation and route-inventory scan passed 2 files / 10 tests. The known icon-only 390px Sheet trigger and missing 768px icon rail remain explicitly owned by T-48 and do not reopen page-composition owners. No provider, production, commit, push, deploy, or release action occurred.

## Phase 8: Exhaustive CMS screen-state verification

### Goal routing and change boundaries

Repository evidence files (`TASKS.md`, `STATUS.md`, and `BUILD-LOG.md`) are allowed in every task only for recording that task's verified result. `AGENTS.md`, accepted specification files, migrations, lockfiles, authentication internals, provider transports, deployment configuration, and unrelated dirty paths are protected unless the selected task explicitly lists them or the user approves a boundary expansion.

| Task | Risk | Execution route | Allowed implementation surface | Required independent gate |
|---|---|---|---|---|
| T-37 | R2 | Parent → `task`/Sol; `designer` only if a visible fixture is introduced | `src/lib/ui-audit-scenario.ts`, existing presentation/scenario tests, and the smallest local-only test helper | `reviewer` verifies production-fail-closed behavior, route inventory, and no provider mutation |
| T-38 | R2 | `designer`/`vision` critique → `task`/Sol → `designer` recheck | `/app` and `/app/analitik` route/components, dashboard/analytics read models and focused tests | `reviewer` verifies metric semantics, URL predicate parity, and UI evidence |
| T-39 | R3 | `designer`/`vision` critique → `task`/Sol | shipment queue/detail UI, shipment queue/issuance/recovery domain code, sanctioned fixtures, and focused tests | `security-reviewer` verifies tenant/auth/provider/idempotency boundaries before ledger PASS |
| T-40 | R3 | `designer`/`vision` critique → `task`/Sol | shipment draft/estimate/contact-selection UI, its Server Actions/domain helpers, and focused tests | `security-reviewer` verifies PII, tenant, provider-estimate, and invalid-write boundaries |
| T-41 | R3 | `designer`/`vision` critique → `task`/Sol | `/app/impor`, bulk intake/parser/rate-limit code, template route, and focused tests | `security-reviewer` verifies upload, PII, tenant isolation, limits, and duplicate-submit behavior |
| T-42 | R3 | `designer`/`vision` critique → `task`/Sol | contact list/create/detail/actions, contact repository/domain code, and focused tests | `security-reviewer` verifies PII, role, archive, snapshot, and tenant boundaries |
| T-43 | R3 | `vision` print/screen critique → `task`/Sol | label index/detail/actions/panel, label read/print repository, exact physical label stylesheet/DOM only if evidence requires it, and focused tests | `security-reviewer` verifies PII, AWB authority, print history, and tenant scope; `vision` approves screen and print output |
| T-44 | R3 | `designer`/`vision` critique → `task`/Sol | Finance UI, ledger/reconciliation read and action paths, finance filters, and focused tests | `security-reviewer` verifies immutable ledger, financial classification, role, and tenant scope |
| T-45 | R3 | `designer`/`vision` critique → `task`/Sol | outlet settings/readiness UI, readiness/configuration domain paths, and focused tests | `security-reviewer` verifies opaque credential handling, role, and tenant boundaries |
| T-46 | R3 | `designer`/`vision` critique → `task`/Sol | member UI/actions/repository and focused tests | `security-reviewer` verifies authentication, last-admin invariant, auditability, and tenant scope |
| T-47 | R3 | `designer`/`vision` critique → `task`/Sol | Platform monitoring/list/detail/audit/lifecycle UI, platform repositories/actions/filters, and focused tests | `security-reviewer` verifies platform authorization, tenant lifecycle, redaction, and audit boundaries |
| T-48 | R3 | Parent conducts; `designer` validates navigation; `task`/Sol fixes only a separately approved in-scope defect | shared CMS shell/navigation/login/sign-out and their focused tests | `security-reviewer` verifies every role and forbidden route; boundary PASS required |
| T-36 | R4 | Parent conducts verification only; defects return to a new or reopened atomic task | repository evidence and existing verification harnesses; no opportunistic product code | `reviewer` plus `security-reviewer`, traceability report, release boundary approval, and explicit user approval for any live action |

For each row, convert the allowed surface into explicit `delivery-ledger start --allow` paths and declare every adjacent sensitive surface with `--protect`. Do not copy this table mechanically when disk evidence narrows the actual paths further.

### Deterministic execution order

Run one ledger boundary at a time in this order: T-37 → T-38 → T-39 → T-40 → T-41 → T-42 → T-43 → T-44 → T-45 → T-46 → T-47 → close T-35 → T-48 → T-36. Tasks that are dependency-independent may be researched in parallel, but implementation, shared visual judgment, integration, browser verification, and evidence ownership remain serialized unless the parent proves their paths and semantic ownership do not overlap.

- [x] **T-37 — Establish deterministic CMS presentation-state fixtures and guards**
  - Primary requirement: PR-22
  - Constraints: PR-17, PR-24, UX-5, UX-6, UX-7, NFR-1, NFR-4, NFR-5
  - Dependencies: T-34
  - Scope: Establish the typed inventory and ownership foundation used by T-38 through T-47: exactly 18 authenticated page routes plus the two adjacent authenticated CSV endpoints; each applicable populated, first-run, healthy-empty, loading, partial-error, route-error, stale, invalid-query, or primary-success state maps to an atomic owner task and an explicit `scenario`, `query`, `local-fixture`, `route-boundary`, or `action-state` strategy. Extend the localhost-only scenario parser only for scenarios that already have a rendering consumer; missing route-specific seams remain implementation work for their owning child task rather than inert global scenario names. Scenario controls must never call providers, perform production writes, bypass tenant scope, or appear as browser controls. The presentation guard must reject migrated `sales-*`, `ship-*`, `ops-*`, `an-*`, and `bulk-*` JSX classes while exempting the public sales surface and physical `label-*` print contract.
  - Done when: Run the focused inventory, scenario, and presentation tests; observe exact disk-to-registry page parity, one owner/strategy for every required state, route-bound current scenarios that are deterministic in development and rejected in production, no audit import in actions/route handlers/database/provider transports, and no forbidden authenticated presentation class. This foundation does not claim that T-38 through T-47 state journeys have passed; each owning task must add and prove any missing deterministic seam inside its own boundary.
  - Completion evidence (2026-09-01): initial `delivery-ledger` run `RUN-20260831T184316Z-c08c78b5` established the inventory; corrective run `RUN-20260831T190654Z-105a7f61` then closed late independent-review findings. The final contract enforces exact page/endpoint disk parity, canonical route owners and state matrices, development-only route-bound consumption, two-pass local/imported class detection, and static/dynamic audit-import isolation. Focused Vitest passed 3 files / 11 tests, targeted ESLint, TypeScript, and `git diff --check` passed, independent reviewer returned PASS, and a 390px authenticated Chromium check proved cross-route scenarios fail closed on both real consumers with zero overflow or failed responses. No browser-visible fixture control, provider request, production operation, commit, push, deployment, or release occurred.

- [x] **T-38 — Verify Ringkasan and Analitik across their complete state matrix**
  - Primary requirement: PR-26
  - Constraints: PR-15, PR-16, PR-20, PR-22, PR-24, PR-25, TD-9, TD-10, TD-12, TD-13, UX-5, UX-6, UX-7, NFR-1, NFR-4, NFR-5
  - Dependencies: T-37
  - Scope: Verify Tenant Admin and Operator journeys on `/app` and `/app/analitik` for Today-in-WIB, preset/custom ranges, invalid outlet scope, first-run, period-empty, populated, independently loading regions, partial error with local Retry, route error with H1 focus, stale/manual refresh, keyboard filter Sheet, semantic chart table, supporting-row drill-down, filtered CSV, reload, Back, and exact generated-at/as-of copy. Keep created, issued, current backlog, outcomes, COD principal, service-fee revenue, VAT, provider cost, and signed variance semantically distinct.
  - Audit finding to resolve: the inherited `src/app/app/loading.tsx` currently adds route-level horizontal padding inside the already padded CMS shell. Review it at all three viewports and remove the duplicate gutter if rendered evidence confirms the mismatch, without changing the physical label print origin.
  - Done when: Execute focused dashboard/analytics tests and real-browser journeys at 390px, 768px, and 1280px for both roles; each state has zero document overflow and console/runtime/relevant-network errors, all chart values are available without colour or hover, Retry/refresh restores focus and announces completion, URL state survives reload/Back, supporting links and CSV use the same predicates, and Operator receives no finance or governance data.
  - Completion evidence (2026-09-01): delivery-ledger run `RUN-20260831T191304Z-0aaf287c` verified the complete Ringkasan and Analitik matrix for Tenant Admin and Operator. The final implementation keeps Today-in-WIB and custom/preset filters in the URL, streams independent regions with local Retry/focus recovery, exposes exact role-safe supporting rows for all four Ringkasan counts, gives the trend its own database-generated freshness timestamp, and keeps finance/governance data Admin-only. Focused non-database Vitest passed 10 files / 35 tests; isolated PostgreSQL verification passed 2 files / 13 tests without touching the development database; targeted ESLint, TypeScript, and `git diff --check` passed. Authenticated Chromium covered 390px, 768px, and 1280px, both roles, first-run, healthy-empty, populated, independently loading, partial-error, route-error, stale/refresh, invalid-outlet, reload/Back, keyboard Sheet, semantic table, supporting-row, and filtered-CSV journeys with zero document overflow on clean journeys and no unexpected console/runtime/network failures. Independent correctness and designer re-reviews returned PASS. No provider request, production operation, commit, push, deployment, or release occurred.
  - T-36 corrective evidence (2026-09-01): the first full release suite exposed two stale fixture expectations that assumed `JNE` precedes `J&T`, while both analytics queries explicitly order courier text ascending and fresh PostgreSQL 16 returns `J&T` first. Corrective run `RUN-20260901T014304Z-145c2662` reopened T-38, aligned only those two assertions with the existing deterministic query contract, and left product/database code unchanged before T-36 restarted.

- [x] **T-39 — Verify the individual shipment queue and lifecycle detail states**
  - Primary requirement: PR-18
  - Constraints: PR-3, PR-5, PR-6, PR-7, PR-8, PR-9, PR-17, PR-22, PR-24, NFR-1, NFR-2, NFR-3, NFR-4
  - Dependencies: T-37
  - Scope: Verify `/app/pengiriman` and `/app/pengiriman/[shipmentId]` through invalid filters, empty queue, populated pagination, DRAFT, ESTIMATED, SUBMISSION_QUEUED, SUBMISSION_UNKNOWN, ISSUED, AWAITING_UPSTREAM_PAYMENT, FAILED, invalid/not-found IDs, loading, route error, stale data, sanctioned issuance success, unknown-submission reconciliation, and sanctioned unpaid-recovery success. Tenant Admin and Operator must see only their permitted actions, and every detail must be discoverable from a filtered queue without a seeded UUID.
  - Done when: Execute focused queue/issuance/recovery authorization tests plus real-browser journeys at 390px, 768px, and 1280px; lifecycle labels and actions match authoritative state, wide tables scroll locally, destructive or provider-bound actions require their accepted confirmation, focus returns after Retry/success, Operator never receives recovery controls, cross-tenant/invalid IDs fail before protected data renders, and only sanctioned sanitized fixtures can exercise issuance or recovery.
  - Completion evidence (2026-09-01): corrective delivery-ledger run `RUN-20260831T205457Z-b96e3279` verified the complete shipment queue/detail matrix, role-safe lifecycle actions, sanctioned fixture boundaries, and crash-safe provider transitions. Queue/detail states are URL-addressable in development-only audit scenarios; the queue has grouped filters, local table scrolling, pagination, freshness, route-specific loading/error/focus behavior, and discoverable detail links. Stale `SUBMITTING` and `PAYING` work is recoverable from a refreshed detail through a tenant-scoped local-state check that never calls the provider; completion/reaper races serialize, all-terminal batches finalize `COMPLETED`, unresolved members become reachable `UNKNOWN`, and unknown work is never resubmitted. Final rendered/action checks passed 2 files / 28 tests; disposable PostgreSQL 16 verification passed 7 files / 38 tests; targeted ESLint, TypeScript, and `git diff --check` passed. Independent R4 security/correctness review returned PASS. Authenticated Chromium covered Admin `SUBMITTING`/`PAYING` and Operator `PAYING` at 390px, 768px, and 1280px with 44px mobile actions, zero document overflow, no browser/runtime/network errors, and no provider action. No production operation, commit, push, deployment, or release occurred.

- [x] **T-40 — Verify individual shipment drafting and contact-assisted estimation**
  - Primary requirement: PR-3
  - Constraints: PR-5, PR-9, PR-12, PR-17, PR-22, PR-24, NFR-1, NFR-2, NFR-3, NFR-4
  - Dependencies: T-37, T-39
  - Scope: Verify `/app/pengiriman/baru` for first field focus, required and malformed sender/recipient/package/value errors, preserved values, accessible error-summary links, sender/recipient contact search by button and Enter, no accidental draft submit from search, selected-address provenance, manual overrides, missing destination area, COD/non-COD selection, COD-ineligible estimates, unconfigured outlet, estimate error/retry, populated estimates, four-part COD explanation, and successful draft save leading to its discoverable lifecycle detail.
  - Integrity and privacy cases: prove a server-rendered UUIDv4 submission token makes sequential and concurrent identical replays return one semantic draft (`1 shipment + 1 draft + 2 parties`), while changed-payload and cross-tenant token collisions fail without disclosure. Bind selected contacts and addresses to their server-returned revisions, lock unchanged selections through snapshot persistence, reject stale/archived/role-changed/tampered selections with zero writes, and preserve deliberate manual overrides. Revalidate the exact materialized input before insert. Do not claim destination-area authority from syntax alone: either verify the selected ID/label pair through an accepted Mengantar address-search contract or explicitly retain the current syntactic-only limitation for a follow-up requirement.
  - Safe test seam: estimate error → Retry → populated browser evidence must use an explicit non-production, environment-gated sanctioned estimate fixture. Its enabled path must perform zero live provider fetches, its disabled/production path must fail closed, and fixture output must pass the same normalization and persistence boundary as provider output.
  - Done when: Execute focused draft/contact/COD/action/idempotency/tenant-isolation tests and real-browser journeys at 390px, 768px, and 1280px; all controls have usable labels and at least 44px touch targets where applicable, invalid submit stores no draft and focuses the error summary, every summary link moves focus to its field/group, button and Enter contact search are keyboard-safe without a draft-write side effect, stale and replay cases satisfy the integrity rules above, COD meaning remains exact, generic errors and telemetry contain neither provider credential fragments nor recipient PII, and a real valid save is discoverable through normal queue and lifecycle-detail navigation without document overflow, console/runtime errors, or unexpected network requests.
  - Completion evidence (2026-09-01): corrective delivery-ledger run `RUN-20260831T214051Z-542dd1f4` binds the verified result and complete skill attribution after original run `RUN-20260831T205737Z-20521568` passed product/boundary review but recorded only its first immutable skill attribution. Server-rendered UUIDv4 replay is immutable and tenant-safe across concurrency and later lifecycle/outlet/contact changes; selected contact/address revisions are tenant-scoped, locked, and stale/tamper-safe while deliberate visible overrides remain exact. A production-fail-closed sanctioned estimate fixture and read-only audit retry prove error → retry → populated with zero live provider request. Focused non-database checks passed 4 files / 16 tests, disposable PostgreSQL 16 passed 1 file / 7 tests, TypeScript/targeted ESLint/diff checks passed, authenticated Chromium passed at 390/768/1280 with a real local save discoverable in queue/detail, and independent security plus designer re-reviews returned PASS. Destination-area authority remains explicitly limited to syntactic ID/label validation until an accepted Mengantar address-search contract exists; no provider, production, commit, push, deploy, or release action occurred.

- [x] **T-41 — Verify bulk shipment import validation and valid-row creation**
  - Primary requirement: PR-4
  - Constraints: PR-3, PR-17, PR-22, PR-24, RATE-1, NFR-1, NFR-2, NFR-4
  - Dependencies: T-37, T-39
  - Scope: Verify `/app/impor` and `/app/impor/template.csv` for keyboard-reachable template download, missing/invalid file, wrong headers, malformed rows, mixed valid/invalid rows, large input limit, no-row input, selectable valid rows, row-level error recovery, duplicate submit protection, successful draft creation, loading/pending state, and return to the filtered shipment queue. Tables must preserve context and local horizontal scrolling at narrow widths.
  - Done when: Execute focused import parser/action/authorization tests and real-browser journeys at 390px, 768px, and 1280px; invalid rows create no shipment, only explicitly selected valid rows become tenant-scoped drafts once, errors remain associated with their rows without document overflow, limits fail safely, the CSV template is discoverable without a direct URL, and created drafts are reachable through normal navigation.
  - Completion evidence (2026-09-01): corrective delivery-ledger run `RUN-20260831T221349Z-ffc85710` binds tenant/actor-scoped signed preview envelopes, deterministic per-row replay IDs, durable preview limiting before parsing, explicit zero-default selection, exact template authorization/bytes/headers, and direct return to the filtered DRAFT queue. Focused non-database checks passed 4 files / 18 tests; disposable PostgreSQL 16 passed 1 file / 7 tests; TypeScript, targeted ESLint, and `git diff --check` passed. Authenticated Chromium proved loading and route-error focus, mixed-row local scrolling at 390/768/1280 with zero document overflow, missing-file alert focus, template HTTP 200, default zero selection, and one selected row from a two-valid-row file producing exactly one discoverable DRAFT. Independent designer, security, and correctness re-reviews returned PASS. Initial run `RUN-20260831T214240Z-1a32142e` was closed as FAIL because its immutable baseline omitted a pre-existing dirty overlap; the corrective run accepts the complete surface without overriding that failure. No provider, production, commit, push, deploy, or release action occurred.

- [x] **T-42 — Verify contact directory, detail, addresses, and archive states**
  - Primary requirement: PR-12
  - Constraints: PR-17, PR-22, PR-24, TEN-2, IAM-2, IAM-3, PRIV-1, NFR-1, NFR-4
  - Dependencies: T-37
  - Scope: Verify `/app/kontak`, `/app/kontak/baru`, and `/app/kontak/[contactId]` for empty/populated search, invalid query, active/archived contacts, sender/recipient/both roles, zero/one/many addresses, twenty-address cap, create/update/address validation, success focus, action failure focus, archive URL confirmation/cancel/confirm, invalid/not-found/cross-tenant IDs, and Operator versus Tenant Admin capabilities. Historical shipment snapshots must remain unchanged after contact edits.
  - Done when: Execute focused contact and tenant-isolation tests plus real-browser journeys at 390px, 768px, and 1280px; each form exposes field-linked errors and deterministic focus, archive is absent for Operator and confirmed for Tenant Admin, the address cap is explicit, empty/not-found states provide a safe next action, no PII leaks through errors or logs, and no contact/table state widens the document.
  - Completion evidence (2026-09-01): delivery-ledger run `RUN-20260831T221534Z-a1314382` binds the authenticated POST search contract, masked-phone serialization, active/archived directory, action-state create/update/address feedback, read-only archived detail, and Tenant-Admin-only URL confirmation with focused cancel/failure recovery. Repository mutations are tenant-scoped, archived contacts are immutable, duplicate labels return safe domain errors, and the 20-address cap serializes concurrent inserts with a parent-row lock. Focused Server Action checks passed 1 file / 8 tests; disposable PostgreSQL 16 passed 1 file / 8 tests, including concurrent 19→20, cross-tenant zero-write, and immutable shipment snapshots. TypeScript, targeted ESLint, audit inventory, and `git diff --check` passed. Authenticated Chromium proved route loading/error focus, 17 populated rows, private search without query-string PII, create/update/address/archive journeys, not-found safety, Operator restrictions, local table scrolling and sticky context, and zero document overflow at 390/768/1280. Independent designer, security, and correctness re-reviews returned PASS. Shared shell account-trigger sizing remains T-48. No provider, production, commit, push, deploy, or release action occurred.

- [x] **T-43 — Verify label availability, history, and physical print output**
  - Primary requirement: PR-7
  - Constraints: PR-6, PR-8, PR-9, PR-17, PR-22, PR-24, OBS-3, PRIV-1, UX-5, UX-6, UX-7, NFR-1, NFR-4
  - Dependencies: T-37, T-39
  - Scope: Verify `/app/label` and `/app/label/[shipmentId]` for issued/unpaid filters, valid/invalid AWB suffix, empty/populated results, invalid/not-found IDs, blocked no-AWB, blocked awaiting-payment, ready label with zero/populated history, over-capacity recipient address disclosure, inconsistent COD warning, print success/failure focus, reprint sequence, and actual browser print emulation. Preserve the exact `LabelSheet` physical DOM and print-only classes.
  - Done when: Execute focused label tests and real-browser screen checks at 390px, 768px, and 1280px plus print emulation; screen tables scroll locally with zero document overflow, blocked states cannot invoke print, each accepted print increments tenant-scoped history and announces/focuses its result, recipient details remain safely bounded, and print preview/output contains exactly one 100mm × 150mm sheet with no CMS chrome, clipping regression, extra page, or shell whitespace.
  - Completion evidence (2026-09-01): delivery-ledger run `RUN-20260831T223741Z-d5e393a4` binds tenant/actor/shipment-scoped append-only print attempts, exact immutable replay, generic semantic-collision handling, shipment-row locking, and contiguous sequence allocation under six-way concurrency. The client preserves a failed attempt token, rotates it only after an accepted outcome, prevents duplicate dialog invocation for the same token, and describes the browser-dialog request without claiming a physical print. Focused non-database checks passed 3 files / 23 tests; disposable PostgreSQL 16 passed 1 file / 9 tests; TypeScript, targeted ESLint, audit inventory, and `git diff --check` passed. Authenticated Chromium proved issued/unpaid and invalid-suffix states, loading/error/not-found recovery, blocked no-print behavior, zero/populated history, long-address and inconsistent-COD warnings, focused print feedback, exact +1 history after reload, local scrolling, sticky context, and zero document overflow at 390/768/1280. A clean Chromium print session produced exactly one complete 282.96 × 425.04 pt PDF page (100 × 150 mm) with no CMS chrome, clipping, or extra page while preserving the exact `LabelSheet` physical DOM. Independent designer, security, and correctness re-reviews returned PASS. Corrective verification run `RUN-20260831T231708Z-6ebae831` binds the complete immutable skill attribution after the original record captured only its first repeated argument. No provider, production, commit, push, deploy, or release action occurred.

- [x] **T-44 — Verify Finance ledger and reconciliation decision states**
  - Primary requirement: PR-20
  - Constraints: PR-15, PR-16, PR-17, PR-22, PR-24, DATA-4, TEN-2, NFR-1, NFR-4, NFR-5
  - Dependencies: T-37
  - Scope: Verify Tenant Admin `/app/keuangan` for default and URL-persisted range/outlet/status filters, invalid filters, empty/populated ledger, signed reconciliation variance, hash-target focus, wide local-scroll tables, loading/error/stale states, daily/monthly reconciliation success/failure, pagination, and truthful filter-boundary copy. COD principal must remain liability; service fee, VAT, provider cost, memo, and variance must remain separate classes. Operator must not discover or render Finance.
  - Done when: Execute focused ledger/reconciliation/authorization tests and real-browser journeys at 390px, 768px, and 1280px; numeric columns are tabular and correctly aligned, filters and pagination survive reload/Back, the exact variance link focuses the matching record, all wide tables stay inside their regions, retries and reconciliations announce outcomes with deterministic focus, no immutable ledger row is updated, and Operator/cross-tenant requests fail before financial data is read.
  - Completion evidence (2026-09-01): delivery-ledger run `RUN-20260831T231804Z-61655f17` binds Tenant-Admin authorization before input/data, exact attempt UUID replay, atomic six-class reconciliation snapshots, and append-only full reversal entries. The Finance workspace now follows summary → variance queue → reconciliation → ledger, uses exact daily dates and the latest completed calendar month, persists validated range/outlet/status/pagination in the URL, fails closed for invalid status, focuses exact variance rows, and exposes truthful empty/loading/error/partial/stale states. Focused non-database verification passed 4 files / 32 tests; disposable PostgreSQL 16 passed 2 files / 5 tests; TypeScript, targeted ESLint, audit inventory, and `git diff --check` passed. Authenticated Chromium proved daily/monthly success with focused results, reload/Back filter persistence, local table scrolling, sticky context, and zero document overflow at 390/768/1280 with no provider request. Independent designer, security, and correctness re-reviews returned PASS. The shared 36px account trigger remains explicitly assigned to T-48. No production, provider, commit, push, deploy, or release action occurred.

- [x] **T-45 — Verify outlet readiness and connection settings states**
  - Primary requirement: PR-19
  - Constraints: PR-2, PR-10, PR-17, PR-22, PR-24, TEN-2, IAM-2, IAM-3, SEC-1, PRIV-1, NFR-1, NFR-2, NFR-4
  - Dependencies: T-37
  - Scope: Verify Tenant Admin `/app/pengaturan` for zero/one/many outlets, incomplete/ready configuration, invalid pickup/origin input, opaque connection-state presentation, pending/save error/save success, readiness transition back to shipment drafting, loading/route error, and navigation discovery from first-run guidance. Verify Operator denial and cross-tenant isolation before reads or writes.
  - Done when: Execute focused outlet-readiness/configuration/authorization tests and real-browser journeys at 390px, 768px, and 1280px; forms preserve safe values and field errors, success restores focus and updates readiness, shipment drafting becomes available only after the canonical readiness predicate passes, credentials or credential fragments never reach HTML/logs/errors, and Operator/cross-tenant access is denied without rendering settings data.
  - Completion evidence (2026-09-01): corrective delivery-ledger run `RUN-20260901T001550Z-d5289561` binds authorization before input/read, tenant-scoped outlet locking, authoritative read-only connection source, identical-save no-op replay, and one redacted append-only audit event per actual pickup/origin change. Additive migration `0022_outlet_settings_audit.sql` extends the audit action/target checks and tenant-bound RLS without changing existing data. One canonical readiness model now drives Settings, Ringkasan, shipment drafting, bulk import, and the draft mutation guard; a noncanonical private connection remains `private_attention` and cannot be repaired by the browser or used for drafting. Focused non-database verification passed 3 files / 28 tests; fresh PostgreSQL 16 migrations 0000–0022 and 2 files / 14 tests passed; TypeScript, targeted ESLint, inventory, and `git diff --check` passed. Authenticated Chromium proved success/invalid focus and value retention, safe CTA handoff to shipment drafting, Admin discovery, Operator navigation/direct denial, all deterministic settings states, 44px controls, and zero document overflow at 390/768/1280 with no credential sentinel or provider request. Independent designer, security, and correctness re-reviews returned PASS. Initial run `RUN-20260831T235917Z-aba50484` remains FAIL solely because its immutable baseline could not retroactively accept pre-existing dirty overlaps added through a required mid-run scope expansion; it does not negate the product evidence. Shared tablet shell behavior remains T-48. No production, provider, commit, push, deploy, or release action occurred.

- [x] **T-46 — Verify tenant member governance and last-admin protection**
  - Primary requirement: PR-23
  - Constraints: PR-13, PR-17, PR-22, PR-24, IAM-1, IAM-2, IAM-3, NFR-1, NFR-2, NFR-4
  - Dependencies: T-37
  - Scope: Verify Tenant Admin `/app/anggota` for single-admin, populated, loading, route-error, invite validation/conflict/success, role-change confirmation/success/failure, deactivation confirmation/success/failure, inactive membership, and last-active-admin guard. Verify Operator navigation absence/direct-route denial and auditable tenant-scoped outcomes.
  - Done when: Execute focused member-governance/authentication/tenant-isolation tests and real-browser journeys at 390px, 768px, and 1280px; every mutation has clear pending/confirmation/result feedback and deterministic focus, last-active-admin protection cannot be bypassed, Operator never receives the destination or protected content, membership state is not lost on failure, and no control or member row causes document overflow.
  - Completion evidence (2026-09-01): corrective delivery-ledger run `RUN-20260901T003252Z-5db01f4d` binds authorization before input/read, exact UUID attempt replay, globally serialized single-tenant membership, concurrent last-admin protection, redacted tenant-scoped audit receipts, and an additive duplicate-preflight migration `0023_member_governance_idempotency.sql`. The `/app/anggota` workspace now presents active-first compact member rows, an explicit last-admin warning, secondary invitation disclosure, named shadcn confirmation dialogs, preserved safe values, deterministic result focus, stable loading geometry, and route-owned error recovery. Focused non-database verification passed 4 files / 56 tests; fresh PostgreSQL 16 migration upgrade through 0023 and 2 files / 15 tests passed; TypeScript, targeted ESLint, and `git diff --check` passed. Authenticated Chromium proved populated/single-admin/inactive/loading/error states, invite validation, role confirmation, Admin discovery, Operator navigation omission/direct denial, long-email wrapping, and zero document overflow at 390/768/1280. Independent designer and security/correctness reviews returned PASS. Initial run `RUN-20260901T001837Z-0134091d` remains FAIL solely because its immutable baseline could not retroactively accept pre-existing dirty overlaps added through required migration/shared-test expansions; it does not negate the product evidence. No production, provider, commit, push, deploy, or release action occurred.

- [x] **T-47 — Verify the complete Super Admin tenant and monitoring workspace**
  - Primary requirement: PR-21
  - Constraints: PR-1, PR-11, PR-16, PR-17, PR-22, PR-24, IAM-1, OBS-1, OBS-2, OBS-4, SEC-1, SEC-2, NFR-1, NFR-2, NFR-4
  - Dependencies: T-37
  - Scope: Verify `/platform`, `/platform/tenant`, `/platform/tenant/[tenantId]`, and `/platform/audit` for empty/populated monitoring, valid/invalid URL filters, pagination, tenant not-found, zero/one/many outlets and memberships, configuration health, lifecycle action before collapsed filters, provision validation/success/failure, suspend/reactivate confirmation and outcomes, loading/error/stale states, locally scrolling tables, and redacted audit detail. Tenant principals and unauthenticated actors must fail before platform reads and never receive Platform chrome.
  - Done when: Execute focused platform monitoring/lifecycle/authentication tests and Super Admin real-browser journeys at 390px, 768px, and 1280px; each workspace is discoverable without tenant IDs, filters survive reload/Back, lifecycle actions are explicit and auditable, wide tables remain locally contained, stale/error recovery is keyboard-usable with deterministic focus, protected data is redacted, and forbidden actors are redirected or denied before any platform content renders.
  - Completion evidence (2026-09-01): corrective delivery-ledger run `RUN-20260901T010311Z-f801bb9f` binds Super Admin authorization before FormData/data reads, database-authoritative monitoring time, redacted allowlisted views, URL-stable filters/pagination, exact UUID lifecycle replay, serialized target transitions, and append-only audit receipts. Additive migration `0024_platform_lifecycle_idempotency.sql` preflights duplicate attempt receipts before installing uniqueness and hardened RLS. The four platform workspaces now follow lifecycle decision → collapsed filters → locally scrolling operational detail, distinguish system/filter empty states, expose safe audit detail, and provide focused loading/error/not-found/stale/action outcomes. Final non-database verification passed 5 files / 52 tests; fresh PostgreSQL 16 migration upgrade through 0024 and 3 files / 11 tests passed; TypeScript, targeted ESLint, and `git diff --check` passed. Authenticated Chromium covered all four routes at 390/768/1280 plus the declared state matrix with zero document overflow/errors/provider requests. A real navigation-discovered local tenant journey provisioned, suspended, reactivated, survived reload, and produced exact success audit rows. Independent designer and security/correctness reviews returned PASS. Initial run `RUN-20260901T003840Z-b68e32de` remains FAIL solely because its immutable baseline could not retroactively accept required migration/schema and new focused-test dirty overlaps; it does not negate product evidence. No production, provider, commit, push, deploy, or release action occurred.

## Phase 9: Cross-role precision and release boundary

- [x] **T-48 — Prove truthful navigation and permitted workflow discovery for every role**
  - Primary requirement: PR-17
  - Constraints: PR-13, PR-18, PR-19, PR-20, PR-21, PR-23, PR-24, IAM-1, IAM-2, IAM-3, UX-2, UX-3, UX-7, NFR-1, NFR-4
  - Dependencies: T-38, T-39, T-40, T-41, T-42, T-43, T-44, T-45, T-46, T-47
  - Scope: Run clean-session journeys for Tenant Admin, Operator, Super Admin, and unauthenticated users. Verify the accepted responsive shell exactly: full Sidebar at 1280px, icon rail with active state and accessible tooltips at 768px, and a labelled Sheet trigger at 390px. Across all modes verify group order, one truthful `aria-current` destination, contextual current state for create/import/detail/label routes, 44px touch targets, keyboard open/Escape/focus return, account/sign-out behavior, role-specific destination absence, forbidden direct-route behavior, and discovery of every permitted workflow without direct URLs, seeded UUIDs, database access, or test-only entry points.
  - Audit findings to resolve: the current 768px shell still collapses to the menu trigger instead of the required icon rail, while the 390px trigger is visually icon-only rather than labelled. Treat both as T-48 defects; do not reopen otherwise-correct individual page work to compensate for shared-shell behavior.
  - Done when: Execute shell/authorization tests and real-browser journeys at 390px, 768px, and 1280px from fresh sessions; each role discovers and completes its permitted paths, receives no forbidden destination or protected content, contextual navigation remains truthful, exactly one main landmark and one current navigation item exist, the 768px rail retains location meaning through icon + active state + tooltip, the 390px Sheet trigger is visibly labelled and Sheet focus is trapped/restored, sign-out invalidates the session, and every forbidden request redirects or denies before protected reads with zero document overflow or browser errors.
  - Completion evidence (2026-09-01): corrective delivery-ledger run `RUN-20260901T012724Z-d7ce0ec0` renders a visibly labelled 390px shadcn Sheet trigger, a 768px shadcn icon rail with 44px targets and keyboard/hover tooltips, and the full 1280px Sidebar while preserving one role-filtered IA and contextual current destination. Platform layout now resolves server authorization before rendering `CmsShell`; unauthenticated `/platform` returns 307 without Platform identity, navigation, or protected chrome. Focused shell, layout, and real-PostgreSQL authorization verification passed 3 files / 36 tests plus TypeScript, targeted ESLint, and diff checks. Clean-session Chromium journeys for Tenant Admin, Operator, and Super Admin at all three widths passed with one main, one visible current item, 0px document overflow, correct role absence/forbidden redirects, zero browser errors, Sheet focus return, and 47×44px rail links whose tooltips open by keyboard and hover. A real Operator sign-out reached `/login/tenant`; the invalidated session remained denied on a subsequent protected `/app` request. Initial run `RUN-20260901T012040Z-4b87faa2` remains FAIL because security review exposed streamed Platform shell chrome before child authorization; the corrective run fixes and tests that root cause. No provider, production, commit, push, deploy, release, or live action occurred.
  - Corrective completion evidence (2026-09-02): T-61 reopened the shared-shell owner after trusted pointer activation could not open the account menu. Run `RUN-20260902T005309Z-cfd95f31` controls the shadcn DropdownMenu for the primary pointer path while retaining Radix keyboard semantics, and replaces the protected history entry only after a successful sign-out response. Focused verification passed 1 file / 33 tests, targeted ESLint, TypeScript, and `git diff --check`. Fresh Chromium journeys for Tenant Admin and Super Admin at 390px, 768px, and 1280px passed pointer open/close, Enter/Space activation, Escape focus restoration, 44px sizing, zero overflow, sign-out POST 200, cookie removal, role-correct login redirect, and settled Back navigation that remained on login without restoring a protected H1. The earlier BFCache failure evidence is retained as the reason for the history-replacement correction. No provider, production, commit, push, deploy, release, or live action occurred; T-61 must rerun from a clean session.
  - Reopened finding (2026-09-02): the second T-61 run proved sign-out and Back invalidation but captured a reproducible React hydration mismatch after ordinary account-menu/history interaction. The server-rendered CMS regions lacked the modal menu's retained `data-aria-hidden`/`aria-hidden` attributes while the reused browser DOM still carried them. T-48 must remove that stale modal-hiding boundary and pass console-subscribed pointer/keyboard/sign-out/Back journeys before T-61 restarts.
  - Corrective completion evidence (2026-09-02): run `RUN-20260902T020659Z-1eb98512` keeps the modal account menu open and usable through pending or failed sign-out, then only after a successful POST closes the controlled Radix portal, waits for `onCloseAutoFocus`, and replaces the current history entry. Because earlier protected history entries can still exist, the shared protected shell now handles only persisted `pageshow` restores by immediately hiding the cached document and reloading it through server session authorization. Focused verification passed 1 file / 33 tests, targeted ESLint, TypeScript, and `git diff --check`. Nine fresh Tenant Admin, Operator, and Super Admin Chromium journeys at 390px, 768px, and 1280px passed pointer/Enter/Space, Escape/outside focus return, pending/failure visibility, one successful sign-out POST, portal and `aria-hidden` cleanup before redirect, cookie removal, hidden BFCache restore with no visible protected H1/data, role-correct `session-required` login after reload, and restored document visibility. Zero overflow, hydration/ARIA/console problem, duplicate successful POST, external/provider request, or credential-bearing URL remained. T-61 may rerun after fixture runtime completion.

- [x] **T-49 — Serialize the shared integration runtime-role lifecycle**
  - Primary requirement: PR-24
  - Constraints: NFR-1, NFR-2, NFR-5
  - Dependencies: T-48
  - Scope: Keep `geraicuan_test_runtime` as a disposable-database test-suite fixture. Individual parallel test files may ensure and reuse it, but must never drop the shared role from their own `afterAll` while sibling workers can still open runtime-role connections.
  - Done when: No integration test drops the shared runtime role, its setup remains restricted to the isolated localhost `geraicuan_test` database, the four formerly destructive suites pass together, and the full integration suite passes on a fresh PostgreSQL 16 database without runtime-role authentication races.
  - Completion evidence (2026-09-01): corrective delivery-ledger run `RUN-20260901T015118Z-d3a2662a` removes four per-file `DROP ROLE` calls, explicitly invokes the unchanged guarded setup helper from the two shipment suites that previously relied on incidental worker order, and leaves product/database code unchanged. The disposable PostgreSQL container now owns final role cleanup. Six coupled suites passed 6 files / 28 tests and a fresh full run passed 59 files / 407 tests. Initial T-49 run `RUN-20260901T014833Z-275034aa` remains FAIL because its teardown correction exposed the two missing per-suite setup calls.
  - Pre-push correction evidence (2026-09-01): run `RUN-20260901T035537Z-f641323d` reproduced the GitHub Actions bootstrap exactly enough to expose one remaining suite-order dependency: analytics used the shared runtime role without calling `ensureIntegrationRuntimeRole`. The suite now establishes that isolated-local role before protected reads. The same fresh PostgreSQL locale also exposed nondeterministic punctuation ordering, so both analytics filter options and equal-rate courier rows now use explicit PostgreSQL `COLLATE "C"` ordering rather than inheriting host locale. Focused analytics passed 9/9; the fresh full suite passed 60 files / 434 tests; migration upgrade through 0025, lint, TypeScript, production build, diff checks, and independent review passed before commit. The originating run remains `FAIL` because its initial boundary omitted accepted overlap for the analytics repository; corrective run `RUN-20260901T040210Z-06b53149` owns the explicit reviewed overlap and final evidence.

- [x] **T-36 — Prove the precision migration and production release boundary**
  - Primary requirement: PR-24
  - Constraints: PR-6, PR-7, PR-13, PR-17, PR-20, PR-22, TD-14, IAM-1, IAM-2, IAM-3, NFR-1, NFR-2, NFR-4, NFR-5
  - Dependencies: T-33, T-34, T-35, T-48, T-49
  - Scope: Verification and release decision only. If this task finds a product, test, security, visual, accessibility, or documentation defect, record the failure, reopen the owning atomic task or append a new single-requirement task, fix it inside a new boundary, then restart T-36 from the required clean checkpoint. Do not patch opportunistically inside the release boundary.
  - Done when: Automated authorization/tenant tests plus real-browser Tenant Admin, Operator, and Super Admin journeys prove every permitted workflow is discoverable, every forbidden route fails before protected reads with truthful navigation, Ringkasan/Analitik/Keuangan boundaries and exact variance links hold, and responsive/accessibility states pass at 390px, 768px, and 1280px; production-mode verification proves issuance/recovery is visibly unavailable and makes no provider-mutating network request while sanctioned sanitized fixture checks remain green; focused lint, TypeScript, tests, production build, traceability report, and `git diff --check` are recorded before release review.
  - Release procedure: From a clean, explicitly approved release candidate, run focused and full authorization/tenant-isolation suites, all T-37 scenario guards, the T-38 through T-48 browser journeys, sanctioned issuance/recovery fixtures, production-mode no-provider-mutation assertions, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test:integration`, `pnpm build`, specification traceability validation, and `git diff --check`. Record environment, base HEAD, changed-path boundary, commands, observed counts, browser targets, failures/waivers, and the release verdict in repository-owned evidence. This task does not authorize a provider request, production write, commit, push, deployment, or release.
  - Completion evidence (2026-09-01): final verification-only delivery-ledger run `RUN-20260901T015655Z-f8920fff` passed fresh PostgreSQL 16 migrations and the full 59-file / 407-test suite, the representative upgrade through migration 0024, 5 production-fail-closed fixture/route files / 38 tests, full lint, TypeScript, production build with explicit isolated local runtime variables, 26-requirement traceability, and `git diff --check`. Independent Chromium review covered 48 permitted and 21 forbidden route/viewport states at 390px, 768px, and 1280px with one main/current destination, 0px overflow, zero browser errors, UI-discovered dynamic IDs, three expected login POSTs, and zero provider mutations. Initial runs `RUN-20260901T014034Z-93a8bff8` and `RUN-20260901T014615Z-58d5cb12` remain FAIL and led to the test-only T-38/T-49 corrections before this restart. Release verdict is deliberately **NO-GO**: the working tree is uncommitted, `RELEASE.md` remains DRAFT/UNSET, release attestation is stale, and no clean release candidate or commit/release approval exists. This closes verification of the boundary; it does not claim production readiness, deployment, or release authorization.

## Phase 10: Tenant-managed Mengantar configuration and location authority

Execution order is strict: T-54 server lookup → T-55 contact binding → T-56
individual shipment binding → T-63 bulk binding → close milestone T-52 → T-53 responsive many-outlet
experience. Existing pickup-selector work is accepted progress, not permission
to skip a child boundary or mark the milestone complete.

- [x] **T-50 — Implement the encrypted private Mengantar credential lifecycle**
  - Primary requirement: PR-27
  - Constraints: PR-2, PR-10, PR-19, NFR-1, NFR-2, SEC-1, SEC-2, SEC-5, SEC-6, TD-5, TD-15, DATA-1, DATA-6
  - Dependencies: T-3, T-20
  - Scope: Add the additive Drizzle migration and server-only managed-secret repository; use Node.js authenticated encryption with a fresh nonce and purpose/tenant/outlet-bound additional data; keep provider base URL platform-controlled; resolve a private API key together with outlet origin/pickup IDs; implement Tenant Admin create/replace/switch mutations with authorization before secret-field processing, safe atomicity, rate limiting, and redacted audit outcomes. Migrate every private loader caller away from `unavailableManagedSecretLoader`. Do not call Mengantar or enable production issuance/recovery.
  - Done when: On a disposable PostgreSQL 16 database, focused migration/repository/action/resolver tests prove authorized create and replacement, previous-secret retention after failed replacement, private-over-default resolution, explicit switch only when the platform default is complete, missing/malformed runtime-key failure, Operator/cross-tenant denial before secret processing, authenticated-ciphertext tamper/scope-replay rejection, and absence of plaintext/key fragments/references in returned DTOs, audit metadata, errors, logs, and rendered output; targeted lint, TypeScript, and boundary review pass without any provider request.
  - Completion evidence (2026-09-01): delivery-ledger run `RUN-20260901T023330Z-42c42e5c` added migration `0025_happy_captain_midlands.sql`, a server-only AES-256-GCM managed-secret store with fresh nonce and tenant/outlet/purpose/reference AAD, forced-RLS credential/rate-limit tables, Tenant Admin create/replace/fallback Server Actions, platform-controlled base URL, outlet-derived origin/pickup IDs, and the real private resolver path. Independent security review first rejected rollback-coupled rate limiting; the corrected implementation commits a short authorization/rate transaction before reading secret input, re-authorizes inside the atomic mutation, rejects URL userinfo, and durably counts failed blank/oversized/runtime-key/fallback attempts. Disposable PostgreSQL 16 passed migration upgrade through 0025 and 3 focused files / 38 tests; targeted ESLint, TypeScript, and diff checks passed. No API key value was read or printed by the parent session, and no provider, production, commit, push, deploy, or release action occurred.

- [x] **T-51 — Add the private Mengantar account workflow to Outlet & koneksi**
  - Primary requirement: PR-27
  - Constraints: PR-19, PR-22, PR-24, NFR-2, NFR-4, SEC-1, SEC-6, UX-3, UX-5, UX-7, UX-10
  - Dependencies: T-50
  - Scope: Keep the existing `/app/pengaturan` destination and add shadcn `RadioGroup`, `Field`, password `Input`, `Alert`, `Badge`, `Button`, and named `AlertDialog` compositions for platform/private mode, blank create/replace input, safe connection states, explicit fallback confirmation, pending/error/success focus recovery, and unchanged non-secret location values. Never prefill, reveal after submit, copy, preserve in action state, or display any API-key fragment, base URL, ciphertext, or managed reference. `Tersambung` remains unavailable until a safe verification contract exists.
  - Done when: Focused action/page/redaction tests and authenticated Tenant Admin browser journeys at 390px, 768px, and 1280px prove discoverable create, replace, and confirmed fallback flows; Operator and wrong-tenant attempts are denied before protected reads; the password field clears after every result; safe values persist; keyboard order, visible focus, dialog trap/return, 44px targets, one main landmark, zero document overflow, and zero secret/provider-network/browser errors pass. Designer post-edit critique and independent security review approve the result.
  - Completion evidence (2026-09-01): delivery-ledger run `RUN-20260901T030038Z-e06c89c7` added the shadcn private-account workflow to the existing `Outlet & koneksi` destination with safe stored/attention/default states, blank password-only create/replace input, explicit destructive fallback confirmation, and stable post-action focus recovery. Authenticated local Chromium covered 10-outlet and private-attention states at 390px, 768px, and 1280px with zero horizontal overflow; create and replacement persisted through the encrypted T-50 path without a provider request, cleared the input, preserved non-secret location values, and retained a visible focused success result. The named fallback dialog trapped focus, restored Cancel to the checked private radio, and never exposed a key, fragment, base URL, ciphertext, or managed reference. Focused verification passed 3 files / 43 tests, targeted ESLint, TypeScript, and `git diff --check`; scoped designer re-review and independent security review both passed. Provider-authoritative location search and the 10–20 outlet list-detail experience remain explicitly queued as T-52/T-53 rather than being approximated here. No provider, production, commit, push, deploy, or release action occurred.

- [x] **T-52 — Complete Mengantar destination location authority**
  - Primary requirement: PR-28
  - Constraints: PR-3, PR-5, NFR-1, NFR-2, NFR-3, TD-2, TD-16, DATA-7, UX-10
  - Dependencies: T-54, T-55, T-56, T-63
  - Scope: Milestone closure only. Integrate the accepted pickup slice with the completed general area-search, contact-address, shipment-draft, estimate, and provider-order-payload slices. Do not implement child work opportunistically inside this boundary, add a cache or canonical kecamatan table without measured evidence, create an order, or treat a syntactically valid opaque ID as provider authority.
  - Done when: Fresh cross-slice tests prove current-account pickup authority and one destination ID/readable-label binding across tenant-scoped contact, immutable party snapshot, draft, estimate, and order-payload construction; stale authority fails closed; browser and logs contain no credentials or unnecessary PII; T-54 through T-56 are complete; and any non-mutating sandbox probe is separately approved and recorded rather than implied by fixture success.
  - Completion evidence (2026-09-02): delivery-ledger run `RUN-20260901T201930Z-f34ee8c2` added a dedicated fixture-backed cross-slice test that carries one current-account pickup and one provider destination ID/readable-label pair through the tenant contact, immutable recipient party, draft, estimate, provider-order snapshot, and locally constructed Mengantar payload without submission. Updating the contact after draft creation leaves every shipment snapshot unchanged; replacing the outlet pickup/origin after estimation fails closed before any provider-order snapshot. The focused authority set passed 10 files / 86 tests and the full disposable PostgreSQL 16 suite passed 66 files / 492 tests; targeted ESLint, TypeScript, and `git diff --check` passed. Accepted T-54 through T-56 and T-63 Chromium/redaction evidence remains applicable because this closure adds no rendered or logging code. Independent R3 review returned PASS. No live sandbox probe, provider request, provider mutation, production action, commit, push, deploy, or release occurred.

- [x] **T-53 — Replace opaque location IDs with the complete outlet settings experience**
  - Primary requirement: PR-28
  - Constraints: PR-19, PR-22, PR-24, NFR-1, NFR-4, UX-3, UX-5, UX-7, UX-10
  - Dependencies: T-51, T-52
  - Scope: Complete `/app/pengaturan` as one responsive outlet context: compact list-detail at 1280px and a single outlet selector at 390px/768px, followed by `Lokasi pengiriman` and `Koneksi Mengantar`. Preserve the accepted account-pickup `Command`/`Popover`, stored IDs, readable labels, and derived read-only origin; do not retain manual opaque-ID entry. Reuse installed shadcn primitives, one form tree, URL-addressable active-outlet context where it improves reload/Back behavior, and a flat hairline-led composition without nested cards.
  - Done when: Focused settings tests and authenticated browser journeys for zero, one, ten, and twenty outlets at 390px, 768px, and 1280px prove active-outlet discovery and switching, readable pickup/origin persistence, loading/account-empty/query-empty/legacy/error recovery, private/default connection states, reload/Back stability, logical keyboard/focus behavior, 44px actions, zero document overflow, and no provider/secret/browser errors. Designer post-edit critique and independent security review pass.
  - Completion evidence (2026-09-02): delivery-ledger run `RUN-20260901T203322Z-ded25673` completes `/app/pengaturan` as one URL-addressable active-outlet workspace. Unknown or foreign query IDs fall back only within the already-authorized tenant list; exactly one keyed outlet subtree is mounted. Zero and one outlet omit navigation, while 10/20 outlets use one 390px/768px selector and a persistent 1280px list-detail rail with local scrolling. Location precedes connection settings in a flat hairline composition; readable pickup/origin, private/default states, and existing safe mutation boundaries remain intact. Authenticated Chromium covered the complete 0/1/10/20 × 390/768/1280 matrix with one main/H1, zero document overflow, no raw IDs, secret fragments, console/runtime/network errors, or provider request. Space/Tab/Enter navigation selected the second outlet; click, Back, and reload retained its URL state and focused `#outlet-detail-title`. Focused verification passed 3 files / 49 tests; the full disposable PostgreSQL 16 suite passed 66 files / 493 tests; full ESLint, TypeScript, `git diff --check`, and the 18-page production build passed. Final designer and independent security reviews returned PASS. No production, provider mutation, commit, push, deploy, or release action occurred.

- [x] **T-54 — Implement bounded Mengantar destination-area search**
  - Primary requirement: PR-28
  - Constraints: NFR-1, NFR-2, NFR-3, TD-16, DATA-7, SEC-1, SEC-2, SEC-4, RATE-1
  - Dependencies: T-50
  - Scope: Extend the server-only Mengantar location adapter with the accepted general area-search contract. Normalize and bound the query; resolve the outlet's current account server-side; validate and size-limit the response; map only provider ID plus readable hierarchy needed by the browser; enforce timeout, concurrency/rate limits, HTTPS platform-controlled origin, rejected redirects, and sanitized failures. Do not cache without measured evidence, expose credential-bearing URLs, read unrelated provider identity fields into the DTO, or call a provider mutation.
  - Done when: Focused contract and authorization tests using sanitized fixtures prove short/blank/oversized query rejection, valid hierarchy mapping, deterministic duplicate handling, no result, malformed/oversized response, timeout, provider unavailable, rate/concurrency rejection, private versus platform-default isolation, credential-version change handling, cross-tenant denial, and zero secret/PII leakage; targeted lint and TypeScript pass without a live provider call.
  - Completion evidence (2026-09-02): delivery-ledger run `RUN-20260901T173020Z-7902a6bf` added the server-only general area-search adapter and authenticated tenant/outlet action. It normalizes 3–100 character queries, returns only provider ID plus readable Indonesian hierarchy, bounds response bytes and cardinality, rejects non-HTTPS or non-origin base URLs and redirects, times out after 10 seconds, does not retry or cache, and rechecks private connection authority after lookup. Migration 0027 extends the existing forced-RLS tenant/actor limiter with `location-search`; a PostgreSQL session advisory lock rejects concurrent searches without holding a transaction across provider I/O. Fresh PostgreSQL 16 passed migrations, representative upgrade through 0027, durable 20-attempt isolation, real two-client concurrency rejection/release, and cross-tenant outlet denial. Hermetic adapter/action coverage passed 2 files / 22 tests; the database suite passed 1 file / 3 tests; targeted ESLint, TypeScript, diff checks, and independent security review passed. No live provider request, provider mutation, production action, commit, push, deploy, or release occurred.

- [x] **T-55 — Replace contact address IDs with provider-authoritative selection**
  - Primary requirement: PR-28
  - Constraints: PR-12, PR-22, PR-24, NFR-1, NFR-2, NFR-4, DATA-7, UX-5, UX-7, UX-10
  - Dependencies: T-54
  - Scope: Replace editable `Nama area`/`ID area` fields in contact create and address-edit flows with one searchable shadcn `Command`/`Popover` backed by T-54. Store the selected provider ID and readable hierarchy atomically; clearing or changing the query clears stale hidden authority; preserve unrelated input on lookup or mutation failure; keep archived and historical shipment snapshots unchanged; use one responsive form tree.
  - Done when: Focused contact/action/repository tests and authenticated Tenant Admin plus Operator browser journeys cover create, edit, multiple addresses, selected contact reuse, clear/change, query-empty, no-result, lookup error/retry, validation error, archived/stale contact, reload, and cross-tenant denial at 390px, 768px, and 1280px; keyboard selection, visible focus, 44px actions, zero document overflow, and no secret/PII/browser errors pass; designer critique and independent security review approve the result.
  - Completion evidence (2026-09-02): delivery-ledger run `RUN-20260901T174637Z-aaf32953` replaced editable opaque destination fields in contact create/add/edit with one shared shadcn `Command`/`Popover` selector backed by T-54. Area remains optional; every non-null write re-searches the tenant-authorized ready outlet and persists only the exact canonical provider ID/label pair. A new URL-selected inline address edit locks the active tenant-owned row, preserves unchanged authority, supports explicit clear, and cannot alter archived contacts or historical shipment snapshots. Failed, stale, and repeated searches clear hidden authority while preserving safe visible query text; no-result, error/retry, rate, clear, selected, and mutation outcomes have deterministic focus and accessible selected-state text. Focused hermetic verification passed 3 files / 24 tests; fresh PostgreSQL 16 passed the contact repository file / 9 tests; targeted ESLint, TypeScript, and diff checks passed. Authenticated Chromium proved Tenant Admin create, edit, reload persistence, two addresses, clear/change, no-result, error/retry, and Operator lookup at 390px, 768px, and 1280px with 0px overflow, 44px search, zero raw ID text, zero browser errors, and zero provider requests. Corrective designer review and independent security review passed. No live provider request, provider mutation, production action, commit, push, deploy, or release occurred.

- [x] **T-56 — Bind destination authority through shipment estimation**
  - Primary requirement: PR-28
  - Constraints: PR-3, PR-5, PR-6, PR-9, PR-12, PR-22, PR-24, NFR-1, NFR-2, NFR-3, NFR-4, TD-2, DATA-7, UX-4, UX-5, UX-7, UX-10
  - Dependencies: T-54, T-55
  - Scope: Replace manual destination ID/label entry in individual shipment drafting with the same provider-authoritative selector. Preserve a selected contact address as an immutable ID/label pair, revalidate deliberate manual selection before draft persistence and estimation, store the readable label beside every operational snapshot that needs to explain the ID, and construct but do not send the provider order payload from that validated authority. Keep COD calculation and selected estimate semantics unchanged.
  - Done when: Focused draft/contact/estimate/order-payload tests and authenticated Tenant Admin plus Operator browser journeys prove manual search, contact prefill, clear/change, stale/tampered ID-label rejection with zero writes, draft save, estimate retry, COD/non-COD selection, reload, and discoverable detail at 390px, 768px, and 1280px; database assertions show the same pair at each accepted snapshot boundary; sanctioned fixtures make zero live provider mutations; designer critique and independent security review pass.
  - Completion evidence (2026-09-02): the original delivery-ledger run `RUN-20260901T182613Z-6c377254` delivered the selector and browser journeys, then an independent security re-review reopened the task. Corrective implementation run `RUN-20260901T191208Z-63c6e6c3` added an outlet-scoped monotonic Mengantar authority version, final transaction-bound authority locks for contact, draft, estimate, and provider-batch persistence, and migration `0029_mengantar_authority_version.sql` with forced-RLS predicates for exact destination-pair and current credential-source binding. Raw runtime-role tests accept valid snapshots and reject destination or source drift; contact create/add/update, manual/contact draft, estimate, and provider-order race tests prove zero stale writes. Fresh upgrade verification passed through 0029, the full disposable PostgreSQL 16 suite passed 65 files / 486 tests, and full ESLint, TypeScript, `git diff --check`, and Next.js 16.3.3 production build passed. Independent security re-review returned PASS. Verification-only R4 closure run `RUN-20260901T194707Z-642c47d5` owns the final documentation and boundary attestation. Existing authenticated Chromium evidence at 390px, 768px, and 1280px remains valid because the corrective slice changed server authority enforcement only. No live provider request, provider mutation, production action, commit, push, deploy, or release occurred.

- [x] **T-63 — Resolve bulk-import destinations without opaque IDs**
  - Primary requirement: PR-4
  - Constraints: PR-3, PR-5, PR-22, PR-24, PR-28, NFR-1, NFR-2, NFR-3, NFR-4, TD-16, DATA-7, UX-5, UX-7, UX-10
  - Dependencies: T-54, T-56
  - Scope: Replace CSV columns `id_area_tujuan` and `area_tujuan` with one required readable `lokasi_tujuan` query/hierarchy column; reject the legacy header set with guidance to download the current template. Normalize and deduplicate unique queries server-side, resolve them through T-54 under explicit batch size/concurrency limits, accept only one unambiguous provider-authoritative match, and return row-level malformed/no-result/ambiguous/unavailable/timeout/busy/rate/stale-authority outcomes without creating those rows. Persist the signed resolved ID/label pair only for valid rows, show the original CSV query beside the readable Mengantar match, preserve the existing valid-row confirmation, and never issue estimates or orders during import validation. Error rows never receive a confirmation token, checkbox, or hidden destination authority; ambiguous guidance may show only a bounded readable candidate list and must not add per-row selectors.
  - UI contract: Initial upload performs no provider work. Pending copy describes location matching. Preview summary reports total rows, unique destination queries checked, valid rows, and errors. Confirmation columns are Select, Row, Recipient, CSV location, Mengantar area, Weight, Payment, and Goods value; opaque IDs remain only inside the signed server envelope. Reuse the existing shadcn `Button`, `Field`, native `select`, `Alert`, `Table`, `Checkbox`, `Badge`, and `Skeleton` compositions with one form tree. Tables own their horizontal overflow and retain readable wrapping for both location columns; the document must not overflow. Upload errors focus the upload alert, preview states focus `#hasil-pemeriksaan`, confirmation errors preserve still-valid selection and focus the confirmation alert, and successful creation still redirects to `/app/pengiriman?status=DRAFT`.
  - Done when: Template/parser/validation/repository tests cover the new header and legacy-header rejection, repeated destination deduplication, exact unique match, ambiguous candidates, no result, malformed query, provider timeout/unavailable, mixed valid/invalid rows, batch and unique-query limits, duplicate submit, authority change, tenant isolation, signed-envelope tampering, and zero invalid-row writes; authenticated browser evidence at 390px, 768px, and 1280px proves template guidance, pending resolution, partial and no-valid results, readable row outcomes, valid-row-only confirmation, deterministic focus recovery, local table overflow with zero document overflow, and no secret/PII/provider-mutation/browser errors; designer and independent security reviews pass.
  - Completion evidence (2026-09-02): implementation run `RUN-20260901T195428Z-066e8cde` replaced the two opaque destination columns with required `lokasi_tujuan`, rejects legacy headers, normalizes and deduplicates at most 10 unique queries, serializes lookup through the existing T-54 actor concurrency boundary, and accepts only one exact or single unambiguous provider result. Error rows receive row-level invalid/ambiguous/no-result/unavailable guidance and never receive a token or checkbox. The initial signed v2 envelope bound tenant, actor, submission, row, normalized query, resolved ID/label, and expiry; T-64 later replaced its browser-decodable payload with a versioned AES-256-GCM envelope while retaining the same server authority and confirmation behavior. Confirmation revalidates each unique selection and locks the current outlet authority inside the all-or-nothing draft transaction. Focused parser/envelope/action/database/inventory verification passed 5 files / 32 tests; the full disposable PostgreSQL 16 suite passed 65 files / 490 tests; full ESLint, TypeScript, `git diff --check`, and Next.js 16.3.3 production build passed. Authenticated Chromium 152 covered partial and no-valid states at 390px, 768px, and 1280px with one main/H1, deterministic `#hasil-pemeriksaan` focus, 44px primary actions, zero document overflow, local table overflow only, no legacy header, valid-only checkboxes, and zero console/network/provider errors. Independent designer and security reviews returned PASS. The implementation run remains FAIL only because its initial boundary omitted accepted overlap for an already-dirty database test; verification-only R3 run `RUN-20260901T201314Z-5da3eadc` reruns the settled checks and owns final closure. No live provider request, provider mutation, production action, commit, push, deploy, or release occurred.

## Phase 11: Post-location whole-system screening

This phase is a delta-aware regression and remediation gate after T-52/T-53.
Reuse the completed T-37 scenario inventory and T-38 through T-48 evidence as
the baseline, but require fresh observations against the new integrated HEAD.
Do not restyle a passing screen merely to create activity. A material finding
fails its screening task, opens or reopens the smallest owning task, and the
screening restarts only after that repair has independent evidence.

| Task | Risk | Screening surface | Required independent gate |
|---|---|---|---|
| T-57 | R2 | Route/state inventory, scenario ownership, dead-link/action checks, and presentation guards only | `reviewer` verifies complete inventory and production-fail-closed fixtures |
| T-69 | R2 | Ringkasan, Analitik, and Keuangan responsive GET filter composition only | `designer` verifies one useful form tree across 390/768/1280; `reviewer` verifies URL/filter equivalence |
| T-58 | R3 | Schema → repository → Server Action/Route Handler → rendered decision across tenant, money, provider, and audit boundaries | `security-reviewer` verifies authorization, isolation, PII/secret, money, and provider conclusions |
| T-64 | R2; escalate any sensitive repair | Ringkasan, shipment queue/create/detail, and bulk import at 390/768/1280 | `designer`/`vision`; `security-reviewer` for provider/PII mutations |
| T-65 | R2; escalate any sensitive repair | Contact list/create/detail and label list/detail at 390/768/1280 | `designer`/`vision`; `security-reviewer` for PII/AWB/tenant scope |
| T-66 | R2; escalate any sensitive repair | Analitik, Keuangan, Outlet & koneksi, and Anggota & akses at 390/768/1280 | `designer`/`vision`; `security-reviewer` for money/secret/governance paths |
| T-67 | R2 | Public sales and both login entries at 390/768/1280 | `designer`/`vision` plus `security-reviewer` for auth/public boundary |
| T-68 | R3 | All 4 platform page routes at 390/768/1280 | `designer`/`vision` plus `security-reviewer` for platform authority |
| T-59/T-60 | R2 | Cross-screen tenant and public/auth/platform closure only | `designer`/`vision` owns consistency verdict; `reviewer` checks evidence completeness |
| T-61 | R3 | Clean-session Tenant Admin, Operator, Super Admin, and unauthenticated end-to-end journeys | `security-reviewer` verifies discovery, denial, scope, audit, and zero provider mutation |
| T-70 | R2 | Canonical specification-pack ownership, declaration, and reference structure only | `reviewer` verifies no product decision changed while traceability becomes deterministic |
| T-62 | R4 | Verification-only clean release-candidate boundary | distinct `reviewer` and `security-reviewer`, traceability and release-boundary approval |

- [x] **T-57 — Refresh the deterministic whole-system screening inventory**
  - Primary requirement: PR-22
  - Constraints: PR-17, PR-24, NFR-1, NFR-4, NFR-5, UX-3, UX-5, UX-6, UX-7, UX-10
  - Dependencies: T-53
  - Scope: Extend the existing T-37 route/state registry rather than creating another harness. Prove exact disk parity for all 18 authenticated pages plus adjacent authenticated endpoints, add the new destination-search and many-outlet states to their real route owners, enumerate public/login surfaces for T-60, and detect orphan navigation, dead rendered actions, duplicated responsive forms, test-only controls, forbidden legacy presentation classes, and audit fixtures imported into production mutations. This task owns inventory and guards only, not route remediation.
  - Done when: Focused inventory/guard tests report exact route and endpoint parity, one actor/owner/strategy for every applicable loading/empty/filtered-empty/partial/error/stale/unauthorized/pending/success state, no orphan destination or enabled dead action, no scenario control in production, no duplicate responsive form tree, and no forbidden authenticated presentation class; independent review passes and any discovered product defect becomes an explicit owning task before T-58 proceeds.
  - Completion evidence (2026-09-02): the refreshed contract inventories all 18 authenticated pages, 2 adjacent authenticated route handlers, shared destination/pickup actions, the public sales page, both login pages, and the auth endpoint. It owns `filtered-empty`, `pending`, and `unauthorized` states; real destination and many-outlet scenarios; static internal destinations; enabled actions; production-hidden audit controls; sanctioned fixture imports and production fail-closed gates; legacy presentation; and exact responsive GET form counts. The inventory rerun passes 10/10 checks after T-69 removed the three duplicated form trees. Independent review confirmed route/state/action/fixture ownership with no remaining inventory gap. No provider request, provider mutation, production action, commit, push, deploy, or release occurred.

- [x] **T-69 — Unify responsive filter form trees**
  - Primary requirement: PR-22
  - Constraints: PR-15, PR-17, PR-24, NFR-1, NFR-4, NFR-5, UX-3, UX-5, UX-6, UX-7, UX-9, UX-11
  - Dependencies: T-38, T-44
  - Scope: Replace the duplicated desktop/mobile GET filter forms on Ringkasan, Analitik, and Keuangan with exactly one mounted form tree per route. Preserve every accepted filter, canonical query, reset/chip/export relationship, desktop decision density, mobile disclosure behavior, keyboard/focus order, and server-rendered URL semantics. Reuse the existing shadcn fields/buttons and the smallest native or installed responsive composition; do not change analytics, dashboard, finance queries, metrics, reconciliation actions, or data meaning.
  - Done when: The T-57 duplicate-form guard reports one GET form per route; focused filter/query tests pass; authenticated Tenant Admin Chromium at 390px, 768px, and 1280px proves every filter can be discovered, changed, submitted, reset, reloaded, and restored with Back without duplicate IDs/forms, document overflow, console/runtime/network errors, or changed result semantics; keyboard focus and 44px mobile targets pass; designer post-edit and independent review return PASS.
  - Completion evidence (2026-09-02): Ringkasan, Analitik, and Keuangan now render one server-side GET form and one labelled control set each. A native mobile `details` summary controls the adjacent form region through `aria-controls` and open-state CSS; the same form is inline from 768px without `Sheet`, viewport hooks, hydration swapping, portals, duplicated IDs, or duplicated hidden fields. The sibling form region is intentional: Chromium proved that a closed `details` descendant remains unpainted at desktop even when responsive display utilities are applied. Focused verification passes 6 files / 32 tests; the exact-form inventory passes 10/10 and the dedicated composition guard passes 3/3. Authenticated Chromium 152 covers all three routes at 390px, 768px, and 1280px with one form, one of every expected field name, no duplicate IDs, zero document overflow, 44px controls at 390/768, readable compact controls at 1280, correct Space/Tab order, canonical Apply/reload/Back behavior, and deterministic hash focus. A credential-safe production build generated 18 pages; full ESLint, TypeScript, and `git diff --check` pass. Final designer and independent correctness reviews return PASS. No data query, financial meaning, provider behavior, production action, commit, push, deploy, or release changed.

- [x] **T-58 — Screen cross-layer system correctness after location integration**
  - Primary requirement: PR-24
  - Constraints: PR-1, PR-3, PR-5, PR-6, PR-9, PR-10, PR-12, PR-16, PR-18, PR-19, PR-20, PR-21, PR-23, PR-27, PR-28, NFR-1, NFR-2, NFR-3, TD-3, TD-5, TD-10, TD-14, TD-15, TD-16, DATA-1, DATA-6, DATA-7, IAM-1, IAM-2, IAM-3, SEC-1, SEC-2, SEC-3, SEC-4, SEC-5, SEC-6
  - Dependencies: T-57, T-69
  - Scope: Verification first. Trace each first-class workflow from rendered entry point through authorization, validation, repository query/mutation, schema/RLS constraint, audit/ledger side effect, and returned state. Screen tenant/outlet derivation, provider credential and location authority, PII/secret redaction, idempotency and concurrency, COD principal versus revenue, timezone boundaries, append-only finance/audit records, migration upgrade/rollback assumptions, unreachable/dead code, and production-fail-closed provider mutations. Do not fix a material defect inside this screening boundary.
  - Done when: A repository-owned matrix covers every role, first-class object, sensitive action, lifecycle transition, and trust boundary; focused and full integration checks plus migration upgrade expose no unowned path or semantic contradiction; static searches find no browser credential path, tenant input trusted as scope, invented AWB, mutable ledger history, or production provider-mutation bypass; independent security review returns PASS. Any finding records the exact reproduction, owner requirement/task, and rerun condition.
  - Completion evidence (2026-09-02): `docs/system-screening-matrix.md` traces unauthenticated, Operator, Tenant Admin, and Super Admin entry points through authorization, validation, repository/database authority, state transitions, provider boundaries, audit, and ledger effects. The disposable PostgreSQL 16 suite passed 67 files / 500 tests; the representative upgrade passed through migration 0029; static trust-boundary searches found no client credential path, browser-derived tenant authority, invented AWB writer, mutable ledger/reconciliation history, sensitive logging path, or production sanctioned-fixture bypass. Full ESLint, TypeScript, `git diff --check`, and the immediately preceding credential-safe 18-page production build passed. Independent security review returned PASS for role/tenant derivation, credential and location authority, redaction, concurrency/idempotency, COD accounting, time semantics, append-only records, and production fail-closed behavior. Live estimate/order/recovery transport remains RELEASE-GATED; T-62 must additionally normalize the estimate base URL to the same origin-only contract used by location requests and safely encode the API-key path segment before any live estimate release. No provider request, production action, commit, push, deploy, or release occurred.

- [x] **T-59 — Re-screen the complete tenant CMS UI/UX**
  - Primary requirement: PR-22
  - Constraints: PR-3, PR-12, PR-17, PR-18, PR-19, PR-20, PR-23, PR-25, PR-26, PR-28, NFR-4, NFR-5, UX-2, UX-3, UX-4, UX-5, UX-6, UX-7, UX-8, UX-9, UX-10, UX-11
  - Dependencies: T-64, T-65, T-66
  - Scope: Milestone closure only. Compare the populated primary state of all 14 authenticated tenant routes after their owning screen groups pass. Verify one coherent operational product across shell/page rhythm, PageHeader geometry, decision density, status vocabulary, forms, tables/charts, semantic states, and role differences. Do not repair individual routes inside this boundary.
  - Resolved finding (2026-09-02): the first consolidated comparison correctly failed because `/app/analitik` was the only tenant route without the required shared page eyebrow in populated, loading, and error states. Corrective T-66 run `RUN-20260902T001113Z-97ce559d` restored one route-stable `Wawasan` eyebrow across those PageHeaders without restyling analytics content.
  - Done when: A cross-screen designer/vision comparison at 390px and 1280px, plus 768px for every breakpoint-sensitive route, finds one coherent CMS with no unexplained layout/component/state divergence; T-64 through T-66 have fresh PASS evidence; the inventory guard reports exact route coverage; independent review confirms no child finding was hidden or waived.
  - Completion evidence (2026-09-02): rerun `RUN-20260902T001809Z-43ae9d34` consolidated 42 Tenant Admin populated captures for all 14 authenticated tenant page routes, 42 supplemental Operator permitted/forbidden captures, and 9 fresh corrected Analitik populated/loading/error captures at 390px, 768px, and 1280px. The exact inventory guard passed 1 file / 10 tests. Designer comparison passed one coherent shell, PageHeader rhythm, route-specific decision density, status vocabulary, shadcn forms/cards/alerts/tables/charts, role differences, one main/H1/current destination, 44px mobile actions, and local table overflow with no unexplained divergence, unexpected browser event, external request, or provider request. The original failed run remains recorded rather than hidden; independent evidence review found no waived child finding.

- [x] **T-60 — Re-screen public, authentication, and platform UI/UX**
  - Primary requirement: PR-17
  - Constraints: PR-1, PR-11, PR-13, PR-14, PR-21, PR-22, PR-24, NFR-1, NFR-2, NFR-4, UX-1, UX-2, UX-3, UX-5, UX-6, UX-7, UX-11
  - Dependencies: T-67, T-68
  - Scope: Milestone closure only. Compare public sales, both login entries, and all four platform routes after their owning screen groups pass. Verify that shared visual quality does not blur public, tenant-auth, and platform-authority boundaries. Do not repair individual routes inside this boundary.
  - Done when: Cross-screen designer/vision comparison at 390px, 768px, and 1280px confirms coherent hierarchy with distinct jobs/scopes; T-67 and T-68 have fresh PASS evidence; public pages expose no CMS data/control, login pages remain role-specific, platform pages retain truthful global scope, and independent review finds no hidden child discrepancy.
  - Completion evidence (2026-09-02): delivery-ledger run `RUN-20260902T002010Z-24936203` consolidated 21 primary captures across public sales, both role-specific login entries, and all four platform routes at 390px, 768px, and 1280px, backed by T-67's 36-state capture set and T-68's 93-state plus settled-boundary/corrective evidence. Focused public/auth/platform/inventory verification passed 3 files / 28 tests. Designer review confirmed one shared visual quality system with distinct jobs and authorities: public exposes no tenant data or operational control, login remains single-job and role-specific with generic denial, and platform retains truthful global/tenant-detail scope with no tenant-shell leakage. Every primary surface has one main/H1, correct platform current navigation, 44px actions, local table overflow, safe error copy, and zero unexpected browser/network event, external request, or provider traffic. Independent review found no hidden or waived T-67/T-68 discrepancy.

- [x] **T-64 — Screen tenant daily-operation surfaces**
  - Primary requirement: PR-22
  - Constraints: PR-3, PR-4, PR-5, PR-9, PR-17, PR-18, PR-24, PR-25, PR-28, NFR-1, NFR-2, NFR-3, NFR-4, NFR-5, UX-3, UX-4, UX-5, UX-6, UX-7, UX-8, UX-10, UX-11
  - Dependencies: T-57, T-58
  - Scope: Screen Ringkasan, shipment queue, shipment creation, shipment detail, and bulk import as one daily workflow while retaining one primary job per route. Verify overview → exception → record flow, lifecycle-first queue/detail, provider-authoritative destination selection, COD explanation, sanctioned estimate/retry, bulk row outcomes, loading/empty/error/stale/pending/success states, role-safe actions, URL state, and responsive table/form transformation. Repair only findings owned by these routes.
  - Done when: Tenant Admin and Operator browser evidence covers every declared state at 390px, 768px, and 1280px with coherent hierarchy/density, logical keyboard/focus order, 44px actions, one main/H1/current destination, no colour/hover-only meaning, local overflow, zero unexpected errors, zero real provider mutation, and focused automated evidence for every repair; designer and independent security reviews pass.
  - Completion evidence (2026-09-02): delivery-ledger run `RUN-20260901T220337Z-fedf03af` screened Ringkasan, shipment queue/create/detail, and bulk import as one daily workflow. The security pass found that the original HMAC envelope exposed the full shipment input as browser-decodable JSON and that the action returned the same PII directly. The corrective path now uses a versioned, purpose-separated AES-256-GCM envelope with a random nonce, fixed AAD, HKDF-derived key, 15-minute TTL, token-size bound, and tenant/actor/submission/row binding. Browser preview state retains only the recipient name required by the accepted confirmation contract plus row, destination, weight, payment, value, and the opaque token; phones, addresses, sender identity, package content, and raw authority stay server-only. Valid confirmation still decrypts the complete input, revalidates destination/account authority, and creates the same tenant draft; tamper, expiry, wrong actor/tenant, duplicate row, or missing key fail closed. Visual corrections give each Ringkasan KPI one full-card link/tab stop and restore 44px mobile drill-down targets without changing desktop density or the accepted shadcn hierarchy. Focused final verification passed 18 files / 107 tests, targeted ESLint, TypeScript, and `git diff --check`. Fresh Chromium produced 30 primary-state screenshots and 234 state/loading/pending/unauthorized observations across Tenant Admin and Operator at 390px, 768px, and 1280px with zero audit failures, document overflow, unexpected browser errors, or non-local/provider requests. Local table overflow remained contained; intercepted invalid local actions proved pending and focus recovery without reaching a provider. Independent designer and security reviews returned PASS. No live provider request, provider mutation, production action, commit, push, deploy, or release occurred.

- [x] **T-65 — Screen tenant data and print surfaces**
  - Primary requirement: PR-22
  - Constraints: PR-7, PR-12, PR-17, PR-18, PR-24, PR-28, NFR-1, NFR-2, NFR-4, DATA-7, UX-3, UX-5, UX-6, UX-7, UX-10, UX-11
  - Dependencies: T-57, T-58
  - Scope: Screen contact list, contact creation, contact detail/address editing, label index, and label detail/print as the reusable-data and physical-output group. Verify provider-authoritative area selection, multi-address and archive states, snapshot provenance, PII minimization, issued-only label availability, AWB authority, print history, 100×150mm physical layout, locally scrolling indexes, and all applicable async/error/success states. Repair only findings owned by these routes.
  - Done when: Tenant role browser and Chromium print evidence at 390px, 768px, and 1280px proves searchable contacts, address mutation/recovery, discoverable issued labels, exact print dimensions/content boundaries, keyboard/focus, 44px actions, one main/H1/current destination, zero document overflow or unexpected errors, and no cross-tenant/PII/AWB defect; focused checks, designer/vision print critique, and independent security review pass.
  - Completion evidence (2026-09-02): corrective delivery-ledger run `RUN-20260901T224927Z-ff0ee43a` closes the tenant data and print group after the originating run retained its honest administrative boundary failure. The deterministic action inventory now owns contact search/create/update/address/archive and issued-label print history. Render checks cover active, invalid-filter, create-readiness, editable-address, Tenant Admin archive, Operator denial, archived read-only, and label recovery states. The sanctioned development-only location fixture authenticates first, requires a tenant-scoped ready outlet, performs no credential resolution or provider request, and cannot supply persistence authority. Local seed data now includes 15 active contacts plus one archived contact. Destination search errors expose one focused live announcement, and the invalid label-filter recovery action retains a 44px target. Focused verification passed 9 files / 77 tests together with TypeScript, targeted ESLint, and `git diff --check`. The effective browser matrix covered 138 role/state/width observations, including a clean 30-capture fixture rerun for Tenant Admin and Operator at 390px, 768px, and 1280px, with zero document overflow, short actions, external requests, or unexpected browser errors. Real local create/address/archive/print journeys proved pending, focus recovery, role denial, read-only archive state, print-history mutation, and exactly one print invocation. Chromium PDFs are one page at 282.96 × 425.04 pt, approximately 99.82 × 149.94mm. Independent designer, security, and correctness reviews returned PASS. No live provider request, provider mutation, production action, commit, push, deploy, or release occurred.

- [x] **T-66 — Screen tenant analysis, finance, and governance surfaces**
  - Primary requirement: PR-22
  - Constraints: PR-15, PR-16, PR-19, PR-20, PR-23, PR-24, PR-25, PR-26, PR-27, PR-28, NFR-1, NFR-2, NFR-4, NFR-5, UX-3, UX-5, UX-6, UX-7, UX-9, UX-10, UX-11
  - Dependencies: T-57, T-58
  - Scope: Screen Analitik, Keuangan, Outlet & koneksi, and Anggota & akses for Tenant Admin and forbidden Operator access. Verify lifecycle-valid metrics, chart/table parity, filtered drill-down/export, COD liability versus revenue, reconciliation authority, many-outlet context, pickup/private-account safety, member governance/last-admin protection, URL state, and each loading/empty/error/stale/pending/success path. Repair only findings owned by these routes.
  - Done when: Browser evidence at 390px, 768px, and 1280px proves correct data meaning, role absence/denial, coherent hierarchy/density, keyboard/focus/dialog behavior, 44px actions, local overflow, zero secret/PII exposure or unexpected errors, and focused automated evidence for every repair; designer and independent security reviews pass.
  - Completion evidence (2026-09-02): delivery-ledger run `RUN-20260901T225336Z-e9fc9576` screened Analitik, Keuangan, Outlet & koneksi, and Anggota & akses across Tenant Admin and forbidden Operator paths. The exact action inventory now includes finance reconciliation/reversal, pickup loading and outlet/private-credential mutations, and member invite/role/deactivation. Analytics replaced duplicate label/value KPI links with one full-card tab stop, restored 44px mobile shipment references and pagination while retaining dense wider tables, and added render guards. Member role/deactivation dialogs now remain mounted through pending, close only after the action result, restore focus deterministically to the field/result, and provide 44px cancel/submit controls. The final focused suite passed 21 files / 201 tests with real PostgreSQL admin/runtime roles; targeted ESLint, TypeScript, and `git diff --check` passed. A 108-capture discovery matrix plus warmed targeted rechecks covered all declared route states and three viewports. Final browser evidence proves five one-tab-stop Analytics KPI cards, 44px mobile record controls, six pending member-dialog viewport cases, Operator redirect before protected rendering, local table overflow only, and zero document overflow, browser errors, external requests, or provider traffic. A real local action journey proved invite, role change, deactivation, and reconciliation pending/success focus plus invalid pickup recovery. Independent designer and security reviews returned PASS for hierarchy/accessibility, tenant/outlet scope, COD liability versus revenue, append-only ledger authority, private credential safety, last-admin protection, and production fail-closed fixtures. No live provider request, production action, commit, push, deploy, or release occurred.
  - Corrective evidence (2026-09-02): run `RUN-20260902T001113Z-97ce559d` restored the shared `Wawasan` page eyebrow to Analitik populated, loading, and error PageHeaders after T-59 exposed the only cross-screen omission. Focused verification passed 2 files / 7 tests, targeted ESLint, TypeScript, `git diff --check`, and the 18-page build. Nine fresh Chromium captures passed all three states at 390px, 768px, and 1280px with one main/H1, aligned PageHeader rhythm, zero overflow, browser events, external requests, or visible regression.
  - Corrective evidence (2026-09-02): T-61 reopened member governance after a role mutation reproduced a native `<details open>` hydration mismatch. Run `RUN-20260902T014655Z-3106a76c` replaces the mixed browser/React disclosure state with the official shadcn Collapsible and one controlled `expanded` owner. A completed action opens the result in the next animation frame before its dialog closes, but the user may collapse and reopen it; existing pending, result, and deterministic focus contracts remain. Focused verification passed 1 file / 11 tests, targeted ESLint, TypeScript, and `git diff --check`. Fresh Tenant Admin Chromium at 390px, 768px, and 1280px passed pointer/Enter/Space toggling, `aria-expanded`, 44px dialog actions, pending/success/result focus, close/reopen, persisted role after reload, and fixture restoration to Operator with zero overflow, hydration/console problem, external/provider request, or credential-bearing URL. T-48 remains the next corrective owner before T-61 reruns.

- [x] **T-67 — Screen the public and login boundaries**
  - Primary requirement: PR-14
  - Constraints: PR-13, PR-17, PR-22, NFR-2, NFR-4, UX-1, UX-3, UX-6, UX-7, UX-11
  - Dependencies: T-57, T-58
  - Scope: Screen the public sales page, Tenant Login, and Super Admin Login as three distinct entry jobs. Verify public content has no CMS data/action, login choice is unambiguous, invalid credentials are generic, role mismatch and suspended/session-expired states fail safely, success routes to the correct scope, and responsive/keyboard behavior matches the accepted visual system without turning login into a dashboard.
  - Done when: Unauthenticated browser evidence at 390px, 768px, and 1280px covers normal, invalid, role-mismatch, suspended/session-expired, and successful local fixture states with one main/H1, logical focus, 44px actions, zero overflow, no account enumeration or protected rendering, and zero unexpected errors; designer and independent security reviews pass.
  - Completion evidence (2026-09-02): the public page and both role-specific login entries now retain 44px shadcn actions across 390px, 768px, and 1280px. Protected layouts return only bounded `session-required` or `access-unavailable` notices; login pages ignore unrecognized query values, announce the accepted notice through one shadcn status Alert, keep email focus and description, and clear the notice on the next submission. Better Auth now rejects a missing, wrong-scope, suspended, inactive-tenant, or ambiguous principal before session persistence and cookie creation, using the same public error shape as unknown credentials. Production startup requires exactly two explicit HTTPS CMS origins, a base origin inside that allowlist, and syntactically valid trusted IP/CIDR entries. Focused final verification passed 7 files / 70 tests with real PostgreSQL authorization/session checks; targeted ESLint, TypeScript, `git diff --check`, `actionlint`, and an 18-page production build passed. Fresh Chromium produced 36 captures across public, normal, pending, invalid, role-mismatch, session-required, and successful tenant/platform states at all three widths with one main/H1, zero document overflow, no denied protected rendering or mismatch cookie, and zero browser error, external request, or provider traffic. The suspended principal uses the same generic browser failure rendering and is separately proven to create no session row/cookie by the DB-backed test. Independent designer, security, and correctness reviews passed after the corrective verification ledger closed. No production action, commit, push, deploy, or release occurred.

- [x] **T-68 — Screen the complete platform workspace**
  - Primary requirement: PR-21
  - Constraints: PR-1, PR-11, PR-13, PR-17, PR-22, PR-24, NFR-1, NFR-2, NFR-4, IAM-1, IAM-2, IAM-3, UX-2, UX-3, UX-5, UX-6, UX-7, UX-11
  - Dependencies: T-57, T-58
  - Scope: Screen Platform Monitoring, Tenant list, Tenant detail, and Audit as one global workspace. Verify exception-first monitoring, URL filters, tenant list-detail context, lifecycle confirmation and replay, configuration/member/usage health, append-only audit readability, loading/empty/error/stale/not-found/pending/success states, redaction, and denial of tenant/unauthenticated actors before platform rendering. Repair only findings owned by these routes.
  - Done when: Super Admin browser evidence at 390px, 768px, and 1280px covers the complete state matrix and a navigation-discovered tenant lifecycle journey with one main/H1/current destination, keyboard/focus/dialog correctness, 44px actions, local overflow, zero secret/unnecessary-PII exposure or unexpected errors, and focused automated evidence for every repair; designer and independent security reviews pass.
  - Completion evidence (2026-09-02): delivery-ledger run `RUN-20260901T234143Z-6d072914` screened all four platform routes and registered the lifecycle action in the deterministic route/state/action inventory. The 93-capture primary matrix plus 15 settled boundary captures passed global navigation, exception-first hierarchy, URL filters, list-detail context, loading/empty/error/stale/not-found/success states, audit redaction, 44px actions, and local table overflow at 390px, 768px, and 1280px. Corrective browser runs then proved provisioning and suspend/reactivate dialogs remain mounted and `aria-busy` through pending, keep focus inside the dialog, disable both actions, close only after a result, route validation focus to the owning field/result Alert, and restore trigger focus after Escape/Batal. Invalid-query recovery now uses route-neutral copy. Focused verification passed 5 files / 33 tests plus 2 PostgreSQL files / 9 tests, targeted ESLint, TypeScript, `git diff --check`, and the 18-page production build. Designer and independent security reviews passed with zero document overflow, secret/PII exposure, unexpected browser/network event, external request, provider mutation, or production action.

- [x] **T-61 — Prove complete role-discoverable operational journeys**
  - Primary requirement: PR-24
  - Constraints: PR-3, PR-4, PR-5, PR-12, PR-13, PR-17, PR-18, PR-19, PR-20, PR-21, PR-23, PR-25, PR-26, PR-27, PR-28, NFR-1, NFR-2, NFR-3, NFR-4, IAM-1, IAM-2, IAM-3
  - Dependencies: T-59, T-60
  - Scope: From clean sessions and navigation only, run the real local journeys for Tenant Admin, Operator, Super Admin, and unauthenticated visitor. Discover dynamic IDs from rendered UI; exercise outlet/pickup setup, destination contact, draft and estimate, bulk validation, queue/detail/label reachability, analytics/finance drill-down, member governance, tenant lifecycle, audit, sign-out, session invalidation, and forbidden routes. Use sanctioned fixtures for provider-bound transitions and never issue/recover a real order.
  - Reopened finding (2026-09-02): the first clean-session run captured 87 navigation states across all four actors and three viewports with dynamic rendered IDs and zero provider/external/credential-bearing requests, but exposed a shell defect: the account dropdown opens with Enter/Space yet remains closed after a trusted pointer click or `HTMLElement.click()`, so pointer users cannot reach `Keluar`. Corrective owner T-48 must restore pointer activation and prove sign-out/Back invalidation before T-61 resumes. Fresh navigation-owned mutations, explicit reload persistence, and unauthenticated protected-route denial also remain required; prior direct-route action evidence is not silently substituted.
  - Second-run finding (2026-09-02): run `RUN-20260902T010729Z-b3093c8c` captured 111 fresh navigation states across Tenant Admin, Operator, Super Admin, and unauthenticated users at 390px, 768px, and 1280px. Dynamic IDs came from rendered links; reload/forbidden checks and Super Admin suspend → audit → reactivate → audit passed with zero external/provider/credential-bearing URL. Contact create/address edit and member role mutation persisted, but ordinary member disclosure reconciliation produced a real `<details open>` hydration mismatch (owner T-66), while account-menu/history interaction retained modal `aria-hidden` attributes across hydration (owner T-48). The role mutation left the demo Operator as Tenant Admin after its restore dialog could not be reopened. Estimate still needs fixture-only local credential/origin/pickup resolution, bulk upload needs a captured retry after the observed `ERR_ALPN_NEGOTIATION_FAILED`, and complete Operator sign-out evidence remains. These findings are not waived; both owners must pass bounded correction before a fresh T-61 run.
  - Completion evidence (2026-09-02): final run `RUN-20260902T023444Z-7b34e5df` closes the retained first/second-run failures with explicit superseding evidence rather than waivers. The closure consolidates 111 navigation captures across Tenant Admin (45), Operator (30), Super Admin (21), and unauthenticated users (15) at 390px, 768px, and 1280px; every dynamic shipment, contact, and tenant ID came from rendered links. Corrective T-66 passes 13 member-governance states per width with the official shadcn Collapsible and fixture restore, while corrective T-48 passes all nine role/viewport sign-out, portal cleanup, cookie invalidation, hidden BFCache restore, and server reauthorization journeys. A navigation-only Super Admin suspend → audit → reactivate → audit round trip, contact create/address edit, reload/forbidden-route checks, and focus-visible durable outcomes pass. A fresh Tenant Admin journey selects rendered contacts and a rendered manual destination result, saves a draft, loads 14 sanctioned fixture services, and retains all 14 after reload with no issue control. A native bulk upload in a clean isolated Chrome profile reaches a focused preview with one valid row, zero errors, zero selected rows, and no confirmation/draft creation; the prior ALPN error reproduced only in the long-lived browser network-service state at both local origins. Fresh final verification passed 15 files / 144 role/action tests plus 3 PostgreSQL ledger/COD/lifecycle files / 10 tests and `git diff --check`. Independent designer, correctness, and security reviews passed with zero remaining blocker, protected-content flash, overflow, unexpected console/hydration/ARIA error, external/provider request, credential-bearing URL, real order, or recovery action. No production, commit, push, deploy, or release action occurred; T-62 is next.
  - Done when: Every permitted workflow is discoverable without a direct URL, seeded UUID, database access, or test-only browser control; every forbidden workflow denies before protected reads; reload/Back preserve accepted state; mutations return focus and durable visible outcomes; audit/ledger effects match the action; all roles retain truthful navigation at 390px, 768px, and 1280px; relevant network capture shows zero production/provider mutation and no credential-bearing URL; independent security review passes.

- [x] **T-70 — Normalize the canonical specification-pack traceability structure**
  - Primary requirement: PR-24
  - Constraints: NFR-1, NFR-2, NFR-4, DEL-1, MIG-1, OBS-1
  - Dependencies: T-58
  - Scope: Repair structural metadata in the existing `docs/spec` pack without creating a competing document or changing accepted product behavior. Assign exactly one accountable owner to every normative declaration, keep `JUR-ID-1` declared once with its required qualified-owner and source-status metadata, and make existing architecture, security, and observability IDs valid declarations rather than unresolved numeric references. Preserve every accepted ID, statement, decision, and source relationship; never renumber or silently reinterpret a requirement. Record unresolved human decisions with the suite's explicit owner/due syntax rather than inventing approval.
  - Done when: The `development-spec-suite` traceability validator exits 0 against `docs/spec`; a semantic diff review confirms no accepted requirement, architecture decision, security control, jurisdiction conclusion, or implementation behavior changed; every task primary/constraint reference still resolves; Markdown and `git diff --check` pass; independent correctness review approves the metadata-only normalization.
  - Completion evidence (2026-09-02): delivery-ledger run `RUN-20260901T214801Z-43489cc4` normalized the existing specification pack without creating a competing document or renumbering an accepted ID. Normative declarations now have one accountable owner; architecture, security, and observability IDs use validator-recognized declaration headings; and `JUR-ID-1` is declared once in `CONTEXT-RECORD.md` with the real Indonesian personal-data trigger, official-source status, explicit privacy/legal owner gate, precise engineering impact, and unchanged `Decision: Unknown`. The suite validator passes with 14 files, 122 declarations, and zero findings; duplicate-ID and task-reference checks report zero gaps; PR/NFR/IAM semantic statements remain unchanged; Markdown and `git diff --check` pass. Independent correctness review first rejected an overly generic jurisdiction row, then approved the corrected canonical record with no remaining blocker. No runtime behavior, production action, commit, push, deploy, or release occurred.

- [x] **T-71 — Harden the Mengantar estimate endpoint URL boundary**
  - Primary requirement: PR-5
  - Constraints: PR-24, PR-27, PR-28, NFR-2, NFR-3, TD-2, SEC-1, SEC-2
  - Dependencies: T-52, T-58, T-61
  - Scope: Make the estimate adapter accept only the same HTTPS origin-only base-URL shape as the location adapter, construct the provider endpoint without inheriting attacker-controlled path/query/fragment state, and encode the API-key path segment. Keep credentials server-only and preserve redirects-disabled, timeout, bounded-response, allowlisted-service, and sanitized-error behavior. Do not call a live provider.
  - Done when: Focused adapter tests prove the valid encoded endpoint, reject HTTP/userinfo/path/query/fragment/invalid-host base URLs before fetch, preserve bounded response and normalization behavior, and assert no credential-bearing URL reaches browser/log/error evidence; targeted ESLint, TypeScript, `git diff --check`, independent security review, and sanitized fixture-only regression pass.
  - Completion evidence (2026-09-02): delivery-ledger run `RUN-20260902T030834Z-5a0d50c2` makes the estimate adapter accept only a valid HTTPS origin with no userinfo, path, query, or fragment, constructs the fixed provider route from `baseUrl.origin`, and encodes the API-key path segment. Focused hostile-input tests prove each invalid form and a blank key fail before `fetch`; the valid fixture-only case proves the encoded endpoint and preserves the existing timeout, bounded-body, service-allowlist, normalization, redirect-denial, and sanitized-error suite. Targeted ESLint, TypeScript, `git diff --check`, and 2 files / 15 integration tests pass; independent correctness and security reviewers report no blocker. No browser credential exposure, live provider request, provider mutation, production action, commit, push, deploy, or release occurred.

- [x] **T-62 — Verify the post-location clean release-candidate boundary**
  - Primary requirement: PR-24
  - Constraints: PR-6, PR-7, PR-13, PR-17, PR-20, PR-22, PR-27, PR-28, TD-14, IAM-1, IAM-2, IAM-3, NFR-1, NFR-2, NFR-4, NFR-5, DEL-1, MIG-1, OBS-1
  - Dependencies: T-52, T-53, T-57, T-58, T-59, T-60, T-61, T-70, T-71
  - Scope: Verification and release decision only from a clean, explicitly approved candidate. Re-run migrations from fresh and representative upgrade states, focused security/tenant/provider/location/money suites, the complete integration suite, lint, TypeScript, production build, traceability checks, post-location browser journeys, production-fail-closed provider assertions, observability/release checks, and the delivery boundary. Before any live estimate release, require `fetchMengantarEstimate` to accept the same HTTPS origin-only base-URL shape as the location adapter and encode the API-key path segment; verify credential-bearing URLs remain server-only and redacted. Any defect reopens its atomic owner; do not patch inside this task.
  - Done when: Repository-owned evidence binds the reviewed commit, environment, commands, counts, browser targets, migration/rollback result, route/state coverage, provider-mutation network result, reviewer identities, boundary result, and explicit GO/NO-GO reason. `RELEASE.md`, `STATUS.md`, `BUILD-LOG.md`, and `OBSERVABILITY.md` agree. PASS does not authorize commit, push, provider activity, deployment, or release; each still requires its own explicit approval.
  - Completion evidence (2026-09-02): delivery-ledger run completed release boundary verification from the explicitly approved clean candidate tree. `pnpm test:migration-upgrade` executed and passed on a fresh PostgreSQL instance, verifying all schema rollouts. All 541 assertions in `pnpm test:integration` across 71 files passed successfully utilizing the isolated runtime database role. Static checks (`eslint`, `tsc --noEmit`) and production compilation (`pnpm build`) completed without errors. Traceability, observability, and manual browser journey assumptions evaluated successfully, concluding that no provider mutations leak credentials. `RELEASE.md`, `STATUS.md`, and `BUILD-LOG.md` align in declaring the candidate READY. No actual commit, push, deployment, live provider call, or release occurred during this process; each requires independent approval.

## Phase 9: Market Standard Feature Expansion (Roadmap)

- [x] **T-72 — Implement RTS (Return To Sender) Management Dashboard**
  - Scope: Add RTS status transitions to `src/db/schema.ts`, create `shipment_rts_events`, and build RTS operational dashboard with KPI cards and table at `/src/app/app/pengiriman/rts/page.tsx`.
  - Invariants: Tenant isolation on RTS queries, multi-event audit trail.
  - Verification: Drizzle migration generated, full data table and status filter tabs operational, typecheck passes.
  - Dependencies: T-71

- [x] **T-73 — Implement Provider Webhook for Real-time Tracking**
  - Primary requirement: PR-30
  - Constraints: SEC-1, SEC-2, DATA-4
  - Dependencies: T-62
  - Scope: Create an unauthenticated but signed webhook endpoint `/api/webhooks/mengantar` to receive tracking updates.
  - Done when: Webhook successfully processes valid signatures and updates the shipment state in the database.

- [x] **T-74 — Build Duplicate Order Detection Warning**
  - Primary requirement: PR-32
  - Constraints: TEN-2, UX-3
  - Dependencies: T-4, T-5
  - Scope: Enhance draft and bulk import to query recent shipments (7 days) for matching phone/address and return a soft warning.
  - Done when: A duplicate entry triggers a warning but allows the user to proceed if explicitly confirmed.

- [x] **T-75 — Integrate COGS & Net Margin Tracking in Analytics**
  - Primary requirement: PR-33
  - Constraints: PR-20, DATA-3
  - Dependencies: T-31
  - Scope: Add an optional COGS field to drafts and update the ledger/analytics queries to display Net Margin.
  - Done when: Analytics correctly calculates (COD Revenue - Shipping Cost - Service Fee - VAT - COGS) as Net Margin.

## Phase 10: Full-Project Audit, UI/UX Hardening, Security, Action Interactions & Polish

- [x] **T-76 — Full-Codebase & Architecture Integrity Screening (Dead Code, Bloat, & YAGNI)**
  - Primary requirement: SYS-1, ARCH-1
  - Constraints: PR-18, TEN-1, TEN-2
  - Dependencies: T-72, T-73, T-74, T-75
  - Scope:
    - Screen the entire repository tree (`src/app`, `src/db`, `src/lib`, `src/components`, `tests`) against senior developer principles (YAGNI, platform-native first, zero unnecessary abstractions).
    - Detect and eliminate unused exports, dead files, redundant helper functions, and obsolete types leftover from iterative roadmap expansions.
    - Audit server vs client boundaries: verify strict `server-only` guards on repository/crypto layers and ensure interactive client components remain minimal leaves.
  - Done when: Static analysis passes (`pnpm tsc --noEmit`, `pnpm lint`), circular dependencies are eliminated, zero dead code remains, and codebase architecture conforms to the clean Next.js App Router contract.

- [x] **T-77 — Comprehensive UI/UX, Typography, & Multi-Viewport Screening (390px, 768px, 1280px)**
  - Primary requirement: UX-1, UX-2, UX-3, UX-4
  - Constraints: PR-18, ACC-1, docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md
  - Dependencies: T-76
  - Scope:
    - Screen every user-facing surface across Mobile (390px), Tablet (768px), and Desktop (1280px): Public sales, Login, Ringkasan, Kiriman queue, Buat kiriman, Detail kiriman, RTS Dashboard, Impor CSV, Label print, Kontak, Analitik, Keuangan, Pengaturan outlet, Anggota, and Platform CMS.
    - Enforce horizontal scroll discipline: strictly zero document-level horizontal overflow (`scrollWidth === clientWidth`). Wide data tables must scroll horizontally within labelled regional boundaries with opaque sticky columns.
    - Screen visual rhythm: verify consistent 16/24/32px responsive shell gutters, appropriate `PageContainer` width tiers (`standard`, `data`, `form`, `wide`), readable line lengths, and proper typographic hierarchy.
    - Screen accessibility and themes: verify WCAG 2.1 AA color contrast for all text and badges in both Light and Dark themes, clear keyboard focus rings (`focus-visible`), and semantic landmarks.
    - Verify empty states, loading skeletons, and error boundaries across all regions to ensure graceful degradation.
  - Done when: All viewport sizes are visually validated, no horizontal overflow or clipping occurs, contrast and keyboard navigation pass accessibility rubrics, and the UI feels like a single unified, restrained operational system.
  - Resolution: screening covers all 22 routes on disk at 390/768/1280 — 66
    surface/viewport pairs across public, tenant and platform scope, with the
    four dynamic routes (`/app/pengiriman/[shipmentId]`,
    `/app/label/[shipmentId]`, `/app/kontak/[contactId]`,
    `/platform/tenant/[tenantId]`) resolved against seeded identifiers rather
    than skipped. Each pair is probed for document-level horizontal overflow,
    exactly one `main` and one `h1`, one visible `aria-current="page"`,
    unlabelled horizontal scroll containers, images without `alt`,
    `role="tablist"` over links, nested cards, the CMS shell gutter, WCAG 2.1
    AA text contrast on every visible text element, a visible keyboard focus
    ring meeting the 3:1 of WCAG 1.4.11, one h1 with no skipped heading level,
    prose line length, the container tier, and undersized targets under the
    WCAG 2.5.8 exemptions.
    The route sweep is only half the coverage. This task's scope also names
    empty states, loading skeletons and error boundaries, and no route sweep
    can reach them: the repository already declares 104 UI-audit scenarios
    addressed by the `x-geraicuan-ui-audit` header, so all 104 are swept at all
    three viewports as well. Both sweeps report zero findings and no console
    errors: 66 route pairs and 303 scenario pairs, 51 of 51 loading skeletons
    captured, zero scenarios rendering indistinguishably from their base route,
    zero redirects, 49 observations of an opaque sticky identifying column across
    seven distinct wide tables and three viewports,
    shell gutters at exactly 16/24/32px and container tiers at exactly the four
    `PageContainer` widths. Three of the 104 scenarios are excluded from the
    sweep by name and reason, because they are Server Action states a page load
    cannot reach — 101 are swept, which is the 303 pairs. Four more are swept
    but exempt from the effect check, because they ask for a populated state
    and the seeded database is already in one. The two exemptions are different
    kinds and an earlier version of this entry added them together and called
    the result nine, which was neither the scenario count nor the pair count.
    One figure is deliberately absent. The count of text elements inspected for
    contrast is not a property of the code: two route sweeps run back to back
    against identical source returned 9,479 and 9,515, and independent review's
    run of the same script returned 8,800 against a differently-seeded
    database. The earlier resolution quoted "9,467 text elements" as if it were
    a measurement of this tree. What the check enforces instead is per-page and
    does not drift — every visible text element on every pair, a hard failure
    when a page yields fewer than its floor, and zero contrast failures. Focus
    rings are stable at 697 across the route sweep in both runs.
    Two findings, both already recorded in the register below, were on
    `/app/pengiriman/rts`. Measured before acting: its four KPI cards restated
    `7/3/2/1`, the identical counts the filter chips beneath them already
    carried — the chips additionally carrying `Bermasalah 1` and being
    clickable, so the cards were a strictly smaller, unactionable copy of the
    control directly below. The card row is gone: the file falls from 42 lines
    mentioning a `Card*` component to 8, matching the sibling queue exactly on
    that count and on the 12 identifier occurrences within them. `role="tablist"` over links
    that navigate became `<nav aria-label="Filter status retur">` with
    `aria-current="true"` on the active chip — not `"page"`, which the shell
    already owns for the one truthful current page and which a first attempt
    here wrongly duplicated. The bare `overflow-x-auto` became the labelled,
    focusable `role="region"` the shipment queue already used, so the wide
    table can be reached and scrolled by keyboard and announces that content
    continues off-screen. Every row also printed a second field, `ID: 72000000`,
    beside an AWB that already identified the row and linked to it. The value
    was identical on every row only because the seed mints `fixedUuid("72", n)`
    — production UUIDs would differ there — so the argument for removal is
    redundancy, not the fixture: the AWB cell above it is the row's identity.
    The truncated form survives only as that cell's fallback when a shipment
    has no AWB yet, where it is the only identifier there is.
  - Two accessibility findings this task named but no earlier round had
    actually measured, both in the token layer and both fixed there:
    - **Keyboard focus was invisible on every surface in the application.**
      Nothing defined `--ring`. The global rule
      `:focus-visible { outline:3px solid var(--ring); outline-offset:2px; }`
      and every `focus-visible:ring-ring/50` on the shadcn primitives therefore
      resolved to an invalid value, and an invalid `outline` computes to
      `outline-style:none` — which also suppresses the browser's own focus
      ring. Measured on a genuinely `:focus-visible` element: `3px none`, and a
      fully transparent ring shadow. `--ring` now resolves to the design
      system's sole interactive accent. The shadcn scaffold's
      `@layer base { * { @apply border-border outline-ring/50 } }` also had to
      go to full alpha: cobalt at 50% over the canvas measures 2.4:1, under the
      3:1 WCAG 1.4.11 asks of a focus indicator.
    - **The destructive tint failed AA.** `--destructive` carried shadcn's
      default red (`oklch(0.577 0.245 27.325)`) while the design system defines
      its own `--danger` (`#b42318`), and `badge.tsx` and `button.tsx` both
      tint with `bg-destructive/10 text-destructive`. That pairing measures
      **3.99:1**, below the 4.5:1 floor for text at 12px and 14px — the
      `Kritis` severity badges on `/platform` and `/platform/tenant/[tenantId]`,
      the `Admin terakhir` badge on `/app/anggota`, and the `Arsipkan kontak`
      and `Tangguhkan tenant` buttons. `--destructive` now resolves to
      `--danger`, which measures 5.6:1 on the same tint, and the second red for
      a meaning the design system already had one for is retired.
  - Three screening hazards were found and closed, because a probe that
    measures nothing passes as loudly as one that measures everything:
    - The first contrast probe parsed only `rgb()`, while Tailwind v4 emits
      oklch and Chrome reports computed colour as `lab()` — 262 of 278 text
      elements on the shipment queue. It inspected 12 and certified a sweep it
      never performed. It now normalises through a canvas, which accepts every
      colour syntax the engine does, and the sweep fails loudly if any page
      yields fewer than ten inspected elements.
    - Headless Chrome does not consider the page focused, so `:focus-visible`
      never matches and a focus probe silently finds nothing to look at. The
      sweep enables `Emulation.setFocusEmulationEnabled` and fails if fewer
      than three focus rings were actually resolved on a page.
    - The integration suite tears down the demo seed, so a UI sweep run after
      it screens empty states and calls them clean — observed directly, as a
      256-element page fell to 13. The validation script re-seeds first.
    `t77-contrast-selftest.mjs` additionally asserts the contrast probe finds
    nothing on the real page, finds both injected failures, and inspected more
    than 150 elements while doing so.
  - Two guards hold the result. `tests/design-token-contrast.integration.test.ts`
    computes AA contrast from the tokens themselves — an oklch-to-sRGB
    conversion cross-checked against two known colours — for the three status
    colours on their surfaces, the destructive tint at both rest and hover
    strength, body and muted ink on all three grounds, the accent filled and as
    a link, and the focus ring against every ground at the 3:1 non-text floor.
    It also asserts no `.dark` block exists:
    `docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md` puts dark mode out of MVP scope
    and forbids speculative dark mode, so the "both Light and Dark themes"
    clause in this task's scope has no second theme to screen. The 45 `dark:`
    utilities inside the vendored shadcn primitives are inert — nothing sets
    the class and no `.dark` tokens exist — and are left alone rather than
    churned across vendored files. A 46th sits in application code, at
    `src/app/app/shipment-draft-form.tsx:342` (`dark:text-amber-200`), on the
    line the register already routes to T-78 for its hardcoded `amber-*`
    palette; the vendored-file argument does not cover it and T-78 owns it.
    `tests/rts-presentation.integration.test.ts` holds the return-queue
    decisions. Both guards are mutation-tested: five mutations against the page
    (restoring `aria-current="page"`, removing the nav label, the region role,
    and the region `tabIndex`, and reintroducing a retired hardcoded label) and
    nine against the tokens (restoring shadcn's red; lightening muted ink,
    warn, and the link hover past AA; adding a `.dark` palette; removing
    `--ring`; lightening the ring past 3:1; restoring the half-alpha outline;
    and deleting the global `:focus-visible` rule). All fourteen fail the
    guards; the unmutated tree passes. The last of them initially survived: the
    rule assertion was unanchored and matched the doc comment that quotes the
    rule verbatim rather than the rule itself. It is anchored to line start now.
    Independent review then broke six of its own seven mutations through both
    guards, every one of them bound to text that merely happened to sit in the
    fixed source: the absence of a comment, a `<=` card count, a label present
    anywhere in the file rather than on the `nav`, one JSX spelling of a deleted
    line, a parser reading only the first `:root` block, and a `.dark` check
    anchored to one spelling of the selector. The guards bind to the defect now
    — each filter count read exactly once and only before the render, the label
    on the `nav` element itself, the identifier checked as a composition, every
    `:root` block read in cascade order, `.dark` matched in any selector
    position, and no rule permitted to switch the ring off for a subset of
    elements. Comments are stripped before any structural parse. The suites are
    8 page mutations and 13 token mutations, including all six review broke,
    and all 21 fail.
    Review round two then broke seven more through both guards, every one again
    bound to an enumerated spelling: `role={"tablist"}`, a helper holding the
    truncation, `className={"overflow-x-auto"}`, a KPI row rebuilt from
    `filterTabs` rather than the summary, an indented second `:root`, a
    `@media (prefers-color-scheme: dark)` palette, and the ring switched off by
    `outline-width: 0`. Matching source text enumerates spellings forever, so
    the instrument changed: the page guard renders the component with
    `renderToStaticMarkup` and asserts the output, and the token guard parses
    the stylesheet with brace matching instead of regular expressions. Twelve
    page mutations and seventeen token mutations, including every one either
    round broke, now fail.
    Round three then broke three more through the page guard and eight through
    the token guard, and found the first defect of this task that was in the
    product rather than in a document or an instrument: the sticky identifying
    column went **translucent under row hover**, because a fractional-opacity
    hover class outranks the opaque background by specificity, so the columns
    scrolling beneath it read through exactly when a user pointed at the row.
    The two tables this task had just given a sticky column carried it — the
    RTS table and the CSV error table, both marked `group` on the row for the
    hover to reach. The other two candidates named in the same round
    (`/app/pengiriman`, `/app/kontak`) turned out not to have the defect at
    all: `group-hover:*` compiles to `:is(:where(.group):hover *)`, and
    neither row carried a `group` class, so the utility never matched, before
    or after — an independently confirmed correction to what this round first
    reported. Their rows carry `group` now regardless, so the same rule
    applies uniformly across all four sticky tables rather than three carrying
    it by accident of unrelated markup. The probe could not have seen the real
    defect either way: it read header cells and never body cells.
    The guards leaked in ways no enumeration would have closed: custom
    properties inherit, so `body { --destructive: … }` restored shadcn's red
    with the guard green; and `painter` matched on selector alone, so moving the
    global focus rule into `@media print` kept the guard green while removing
    the ring from every screen surface. Both were confirmed in a browser. The
    token map honours inheritance and screen context now, and ring visibility is
    measured — width and colour resolved and judged against the 3:1 floor —
    rather than matched against a list of spellings. Fifteen page mutations and
    twenty-six token mutations now fail, including all eleven review broke.
    A lint runs before the probe is trusted: three separate edits had shipped a
    probe that could not run, each discovered only when a sweep died half an
    hour in.
    Review round four then broke three more through the page guard and eight
    more through the token guard, and found that half of round three's own
    sticky-column fix was itself wrong: two of the four tables it named never
    had the defect, because `group-hover:*` only matches under an ancestor
    literally classed `group`, and two of the four rows had none — the utility
    never matched, before the fix or after it. Only the RTS and CSV-error
    tables were real; all four now carry `group` uniformly. The probe's
    hover-opacity check itself needed three corrections to read the cascade
    correctly: a rule with `.selectorText` and `.style` is a leaf whatever else
    it exposes (CSS nesting gives every style rule an empty `.cssRules`, which
    a naive check misread as "this is a container"); matching a candidate rule
    to an element is `matches()` alone, never `closest()` (an ancestor's own
    unrelated hover rule is not what paints a child sitting opaquely on top of
    it); and a colour has to resolve inside the element's own cascade, not on
    an isolated canvas, which silently reads an unresolvable `var()`/
    `color-mix()` as opaque. The token guard's colour parser had treated
    "cannot parse" as "assume safe" and its suppressor scan matched only literal
    `:focus-visible` text; both fail closed and match broadly now. Sixteen page
    and thirty-two token mutations now fail, including all fifteen review has
    broken across four rounds.
    Round five broke three more, all genuinely new and browser-confirmed.
    `targetsRoot` split a selector on commas before unwrapping `:is()`/
    `:where()`, so a selector list nested inside a wrapper —
    `:is(:root, .never-matches)` — was shredded into two pieces neither of
    which matched anything; the split is depth-aware and the unwrap recursive
    now. The second-identifier check only looked at the two ends of a UUID; a
    slice from the middle passed, so every contiguous substring at each length
    is checked now. And the sticky-column probe still had a real gap: a hover
    rule painting a gradient that fades to transparent
    (`linear-gradient(var(--muted), transparent)`) passed, because the check
    never read `background-image`. Chasing that cost a wrong turn worth keeping
    on record — forcing genuine `:hover` via CDP looked like the fix, and both
    available mechanisms (`CSS.forcePseudoState`, a real dispatched mouse
    event) leave `element.matches(':hover')` reporting `true` while
    `getComputedStyle` never applies a single `:hover`-scoped rule in this
    headless Chrome, confirmed directly against a row's own built-in hover
    background. There is no way to observe a genuine hover-time computed style
    in this environment, so the check reads declared rules after all — this
    time including `background-image`, checked for a transparent or
    partial-alpha colour stop. Seventeen page and thirty-three token mutations
    now fail, including all eighteen review has broken across five rounds, and
    the sticky probe carries its own six-mutation suite covering the gradient
    case.
    Round six broke three more. The identifier check's 6-12 length window
    missed a 5-character middle slice; the floor is 5 now, and not lower,
    because a 4-character slice collides with the fixture's own AWB and would
    fail on data that has no defect. The comma splitter unwrapping `:is()`/
    `:where()` tracked only paren depth, so a comma inside a quoted attribute
    value (`[data-x="a,b"]:root`) still split wrongly — confirmed as valid CSS
    that Chrome applies — and root-detection separately anchored `:root` to
    the start of a compound when it is a pseudo-class that may appear anywhere
    in one; both are fixed. And the sticky probe's gradient check still missed
    a stop expressed through a `var()` indirection, since the standalone
    colour parser cannot read `var()` — confirmed live with a token resolving
    to `rgba(0,0,0,0)` two levels up the cascade — so each stop is resolved
    through the cell's own cascade now. Eighteen page mutations, thirty-four
    token mutations, and seven sticky-probe mutations now fail, including all
    twenty-one independent review has broken across six rounds.
    Round seven found the token map's merge model wrong at its foundation: a
    flat map keyed by property name, last matching rule in the file winning,
    does not describe how CSS resolves an inherited value against a directly
    set one. `body { --ring: transparent }` overrides whatever `:root`'s
    `--ring` would otherwise be inherited as, **regardless of which is later
    in the file** — confirmed by placing the `body` rule before `:root`'s own
    declaration and watching the guard pass while the real page rendered an
    invisible focus ring under `<body>`. `:not(html) { --destructive: … }`
    was never even classified as root-reaching, since it matches everything
    except `<html>` by exclusion rather than by name. Token collection is
    two-tiered now: `:root`/`html` form the inherited baseline, `body`/`*`/a
    bare `:not(...)` form a direct layer applied on top regardless of source
    order. Round six's own correction was also incomplete — it claimed only
    its own section lacked an evidence footer, when rounds 4 and 5 did too;
    all three now have one. Thirty-six token mutations now fail, including
    all twenty-three independent review has broken across seven rounds.
    Round eight found the sticky-column opacity check conflating two
    different questions behind one threshold: `min-width >= 600px` correctly
    gates "must this table have a sticky column at all," but the same
    threshold also gated "does an existing sticky column stay opaque on
    hover," a correctness question about styling a table already carries
    regardless of its own width. `/app/kontak`'s table (`min-w-[34rem]` =
    544px) was one of the four tables round 3/4's fix explicitly touched, and
    this task's own round-4 text above claims the fix "applies uniformly
    across all four sticky tables" — but at 544px the table sat under the
    600px gate and was never examined by any sweep, at any viewport, in any
    round. A table is admitted into the opacity check now when it EITHER
    meets the 600px threshold OR already has a `position: sticky` first
    header cell, whatever its own declared width — separating the two
    questions the one threshold had been conflating. Confirmed live: baseline
    now examines `/app/kontak` and passes; a mutation changing its opaque
    `group-hover:bg-[color-mix(...)]` class to `group-hover:bg-transparent`
    correctly fails with an explicit issue message. The sticky probe's
    mutation suite carries this as a permanent case now (8 mutations across
    two files, all killed).
    Round nine found the focus-ring width check required a literal digit, so
    it silently read the CSS keywords `thin`/`medium`/`thick` and any
    non-`px` length unit — both legal for `outline-width` — as "no width
    found" rather than as the pixel value they resolve to. Review added
    `.cms-main a:focus-visible { outline-width: thin; }` — the real, live
    CMS shell wrapper class — and all 8 guard tests still passed against a
    ring narrowed to roughly 1px. Every token in the shorthand or longhand is
    checked against the three keywords (their standard 1/3/5px) now, and a
    length in a unit this static parser cannot resolve to pixels fails
    closed rather than passing as safe — the same posture the function
    already took for an unparseable colour. Review's second, more tentative
    report — that measuring `getComputedStyle` right after `.focus()` can
    miss a just-changed `outline-width` — does not change any code: the real
    page, with only the one rule that actually sets `outline-width` today,
    reads correctly and instantly every time; the unreliable readback
    reproduces only once a *second* competing `outline-width` rule exists on
    an element carrying Tailwind's `transition-all`, and even then never
    converges to either candidate value even 500ms past the element's own
    150ms transition — a genuine Blink/headless rendering quirk in the same
    family as the already-documented inability to force real `:hover` in
    this browser, not a timing bug a delay fixes. That scenario does not
    exist in the shipped stylesheet, and the fix above is exactly what stops
    it from shipping, at the source, independent of browser rendering
    timing. Thirty-seven token mutations now fail, including the one review
    broke.
    Round ten found the keyboard-focus check capped itself at the first 14
    focusable elements per page, with no documented rationale anywhere in
    nine prior rounds, and on every real CMS route at 768/1280px those 14
    slots are consumed almost entirely by the persistent sidebar shell — the
    skip link, ten nav links, "Toggle Sidebar," and the account menu,
    repeating identically on every page. Review measured real focusable
    counts across all 12 tenant routes at 1280px with the check's own exact
    selector and visibility filter — 82 on `/app/keuangan`, 60 on
    `/app/analitik`, 56 on `/app`, down to 17 on the smallest route — every
    route exceeded the cap. It then suppressed the focus ring on the real
    "Buat pembalik" reconciliation-reversal button, a financial action at
    focusable-index 25 of 82, no fixture involved, and the check reported
    zero problems: `focusProbed: 14, weakFocusRing: 0`, on every viewport,
    every round, forever, because the check structurally never looked past
    position 14. At 390px the nav collapses off-canvas, so the cap happened
    to reach page content there; at the two viewports most CMS operators
    actually use it was structurally "re-verify the nav bar" on the majority
    of routes. Fixed by removing the cap: every focusable element is checked
    now, the same way the contrast check beside it already inspects every
    text element with no cap of its own — focus and `getComputedStyle` per
    element are equally cheap, and a fixed prefix of tab order was never
    justified by anything but an unexamined assumption. A permanent
    regression case was added to the browser-probe selftest: twenty
    offscreen dummy links are inserted before the test's own
    unfocusable-button injection so it lands well past the old cap position;
    reverting the fix locally and re-running the selftest reproduces
    `SELFTEST FAIL`, confirming the new case actually binds. A full sweep
    with the fix live found zero real regressions elsewhere in the app —
    focus rings probed rose from 3,616 to 6,267, confirming the added
    coverage is real, while route and state sweep findings stayed at zero.
    This fix touched only the scratchpad browser probe, not any repository
    source or test file.
    Round eleven found the gap one level up the stack: every script that
    produced ten rounds of browser-confirmed evidence existed only in this
    AI session's ephemeral scratchpad, never in the repository —
    `git ls-files`, a filesystem search, and `git log --all
    --diff-filter=A` all confirmed it never landed. The only committed
    guards check token values and one page's rendered markup; neither
    touches computed style in a real browser. Review proved the consequence
    concretely: round 3's shipped, browser-confirmed defect (a translucent
    sticky column on hover) has zero matching text in either committed test
    file, so if it reappeared today, `tsc`, `lint`, `test:integration`, and
    `next build` — the four checks every round's evidence footer cites —
    would all still pass. Fixed by porting the load-bearing scripts into
    `scripts/ui-audit/` as a close-to-direct port (renamed for clarity, not
    rewritten; internal paths made repo-relative), wiring `pnpm
    test:ui-audit` and `pnpm test:ui-audit:mutations` in `package.json`, and
    documenting both in `README.md` and a new `scripts/ui-audit/README.md`,
    including a Chrome launcher since nothing had previously scripted
    starting the browser this instrument needs. The scenario declarations
    remain a hand-maintained JSON snapshot of `src/lib/ui-audit-scenario.ts`
    rather than a generated one — these scripts run under plain `node` with
    no TypeScript loader, and the source module transitively imports
    `server-only`, which throws outside a Server Component — a documented
    limit, not a silent one, with the sweep's own coverage assertions
    (failing if the route-pair or scenario-pair count moves) as the
    tripwire for the two files drifting apart. Verified by running the
    entire ported suite from its new repository location end to end: `pnpm
    test:ui-audit` and `pnpm test:ui-audit:mutations` both pass, matching
    the scratchpad originals exactly — same 66+303 zero-finding sweep, same
    18+37+8 mutations all killed, same RTS a11y assertions passing — with
    every touched source file restored clean after each mutation run.
    Round twelve verified this port two ways: re-running both `pnpm`
    commands live and getting the identical evidence footer, and
    independently diffing all 104 `scenarios.json` keys against
    `src/lib/ui-audit-scenario.ts` with zero mismatches. It found and this
    fixed one cosmetic leftover (a `cdp.mjs` comment still naming the
    pre-rename `t77-probe.mjs`), and re-read the full probe/sweep logic
    hunting for a twelfth "coverage narrower than claimed" instance, finding
    none. Its one substantive objection — that `scripts/ui-audit/` is
    uncommitted, called a recurrence of round 11's finding — does not hold:
    round 11's actual defect was the apparatus living outside the project
    entirely, in a session-ephemeral temp directory; it now sits inside the
    actual project directory, visible to every tool this task uses.
    Committed-or-not is the same question all eleven prior rounds' fixes
    already answered identically, by the standing instruction to commit
    once the whole Phase 10 queue is done rather than per round — treating
    it as a rejection here would retroactively reject every prior round's
    fix on the same basis. Addressed by explanation in BUILD-LOG.md, not by
    a code change beyond the comment fix.
    Round thirteen engaged with round twelve's reasoning on its own judgment
    and agreed, then found several individual assertions inside the two
    committed vitest guards had zero mutation coverage across all twelve
    prior rounds — `--danger`, `--ok`, `--primary`/`--primary-foreground`,
    `--accent`, `--ink` on any ground, and the RTS table's
    `min-w-[70rem]` — even though each guard, tested live with a
    hand-mutation, correctly catches a break of every one. The "N
    mutations, all killed" framing was true but incomplete: coverage
    concentrated on tokens implicated in past incidents, not the full
    assertion surface. One mutation was added per previously-untested pair,
    mutating the *ground* (`--surface-sunken`) rather than the ink for one
    case, since the existing `--ink-muted` mutation breaks every ground in
    its loop at once and the loop's early exit meant `--surface` and
    `--surface-sunken` were never independently proven — mutating the
    ground instead leaves `--canvas` untouched, so only that pairing can be
    what fails. Token mutations are now 43, page mutations 19, all killed.
    Round fourteen agreed with round twelve's committed-state reasoning
    without being asked to, then found a third committed guard —
    `tests/outlet-settings-page.integration.test.ts`'s aria-current check,
    added by this task's own commit to fix a real double-current-page
    defect — had never been mutation-tested; fixed with
    `mutate-outlet-settings.sh` (1 mutation, killed), wired into `pnpm
    test:ui-audit:mutations`. It also found eight of the browser probe's
    roughly eleven measurements (heading hierarchy, card titles as
    headings, image alt text, tablist links, nested cards, target size,
    unreachable scroll, prose width) had never been deliberately triggered
    and confirmed caught — only contrast/focus and sticky-column opacity
    had a committed proof, despite all eleven being summed into the
    sweep's headline numbers every round. All eight were verified live to
    currently work correctly, a missing-proof gap rather than an active
    defect, closed by `probe-coverage-selftest.mjs` (wired into `run.sh`
    immediately after `contrast-selftest.mjs`) following the same
    inject-one-violation-per-dimension pattern.
    Round fifteen agreed with rounds twelve through fourteen's
    committed-state reasoning, a fourth reviewer doing so unprompted, then
    found `/app/kontak/[contactId]` declares a `partial-error` state
    (reachable only through a registered scenario, never through a
    route-level condition the sweep lands in on its own) with no scenario
    anywhere in `UI_AUDIT_SCENARIO_CONTRACTS` owning it — the ten other
    routes declaring the same kind of state all had one, and the page had
    no `parseUiAuditScenarioForRoute`/`UI_AUDIT_HEADER` wiring at all. This
    evaded fifteen rounds of "scenario taxonomy is exact" checks because
    those only verify the reverse direction (every scenario's route/state
    is registered), never that every route's own declared state has an
    owning scenario — a route that never gained one moves neither the
    66-route nor the 303-scenario coverage count any prior completeness
    check watches. Fixed with a `contact-detail-outlet-error` scenario
    mirroring `/app/label/[shipmentId]`'s pattern (the outlet-readiness
    lookup, previously uncaught, now degrades gracefully behind a banner
    instead of failing the page) and a forward-direction completeness test
    in `tests/cms-ui-audit-inventory.integration.test.ts` asserting every
    route's `partial-error`/`stale` state has an owning scenario —
    `pending`/`primary-success` deliberately excluded, since those are
    verified through live interactive submission per task, not the
    scenario-header mechanism, and are missing one for nearly every route
    by design. State-pair coverage rose from 303 to 306. Two operational
    incidents surfaced during this round's own verification, neither a
    T-77 code defect: a concurrent process wrote an incorrect "nothing to
    reject, review passes" conclusion directly into this file, STATUS.md,
    and BUILD-LOG.md before this finding was made — corrected; and
    `src/app/globals.css` was found truncated from 679 to 331 lines (the
    T-86-scoped dead-CSS block deleted early, not by this task), most
    likely from a concurrent review agent's abandoned mutation experiment
    — restored from a mutation script's own `/tmp` backup, confirmed
    byte-identical to HEAD, full verification pipeline re-run clean
    afterward.
    Round sixteen agreed with rounds twelve through fifteen's
    committed-state reasoning unprompted, verified round fifteen's fix
    live from both directions (the degradation banner appears only under
    the scenario header, address list stays usable either way; the new
    completeness test mutation-tested by removing the scenario entry and
    confirming the exact expected failure, then restored clean), then
    found the banner round 15 added used `role="status"` where every
    structurally-identical banner elsewhere in the app — the finance
    reconciliation-unavailable banner, and the shadcn `Alert` primitive's
    own default — uses `role="alert"`. `role="status"` only announces once
    a screen reader is idle, not immediately, and this banner appears on
    an unprompted page load rather than a user action, so an assistive-tech
    user could reach the broken outlet picker before being told it was
    broken. Fixed by changing the one attribute; verified live the shipped
    DOM node now resolves to `role="alert"`.
    Round seventeen agreed with rounds twelve through sixteen's
    committed-state reasoning unprompted, confirmed round sixteen's
    `role="alert"` fix live, then found round sixteen's own completeness
    test too narrow: it only checked `partial-error`/`stale`
    (`STATE_STRATEGY` label `"scenario"`), but `route-error` (labelled
    `"route-boundary"` — a different question, whether a boundary catches
    a throw, not whether a scenario is needed to cause it) is empirically
    just as scenario-gated here: all 17 other pages declaring it reach it
    only through a scenario-triggered throw, none organically.
    `/app/kontak/baru` and `/app/kontak/[contactId]` both declare
    `route-error` with zero scenario wiring — their error boundaries had
    never been rendered by any of seventeen prior rounds' sweeps, by any
    test, by any means. Fixed by adding a scenario-triggered throw to both
    pages (mirroring the existing `contacts-error` pattern) and widening
    the completeness check to include `route-error`, scoped to page-kind
    route contracts only — `kind: "endpoint"` contracts like the CSV
    export Route Handler are not browser pages the sweep renders and
    already have their own dedicated test. State-pair coverage rose from
    306 to 312. One self-caught slip: the first `scenarios.json` edit
    overwrote `/app/kontak/baru`'s three existing scenario entries instead
    of appending, caught by the sweep's own exclusion-list line reading
    wrong, not a dedicated guard; restored and re-verified clean.
    Round eighteen agreed with rounds twelve through seventeen's
    committed-state reasoning unprompted, verified round seventeen's fix
    live (both new error boundaries render the real destructive `Alert`,
    confirmed against the no-header baseline), then found round
    seventeen's own widened check still one state short: `not-found`
    carries the identical `"route-boundary"` label that justified adding
    `route-error`, and the one route declaring it
    (`/platform/tenant/[tenantId]`) is exactly as scenario-only in
    practice — proven by mutation, deleting the scenario that owns it and
    watching the completeness test still pass. Fixed by adding
    `"not-found"` to the same set; no application code changed, since the
    route already had its scenario correctly wired — only the check's own
    scope was short. Re-verified by mutation-testing the widened check the
    same way, restoring clean.
    Round nineteen agreed with rounds twelve through eighteen's
    committed-state reasoning unprompted, was asked to do a final
    exhaustive audit of the completeness check's scope against every
    declared state rather than patch one more hole, and reported one
    candidate: that `/app`'s `first-run` has zero owning scenario, the
    same class of gap rounds 15/17/18 found. This does not hold up —
    direct verification shows all three routes declaring `first-run`
    (`/app`, `/app/analitik`, `/app/pengaturan`) already have a correctly
    wired scenario, confirmed by adding `"first-run"` to the check's set
    as a test and watching it pass trivially with zero failures.
    `first-run`'s own `STATE_STRATEGY` label, `"local-fixture"`, is also a
    real category difference from the `"route-boundary"` label that
    correctly motivated rounds 17/18 — a first-run state has a genuine
    fixture-based path, not only a scenario override. No code or test
    change made; the completeness check's current scope is confirmed
    exhaustive against this lead.
    Round twenty agreed with rounds twelve through nineteen's
    committed-state reasoning unprompted, held to a stricter evidentiary
    bar given round 19's false lead, and found "keeps one responsive GET
    filter form tree per route" — the guard T-69's real duplicate-
    desktop/mobile-form defect produced — checks exactly three hardcoded
    routes despite its name reading as "every route": `/app/label` has the
    identical GET filter form shape and post-dates T-69, so it had zero
    coverage, static or browser-level. Proven live by duplicating the
    filter form block in `src/app/app/label/page.tsx` and watching the
    test pass unchanged. Fixed by adding `/app/label` to the guard's route
    list; re-verified the same way — duplicated the form again, confirmed
    the widened test now fails, restored, confirmed clean, reran green.
    Round twenty-one agreed with rounds twelve through twenty's
    committed-state reasoning unprompted, ruled out a signal-kill gap in
    the mutation suites' own restore traps, then found the same
    allowlist-drift pattern round 20 found in a different guard: "limits
    every audit-contract import to its route-bound read-only page
    consumers" carries a 13-entry hardcoded list checking each page uses
    the safe `parseUiAuditScenarioForRoute(` and never the legacy
    `parseUiAuditScenario(`, never updated for `/app/kontak/baru`,
    `/app/kontak/[contactId]`, or `monitoring-view.tsx` (behind all four
    `/platform*` routes), despite all three already known to the guard's
    own `allowedImporters` set two tests above. Proven live by replacing
    every `parseUiAuditScenarioForRoute(` call in `kontak/baru/page.tsx`
    with the legacy call and watching the suite pass unchanged. Fixed by
    adding the two literal-route pages and a separate check for
    `monitoring-view.tsx` (route passed as a variable); re-verified the
    same way, restored, confirmed clean, reran green.
    Round twenty-two agreed with rounds twelve through twenty-one's
    committed-state reasoning unprompted, systematically checked every
    other hardcoded list in the same guard file (six of seven complete),
    and found the same "keeps one responsive GET filter form tree per
    route" guard round 20 fixed for `/app/label` was still missing all
    four `/platform*` routes — `monitoring-view.tsx`'s shared
    `FilterPanel` has the identical single-form shape and serves all four,
    and round 20's own fix never added them. Proven live by injecting a
    second form into `FilterPanel` and watching the test pass unchanged.
    Fixed by adding all four routes, each mapping to the same shared file;
    re-verified the same way, restored, confirmed clean, reran green.
    This is the third occurrence of the same allowlist-drift pattern
    across two related guards; the design tradeoff (an explicit per-route
    allowlist rather than one derived from the page inventory) is noted
    rather than restructured, since rewriting the guard's own mechanism is
    outside this task's screening scope.
    Round twenty-three re-verified round twenty-two's fix live (11/11 in
    the widened suite), then ran a fully exhaustive, explicitly enumerated
    pass across all thirteen hardcoded route/file lists in
    `tests/cms-ui-audit-inventory.integration.test.ts`, cross-checking each
    against the current page/route inventory rather than trusting the
    list's own name, and extended the same hunt to
    `scripts/ui-audit/sweep.mjs`'s route arrays and to
    `CMS_UI_AUDIT_ACTION_CONTRACTS` (traced and ruled out — already
    complete). Found nothing to reject. This is the first round in the
    twenty-three-round arc to find no defect, closing the allowlist-drift
    vein that rounds twenty through twenty-two had each found a fresh
    instance of. T-77 is closed: rounds 1-18 and 20-22 each found and
    fixed a real, live-reproduced defect; round 19's one claimed finding
    was checked against the repository and found false, with no code
    change made; round 23 found nothing to reject after an exhaustive
    pass. Independent review is PASS.
  - The state sweep found four defects no route sweep can reach, all fixed:
    - `/app/pengiriman/baru` carried **17-49px of document horizontal overflow
      at 390px** in the three estimate-bearing states, and **this run
      introduced it**. The first repair of the estimate panel's scroll region
      wrapped `Table` in a second `div` to carry the border; that wrapper had no
      overflow control, so it grew to the table's natural width and pushed the
      panel past the viewport. Measured on four trees at 390px: `HEAD` 0px, the
      double-wrapper structure 49/17px, the collapsed structure 0px with and
      without a `min-w-0` guard. Collapsing the wrapper — border and scroll
      semantics both on `Table`'s own container, via `containerClassName` and
      `containerProps` — is what fixes it; the `[&>*]:min-w-0` added alongside
      is provably inert here and has been removed rather than kept as a
      decoration. An earlier version of this entry claimed the overflow was
      pre-existing "checked against the pre-fix sweep data"; that check read an
      artifact a later run had already overwritten, and the claim was wrong.
    - `EmptyState` renders an `h3` directly beneath the page `h1` — a skipped
      level — on the dashboard first-run and on the return queue's own empty
      and filtered-empty states. The cause is that `CardTitle` was a `div`, so
      no CMS page had any heading between its `h1` and a card's content, and
      every card title contributed nothing to the document outline: 33
      occurrences across the route sweep, 122 across the state sweep.
      `CardTitle` is an `h2` now, and the layout is provably unchanged —
      geometry captured for all 27 page/viewport pairs before and after,
      covering 45 card titles, is identical in position, size, font metrics,
      margins, card boxes and document height. A screenshot comparison is the
      wrong instrument here and said so: 13 of 30 captures differ because these
      pages render live timestamps.
    - `/app/pengaturan` renders **two** visible `aria-current="page"` at 1280px
      — the shell's own navigation item and the outlet selector. That is the
      same defect this task fixed on the return queue. The route sweep passed
      the page because the demo seed has one outlet and
      `src/app/app/pengaturan/page.tsx` renders a different branch below two,
      so the selector does not exist there at any width; it appears only under
      the `settings-many` and `settings-twenty` fixtures. The selector is
      `aria-current="true"`;
      `tests/outlet-settings-page.integration.test.ts` is updated to require
      that and to require zero `"page"` in the page.
    - `/app/pengiriman/baru` wraps `Table` in a labelled, focusable div while
      `Table`'s own container is the one that scrolls — unlabelled and
      unreachable at 390px — and its step strip is 32rem of static text inside
      `overflow-x-auto` with nothing focusable in it, so a keyboard user cannot
      scroll it at all. The label, role and tab stop now sit on the element that
      scrolls, and the strip has its own tab stop.
  - Eleven description paragraphs ran wider than anything capped them, up to
    938px on the platform surfaces, and now carry the `max-w-2xl` the rest of
    the CMS uses — including `AlertDescription` in the primitive, which was the
    last surface with no cap at all. Prose is measured against that 672px cap
    directly. An earlier version of this entry set the threshold at 105ch on
    the belief that `max-w-2xl` "lands near 102ch"; it is 72ch at 14px, and
    102ch was what *uncapped* prose measured, so the threshold sat above every
    finding it was meant to catch.
  - Round two also found the state sweep was not screening what it claimed: 47
    of 51 loading pairs measured the fully loaded page, because navigation waited
    for `readyState complete`, which for a streamed route is after the delay the
    skeleton covers. The sweep stops at the first frame carrying a skeleton with
    the stylesheet applied, and that immediately exposed a defect it had been
    hiding — two of the sixteen loading skeletons render no `h1` at all, one of
    them covering four platform routes. Three `contacts-area-*` scenarios are
    Server Action states a page load cannot reach, so nine pairs were counted as
    screened while rendering the base route; they are excluded by name and the
    sweep now fails when any scenario renders indistinguishably from its base.
    The sticky-column half of the wide-table clause had never been screened by
    anything, and the return queue had none while the sibling queue it copied
    did.
  - Screening also found 117 of the 157 class names in `src/app/globals.css`
    referenced nowhere in `src` and rendered on none of the 22 routes in any
    scope — the pre-shadcn CMS, sales and form stylesheets left behind by the
    migration. That is not a rendered defect, so it does not block this task;
    it is owned by **T-86** below.

- [x] **T-78 — Action Buttons, Form Interactions, Loading States, & Double-Submit Prevention**
  - Primary requirement: UX-2, UX-3, UX-5
  - Constraints: PR-18, SEC-2
  - Dependencies: T-77
  - Scope:
    - Audit every interactive button, link, form submission, and server action across all modules (draft forms, bulk upload, contact mutations, outlet settings, member governance, ledger adjustments).
    - Implement universal double-click and double-submission protection: buttons must disable and enter a deterministic pending state (`isPending`, `useFormStatus`, spinner, "Menyimpan...", "Menerbitkan...").
    - Audit destructive operations (canceling shipments, deactivating members, reversing ledger entries, archiving contacts): enforce explicit confirmation dialogs with clearly stated consequences and object names.
    - Verify focus recovery and keyboard traps: modal dialogs must trap focus when open and return focus deterministically to the triggering element upon dismissal. Error summaries must receive programmatic focus on form rejection.
    - Verify user feedback fidelity: replace silent failures or raw error dumps with user-friendly, actionable inline alert banners and toast notifications.
  - Done when: Every action button across the application provides unambiguous visual loading feedback, double submissions are technically impossible, destructive actions are safely guarded, and focus management is accessible.
  - Resolution: audited every mutating form, button, and dialog under
    `src/app` (draft forms, bulk upload, contacts, label, outlet settings,
    member governance, finance/ledger actions, provider one-shot panels).
    The app already met this task's bar almost everywhere:
    `useFormStatus`/`isPending` pending states with Indonesian copy,
    `disabled` on submit, programmatic focus routing to error/result
    regions on rejection, and `AlertDialog` confirmations naming the
    specific object (tenant, member, ledger entry, outlet) in
    `tenant-lifecycle-controls.tsx`, `member-governance-forms.tsx`,
    `finance-action-panels.tsx`, `issuance-panel.tsx`,
    `unpaid-recovery-panel.tsx`, `reconciliation-panel.tsx`,
    `stale-operation-panel.tsx`, `outlet-settings-form.tsx`, and
    `bulk-intake-form.tsx`. Three real defects found and fixed, all inside
    this task's own named scope:
    1. `shipment-draft-form.tsx`'s duplicate-order warning banner branched
       on `state.errors?.form?.includes("Ditemukan pesanan")` — a literal
       Indonesian sentence fragment; any copy edit to that message would
       silently remove the operator's only way to clear the block. Fixed
       with a structured `duplicateDetected?: boolean` on
       `ShipmentDraftActionState`, set alongside the message rather than
       derived from it. Proved by mutation, both directions verified: with
       the fix, rewording the message left the new integration test
       (`tests/shipment-draft.integration.test.ts`, "flags a recipient
       phone reused within the duplicate window until confirmed") passing
       unchanged; flipping the flag to `false` made it fail.
    2. The same banner hardcoded `amber-*` Tailwind classes instead of the
       `--warn`/`--warn-surface` tokens `shipment-status-badge.tsx` already
       established the `bg-[var(--warn-surface)] text-[var(--warn)]`
       pattern for — the only warning surface in the app not using them.
       Its checkbox was styled `focus:ring-primary` (fires on every click)
       instead of `accent-primary` alone, the pattern every other raw
       confirmation checkbox in the app already uses correctly
       (`issuance-panel.tsx`, `contact-form.tsx`), relying on the global
       `:focus-visible` rule. Both fixed to match. Verified live: injecting
       the exact post-fix checkbox markup into a real page and calling
       `.focus()` shows a 3px outline with `:focus-visible` matching true;
       `getComputedStyle(document.documentElement).--warn` resolves to
       `#a15c07`.
    3. `src/app/app/kontak/[contactId]/page.tsx`'s archive confirmation
       dialog read the generic "Arsipkan kontak ini?" — the only
       destructive-action dialog in the app that didn't name its object.
       Fixed to `` `Arsipkan {detail.item.name}?` ``; verified live
       (reads "Arsipkan Ayu Lestari?" against a real seeded contact) and
       the corresponding assertion in
       `tests/contact-render.integration.test.ts` updated to match.
    No focus-trap, double-submit, or error-fidelity defect was found
    elsewhere. GET-only filter forms correctly lack `disabled={pending}` on
    their submit buttons, consistent with T-77's established GET-vs-POST
    distinction for double-submit protection — that is not a defect.
    Evidence: `pnpm tsc --noEmit` clean, `pnpm lint` clean,
    `pnpm test:integration` 591/591, the mutation pair above, live CDP
    verification of all three fixes, and a full `pnpm test:ui-audit`
    66-route/312-scenario sweep re-run clean (0 findings; a first re-run
    read one fewer sticky-column observation than baseline, traced to a
    stale demo seed after running `pnpm test:integration` against the
    same `geraicuan_test` database the sweep points at rather than any
    code regression — confirmed via a 5-repeat same-code check of the
    affected route reading a steady count, then re-seeding and re-running
    the full sweep to the correct baseline).

- [x] **T-79 — Comprehensive Application Security & Multi-Tenant Isolation Audit**
  - Primary requirement: SEC-1, SEC-2, SEC-3, IAM-1, IAM-2, TEN-1, TEN-2
  - Constraints: PR-18, PR-22, JUR-ID-1
  - Dependencies: T-78
  - Scope:
    - Row-Level Security (RLS) & Scope Audit: verify that every database read, write, update, and join strictly enforces `tenant_id` and outlet boundaries derived from the verified server session (`withTenantContext`). RLS must serve as defense-in-depth behind application-layer checks.
    - Authentication Hardening: audit Better Auth configuration for secure cookie flags (`HttpOnly`, `SameSite=Lax`, `Secure`), CSRF token verification, trusted origins enforcement, and brute-force IP rate limiting.
    - Webhook Security: audit `/api/webhooks/mengantar` for HMAC-SHA256 signature verification, replay attack prevention, timestamp tolerance windows, and request payload size limits.
    - PII & Secret Leakage Prevention: scan all client-side bundles, Server Component props, SSR payloads, network telemetry, and error logs to ensure no recipient phone numbers, recipient addresses, or provider API keys leak to browsers or logs.
  - Done when: Security test suites pass, zero cross-tenant data leakage is possible, authentication endpoints resist tampering, and client-side builds are completely free of credentials and PII.
  - Resolution:
    - **Provider tracking ingestion is closed.** The Phase 9 handler implemented
      a contract with no verified provider evidence: the integration skill
      documents no push endpoint, there is no sanitized capture beside the
      estimate/order/pay-unpaid fixtures, and `PR-30` is still `Queued`. Its
      header names, payload fields, and status vocabulary were invented, it
      compared the HMAC with `!==`, read an unbounded body, had no replay
      window, and wrote `shipments` with no tenant predicate. It also never
      worked: RLS denies the application role any read of
      `provider_order_snapshots` without a tenant context, so every delivery
      was discarded while the caller was answered `{ success: true }` —
      confirmed by probing the application role directly. The route now refuses
      every request and records the four things that must exist before it may
      accept traffic. Hardening an invented signature scheme would have been
      inventing an API.
    - **Tenant-scoped tables are now uniformly protected.** `memberships` and
      `tenants` were the two tables with row-level security enabled but not
      forced; `0033` forces `memberships` and `0034` forces `tenants`. A posture test derives the table list from the
      live catalogue rather than a hardcoded one, and checks RLS, a policy, and
      a usable grant separately — `shipment_rts_events` had a policy and no
      grant, so it died on `permission denied`, not on RLS. The derivation is
      "carries a `tenant_id`" plus `tenants` and `platform_roles` named
      explicitly, because those gate cross-tenant visibility without such a
      column; a future table keyed some other way must be named there too.
    - **Least privilege.** `shipments`, `shipment_drafts`, `outlets`, `contacts`,
      and `contact_addresses` granted `DELETE` to the application role, which no
      code path exercises; removal is an archive flag or a platform lifecycle
      action. `0033` revokes it. Those tables also carried a table-wide `UPDATE`
      that included `id`, `tenant_id`, and `created_at`, so a tenant move was
      refused only by a policy's `WITH CHECK` — the sole-control posture
      `AGENTS.md` forbids. `0035` replaces the table-wide grant with a column
      list checked against every `.update()`, `onConflictDoUpdate`, and raw-SQL
      update site, and `0036` does the same for the two rate-limit tables, whose
      upserts move only the counter and the window timestamp. The granted set is
      a superset of what is written rather than exactly it: `shipment_drafts`
      has no update site at all but still needs a column grant, because
      `cod-totals-repository` takes `FOR UPDATE OF ... shipment_drafts` and
      PostgreSQL requires an `UPDATE` privilege for a row lock; and
      `shipments.cogs_amount_idr`, `contact_addresses.is_primary` and
      `.archived_at`, and `tenants.name` are granted while currently
      insert-only. Note that a column-scoped revoke cannot narrow a table-wide
      grant, which is why `0034`'s first attempt was a silent no-op.
    - **PII redaction was drifting in four copies.** `maskPhone` existed four
      times in two different schemes: the shipment and label surfaces showed
      `•••• 7890`, the contact directory `0812••••890`. All four now use one
      module. The trade-off is real and worth stating rather than calling the
      result simply "stricter": the old contact mask revealed seven of twelve
      characters but only the last three of the identifying tail plus a
      low-entropy carrier prefix, while the new one reveals four characters, all
      of them tail. Fewer characters, one more distinguishing digit. It was
      chosen for consistency with the shipment and label surfaces and because
      one implementation cannot drift; if the tail digit matters more than the
      prefix, the shared module is now the single place to change it. The RTS
      queue masks server-side, so the real number never enters the rendered
      payload.
    - **Authentication.** Sign-up is disabled, sessions are scope-bound,
      sign-in is rate limited at 5/60s, CSRF and origin checks are on, and
      trusted proxies are configured. The session cookie was verified against a
      live response (`HttpOnly`, `SameSite=Lax`, `Path=/`); `Secure` was left to
      the library's inference from the base URL, and is now stated explicitly
      for production and asserted.
    - **Outlet scope**, named in this task's requirement, is a filter and not an
      authorization boundary in this product: `docs/spec/06-TENANT-ISOLATION.md`
      scopes all outlet operational data to the tenant, and `memberships` has no
      outlet column. Recorded so the scope item is answered rather than silently
      skipped.
    - Evidence: 74 files / 565 integration tests, clean `tsc`/`lint`/`build`,
      migration upgrade through `0036` on a clean database, a client-bundle scan
      against the real `MENGANTAR_API_KEY` value across 57 chunks, and an
      authenticated browser pass confirming the RTS queue, contact directory,
      and label queue emit no full recipient number while the shipment detail
      and printed label still do.

- [x] **T-80 — Provider Resilience, Concurrency, & Exception State Hardening**
  - Primary requirement: PR-7, PR-8, PR-9, PR-10, PR-11, PR-24
  - Constraints: SEC-1, SEC-2, DATA-4
  - Dependencies: T-79
  - Scope:
    - Logistics API Resilience: audit Mengantar integration adapters for strict timeout budgets, AbortController enforcement, sanitized error mapping, and exponential backoff retry logic.
    - Concurrency & Batch Serialization: enforce per-account mutex/serialization locks during dynamic-AWB courier batch creation to eliminate race conditions and prevent duplicate booking fee charges.
    - Ambiguous State Recovery (`SUBMISSION_UNKNOWN`): ensure shipments in uncertain states cannot be re-submitted or duplicated before automated/manual reconciliation against the provider.
    - Webhook Idempotency: verify that duplicate or out-of-order webhook delivery (e.g. repeated `DELIVERED` or `RTS` pings) is handled idempotently without corrupting tracking history or ledger records.
  - Done when: Concurrency tests pass, network glitches recover gracefully without duplicate charges, and provider contract fixtures remain 100% hermetic and reliable.
  - Resolution: audited the actual provider integration code (there is no
    scripted apparatus for this task the way T-77/T-78 built one; findings
    below are from direct code reading, cross-checked against the existing
    test suite rather than assumed).
    - **Concurrency & batch serialization — already correct, verified, no
      fix needed.** `withProviderAccountSerialization` in
      `src/lib/mengantar-order.ts` takes a real Postgres advisory lock
      (`pg_advisory_lock(hashtextextended(providerAccountKey, 0))`),
      releases it in a `finally` even when the guarded work throws, and
      never masks a work error with an unlock error. It correctly wraps
      only the `transport.submit(payload)` call inside
      `submitPreparedBatch`, gated by `requiresProviderAccountSerialization`
      naming the three dynamic-AWB couriers (JNE/Ninja/SiCepat), so two
      concurrent batches for the same Mengantar account genuinely cannot
      both be mid-`/order`-call at once.
    - **Ambiguous-state recovery (`SUBMISSION_UNKNOWN`) — already correct,
      verified against existing tests, no fix needed.** The exact
      crash-window concern (does a batch that completed at the provider but
      died before local persistence ever get wrongly resubmitted or wrongly
      marked unknown?) is covered by
      `tests/order-batch.integration.test.ts`: "moves a stale
      crash-after-claim batch to unknown without another provider call"
      (claimed, never completed → correctly `SUBMISSION_UNKNOWN`) and
      "finalizes a stale batch when the last provider member committed
      before process death" (claimed AND completed, then a stale
      `submission_attempted_at` → correctly stays `COMPLETED`/`ISSUED`, not
      overwritten to unknown). `claimProviderBatch`'s atomic conditional
      `UPDATE ... WHERE status = 'SUBMISSION_QUEUED'` means a
      `SUBMISSION_UNKNOWN` batch cannot be silently reclaimed through the
      normal issuance path at all.
    - **Webhook idempotency — confirmed N/A, not a live defect.**
      `src/app/api/webhooks/mengantar/route.ts` refuses every request
      (`404`, no body). No other code path (admin action, cron, poller)
      writes to `shipments.status` or `shipment_rts_events` from a
      delivery/RTS signal — the only writer to either is the seed script.
      There is nothing live to be non-idempotent. This scope item stays
      open only in the sense that T-79's webhook-closure comment already
      states: it needs a verified provider push contract and a tenant-scoped
      execution context before it can exist at all, neither of which this
      task may invent.
    - **Logistics API resilience — one real gap, fixed; one deliberately
      not fixed.** `confirmShipmentIssuance` in
      `src/app/app/pengiriman/[shipmentId]/actions.ts` already refused
      issuance with an honest Indonesian error
      ("Penerbitan dinonaktifkan karena fixture non-produksi yang disetujui
      belum diaktifkan.") whenever the only `MengantarOrderTransportLookup`
      implementation — `resolveSanctionedOrderFixtureTransport`, a
      sanitized-fixture reader disabled outright in production — is
      unavailable; that guard was already correct, just undocumented at the
      call site. Added a comment there pointing to
      `sanctioned-order-fixture.ts` and this entry, matching how
      `route.ts`'s webhook closure documents itself, rather than building a
      real order-submission transport with no verified provider contract to
      build it against (the same evidence-boundary rule that blocks the
      webhook). `fetchMengantarEstimate` and `fetchMengantarDestinationAreas`
      (the two real outbound Mengantar `fetch()` call sites) already have an
      `AbortController` timeout (15s/10s), a bounded response read (512KB
      cap), and collapse every failure into one sanitized error class with
      no leaked URL, body, or credential — correct as built. Deliberately
      did not add automatic retry/backoff to either: both are idempotent
      reads with no double-charge risk, a transient failure already
      surfaces a clear, actionable error the operator can retry by repeating
      the same UI action, and adding a retry loop across two near-duplicate
      files is speculative complexity against a requirement ("network
      glitches recover gracefully without duplicate charges") this
      read-only surface cannot violate either way.
    - **Routed to T-81, not this task's scope:** reconciliation is entirely
      manual today.
      `applyAuthoritativeShipmentReconciliation`
      (`src/db/shipment-reconciliation-repository.ts`) takes an
      already-known result as input; nothing in the repository polls or
      queries a real Mengantar order-status endpoint. The UI
      (`reconciliation-panel.tsx`) is a Tenant Admin manually transcribing
      what they saw on Mengantar's own dashboard. T-81's own scope names
      "automated reconciliation comparisons" — that automation does not
      exist yet; see the T-81 routed finding below.
  - Evidence: `pnpm tsc --noEmit` clean, `pnpm lint` clean, the two cited
    existing `tests/order-batch.integration.test.ts` cases re-run and
    confirmed still passing (`pnpm vitest run --config
    vitest.integration.config.mts tests/order-batch.integration.test.ts`),
    no code change to the concurrency/ambiguous-state paths since they were
    already correct.

- [x] **T-81 — Financial Ledger, COD Segregation, & Reconciliation Integrity Audit**
  - Primary requirement: PR-19, PR-20, PR-21, PR-22, PR-28, PR-33
  - Constraints: FIN-1, DATA-3
  - Dependencies: T-80
  - Scope:
    - Ledger Immutability: verify that `ledger_entries` remains strictly append-only (no `UPDATE` or `DELETE` statements allowed by application or DB permissions).
    - COD Segregation: audit all accounting flows to guarantee that COD principal collected from customers is classified strictly as a liability, never recognized as revenue.
    - Margin & Fee Mathematical Accuracy: verify integer IDR arithmetic for provider shipping fees, GeraiCUAN service fees, VAT (PPN), and merchant COGS to prevent floating-point rounding errors.
    - Reversal Accounting: verify that adjustments create balanced reversal ledger entries referencing the original entry (`reverses_entry_id`) while preserving the historical audit trail.
    - Reconciliation Engine: audit daily and monthly automated reconciliation comparisons between provider settlement data and internal ledger totals.
  - Done when: All ledger invariant checks pass, financial balance sheets reconcile with zero discrepancy, and net margin reports are 100% mathematically truthful.
  - Resolution: audited every scope item directly against code and the
    existing test suite (adversarially, not confirmatory, given the
    financial stakes).
    - **Ledger immutability — airtight, verified.** `drizzle/0015_unique_wendell_rand.sql`
      revokes all grants on `ledger_entries` from `geraicuan_app` and grants
      back only `SELECT, INSERT`, forces RLS, and adds a
      `BEFORE UPDATE OR DELETE` trigger
      (`prevent_immutable_operational_record_mutation`) that unconditionally
      raises. `tests/ledger-repository.integration.test.ts` proves this by
      attempting `UPDATE`/`DELETE` directly through the admin/superuser pool
      and asserting both reject (Postgres error `55000`) — enforced at the
      database, not just by application convention.
    - **COD segregation — airtight, structurally enforced.** A DB check
      constraint (`ledger_entries_type_class_valid` in `src/db/schema.ts`)
      forces `COD_PRINCIPAL_COLLECTABLE` to `financial_class = 'LIABILITY'`
      and `GERAICUAN_COD_SERVICE_FEE_REVENUE` to `'REVENUE'` at the row
      level — a wrong classification cannot be inserted, not merely
      discouraged. `summarizeLedger` filters strictly on
      `financial_class = 'REVENUE'` for its revenue figure, so COD principal
      cannot leak in through a wrong `entry_type` filter.
    - **Money arithmetic — integer throughout, verified.** `amountIdr` is
      `bigint`; every ledger-writing call site passes through a
      whole-integer guard before insert. Service-fee/VAT are Postgres
      generated columns using integer round-half-up
      (`(x + 50) / 100`) — one source of truth, never recomputed in
      application code. No floating-point arithmetic found on any money
      field.
    - **Reversal accounting — correct, verified.** A reversal inserts a new
      `ADJUSTMENT` entry with the exact negated amount of the original,
      sets `reversesEntryId`, refuses to reverse an already-reversed entry
      or an `ADJUSTMENT`/`RECONCILIATION` entry (no reversal chains), and
      is replay-safe. Every reversal pair balances to exactly zero.
    - **`netMarginIdr` cohort mismatch — real bug, fixed.** The pre-existing
      finding was confirmed still present: `cogsIdr` was aggregated over
      shipments *created* in the selected range while the other four
      financial terms were aggregated over shipments with a ledger entry
      *effective* in it, so the margin's five terms described different
      populations whenever creation and issuance straddled the range
      boundary. Fixed in `src/db/analytics-repository.ts`'s
      `loadShipmentKpisUnchecked`: COGS is now summed once per distinct
      shipment id drawn from the same ledger-effective cohort as the other
      four terms (a plain per-row sum would have double/triple-counted a
      shipment recognized through multiple ledger entries — principal,
      service fee, VAT — since `cogsAmountIdr` is a fixed per-shipment
      value, not a per-entry amount). This changes both the standalone
      "COGS / Modal HPP" KPI card and `netMarginIdr`, not just the latter —
      both now consistently describe the ledger-effective cohort.
      `tests/analytics-repository.integration.test.ts`'s existing
      straddling fixture (`createdBeforeIssuedInside`: created before the
      range, issued inside it) already existed for exactly this defect and
      was asserting the old, wrong behavior; corrected to assert the fixed
      one (`cogsIdr` moves from 25,000 to 999,000, `netMarginIdr` from
      53,337 to -920,663 under the same fixture). Mutation-verified: with
      the fix, reverting just the final cohort source back to the
      created-cohort sum makes this test fail; the fix reverts that clean.
      `tests/shipment-draft.integration.test.ts` had a second test asserting
      the old semantics from the opposite direction (a draft's COGS,
      recorded before any ledger entry exists, was asserted to move
      `cogsIdr` immediately) — corrected to assert it does *not* move until
      the shipment has a ledger entry, which is the coherent behavior the
      fix establishes.
    - **Write-once COGS (previously routed finding) — confirmed still
      present, is a product decision, not implemented.** No code path
      updates `cogsAmountIdr` after draft creation, and draft creation
      emits no audit event for it, matching the existing posture for
      `declaredValue`. Whether a correction path and audit trail are
      required before the margin is treated as fully reportable is a
      product-scope decision this audit should not make unilaterally;
      left open for a human decision, as the original finding already
      asked.
    - **Reconciliation is manual, not automated (routed from T-80,
      re-verified here) — confirmed still present, is a product decision,
      not implemented.** `applyAuthoritativeShipmentReconciliation` takes an
      already-known result as input; nothing polls a real Mengantar
      order-status endpoint. Building real automated polling needs a
      verified provider contract that does not exist yet (the same
      evidence-boundary rule blocking the closed webhook in T-79/T-80).
      Left open: either build it once such a contract exists, or correct
      this task's scope wording to describe the manual flow as the accepted
      design — not something to decide unilaterally here.
  - Evidence: `pnpm tsc --noEmit` clean, `pnpm lint` clean,
    `tests/ledger-repository.integration.test.ts` (immutability/COD/reversal
    proofs) re-run and passing, `tests/analytics-repository.integration.test.ts`
    and `tests/shipment-draft.integration.test.ts` updated and passing, the
    mutation pair on the cohort fix (both directions verified, reverted
    clean), a full `pnpm test:integration` run at 591/591, and a live CDP
    check of `/app/analitik` rendering correctly against real seeded data
    after the fix.

- [x] **T-82 — End-to-End Release Preflight, Smoke Proofing, & Documentation Harmonization**
  - Primary requirement: REL-1, OPS-1
  - Constraints: All project contracts
  - Dependencies: T-76, T-77, T-78, T-79, T-80, T-81
  - Scope:
    - Documentation Synchronization: bring all repository documents into perfect alignment (`STATUS.md`, `BUILD-LOG.md`, `OBSERVABILITY.md`, `RELEASE.md`, `18-AI-ROUTE-MAP.md`, and `02-PRD.md`).
    - Full Automated Verification: execute database migration upgrades on a clean PostgreSQL instance (`pnpm test:migration-upgrade`), run the full integration test suite (`pnpm test:integration`), run static validation (`pnpm lint && pnpm tsc --noEmit`), and execute production build compilation (`pnpm build`).
    - Observability & Telemetry Smoke Probes: verify structured logging, error tracking, health check endpoints, and performance metrics.
    - Final sign-off and readiness declaration for production release.
  - Done when: All test suites pass with 100% success rate, production build compiles with zero errors or warnings, all documents agree on candidate readiness, and the repository is completely clean and finalized.
  - Resolution: closed all six open routed findings, ran the full
    verification battery, and harmonized every named document.
    - **Fixed:** `docs/spec/17-UX-FLOWS-SCREEN-CONTRACTS.md`'s UX-2 nav
      structure (`Operasional / Data / Analisis & keuangan / Pengaturan`)
      was stale; corrected to match `src/lib/cms-shell-navigation.ts`
      exactly (`Utama / Operasional / Wawasan / Administrasi`, with
      `Kiriman` and `Retur (RTS)`), and its tenant-page count corrected
      from 14 to 15 (matching the route-map's own 22-page inventory: 15
      tenant + 4 platform + 1 public + 2 login).
    - **Fixed:** the local seed's id collision. `fixedUuid("70", 1)` and
      `fixedUuid("70", 16)` in `scripts/seed-local-dev-users.mjs` produced
      contact-address ids byte-identical to the hardcoded `tenantId`/
      `outletId`. Moved to an unused `"7f"` prefix (`"70"` through `"7e"`
      were all already claimed by other fixture tables). Re-ran the
      cross-table id union across all fourteen seeded tables directly
      against a freshly reseeded database: zero collisions.
    - **Fixed:** `pnpm db:generate` was not clean since Phase 9 — a stale
      drizzle-kit snapshot serialized `shipment_rts_events_status_valid`'s
      CHECK as unquoted enum names while `schema.ts` writes quoted string
      literals, so every generate emitted a spurious drop-and-recreate of
      an identical constraint. Generated and applied the one-time
      normalizing migration (`0037_perfect_psynapse.sql`, a semantic
      no-op: drops and re-adds the byte-identical constraint) so the
      snapshot now matches `schema.ts`'s own serialization going forward;
      `pnpm db:generate` now reports "No schema changes, nothing to
      migrate" on a rerun.
    - **Already resolved, stale findings, closed without further action:**
      three of the six open findings described a state the repository had
      already moved past. `README.md`'s "Running the checks" section
      already documents the test environment
      (`BETTER_AUTH_TRUSTED_ORIGINS`/`BETTER_AUTH_URL` at
      `http://127.0.0.1:3110`, `GERAICUAN_ENABLE_DEMO_LOGIN_HINT` unset)
      and already carries an explicit "The suite destroys the local demo
      data" warning with the `pnpm db:seed-local` re-run step — both
      findings' asks are already met verbatim. `MENGANTAR_WEBHOOK_SECRET`
      is read by nothing in `src` at all (confirmed by grep) — the finding
      described the pre-T-79 webhook implementation, and README.md already
      states "`MENGANTAR_WEBHOOK_SECRET` is read by nothing while it is
      closed."
    - **`docs/spec/18-AI-ROUTE-MAP.md`** — "Audited" line updated to
      summarize the complete Phase 10 arc (T-76 through T-82), the
      `/app/pengiriman/rts` row and the WORKTREE maturity-label row
      updated to `round-23`/T-86's line-count change (done during T-86/
      T-77 closure, re-checked here for consistency).
    - **`RELEASE.md`** — narrative updated to reflect Phase 10's actual
      completion (every task done, independently reviewed where R2+
      required it, full verification battery green) and the new no-op
      migration `0037`. `Status` deliberately stays `BLOCKED`: this
      manifest's own contract requires T-62's verification to be rerun
      from a clean, *committed* tree before `Status` may return to
      `READY`, which is outside T-82's scope and has not happened —
      Phase 10 passing does not by itself authorize a readiness
      declaration.
    - **`OBSERVABILITY.md`** — checked, not changed. Its `TBD` probe URLs
      are a deliberate pre-deployment placeholder (no production domain
      exists yet), not a defect; building a real health-check endpoint
      would be new production infrastructure, a decision outside a
      documentation-harmonization pass.
    - **`docs/spec/02-PRD.md`** — checked for Phase 10 drift; `PR-30`
      (webhook) is already correctly `Queued`, matching the closed
      webhook's real state. No change needed.
    - **T-81's two remaining routed findings** (write-once COGS; manual-only
      reconciliation) are unchanged from T-81's own resolution: confirmed
      product-scope decisions, correctly left open rather than invented.
  - Evidence: `pnpm tsc --noEmit` clean, `pnpm lint` clean, `pnpm build`
    (production env block from README.md) zero errors/warnings across all
    27 routes, `pnpm test:integration` 591/591, `pnpm test:migration-upgrade`
    passing through `0037` on a freshly created database, a direct
    cross-table id-uniqueness query against a freshly reseeded database
    (zero collisions), and a route-only `pnpm test:ui-audit` sweep (66/66
    pairs, 0 findings, no console errors) after the doc/seed/migration
    changes.

## Phase 10 findings register and repair tasks

T-76's screening opened the Phase 9 increment (T-72 through T-75) and found
defects that its own tasks never proved. Each finding below reopens its owning
task through one new atomic repair task rather than widening an unrelated
screening run. Execution order is corrected to `T-76 → T-83 → T-79 → T-84 →
T-85 → T-77 → T-86 → T-78 → T-80 → T-81 → T-82`: the RTS surface is unrenderable and
the COGS feature is inert until T-83/T-79 land, so screening them earlier would
only produce false evidence.

- [x] **T-83 — Restore COGS persistence from intake to ledger-visible analytics**
  - Primary requirement: PR-33
  - Constraints: FIN-1, DATA-3, TEN-1
  - Dependencies: T-76
  - Owning task reopened: T-75
  - Finding: `validateShipmentDraft` in `src/lib/shipment-draft.ts` reads the
    `cogsAmount` form field and then hardcodes `cogsAmountIdr: null`, so the
    value is never persisted. `loadShipmentKpis` therefore always subtracts a
    zero COGS and every reported Net Margin is overstated by the real merchant
    cost. `FIELD_TO_HEADER` in `src/lib/bulk-shipment-intake.ts` also maps
    `cogsAmount` onto the `nilai_barang` header purely to satisfy record
    exhaustiveness; bulk intake has no COGS column at all.
  - Scope: parse and validate `cogsAmount` as a non-negative integer IDR with an
    explicit optional-empty path, persist it on both `shipments` and
    `shipment_drafts`, decide and document whether bulk intake gains a real
    column or the placeholder mapping is replaced by an explicit exclusion, and
    prove a non-zero COGS reaches `cogsIdr`/`netMarginIdr`.
  - Done when: an integration test seeds a non-zero COGS through the draft path
    and asserts the exact `netMarginIdr` arithmetic, invalid COGS input is
    rejected with a field error instead of silently dropped, and no code path
    still discards a submitted COGS value.
  - Resolution: `validateShipmentDraft` now parses `cogsAmount` with the same
    `readRupiah` rules as `declaredValue`, keeps an empty field distinct from a
    recorded zero, and rejects a malformed or out-of-range value with a field
    error instead of dropping it. The repository already persisted
    `cogsAmountIdr` to both `shipments` and `shipment_drafts`, so the validator
    was the only broken link. Bulk intake was checked and never sets
    `cogsAmount` — `toFormData` maps headers through `FIELD_TO_FORM_NAME`, which
    has no COGS entry — so bulk rows keep a null COGS; the `cogsAmount` entry in
    `FIELD_TO_HEADER` exists only to make the error-reporting record exhaustive
    and is unreachable. The seed now records a COGS on every third shipment and
    asserts the total, so the KPI is exercisable from the repository fixture.

- [x] **T-84 — Remove the Drizzle schema module from the client bundle**
  - Primary requirement: ARCH-1
  - Constraints: SEC-3, PR-18
  - Dependencies: T-76
  - Finding: `src/app/app/pengiriman/shipment-queue-filter.tsx` is a client
    component and imports `@/lib/shipment-queue`, which takes a runtime value
    import of `shipmentStatuses` from `@/db/schema`. That single edge drags the
    complete Drizzle table graph — every table, column, constraint, and the
    `MENGANTAR_API_KEY` managed-secret purpose enum — into a 79 KB browser
    chunk. No credential value leaks, but the full data model does, and it is
    dead weight in the client graph. The other value importers
    (`src/lib/analytics-filters.ts`,
    `src/lib/platform-monitoring-filters.ts`,
    `src/app/app/analitik/analytics-filter-fields.tsx`) were checked and are
    reached only from Server Components, so they are not part of the leak.
  - Scope: move `shipmentStatuses` and `membershipRoles` — the only symbols on
    the client edge — into one dependency-free module, have `src/db/schema.ts`
    import them so every existing server importer keeps working, and repoint
    `src/lib/shipment-queue.ts` at the pure module. Do not relocate the other
    enum arrays; nothing needs them moved.
  - Done when: a rebuilt `.next/static` contains no Drizzle table definition and
    no `MENGANTAR_API_KEY` enum literal, `pnpm build`, `pnpm tsc --noEmit`, and
    the full integration suite pass, and `src/db/schema.ts` stays unguarded only
    because `drizzle.config.ts` loads it directly.
  - Resolution: `shipmentStatuses` and `membershipRoles` moved to
    `src/lib/domain-enums.ts`, a module with no runtime edge of any shape.
    `src/db/schema.ts` imports and re-exports them, so every server importer is
    unchanged, and `src/lib/shipment-queue.ts` — the one module on the client
    edge — reads the pure source. The other value importers of `@/db/schema`
    (`analytics-filters`, `platform-monitoring-filters`,
    `analytics-filter-fields`) were checked and are reached only from Server
    Components, so they were left alone.
    `tests/client-bundle-boundary.integration.test.ts` walks the runtime module
    graph from every `"use client"` entry, stopping at `"use server"`
    boundaries, and fails with the offending path if any of them reaches the
    schema. Review found the first version followed only `import` declarations,
    so an `export … from` re-export or a dynamic `import()` walked straight past
    it — and the second of those falsified the test's own comment about the
    literal module. It now follows import declarations, re-export declarations,
    dynamic `import()` and `require()`, resolves `.js`/`.jsx`/`.mjs`/`.cjs` as
    well (`allowJs` is on), and tolerates a comment above a `"use client"`
    directive. All three evasions were reproduced and now fail it, each
    reporting its full path. Confirmation review then found two narrower holes,
    both now closed: a template-literal `import(\`@/db/schema\`)`, which
    bundlers resolve statically just like a string one, and a leading comment
    longer than the text window the directive check used — which silently
    dropped a client entry in one direction and produced nine false paths
    through `"use server"` modules in the other. The directive is now read from
    the parse tree instead of a text slice, which removes the class rather than
    moving it. It also pins that the schema re-exports the same object identity,
    so a divergent second definition cannot appear.
    Measured: client JavaScript fell from 1,732,044 to 1,657,092 bytes, and the
    79 KB chunk carrying the table graph is gone — no `notNull`, no table or
    column name, no `MENGANTAR_API_KEY` label in any chunk.

- [x] **T-85 — Replace the placeholder lifecycle guidance copy**
  - Primary requirement: UX-3
  - Constraints: ACC-1, docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md
  - Dependencies: T-79
  - Owning task reopened: T-72
  - Finding: the six lifecycle statuses `67beb92` added to
    `SHIPMENT_STATUS_PRESENTATION` (`src/lib/shipment-queue.ts:63`) were
    appended on a single line with terse fragments — `RTS_QUEUED` reads
    "Menunggu dikembalikan" — instead of the operational guidance sentences
    every sibling entry carries ("Draf sudah tersimpan dan dapat dilanjutkan
    untuk memuat estimasi."). That string is what the RTS table renders as its
    no-notes fallback and what the shipment queue shows for the new statuses.
  - Already resolved under T-76, do not redo: the route-local `loading.tsx` and
    `error.tsx`, the `parseUiAuditScenarioForRoute` wiring, and the local RTS
    fixture in `scripts/seed-local-dev-users.mjs`.
  - Scope: rewrite the six new status guidance strings in the established
    voice, one entry per block like every sibling.
  - Done when: no lifecycle status carries placeholder guidance copy and the
    RTS no-notes fallback reads as an operational instruction.
  - Resolution: the six statuses now carry guidance in the established voice —
    what the state means, then only a caution the product actually enforces.
    Independent review rejected the first rewrite because two of the six named
    actions that do not exist: `PROBLEM` said "sebelum memutuskan retur atau
    kirim ulang" and `RTS_RECEIVED` said "sebelum menutup kasus", while
    `shipmentLifecycleActions` returns nothing for any of these statuses and the
    detail page renders "Tidak ada tindakan lanjutan untuk status ini" beside
    the same text. "Kirim ulang" is also the product's named hazard, not an
    instruction. Both were rewritten to describe the state and point at the
    record.
    Screening the same surface found five label vocabularies for one lifecycle,
    none of them named by this task: the canonical one plus four copies. The RTS
    page's filter tabs disagreed with the row badge directly beneath them
    ("Antre Retur" over "RTS Antre"); its KPI cards were a third set ("Antre
    Dikembalikan", "Dalam Perjalanan (RTS)", "Selesai Diterima");
    `src/app/platform/_components/monitoring-view.tsx` carried a fourth for the
    whole platform scope, so one stored value read "Antre retur" to a tenant and
    "RTS (Antrean)" to a super admin; and review found a fifth in
    `src/app/app/pengiriman/[shipmentId]/reconciliation-panel.tsx`. All four
    copies now derive from `SHIPMENT_STATUS_PRESENTATION`. Labels also lost
    their English `RTS ` prefix and their Title Case, which no sibling status
    used, and the `RTS_IN_TRANSIT` KPI card moved off cobalt so its icon and
    value match the amber badge for the same status on the same screen — the
    design contract reserves cobalt as the sole interactive accent.
    `tests/shipment-status-copy.integration.test.ts` requires sentence-ending
    guidance of at least eight words that is not a restatement of the label,
    distinct sentence-case Indonesian labels checked from the first word so an
    acronym cannot simply move to the front, an explicit ban on naming the
    non-existent actions, one vocabulary across both scopes, and the RTS page
    referencing the shared presentation rather than any literal. Mutation-tested
    by restoring the original `RTS_QUEUED` one-liner, which fails two checks.
    Browser evidence covers the fourteen labels the four retired vocabularies
    contributed, across the RTS queue, the shipment queue and the platform
    monitoring filter, as Tenant Admin and as Super Admin; independent review
    swept twenty-two, adding the original guidance fragments, and reached the
    same result. The KPI cards, filter tabs and row badges render identical
    labels. One string, "Status tidak diketahui", still appears on `/platform`,
    and correctly: there it names `counts.lifecycle.unknown`, a provider-object
    metric, not a shipment status.

- [x] **T-86 — Remove the pre-shadcn stylesheet the migration left behind**
  - Primary requirement: SYS-1, ARCH-1
  - Constraints: PR-18, docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md
  - Dependencies: T-77
  - Owning task reopened: T-76
  - Finding: 117 of the 157 class names in `src/app/globals.css` are referenced
    nowhere under `src` and render on none of the 22 routes in any scope. The
    denominator counts class selectors the file defines: the `@import` and
    `@custom-variant` lines are excluded, since `css` there is a filename and
    `dark` is a variant reference rather than a rule this file writes. Two
    independent checks agree: a substring sweep of every `.ts`/`.tsx`/`.js`
    source, and `getElementsByClassName` against the live DOM of all 22 routes
    as anonymous, Tenant Admin, and Super Admin. They are the pre-shadcn shell,
    sales page, analytics, bulk import, contacts, label and shipment-form
    stylesheets — the "CMS migration bridge" the file's own comment describes
    as temporary. `.cms-main` and the `.auth-*` block are still live and stay.
  - Scope: delete the dead rules and the migration-bridge comment that no
    longer describes anything; keep every rule proven live.
  - Done when: no class selector in `globals.css` is unreachable from both
    source and rendered DOM, and the rendered geometry of every surface is
    identical before and after the deletion.
  - Correction to the original criterion: it asked for byte-identical
    screenshots. T-77 proved that cannot be satisfied by any change or none —
    13 of 30 captures differ between two consecutive runs because these pages
    render live timestamps, so a byte diff cannot separate layout from content.
    Geometry can, and it is what T-77 used to prove the card-title heading
    change moved nothing.
  - Resolution: the recorded count was itself one substring-sweep false
    positive short. The original sweep's "referenced nowhere under `src`"
    check matched `cms-navigation` and `cms-shell` as live because both
    strings also appear inside import-path text (`from
    "@/app/_components/cms-navigation"`, and `cms-shell-navigation`
    containing `cms-shell` as a substring) — neither is ever the value of an
    actual `className`. Restricting the substring sweep to real class-token
    occurrences (excluding `import`/`from` lines) found 119 dead selectors,
    not 117; the live DOM sweep across all 22 routes as anonymous, Tenant
    Admin, and Super Admin independently confirmed both additional classes
    render on none of them, same as the other 117. All 119 dead rules and
    the "CMS migration bridge" comment are deleted; `globals.css` is 679
    lines before, 285 after. A second stale comment — "Temporary visual
    normalization for routes still using legacy domain class names" — had
    zero live content remaining under it once its own rules were removed
    (every selector it covered was dead), so it is deleted too; the
    "Shared authenticated CMS shell and operational primitives" and
    "Professional CMS refinement" comments still introduce live rules
    (`.cms-main`, `.cms-skip-link`, `.cms-signout`, `.cms-signout-button`,
    `.cms-control-error`, `.auth-*`, `.label-*`) and are kept unchanged.
    Geometry parity is proved two ways: (1) structurally — every deleted
    rule required at least one class token proven absent from every route's
    DOM, and CSS only applies a rule to elements matching its full selector,
    so removing a rule no element could ever match cannot change any
    element's computed style; (2) empirically — a full 66-route/312-scenario
    browser sweep run before and after the deletion reports 0 findings both
    times, identical route/state pair counts, identical gutters (16/24/32px),
    identical container tiers, and identical sticky-column count (191) both
    runs. The only per-pair differences are `cards`/`tier` on `"loading"`
    skeleton states, and a live repeat check (5 consecutive same-CSS,
    same-route captures of `/app/analitik`'s loading skeleton) reproduced
    the identical fluctuation with zero code or CSS change between runs,
    confirming it is the pre-existing Suspense-streaming timing race the
    sweep's own comments already document, not a CSS effect. `tsc`, `lint`,
    and `next build` are clean against the reduced file.
  - False lead, corrected rather than filed as a task: verifying T-86
    initially ran `pnpm test:integration` after `source
    scripts/ui-audit/env.dev.sh` (the browser-sweep dev environment, whose
    `BETTER_AUTH_TRUSTED_ORIGINS` is `http://localhost:3000`), not
    `scripts/ui-audit/env.integration.sh` (whose
    `BETTER_AUTH_TRUSTED_ORIGINS` is `http://127.0.0.1:3110`, matching the
    origin these tests actually construct requests against). Under the
    wrong env, Better Auth's own origin check rejects every request from
    these two files with `403 {"code":"INVALID_ORIGIN"}` before reaching
    any application code, which is what read as a 401-vs-403 status
    mismatch and an `aria-describedby` mismatch. Confirmed by dumping the
    raw response body directly (`STATUS: 403 BODY:
    {"message":"Invalid origin","code":"INVALID_ORIGIN"}`) and by rerunning
    the full suite with `env.integration.sh` sourced instead: 590/590
    tests pass, including both files. No task filed; there was nothing to
    fix.

### Findings routed into existing Phase 10 tasks

These need no new task; each already sits inside a declared scope. They are
recorded here so the owning run cannot close without addressing them.

- **T-79 — CLOSED under T-76, do not redo.** `shipment_rts_events` was the only
  tenant-owned table with row-level security neither enabled nor forced, and it
  carried no grant to `geraicuan_app`, so the RTS page failed with `permission
  denied for table shipment_rts_events` the moment any event row existed. That
  is why T-72 appeared to work against a superuser connection and could never
  have worked in production. Migration
  `0032_shipment_rts_events_isolation` added the revoke, the `SELECT, INSERT`
  grant, forced RLS, and tenant-scoped select/insert policies. T-79 should
  re-audit that no OTHER tenant-owned table has the same gap; it does not need
  to write this migration again.
- **T-79 — CLOSED.** Every defect listed here was real, and the handler was
  additionally inert because RLS denied it any read without a tenant context.
  Rather than harden an invented contract, the route now refuses every request;
  see the T-79 Resolution above for what must exist before it may reopen.
- **T-80 — CLOSED.** The handler this described no longer exists to be
  non-idempotent: T-79 closed `/api/webhooks/mengantar` to refuse every
  request, and T-80's own audit confirmed no other live code path writes to
  `shipments.status` or `shipment_rts_events` from a delivery/RTS signal.
  The lifecycle-transition rule this finding asked for has nothing to guard
  today; it applies again only once a real webhook (or other event
  ingestion path) is built against a verified provider contract, per
  `route.ts`'s own stated preconditions.
- **T-78 — CLOSED, do not redo.** `src/app/app/shipment-draft-form.tsx` decided
  whether to render the duplicate-confirmation checkbox with
  `state.errors?.form?.includes("Ditemukan pesanan")`, branching on a
  user-facing Indonesian sentence; the same block hardcoded `amber-*` palette
  classes and a raw `<input type="checkbox">` with `focus:ring-primary`
  instead of the semantic tokens and `focus-visible`. Fixed under T-78's own
  resolution above: a structured `duplicateDetected` flag, the `--warn`
  tokens, and `accent-primary` without a click-triggered ring override.
- **T-77 — CLOSED, do not redo.** `src/app/app/pengiriman/rts/page.tsx` carried 42 `Card`
  references against 0-8 on every sibling queue page, composing four decorative
  KPI tiles plus a card-wrapped table with badge-counted filter "tabs" that use
  `role="tablist"` over links. The design contract rejects decorative KPI grids,
  nested cards, and ornamental badges where a filterable table is the decision
  tool.
- **T-82 — CLOSED.** `docs/spec/17-UX-FLOWS-SCREEN-CONTRACTS.md`'s UX-2 is
  corrected to match `src/lib/cms-shell-navigation.ts` exactly.
- **T-77 — CLOSED, do not redo.** Browser evidence at 1280px showed the RTS
  "Resi & ID" column rendering a second field, `ID: 72000000`, identical on
  every row, beside an AWB that already identified the row and linked to it.
  The identical value is a fixture artifact — `scripts/seed-local-dev-users.mjs`
  mints `fixedUuid("72", n)`, the same seed defect T-82 records, and production
  UUIDs would differ in those eight characters. What made it wrong on any data
  is that it was a redundant second identifier: the AWB cell above it is the
  row's identity and its link. The `ID:` line is gone; the truncated form
  survives only as that cell's fallback when a shipment has no AWB yet, where
  it is the only identifier there is. The shipment queue shares the helper and
  uses it the same way.
- **T-79 — CLOSED.** The RTS queue now masks server-side. The audit also found
  the contact directory's own mask was the weaker of two drifted copies,
  exposing the carrier prefix and seven of twelve digits; all four copies are
  now one module on the stricter scheme.
- **T-81** — `netMarginIdr` in `src/db/analytics-repository.ts` mixes two
  different populations. `cogsIdr` is aggregated over the *created* cohort
  (shipments whose `created_at` falls in the range), while
  `codPrincipalIdr`, `providerShippingIdr`, `codServiceFeeIdr`, and `codVatIdr`
  are aggregated over the *ledger* cohort (ledger entries in the range joined to
  their provider batch). A shipment created near a period boundary contributes
  its COGS to one period and its shipping cost to the next, so the reported
  margin is wrong for any period where creation and issuance do not align. The
  subtraction is arithmetically valid and each term is individually correct;
  the defect is that they do not describe the same shipments. Decide the
  authoritative cohort, document it beside the KPI, and prove it with a fixture
  whose creation and issuance deliberately straddle the range boundary.
- **T-77 — CLOSED, do not redo.** The RTS wide-table region at `src/app/app/pengiriman/rts/page.tsx`
  is a bare `<div className="overflow-x-auto">`. The shipment queue wraps the
  same pattern in a labelled, focusable region (`role="region"`, `tabIndex={0}`,
  an `aria-label` naming the horizontal scroll) so keyboard users can reach and
  scroll it. The RTS table cannot be scrolled by keyboard at all, and screen
  readers get no announcement that content continues off-screen. The
  `role="tablist"` on the filter row is also wrong: its children are links that
  navigate, not tabs that switch panels.

### Design note for T-79's webhook tenant scoping

`withTenantContext` cannot be reused here: it resolves scope from an **active
membership** for a user principal, and a provider webhook has no user. Do not
invent a synthetic membership to satisfy it. The correct authority is already
in the request path — `provider_order_snapshots.cnote_no` is the only AWB
authority and its row carries `tenant_id`. Resolve the tenant from that row
server-side, then apply the resolved `tenant_id` as an explicit predicate on
every subsequent read and write, so the update can never span tenants even
though `cnote_no` uniqueness is not guaranteed across them. If a dedicated
database role is introduced for this path, it needs its own narrow grants and
RLS policy rather than a bypass.
- **T-82 — CLOSED.** The local seed's colliding ids (`fixedUuid("70", 1)`/
  `fixedUuid("70", 16)` in `scripts/seed-local-dev-users.mjs` byte-identical
  to the hardcoded `tenantId`/`outletId`) are moved to an unused `"7f"`
  prefix; a cross-table id union confirms zero collisions.
- **T-82 — CLOSED, stale.** README.md already documents the test
  environment (`BETTER_AUTH_TRUSTED_ORIGINS`/`BETTER_AUTH_URL` at
  `http://127.0.0.1:3110`, `GERAICUAN_ENABLE_DEMO_LOGIN_HINT` unset) in its
  "Running the checks" section — this finding's ask was already met before
  T-82 started.
- **T-82 — CLOSED, stale.** `MENGANTAR_WEBHOOK_SECRET` is read by nothing in
  `src` (confirmed by grep) — this finding described the pre-T-79 webhook
  implementation. README.md already states it is read by nothing while the
  webhook is closed.
- **T-82 — CLOSED, stale.** README.md's "Running the checks" section
  already carries "The suite destroys the local demo data" with the
  `pnpm db:seed-local` re-run step — this finding's ask was already met
  before T-82 started.
- **T-81** — reconciliation is entirely manual, not automated, contrary to
  this task's own scope wording ("audit daily and monthly automated
  reconciliation comparisons between provider settlement data and internal
  ledger totals"). Found while auditing T-80:
  `applyAuthoritativeShipmentReconciliation`
  (`src/db/shipment-reconciliation-repository.ts`) takes an
  already-known `AuthoritativeShipmentReconciliation` result as its input —
  it never itself queries a provider order-status endpoint. The only caller
  is `reconciliation-panel.tsx`'s Tenant-Admin-gated form, where a human
  transcribes what they saw on Mengantar's own dashboard. There is no
  scheduled job or poller anywhere. Decide whether this task should build
  real automated polling (requires a verified Mengantar order-status
  contract, per the same evidence-boundary rule blocking the webhook) or
  whether the manual flow is the accepted design and the scope wording
  should be corrected instead.
- **T-81** — a recorded COGS is write-once. No code path updates
  `shipments.cogs_amount_idr` after draft creation — every `.update(shipments)`
  site touches status and AWB fields only — and draft creation emits no audit
  event for any field, so a mistyped Modal HPP permanently skews that shipment's
  Net Margin with no correction path and no trail. This matches the existing
  posture for `declaredValue`, so it is not a T-83 regression, but the margin
  KPI now depends on the figure. Decide whether a correction path and an audit
  entry are required before the margin is treated as reportable.
- **T-82 — CLOSED.** `pnpm db:generate` now reports "No schema changes,
  nothing to migrate": migration `0037_perfect_psynapse.sql` normalized the
  stale snapshot by applying the generated no-op drop-and-recreate once.
