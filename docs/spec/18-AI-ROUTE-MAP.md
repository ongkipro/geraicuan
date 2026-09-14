# AI Development Sitemap and Route Ownership Map

This is the implementation navigation index for GeraiCUAN. It helps an AI or
developer find the correct page, authorization boundary, data owner, mutation,
state file, test, and canonical specification before changing code.

It is not a product-requirement source and it is not an XML/SEO sitemap.
Requirements remain in 02-PRD.md, screen behavior in
17-UX-FLOWS-SCREEN-CONTRACTS.md, data ownership in 05-DATA-MODEL.md,
authorization in 07-IAM-RBAC-ABAC.md, security in 12-SECURITY-ARCHITECTURE.md,
and execution status in the root TASKS.md and STATUS.md. If this index conflicts
with those documents or the route files, the canonical document and repository
disk win.

## 1. Snapshot and maturity rules

- Audited: 2026-09-11 against HEAD `69e6be6` (T-76 through T-77's round-2
  repairs, over `67beb92`) plus every Phase 10 task's uncommitted repairs
  since: T-77 (twenty-three independent review rounds; rounds 1-18 and
  20-22 each found and fixed a real defect, round 19's one claim was
  checked and found false, round 23 found nothing to reject), T-86 (119
  dead CSS selectors removed, geometry-verified), T-78 (three action/form
  defects fixed, independently review-clean), T-80 (provider concurrency
  and ambiguous-state handling verified already correct; one
  documentation-only fix), T-81 (a `netMarginIdr` cohort-mismatch bug
  fixed and independently reviewed, R3), and T-82 (this release preflight:
  migration `0037`, seed-fixture id collision fixed, navigation-doc drift
  corrected, `pnpm test:integration`/`tsc`/`lint`/`build`/`test:migration-upgrade`
  all clean). T-76 through T-82 — the entire Phase 10 queue — are complete.
  See STATUS.md and BUILD-LOG.md for the full history.
- Framework: Next.js App Router 16.3.3, React 19.2.8.
- Inventory: 22 UI pages and four committed Route Handlers. The Mengantar
  webhook is mounted but closed — it refuses every request; see its row in
  section 8.
- Shared UI: Tailwind CSS and copied shadcn/ui components.
- Server model: Server Components by default; interactive forms are bounded
  client leaves; Server Actions and Route Handlers are remotely reachable trust
  boundaries.
- Tenant data: every read and mutation must use the server-derived user,
  tenant, and target outlet/object scope through withTenantContext.
- Platform data: every read and mutation must pass resolvePlatformAccess and
  use the restricted platform context.

Maturity labels used below:

| Label | Meaning |
|---|---|
| COMMITTED | Present at HEAD `67beb92`. Committed is not the same as reviewed; the Phase 9 additions in `67beb92` are committed and NOT reviewed. |
| MODIFIED | Committed route whose supporting behavior has uncommitted worktree changes on top of HEAD. Re-verify before claiming it works. |
| WORKTREE | New uncommitted route or handler. It is discoverable for development but is not release-reviewed or production-ready. No route carries this label at this snapshot: every page and handler is committed, T-76 through T-77's round-2 repairs at `69e6be6` over `67beb92`. T-77's round-3 through round-23 repairs — the sticky-column fix, the token and page guard rewrites, the browser-audit script tree under scripts/ui-audit/, and the documents describing them — plus T-86's deletion of 119 dead selectors from `src/app/globals.css` (679 lines to 285) — are uncommitted on top of that; none of them add or remove a route. What `69e6be6` itself changed spans more than fifty paths, including `src/db/rts-repository.ts`, `src/app/app/pengiriman/rts/page.tsx`, `src/lib/ui-audit-scenario.ts`, `src/lib/pii-redaction.ts`, the closed webhook handler, the `server-only` guards through `src/db`, `scripts/seed-local-dev-users.mjs`, migrations `0032` through `0036`, the design tokens in `src/app/globals.css`, and their tests. Run `git status` rather than reading a maturity label as a statement about the whole tree. |
| RELEASE-GATED | Code exists, but live Mengantar mutation remains disabled until separately approved and verified. |

Never infer maturity from a checked task alone. Confirm git status, STATUS.md,
the relevant delivery-ledger run, and executable evidence.

## 2. Route hierarchy

```mermaid
flowchart TD
    Root[Public sales] --> TenantLogin[Tenant login]
    Root --> PlatformLogin[Platform login]

    TenantLogin --> TenantShell[Tenant CMS shell]
    TenantShell --> Summary[Ringkasan]
    TenantShell --> Shipments[Kiriman]
    Shipments --> NewShipment[Create draft]
    Shipments --> ShipmentDetail[Shipment detail]
    Shipments --> Rts[Return workflow]
    Shipments --> Bulk[Bulk intake]
    Shipments --> Labels[Label queue]
    Labels --> LabelDetail[Print label]
    TenantShell --> Contacts[Contact directory]
    Contacts --> NewContact[Create contact]
    Contacts --> ContactDetail[Contact detail]
    TenantShell --> Analytics[Analytics]
    TenantShell --> Finance[Finance]
    TenantShell --> Settings[Outlet settings]
    TenantShell --> Members[Member governance]

    PlatformLogin --> PlatformShell[Platform CMS shell]
    PlatformShell --> PlatformSummary[Platform overview]
    PlatformShell --> TenantList[Tenant directory]
    TenantList --> TenantDetail[Tenant lifecycle]
    PlatformShell --> Audit[Audit trail]

    AuthHandler[Better Auth handler] --> TenantShell
    AuthHandler --> PlatformShell
    Webhook[Mengantar webhook] -. closed by T-79, reaches nothing .-x Shipments
```

## 3. Shell, role, and navigation contract

| Scope | Layout and access owner | Navigation groups | Actor |
|---|---|---|---|
| Public | src/app/layout.tsx | Sales page links only | Unauthenticated visitor |
| Tenant CMS | src/app/app/layout.tsx and src/lib/cms-auth.ts | Utama; Operasional; Wawasan; Administrasi | Active Tenant Admin or Operator membership |
| Platform CMS | src/app/platform/layout.tsx and src/app/platform/platform-access.ts | Platform | Active Super Admin only |

Tenant navigation is owned by src/lib/cms-shell-navigation.ts:

- Utama: Ringkasan.
- Operasional: Kiriman, Retur (RTS), Kontak.
- Wawasan, Tenant Admin only: Analitik, Keuangan.
- Administrasi, Tenant Admin only: Outlet & koneksi, Anggota & akses.
- Impor and Label are contextual shipment destinations. They intentionally keep
  Kiriman selected instead of adding top-level navigation.
- Detail, create, and print pages inherit the nearest parent destination.
- Hiding a navigation item is not authorization. Every page, Server Action,
  Route Handler, and repository target must enforce authority again.

## 4. Public and authentication pages

| Route | Source | Actor and primary job | URL state and entry/exit | Server boundary and actions | Required states | Maturity |
|---|---|---|---|---|---|---|
| / | src/app/page.tsx | Visitor evaluates GeraiCUAN and chooses the correct login scope. | Entry from public URL; exits to /login/tenant or /login/super-admin. | No CMS read or mutation. Must never render shipment, provider, contact, finance, analytics, or tenant data. | Marketing content, keyboard-visible login links, responsive layout. | COMMITTED |
| /login/tenant | src/app/login/tenant/page.tsx | Tenant Admin or Operator authenticates into tenant scope. | Accepts only notice=session-required or notice=access-unavailable; success replaces navigation to /app. | Client POST to /api/auth/sign-in/email with x-geraicuan-login-scope=tenant. Better Auth and the session hook verify the active CMS principal before session persistence. | Empty form, pending, generic invalid credentials, access notice, local-only demo fill, successful redirect. | COMMITTED |
| /login/super-admin | src/app/login/super-admin/page.tsx | Super Admin authenticates into platform scope. | Same bounded notice values; success exits to /platform. | Same Better Auth endpoint with x-geraicuan-login-scope=platform; tenant membership cannot synthesize platform authority. | Same login states, with platform-specific destination and copy. | COMMITTED |

Shared login interaction owner:
src/app/login/_components/login-form.tsx. Authentication configuration owners:
src/lib/auth.ts, src/lib/auth-config.ts, and src/lib/cms-principal.ts. Primary
evidence: tests/public-auth-render.integration.test.ts,
tests/auth-session-boundary.integration.test.ts, and
tests/auth-config.integration.test.ts.

## 5. Tenant CMS pages

### 5.1 Command center and shipment operations

| Route | Source and navigation | Actor and primary job | Canonical URL state | Reads and mutation owners | State boundary and completion | Maturity |
|---|---|---|---|---|---|---|
| /app | src/app/app/page.tsx; Ringkasan | Both tenant roles choose the next permitted daily action from shallow period analytics, readiness, exceptions, and actionable recent shipments. | rentang, dari, sampai, tz, outlet, support; draft redirects to /app/pengiriman/baru?draft=validated-id. Invalid scope is removed rather than broadened. | src/db/tenant-dashboard-repository.ts and outlet-readiness-repository.ts. Read-only; links to create, queue, analytics, finance, or settings according to role. | Parent loading/error; first-run readiness, healthy empty, filtered empty, partial/stale, actionable exceptions, populated. Must not present COD principal as revenue. | COMMITTED and UNREVIEWED: navigation and dashboard support changed in `67beb92`. |
| /app/pengiriman | src/app/app/pengiriman/page.tsx; Kiriman | Both roles triage lifecycle work and open the one valid next action. | status and page. Status accepts ALL, ACTION_REQUIRED, READY_TO_PROGRESS, ISSUED_TODAY, or a stored shipment status; page is positive integer. | loadShipmentQueuePage in shipment-queue-repository.ts; lifecycle links from src/lib/shipment-queue.ts. | Local loading/error; system empty, filtered empty, invalid filter adjustment, populated, stale, pagination. | COMMITTED at `69e6be6`. T-85 rewrote the guidance for the six lifecycle statuses it added and folded five label vocabularies into one shared source; that work passed independent review before this commit. The queue's own presentation was never re-reviewed as a whole. |
| /app/pengiriman/baru | src/app/app/pengiriman/baru/page.tsx; contextual Kiriman | Both roles create or resume one tenant-scoped shipment draft, select destination authority, and load a provider estimate. | Optional draft UUID; invalid or foreign IDs do not become scope. | Common actions in src/app/app/actions.ts; destination actions in location-actions.ts; estimate action in estimate-actions.ts. Repositories: outlet readiness, contact, shipment draft, estimate. | Local loading/error; blocked outlet, pristine, contact search, destination loading/empty/error/selected, validation error, duplicate warning, saved, estimate pending/success/failure. | COMMITTED, UNREVIEWED and RELEASE-GATED: the duplicate warning and COGS field shipped in `67beb92`; the live provider estimate remains gated. The COGS field now persists through `validateShipmentDraft` (T-83). |
| /app/pengiriman/[shipmentId] | src/app/app/pengiriman/[shipmentId]/page.tsx; child of Kiriman | Both roles inspect immutable shipment context and perform only the action allowed by lifecycle and role. | Dynamic shipment UUID only; malformed or foreign/missing target returns not-found without cross-tenant disclosure. | loadShipmentDetail; confirmShipmentIssuance; checkStaleShipmentOperation; Tenant Admin-only reconcileShipmentUnknownSubmission and recoverShipmentUnpaidPayment. | Local loading/error/not-found; every lifecycle status, stale operation, pending/success/failure, estimate/provider result, label history. | COMMITTED and RELEASE-GATED for issuance/reconciliation/recovery transport. |
| /app/pengiriman/rts | src/app/app/pengiriman/rts/page.tsx; Retur (RTS) | Both tenant roles scan failed/returning shipments and open shipment detail for follow-up. | status accepts ALL, RTS_QUEUED, RTS_IN_TRANSIT, RTS_RECEIVED, PROBLEM; page is positive integer. An unrecognised status or page is reported as an adjusted filter rather than silently coerced. | loadRtsShipmentsPage in src/db/rts-repository.ts. Read-only; links to shipment detail. | Local loading/error; system empty, filtered empty, invalid query adjustment, populated, pagination. No mutation surface exists. | COMMITTED at `69e6be6` (T-76 through T-77) over `67beb92` (page, repository, schema, migrations 0030-0031); changed by T-76, which added the route boundaries, the audit-scenario hook, the repository test, the local RTS fixture, and migration 0032, and by T-77, which removed the KPI card row that restated the filter counts, replaced `role="tablist"` over links with a labelled `nav` carrying `aria-current="true"`, moved the wide table into the labelled focusable scroll region the sibling queue already used, and dropped the non-identifying `ID:` line, plus its uncommitted round-3 through round-23 repairs — an opaque sticky identifying column on the AWB cell, two review-broken guards rewritten to measure the rendered page and the parsed stylesheet rather than match spellings, and the browser-audit script tree ported from an ephemeral scratchpad into scripts/ui-audit/. T-77 has been through twenty-three rounds of independent review; every real finding is repaired (round 19's one claim was checked and found false; round 23 found nothing to reject). Independent review passed. |
| /app/impor | src/app/app/impor/page.tsx; contextual Kiriman | Both roles upload a bounded CSV, review row-level decisions, and create only explicitly selected valid drafts. | Form state, not shareable query state. | uploadBulkIntake and createSelectedDrafts in app/impor/actions.ts; bulk contract, intake, and signed envelope in src/lib. | Local loading/error; invalid file, mixed rows, no valid rows, preview, pending confirmation, partial result, success. | COMMITTED and UNREVIEWED: duplicate-detection behavior shipped in `67beb92`. |
| /app/label | src/app/app/label/page.tsx; contextual Kiriman | Both roles find issued or unpaid shipments eligible for label-related work. | q is an optional AWB suffix of 3–24 letters or digits; an invalid value shows an alert and skips the read. status=unpaid selects the unpaid view; an absent or any other value renders the default issued view without an adjustment notice. Both views are chosen through `DataTableFacetFilter` in `DataTableToolbar`, with `<noscript>` links to the same two URLs, and each keeps the current suffix. | listPrintableShipments in label-print-repository.ts. Read-only index. | Local loading/error; invalid query, system empty (separate issued and unpaid copy), filtered empty, populated. | COMMITTED; Phase 13 toolbar recomposition is uncommitted in the worktree. |
| /app/label/[shipmentId] | src/app/app/label/[shipmentId]/page.tsx; child of Label | Both roles verify provider-authoritative label data and print/reprint an issued shipment. | Dynamic shipment UUID only. | loadPrintableLabel, listPrintEvents, and recordLabelPrint. Provider cnote_no is the only AWB authority. | Local loading/error/not-found; label unavailable, printable, print pending/error/success, no history/history, print CSS at 100 by 150 mm. | COMMITTED |

Shipment lifecycle authority is src/db/schema.ts plus
src/lib/shipment-queue.ts. The committed lifecycle is documented in UX-4.
The RTS, delivery, problem, and in-transit statuses are committed at
`67beb92` (`src/db/schema.ts` plus migration 0031) but were never independently
reviewed. Do not treat them as reviewed lifecycle transitions.

### 5.2 Contacts

| Route | Source and navigation | Actor and primary job | Canonical URL state | Reads and mutation owners | State boundary and completion | Maturity |
|---|---|---|---|---|---|---|
| /app/kontak | src/app/app/kontak/page.tsx; Kontak | Both roles find active/archived reusable sender or recipient records. | status=active or archived; unknown values fall back visibly. Interactive text search uses searchContacts without changing tenant scope. | listContacts and searchContacts; Tenant Admin sees create/archive capabilities, Operator retains permitted contact use. | Local loading/error; active empty, archived empty, filtered empty, invalid status, populated. | COMMITTED |
| /app/kontak/baru | src/app/app/kontak/baru/page.tsx; child of Kontak | Both roles create one reusable contact and an optional provider-authoritative destination. | No URL state. | saveContact plus search/validate destination-area actions; listReadyShipmentOutlets supplies allowed lookup scope. | Local loading/error; blocked readiness, pristine, destination search states, validation error, success redirect. | COMMITTED |
| /app/kontak/[contactId] | src/app/app/kontak/[contactId]/page.tsx; child of Kontak | Both roles inspect/update contact and addresses; Tenant Admin may archive. | alamat selects an active address; arsipkan=1 opens authorized confirmation; diarsipkan=1 presents durable success. | getContact/listContactAddresses; updateContactAction, addContactAddressAction, updateContactAddressAction, archiveContactAction; shared location validation. | Local loading/error; safe not-found view, archived/read-only differences, address selection, validation, confirmation, mutation result. | COMMITTED |

Canonical data owners are src/db/contact-repository.ts,
src/lib/contact-directory.ts, and the Mengantar destination authority boundary
in src/app/app/location-actions.ts.

### 5.3 Reporting, finance, configuration, and governance

| Route | Source and navigation | Actor and primary job | Canonical URL state | Reads and mutation owners | State boundary and completion | Maturity |
|---|---|---|---|---|---|---|
| /app/analitik | src/app/app/analitik/page.tsx; Analitik | Tenant Admin compares lifecycle performance, finds causes, and drills into exact supporting shipments. Operator is redirected to /app before protected analytics reads. | rentang, dari, sampai, tz, outlet, kurir, status, basis, halaman. basis is created, issued, outcome, or exceptions. Unknown dimensions are rejected and a canonical URL is offered. | src/db/analytics-repository.ts and analytics filter/range helpers. Read-only; export uses the same canonical filters. | Local loading/error plus region-level partial errors; no data, filtered empty, adjusted filter, stale, KPI comparison, accessible trend/table, pagination. | COMMITTED and UNREVIEWED: the COGS/net-margin KPIs shipped in `67beb92`. They are now covered by a discriminating test and the draft path writes a COGS value (T-83), but `cogsIdr` is aggregated over the created cohort while the money terms come from the ledger cohort (T-81). |
| /app/keuangan | src/app/app/keuangan/page.tsx; Keuangan | Tenant Admin reconciles signed money variances and inspects append-only ledger evidence. | Range parameters plus outlet, status, halaman, and rekonsiliasiId focus target. Invalid scope never widens results. | list/summarize ledger and reconciliation reads; runLedgerReconciliation and reverseLedgerEntry. | Local loading/error; matched, variance, invalid/adjusted filters, pending/error/success, reversal, pagination. COD principal remains liability, never revenue. | COMMITTED |
| /app/pengaturan | src/app/app/pengaturan/page.tsx; Outlet & koneksi | Tenant Admin restores one outlet's readiness, chooses provider-authoritative pickup/origin, and manages platform-default or private Mengantar credentials. | outlet selects only an outlet already returned inside the tenant. | listOutletReadiness; loadMengantarPickupOptions, saveOutletSettings, savePrivateMengantarCredential, switchMengantarToPlatformDefault. Credentials resolve server-side only. | Local loading/error; zero/one/many outlets, incomplete, pickup loading/empty/error/legacy, private saved-unverified/connected/rejected, replacement/switch confirmation. | COMMITTED |
| /app/anggota | src/app/app/anggota/page.tsx; Anggota & akses | Tenant Admin invites staff, changes role, or deactivates membership while preserving an active admin. Operator redirects to /app. | No shareable query state. | listTenantMembers; inviteMemberAction, changeMemberRoleAction, deactivateMemberAction. Every outcome is audited and replay-safe. | Local loading/error; no members (*Anggota tidak ditemukan*), active and deactivated (`SUSPENDED`) members — there is no separate invited status; single-active-admin alert; per-member *Kelola akses* disclosure with role-change and deactivate confirmation dialogs; validation, pending, success, last-admin/conflict. The header *Undang anggota* button scrolls to the always-visible invite section and moves focus to its email field. | COMMITTED; Phase 13 `SettingsLayout` recomposition is uncommitted in the worktree. |

Analytics is not financial authority. Keuangan owns ledger and reconciliation;
Ringkasan owns shallow prioritization; Analitik owns historical exploration.
Outlet settings is the only Mengantar credential/configuration destination.

## 6. Platform CMS pages

All four platform pages are thin route owners over
src/app/platform/_components/monitoring-view.tsx. That component resolves
platform access again, parses route-specific filters, performs restricted
platform reads, records monitoring access, and renders partial-degradation
regions.

| Route | Source and navigation | Super Admin job | Canonical URL state | Reads and actions | State boundary and completion | Maturity |
|---|---|---|---|---|---|---|
| /platform | src/app/platform/page.tsx; Ringkasan | Triage cross-tenant provider, queue, failure, latency, volume, usage, and audit exceptions. | Range/timezone plus optional tenant, outlet, kurir, status, halaman. q and hasil are route-invalid. | Platform health/count/trend/usage/audit repositories; read-only plus monitoring-access audit. | Shared loading/error; healthy, warning, critical, degraded region, empty, stale, invalid query. | COMMITTED and UNREVIEWED: the shared monitoring view changed in `67beb92`. |
| /platform/tenant | src/app/platform/tenant/page.tsx; Tenant | Find tenant, compare usage, and provision a tenant with an explicit governed action. | Platform filters plus q of 2-80 characters; hasil is invalid here. | listTenantUsage and submitPlatformTenantLifecycle for provisioning. | Shared loading/error; empty, filtered, paginated, provision dialog pending/error/success. | COMMITTED and UNREVIEWED through the shared monitoring view. |
| /platform/tenant/[tenantId] | src/app/platform/tenant/[tenantId]/page.tsx; child of Tenant | Inspect one tenant's lifecycle, outlets, membership/configuration health, operations, finance summary, and suspend/reactivate it. | UUID path forces tenant scope; range/outlet/courier/status/page remain validated; tenant query cannot override the path. | readTenantDetail, health/count/trend/audit/finance reads; submitPlatformTenantLifecycle. | Shared loading/error plus local not-found; zero/one/many outlets, stale/degraded, lifecycle confirmation pending/error/success. | COMMITTED and UNREVIEWED through the shared monitoring view. |
| /platform/audit | src/app/platform/audit/page.tsx; Audit | Review redacted append-only platform actions and denied outcomes. | Range/timezone, tenant/outlet/courier/status, hasil=SUCCESS or DENIED, halaman. q is invalid here. | listAuditEvents plus monitoring-access audit; no audit mutation. | Shared loading/error; empty, filtered, paginated, stale/degraded, invalid query. | COMMITTED and UNREVIEWED through the shared monitoring view. |

Filter ownership: src/lib/platform-monitoring-filters.ts. Data ownership:
src/db/platform-monitoring-repository.ts and src/db/platform-context.ts.
Lifecycle mutation ownership: src/app/platform/tenant/actions.ts and
src/db/platform-tenant-repository.ts.

## 7. Canonical URL-state dictionary

| Parameter | Accepted values and owner | Used by |
|---|---|---|
| rentang | hari-ini, kemarin, minggu-ini, bulan-ini, 7-hari, 30-hari, or kustom; src/lib/analytics-range.ts | Ringkasan, Analitik, Keuangan, and Platform |
| dari, sampai | ISO calendar dates required for a valid custom range; maximum 366 days and no future end date | Range-aware pages |
| tz | Asia/Jakarta, Asia/Makassar, Asia/Jayapura, or UTC | Range-aware pages |
| outlet | An ID from the currently authorized tenant or forced platform-tenant options | Ringkasan, Analitik, Keuangan, Settings, and Platform |
| support | created, cod, non-cod, or issued | Ringkasan supporting-record disclosure |
| status | Route-specific allowlist; never reuse a status parser across pages without checking its domain | Shipment queue, RTS, Contacts, Label, Analitik, Keuangan, and Platform |
| page | Positive integer in shipment and RTS queues | Shipment and RTS queues |
| halaman | Positive integer in analytics, finance, and platform parsers | Analitik, Keuangan, and Platform |
| basis | created, issued, outcome, or exceptions | Analitik and analytics CSV |
| kurir | Case-normalized value from authorized filter options | Analitik and Platform |
| q | Label: 3-24 alphanumeric AWB suffix. Platform tenant list: 2-80 character tenant query. | Label and Platform tenant list |
| hasil | SUCCESS or DENIED, valid only on /platform/audit | Platform audit |
| draft | Tenant-owned shipment UUID | Ringkasan redirect and shipment create/resume |
| alamat | Active address ID belonging to the current contact | Contact detail |
| arsipkan, diarsipkan | Literal 1 for authorized archive confirmation/result state | Contact detail |
| rekonsiliasiId | Reconciliation row focus target inside the validated finance result | Keuangan |

Parsers canonicalize or reject invalid values; they must never broaden tenant
scope. Shareable GET filters live in the URL. Secret values, form drafts,
confirmation tokens, and provider credentials never do.

## 8. Route Handlers and non-page HTTP surfaces

Route Handlers do not inherit page layouts. Each must independently own method,
authentication/signature, validation, rate/replay behavior, response limits,
and observability.

| Endpoint | Source | Method and caller | Security/data contract | Maturity |
|---|---|---|---|---|
| /api/auth/[...all] | src/app/api/auth/[...all]/route.ts | Better Auth methods used by login and sign-out. | Better Auth configuration, trusted origins, scoped pre-session authorization, secure cookies, and generic failures. | COMMITTED |
| /app/impor/template.csv | src/app/app/impor/template.csv/route.ts | GET by authenticated tenant user. | Re-authorizes tenant scope before returning the bounded CSV template. | COMMITTED |
| /app/analitik/export.csv | src/app/app/analitik/export.csv/route.ts | GET by Tenant Admin. | Re-authorizes Tenant Admin, canonicalizes analytics scope/basis, exports the full filtered set up to the explicit limit, and returns safe HTTP errors. | COMMITTED |
| /api/webhooks/mengantar | src/app/api/webhooks/mengantar/route.ts | Would be POST from Mengantar, not a browser page. Currently refuses every request with 404. | T-79 closed it: no provider push contract has been verified — the integration skill documents none, there is no sanitized capture, and `PR-30` is `Queued`. The handler committed in `67beb92` invented its headers, payload fields, and status vocabulary, and was inert anyway because RLS denies the application role a tenant-less read. | CLOSED by T-79. `tests/provider-webhook-boundary.integration.test.ts` pins the refusal and forbids the route reaching the database, provider, or secret modules. Reopening requires a verified contract and fixture, a tenant-scoped machine principal, constant-time comparison with a bounded body and replay window, and T-80's idempotent transition handling. |

## 9. Mutation ownership map

| Business mutation | UI entry | Server Action owner | Persistence/domain owner |
|---|---|---|---|
| Search/select shipment contacts | New shipment | src/app/app/actions.ts | contact repository and tenant context |
| Save draft | New shipment; selected bulk rows | src/app/app/actions.ts; app/impor/actions.ts | shipment-draft-repository.ts and shipment-draft.ts |
| Search/validate destination | Contact and shipment forms | src/app/app/location-actions.ts | mengantar-locations.ts, authority/rate boundaries |
| Load estimate | Saved draft | src/app/app/estimate-actions.ts | mengantar-estimate.ts and estimate-repository.ts |
| Issue AWB | Shipment detail | app/pengiriman/[shipmentId]/actions.ts | order batching, rate limit, provider snapshot, ledger |
| Reconcile unknown | Shipment detail, Tenant Admin | reconciliation-actions.ts | shipment-reconciliation repositories/domain |
| Recover unpaid | Shipment detail, Tenant Admin | unpaid-recovery-actions.ts | recovery repositories/domain |
| Upload/commit bulk rows | Import | src/app/app/impor/actions.ts | bulk intake, signed envelope, draft repository |
| Create/update/archive contact | Contact pages | app/kontak/actions.ts and [contactId]/actions.ts | contact-repository.ts |
| Record label print | Label detail | app/label/[shipmentId]/actions.ts | label-print-repository.ts |
| Reconcile/reverse finance | Finance, Tenant Admin | app/keuangan/actions.ts | ledger-repository.ts |
| Save pickup/credential mode | Outlet settings, Tenant Admin | app/pengaturan/actions.ts | outlet readiness, managed secret, Mengantar authority |
| Invite/change/deactivate member | Members, Tenant Admin | app/anggota/actions.ts | member governance repository and audit |
| Provision/suspend/reactivate tenant | Platform tenant pages | app/platform/tenant/actions.ts | platform tenant repository and audit |
| Apply provider tracking event | None — the route is closed | Route Handler, not a Server Action | T-79 closed it: no verified provider push contract exists. Nothing applies tracking events today |

Every mutation must follow this order:
authenticate, derive actor scope, validate untrusted input, resolve the target
inside that scope, enforce lifecycle/idempotency/concurrency, commit the
authoritative write, append required audit/ledger evidence, then
revalidate/redirect or return a sanitized result.

## 10. Special-file and state ownership

- Root tenant loading and unexpected-error boundaries:
  src/app/app/loading.tsx and src/app/app/error.tsx.
- Tenant routes with dedicated loading/error:
  analitik, anggota, impor, keuangan, kontak, kontak/baru,
  kontak/[contactId], label, label/[shipmentId], pengaturan, pengiriman,
  pengiriman/baru, pengiriman/[shipmentId], and pengiriman/rts.
- Dedicated not-found:
  label/[shipmentId], pengiriman/[shipmentId], and
  platform/tenant/[tenantId]. Contact detail renders its own safe missing state.
- RTS owns its own loading/error boundary and is registered in the audit
  scenario inventory as `shipment-rts-empty`, `shipment-rts-error`,
  `shipment-rts-filtered-empty`, `shipment-rts-invalid-query`,
  `shipment-rts-paginated`, and `shipment-rts-stream`.
- Platform loading/error are shared by all platform routes.
- Development-only scenario coverage is owned by
  src/lib/ui-audit-scenario.ts. A new visible route is incomplete until this
  registry and tests/cms-ui-audit-inventory.integration.test.ts both know it.

## 11. Page-to-evidence map

| Page or surface | Primary executable evidence |
|---|---|
| Public sales and both login pages | public-auth-render, auth-session-boundary, auth-config |
| Tenant shell and navigation | cms-shell, cms-ui-audit-inventory |
| /app | tenant-dashboard, dashboard-period-page, dashboard-audit-scenario, dashboard-error-loading |
| /app/pengiriman | shipment-queue, shipment-route-states, cms-ui-audit-inventory |
| /app/pengiriman/baru | shipment-draft, shipment-actions, shipment-destination-actions, shipment-estimate-authority-action |
| /app/pengiriman/[shipmentId] | shipment-actions, shipment-issuance, shipment-reconciliation, shipment-unpaid-recovery, shipment-route-states |
| /app/pengiriman/rts | rts-repository, rts-presentation, cms-shell, cms-ui-audit-inventory. Browser evidence recorded under T-76's boundary and re-taken under T-77's sweep: 66 route pairs at 390/768/1280 plus 303 UI-audit scenario pairs covering the empty, filtered-empty, loading, error, invalid-query and paginated states. |
| /app/impor | bulk-shipment-intake, bulk-import-envelope, bulk-import-actions |
| /app/kontak | contact-directory, contact-render, contact-actions |
| /app/kontak/baru | contact-actions, location-search-actions |
| /app/kontak/[contactId] | contact-actions, contact-render, mengantar-location-authority |
| /app/label | label-render, cms-ui-audit-inventory |
| /app/label/[shipmentId] | label-render, label-print-actions |
| /app/analitik and export | analytics-range, analytics-filters, analytics-repository, analytics-streaming, analytics-export-route |
| /app/keuangan | finance-page, finance-actions, finance-exception-filter, ledger-workspace |
| /app/pengaturan | outlet-settings-page, outlet-settings-actions, managed-secret-repository, mengantar-credentials |
| /app/anggota | member-governance-page, member-governance-actions |
| All platform pages | platform-layout, platform-monitoring-filters, platform-monitoring, platform-monitoring-page |
| Platform tenant lifecycle | platform-tenant-actions plus platform monitoring evidence |
| Better Auth handler | auth-config, auth-session-boundary, public-auth-render |
| CSV handlers | bulk-import actions/template assertions and analytics-export-route |
| Mengantar webhook | provider-webhook-boundary. The route is closed; the test pins the refusal and the modules it must not reach. |

Names above refer to matching files under tests with the
.integration.test.ts suffix. Repository and database tests remain required
where a page delegates to tenant-scoped persistence; a render test alone does
not prove authorization, RLS, lifecycle, or money correctness.

## 12. Where an AI should start

Use this sequence for any page change:

1. Locate the row in this file and identify its actor, job, maturity, query
   state, read owner, mutation owner, and state boundary.
2. Read the governing requirement in 02-PRD.md and screen contract in
   17-UX-FLOWS-SCREEN-CONTRACTS.md. Do not invent a workflow from the JSX.
3. Trace the route from page or handler to authorization, validation,
   repository transaction, schema/RLS, lifecycle, and audit/ledger side effect.
4. Reuse src/components/cms and src/components/ui. Do not introduce a second
   shell, navigation registry, filter parser, status vocabulary, or credential
   settings destination.
5. Add or update loading, empty, filtered-empty, error, stale, unauthorized,
   pending, conflict, success, and not-found behavior only where applicable.
6. Add the route/action to the deterministic UI audit registry and behavioral
   tests. Browser-visible changes require real-browser evidence at 390, 768,
   and 1280 pixels.
7. Update this route map only after disk behavior and canonical documents
   agree. Record verification in TASKS.md, STATUS.md, and BUILD-LOG.md through
   the repository delivery process.

## 13. Fast drift checks

Run these read-only checks before trusting this map:

```bash
rg --files src/app | rg '/page[.]tsx$' | sort
rg --files src/app | rg '/route[.]ts$' | sort
rg -n '^export async function' src/app --glob '*actions.ts' --glob 'route.ts'
rg -n 'href: "/(app|platform)' src/lib/cms-shell-navigation.ts
git status --short --branch
```

Expected page count for this snapshot: 22. Expected handler count: 4, all
committed at HEAD `67beb92`; the Mengantar webhook is mounted but closed by
T-79 and reaches nothing. Any count or route change
requires a page-by-page review of navigation, authorization, URL state,
loading/error/not-found behavior, action reachability, tests, and this map.

Repository policy makes this synchronization mandatory in `AGENTS.md`. A change
that adds, renames, or removes a page, Route Handler, navigation destination,
Server Action, or route-owned state boundary is incomplete until this map's
inventory, maturity, ownership, URL state, and evidence are updated in the same
change.

## 14. Known gaps at this snapshot

- The RTS route, tracking webhook, duplicate warning, and COGS/net-margin work
  were COMMITTED at HEAD `67beb92` without independent review and without a
  passing test suite. T-76 screened and repaired the RTS surface, T-83 the COGS
  path, and T-79 closed the tracking webhook; the duplicate warning is still
  unreviewed and is T-78's. Committed is not reviewed.
- Migration 0030 created `shipment_rts_events` with neither row-level security
  nor a grant to `geraicuan_app`, so the RTS page could not read its own event
  table under the application role. Migration 0032 adds the forced RLS,
  tenant-scoped select/insert policies, and the grant.
- T-83 repaired the COGS path: `validateShipmentDraft` parses and persists the
  value, the draft replay guard compares it, and the local seed records one so
  the KPI is exercisable. `netMarginIdr` still mixes the created and ledger
  cohorts, which is T-81.
- The webhook is closed by T-79 and has a boundary test. Its stated
  signed/replay-safe contract was never proven and the provider is not known to
  send one at all; it must be verified against provider documentation and a
  sanitized capture before the route may accept traffic again.
- `67beb92` changed the shipment lifecycle and financial semantics without
  independent review. Those changes still require canonical cross-document
  review, tenant-isolation/security review, and fresh whole-system browser
  screening before release readiness can be restored. The T-76 worktree adds
  migration 0032, the RTS route boundaries, and their evidence; it does not
  change lifecycle or financial semantics.


## T-110 — Blue UI presentation refinement (2026-09-13)

Worktree implementation on `feat/tokophi-blue-ui`; not committed or deployed.
Route, page, handler, action, navigation-destination, and scenario counts are unchanged.

- Shared owner: `src/app/globals.css`, `src/app/_components/cms-shell.tsx`, and `cms-navigation.tsx`; semantic blue tokens, light navigation/header, persistent mobile role, and active-item indicator. PageHeader/PageContainer retain their existing width tiers with a compact heading and spacing rhythm.
- `/app`: `page.tsx` keeps the period filter and summary first, current work next, and moves `DashboardPeriodTrendRegion` below the action region before recent shipments. The same trend promise, audit scenarios, support URLs, and retry focus ID remain; its standalone heading is now an `h2`. No new read or metric is introduced.
- `/app/analitik`: existing page and region owners retain query/basis/export behavior. Operational and financial grids use flat internal dividers; financial cells use at most three desktop columns for readable amounts. Financial definitions, including pending spec 19 M-5 D-3, are not resolved by this presentation pass.
- Verification owner: `scripts/ui-audit/blue-ui-check.mjs` plus the existing route sweep. T-110 evidence is recorded in BUILD-LOG; T-94/T-98/T-100 remain separate tasks with their original metric and feature requirements.

T-110 generated-route compatibility note: `/app/pengaturan` keeps its existing
route owner and behavior, but its default page function now requires the props
object supplied by Next.js. Its `searchParams` fallback remains unchanged; two
existing authorization-test callers pass an explicit empty object. No state,
route, or authorization boundary was added.


### T-111 refinement — 2026-09-14

T-111 keeps all 22 page routes, API/action inventories, navigation destinations, and ownership unchanged. `/app` now defaults `rentang` to `7-hari`; active-filter count and Reset use the same default. Explicit URL overrides, timezone, outlet, and support drill-downs retain their contracts. Dashboard rendering and loading now put the comparative line chart directly after the summary and before current work. Analytics preserves independent region freshness while reducing repeated presentation context.

The development-only `demo=grafik` query affects only chart samples and has a visible Data demo notice. It is ignored outside development. Dashboard trend reads both equal-length daily ranges with identical server-derived tenant/outlet scope; monthly ranges keep only current totals and explain the comparison limit. No new route or action was added.

The subsequent user-selected shadcn preset updates shared primitives and RootLayout typography to Inter without adding routes/actions. Table server rendering, named scroll props, semantic headings, mobile navigation focus return, and light-only rendering are preserved as integration adaptations.


### T-113 — Admin workspace composition

Route inventory remains 22 pages with unchanged destinations, role checks, server reads, Server Actions and URL parameter meanings. DashboardPeriodFilter, AnalyticsFilterFields and FinanceFilters now own small client disclosure behavior: period/outlet stay visible; choosing `kustom` opens the same form's advanced fields. Closed advanced fields remain successful GET controls; no second state store or duplicated form is introduced. Native disclosures are keyed by the existing canonical URL state when applicable.

AnalyticsSummaryRegion now renders the operational summary; AnalyticsFinancialRegion awaits the same `reads.summary` promise after AnalyticsTrendRegion. This adds a rendered Suspense region, not a DB read or metric formula. Home retains its scoped Analitik lengkap link, default seven-day comparison, developer-only demo and all supporting-record links. DashboardQuickAccess was removed because its destinations already remain in role-aware navigation; no destination was removed.

Presentation owners: CmsShell/CmsNavigation, PageHeader/PageContainer, Table, DetailSection/DefinitionGrid, the existing route pages/forms and globals' cms-form-section/cms-filter-bar classes (Phase 13 later removed the unused cms-form-section rules). Width tiers are now form/standard1024px, data1280px, wide1408px; public/login retain their existing widths. Boundary and browser evidence live in the T-113 BUILD-LOG entry.


### Phase 13 — shadcn-admin recomposition (T-118 to T-124, 2026-09-14)

Route inventory is unchanged: 22 pages, the same handlers, Server Actions, navigation destinations, role checks, and URL parameter meanings. These route-owned state boundaries and presentation owners changed:

- `/app`: `page.tsx` renders the header (with `DashboardHeaderActions`) → `OutletReadinessRegion` → the filter row → `DashboardPeriodSummaryRegion` (plus `DashboardPeriodSupportRegion` when `support` is set) → one grid holding `DashboardPeriodTrendRegion` and `DashboardRecentRegion` → `DashboardMetricsRegion`. Fix round 3 merged the former `DashboardActionRegion` into `DashboardRecentRegion`: one *Kiriman terbaru* card that awaits both the five-row `loadTenantDashboardShipments({ mode: "actionable" })` read and the eight-row `mode: "recent"` read, lists each shipment once (actionable rows first), and shows a partial-failure alert inside the card when only one read fails. The repository function is unchanged. `loading.tsx` follows the same skeleton order (`ReadinessSkeleton` → filter placeholders → `PeriodSummarySkeleton` → `PeriodTrendSkeleton` + `RecentSkeleton` → `MetricsSkeleton`). `DashboardPeriodFilter` takes no `rangeLabel` prop; a text line under the filter names the applied dates, zone, and outlet, and the header description line was removed.
- Shared primitives in `src/components/cms`: `DataTableToolbar`, `DataTableFacetFilter`, `DataTablePagination`, `DataTableShell`, `StatCard`, and `SettingsLayout`. Facet options are `role="option"` entries with `aria-checked` that navigate with `router.push` to the same URL each option linked to before; they are no longer `<a>` links. Queue URL parameters keep their meanings on `/app/pengiriman`, `/app/pengiriman/rts`, and `/app/label`, the routes that render the toolbar. `/app/kontak` keeps its own directory browser.
- `/app/pengaturan` and `/app/anggota`: page, loading, and error render inside `SettingsLayout` with `navLabel="Administrasi"` and their own `currentHref`. The shell sidebar keeps the only `aria-current="page"`, and the settings menu marks its item with `aria-current="true"`.
- `/app/analitik`, `/app/keuangan`, and `/platform/*`: KPIs render through `StatCard`, and paginated tables use `DataTablePagination`. Platform lists and audit also use `DataTableToolbar`. Region Suspense boundaries, freshness controls, and export/basis state are unchanged.

Evidence status: T-126 records fresh655-test/82-file integration, production build and66route/viewport observations, plus independent review; T-118–T-125 are closed through that bounded gate. Current limitations and follow-up evidence belong to the latest TASKS/STATUS/BUILD-LOG entries, not this historical implementation checkpoint.

### T-134 — Shared Admin/Super Admin presentation parity

Inventory remains22pages (15tenant,4platform,3public); no handler, Server Action or navigation destination is added or removed. MonitoringView remains the server data/filter owner for all four platform pages. FilterPanel now renders one visible-primary `cms-filter-bar` GET form: period/outlet and the authorized tenant selector where the table facet does not own it; secondary dates/timezone/courier/status/search sit in a native advanced disclosure. Facet-owned dimensions remain single hidden inputs; tenant detail's route ID remains authoritative. Applying a preset or reset preserves existing parser/authorization rules and resets pagination as before.

`platform/_components/platform-period-select.tsx` is a new small client leaf owning only custom-preset disclosure opening. Native GET submission owns URL state; `rentang=kustom` selects custom dates through the existing parser. The form now uses one Terapkan submit like Admin; existing `khusus=1` URLs remain accepted. No DB/schema/provider module enters this leaf. Advanced applied values open server-side; no duplicate mobile form or client fetch is introduced.

Compact period/operational count summaries on `/app`, `/app/analitik` and platform health use two phone columns with matching skeletons; detailed current-work/full-IDR regions remain stacked. Platform Counts cards fit their own content and tenant scope uses three desktop columns. Shared table headers use the existing muted tint with opaque pinned equivalents. Analytics section prose is capped to the existing2xl measure. Platform shared loading uses visible generic controls and the same count-column choices; its two control placeholders do not exactly reproduce the overview's three fields. No Suspense/read boundary changes.

T-134 verification passes:18route/viewport observations,487actual focus probes, nine role observations, custom/preset/facet submission checks, full83-file integration suite, production build and independent source/visual review. BUILD-LOG retains native-key delivery, generic loading and control-height limits. No new route/read/action boundary is introduced.
