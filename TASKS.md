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

> Complete the accepted GeraiCUAN CMS precision and UI/UX review goal from the repository's current state. First inspect `delivery-ledger status/current` and this queue: resume the active atomic run when it is valid, otherwise select the first unchecked dependency-ready task in T-37 through T-47. Finish every remaining atomic task, close T-35 only after its cross-screen consistency gate passes, execute T-48, and finally execute T-36. Treat repository requirements, disk state, and fresh executable evidence as authoritative. For every browser-visible task, route the before-edit audit and after-edit critique through `designer` or `vision`; use `task`/Sol for implementation; prefer existing shadcn/ui primitives and native semantics; exercise the full declared state matrix in a real browser at 390px, 768px, and 1280px; obtain the required independent review; pass the delivery boundary; update repository evidence; and continue until every dependency and release gate is genuinely satisfied. Never call a real provider, mutate production, read or print secrets, commit, push, deploy, release, or materially expand scope without explicit approval.

### Startup gate

1. Read `AGENTS.md`, `~/dotfiles/config/omp/GOAL-ORCHESTRATION.md`, the primary requirement and constraints for the selected task, `docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md`, `docs/spec/17-UX-FLOWS-SCREEN-CONTRACTS.md`, `STATUS.md`, `BUILD-LOG.md`, and the current delivery-ledger state.
2. Run `delivery-ledger status` and `delivery-ledger current` instead of trusting a dated status snapshot. If a valid run is active, resume only its declared task and boundary; if no run is active, resolve any drift through the documented ledger workflow before implementation. Never manufacture a retroactive boundary or PASS, and never open a second run over an active one.
3. For a new run, capture the base HEAD and all pre-existing dirty paths. Classify each path as accepted existing work, protected user work, or unexplained. An unexplained or overlapping path blocks the task until scope is explicitly resolved. For a resumed run, re-check that its immutable baseline and accepted overlaps still match the intended task before continuing.
4. Select or resume exactly one unblocked atomic task. T-35 and T-36 are milestones, not permission to merge their child tasks into one boundary.
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

### Milestone closure gate for T-35

After T-37 through T-47 pass, do not close T-35 from child checkmarks alone. `designer` or `vision` must compare the populated primary state of all 18 authenticated page routes at 390px and 1280px, with 768px added for every navigation, table, filter, or layout breakpoint. The review must verify one coherent CMS rather than eighteen individually acceptable pages: shared shell gutters and page measures, PageHeader geometry, title/action alignment, section rhythm, form/control sizing, table density, status vocabulary, semantic tokens, empty/error/loading/success treatment, and restrained Card usage. Any material mismatch reopens its owning atomic task or creates a new single-requirement task; T-35 closes only after the cross-screen critique and authenticated presentation-class scan both pass with recorded evidence.

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

- [ ] **T-52 — Accept and implement Mengantar location and pickup authority**
  - Primary requirement: PR-28
  - Constraints: PR-3, PR-5, NFR-1, NFR-2, NFR-3, TD-2, TD-16, DATA-7
  - Dependencies: T-50
  - Scope: Retrieve and record a current official/sanitized Mengantar address-search and pickup contract before naming endpoints or schemas. Implement bounded server-side lookup with strict response validation, timeout/size/concurrency limits, sanitized errors, and no credential-bearing URL logging. Add an additive cache/table only if observed latency/quota/availability evidence justifies it; define expiry and stale recovery. Preserve one provider-ID/label binding through contacts, drafts, estimates, and order payloads. Do not create an order or promote an assumed kecamatan dataset to authority.
  - Done when: Sanitized provider contract fixtures and disposable-database tests prove valid hierarchy mapping, no-result, unsupported, malformed, timeout, stale-cache, and provider-unavailable behavior; origin/pickup/destination IDs remain bound to their labels across tenant-scoped contact/draft/estimate flows; no secret/PII leaks; and any non-mutating sandbox probe is separately approved and recorded rather than implied by fixture success.

- [ ] **T-53 — Replace opaque location IDs with the complete outlet settings experience**
  - Primary requirement: PR-28
  - Constraints: PR-19, PR-22, PR-24, NFR-1, NFR-4, UX-3, UX-5, UX-7, UX-10
  - Dependencies: T-51, T-52
  - Scope: Redesign `/app/pengaturan` as one responsive outlet context: compact list-detail at 1280px and a single outlet selector at 390px/768px, followed by `Lokasi pengiriman` and `Koneksi Mengantar`. Use the accepted provider-backed searchable area/pickup composition, storing IDs while displaying `Kecamatan, Kabupaten/Kota, Provinsi`; do not retain manual opaque-ID entry. Reuse installed shadcn primitives and inspect `Command`/`Popover` registry output only if the accepted lookup requires them; no duplicate responsive form trees or nested-card layout.
  - Done when: Focused lookup/settings tests and authenticated browser journeys for zero/one/ten outlets at 390px, 768px, and 1280px prove searchable selection, label/ID persistence, loading/no-result/stale/error recovery, private/default connection states, Back/reload stability where applicable, logical keyboard/focus behavior, 44px actions, zero document overflow, and no provider/secret/browser errors. Designer post-edit critique and independent security review pass.
