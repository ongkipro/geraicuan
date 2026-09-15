# UX Flows and Screen Contracts: GeraiCUAN

- Status: Accepted for CMS redesign
- Locale: `id-ID`
- Primary device model: desktop operator console with tablet rail and mobile sheet
- Visual source: `10-DESIGN-SYSTEM-WHITELABEL.md`

## UX-1 — Operational frame

- Owner: Product owner

| Actor | Primary job | Success condition | Highest failure cost |
|---|---|---|---|
| Operator | Turn valid shipment data into a provider-issued AWB and printable label | The provider AWB is issued once and the label is reachable from the shipment | Duplicate or unknown provider submission |
| Tenant Admin | Keep an outlet operational and reconcile shipment, staff, and money exceptions | Outlet readiness, member access, unpaid recovery, and ledger variance are actionable | Cross-tenant access, secret exposure, or incorrect money state |
| Super Admin | Detect platform exceptions and govern tenant lifecycle | Affected tenant and safe next action are identifiable without shipment PII | Incorrect lifecycle action or credential/PII exposure |

## UX-2 — Information architecture

- Owner: Product owner

### Tenant CMS

1. **Utama**
   - **Ringkasan** → `/app` — both tenant roles; daily command center and exception entry point.
2. **Operasional**
   - **Kiriman** → `/app/pengiriman` — both tenant roles; lifecycle queue. Create, import, detail, and label routes are contextual descendants and retain Kiriman as current.
   - **Retur (RTS)** → `/app/pengiriman/rts` — both tenant roles; failed and returning-shipment queue.
   - **Kontak** → `/app/kontak` — both tenant roles; reusable sender and recipient directory.
3. **Wawasan**
   - **Analitik** → `/app/analitik` — Tenant Admin only; historical exploration, comparison, supporting rows, and export.
   - **Keuangan** → `/app/keuangan` — Tenant Admin only; authoritative ledger, reconciliation history, and permitted mutations.
4. **Administrasi**
   - **Outlet & koneksi** → `/app/pengaturan` — Tenant Admin only.
   - **Anggota & akses** → `/app/anggota` — Tenant Admin only.

`Label & cetak` is not a separate primary object. Label preview and print history
remain reachable from an issued shipment and may also exist as a filtered issued
shipment view during migration.

### Platform CMS

One **Platform** group contains:

1. **Ringkasan** → `/platform` — exception-first platform health.
2. **Tenant** → `/platform/tenant` — tenant list, detail, and lifecycle governance.
3. **Audit** → `/platform/audit` — append-only governed event history.

## UX-3 — Shared shell contract

- Owner: Product owner

- One shadcn-based shell serves tenant and platform scope without sharing authorization.
- Desktop uses a full sidebar, tablet uses an icon rail with tooltips and visible current location, and mobile uses a labelled Sheet.
- The top bar persistently identifies tenant/platform scope and authenticated role.
- Every route has one page title, optional description, and at most one dominant primary action.
- Shell, navigation, account menu, overlays, focus return, and skip navigation are keyboard operable.
- Filter, pagination, and saved-view state that users may share remains URL-addressable.
- Every authenticated route adopts one page pattern from `docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md` § CMS page patterns. The shell adds a scope-bounded `⌘K` command palette, breadcrumbs on contextual descendants, action-needed navigation counts, and the non-interactive platform scope marker defined there.
- Navigation is derived from authorized destinations. A forbidden direct request is redirected or rejected before protected data reads and never produces a denial page with Ringkasan falsely marked current. Operator requests for Tenant Admin-only tenant destinations redirect server-side to `/app`.

## UX-4 — Shipment lifecycle journey

- Owner: Product owner

`DRAFT → ESTIMATED → SUBMISSION_QUEUED → ISSUED | AWAITING_UPSTREAM_PAYMENT | SUBMISSION_UNKNOWN | FAILED`

| State | Dominant job | Primary action | Guardrail |
|---|---|---|---|
| `DRAFT` | Complete valid shipment data | Load estimates | Preserve input and immutable party snapshot rules |
| `ESTIMATED` | Select an eligible service | Confirm issuance | Show provider values and COD breakdown before confirmation |
| `SUBMISSION_QUEUED` | Wait for authoritative provider result | None | Do not expose a duplicate submission action |
| `ISSUED` | Print or reprint the provider label | Open label | Provider `cnote_no` remains the only AWB authority |
| `AWAITING_UPSTREAM_PAYMENT` | Recover after wallet funding | Recover payment | Tenant Admin only; one explicit confirmation |
| `SUBMISSION_UNKNOWN` | Reconcile uncertain upstream state | Follow recovery guidance | Never retry creation before reconciliation |
| `FAILED` | Understand the safe recovery path | State-dependent | Preserve sanitized error and original draft context |

The lifecycle describes the accepted product flow, not current production release permission. While TD-14 remains closed, issuance and unpaid-recovery controls are disabled or absent in production and explain that only sanctioned sanitized fixture validation is approved; no role can override this gate.

## UX-5 — Screen contracts

- Owner: Product owner

| Screen | Primary job | Presentation | Required states | Primary components |
|---|---|---|---|---|
| CMS shell | Retain location and scope while moving between jobs | Persistent sidebar/rail/sheet plus compact top bar | active, collapsed, mobile open, sign-out pending/error | `Sidebar`, `Sheet`, `Tooltip`, `DropdownMenu`, `Separator`, `Button` |
| Shipment queue | Find the next shipment requiring action | Data-table toolbar (search plus URL-addressed facet filters and Reset) over a dense server-paginated table in a labelled overflow region | system empty, filtered empty, loading, error, partial/stale | `Button`, `Badge`, `Table`, `Select`, `Sheet`, `Pagination` |
| Shipment creation | Capture one valid shipment without losing data | Full-page stepped flow (spec 10 Pattern 5) with provider-authoritative destination search, summarised completed steps, visible draft persistence, and a persistent action/money summary | pristine, destination loading/no-result/error, validation error, saved, estimating, blocked outlet | `Field`, `Input`, `Textarea`, `Command`, `Popover`, `RadioGroup`, `Alert`, `Button` |
| Shipment detail | Understand immutable context and perform the one valid next action | Status header, next-action region, lifecycle timeline, grouped facts | every shipment lifecycle state, loading, missing, error | `Badge`, `Alert`, `Button`, `Separator`, `Table` |
| Issuance/recovery | Confirm a costly provider transition | Context-preserving confirmation with consequence | pending, success, provider failure, unknown, unauthorized | `AlertDialog`, `Alert`, `Button` |
| Bulk intake | Validate and commit only valid rows | Upload → validation → row review → confirmation → result | invalid file, mixed rows, pending, partial failure, success | `Field`, `Input`, `Table`, `Checkbox`, `Alert`, `Button` |
| Contacts | Find and maintain reusable party data | Searchable directory and dedicated detail form with provider-authoritative address-area selection | system empty, filtered empty, archived, destination loading/no-result/error, validation error | `Input`, `Command`, `Popover`, `Badge`, `Table`, `Field`, `AlertDialog` |
| Outlet settings | Restore or maintain outlet readiness | One outlet selector/list-detail context followed by location and Mengantar connection sections | no outlet, incomplete, pickup loading/account-empty/query-empty/error, legacy unlabelled, platform fallback, private unstored, private stored-unverified, connected, credential rejected, provider unavailable, secret missing, replacement pending/error/success, safe switch confirmation | `Badge`, `Alert`, `Field`, `RadioGroup`, `Input`, `Command`, `Popover`, `Select`, `AlertDialog`, `Button` |
| Members | Govern tenant access | Status tabs, compact member table with row `⋯` actions, and one header invite `Dialog` | empty, invited, active, deactivated, last-admin blocked | `Table`, `Badge`, `DropdownMenu`, `Dialog`, `AlertDialog`, `Tooltip`, `Button` |
| Analytics | Explore historical lifecycle performance without replacing financial authority | Four period/snapshot KPIs, trend and breakdowns, a separate latest tenant-wide signed variance exception, then supporting table/export | no data, filtered empty, adjusted filter, loading, partial error, stale | `Card`, `Chart`, `Table`, native filter disclosure, `Button` |
| Finance | Reconcile money exceptions and inspect source entries | Summary strip, variance queue, then ledger table | matched, variance, reversal, loading, error | `Badge`, `Alert`, `Table`, `AlertDialog`, `Button` |
| Platform monitoring | Triage platform and tenant exceptions | Threshold-ranked *Perlu perhatian* list before one KPI strip, trend chart with collapsible data table, and aggregate detail | healthy, warning, critical, degraded, empty | `Badge`, `Table`, `Chart`, `Sheet`, `Button` |
| Label preview | Verify and print an issued provider label | Domain-specific 100×150 mm sheet plus compact toolbar/history | unavailable, overflow warning, COD mismatch, print success/error | `Button`, `Alert`, `Table`; semantic print markup remains custom |
| Tenant overview | Choose the next permitted operational action | Header with the period/outlet filter row and a visible applied period · timezone · outlet line, then period summary KPI stat cards, then a two-column row of the comparative shipment chart beside the compact *Kiriman terbaru* card (the eight most recent shipments merged with up to five actionable ones, each shipment once, actionable rows first with exceptions leading, at most eight rows, a next-action button only where the role has one), then the current-work cards (spec 19 M-2) | first-run, healthy, actionable exceptions, partial/stale, loading, error | `Card`, `Alert`, `Badge`, `Chart`, `Skeleton`, `Button` |

## UX-6 — Component and visual rules

- Owner: Product owner

- shadcn/ui is the source for the complete interactive vocabulary; native semantic HTML remains valid when it is smaller and equally accessible.
- Use one semantic token graph. Legacy `sales-*`, `ship-*`, `ops-*`, `an-*`, and `bulk-*` presentation classes are migration-only and must not appear in new CMS components.
- A legacy authenticated screen is not migrated until its rendered path no longer depends on those legacy presentation classes. Reuse shared shadcn components and semantic tokens; native `form`, `select`, `table`, and `details` remain valid where they are the smaller accessible primitive.
- No speculative dark mode, gradients, backdrop blur, decorative shadows, nested cards, or decorative KPI grids.
- Cards group a real concept; tables and dividers remain the default for dense operational data.
- Status always has readable text and, where direction matters, a non-colour cue.
- Destructive or provider-costly actions use an explicit named confirmation; reversible actions do not.

## UX-7 — Responsive acceptance

- Owner: Product owner

- `390px`: mobile Sheet navigation, locally contained data overflow, no document overflow, and 44px minimum primary touch targets.
- `768px`: icon rail retains current-location meaning through icon, active state, and tooltip.
- `1280px`: full sidebar and dense tables preserve readable hierarchy without decorative empty space.
- Breakpoint-sensitive GET filters mount one form and one labelled control set only. At 390px a native disclosure hides the adjacent form region from layout and keyboard order until opened; at 768px and 1280px the same server-rendered form is inline. URL submission, reset, reload, and Back preserve canonical values and focus targets without `matchMedia`, portal relocation, or duplicated IDs.
- Every migrated screen is checked for keyboard order, visible focus, accessible names/states, loading, empty, error, and its primary success path.

## UX-8 — Tenant overview contract

- Owner: Product owner

The overview borrows the useful completeness of a mature shipping dashboard—summary, exceptions, trends, and source records—without copying another product's branding, information hierarchy, or unsupported business metrics.

Public Indonesian shipping-dashboard evidence supports this coverage: Mengantar documents COD collection states, shipment-status summaries, attention queues, and courier performance; KiriminAja documents balance/COD/status/issue summaries plus daily shipment and courier reports. GeraiCUAN transfers the decision pattern, not the nouns blindly: ticketing, withdrawal balance, affiliate income, delivery/return tracking, SLA, and destination geography stay absent until accepted requirements and authoritative data exist. Sources reviewed 2026-08-31: [Mengantar dashboard guide](https://help.mengantar.com/id/articles/5111202-dashboard) and [KiriminAja shipment-statistics guide](https://help.kiriminaja.com/article/panduan-laporan-statistik-pengiriman-di-dashboard-baru).

| Region | Operator | Tenant Admin | Completion rule |
|---|---|---|---|
| Scope and time | Tenant, URL-persisted date range, fixed WIB (Asia/Jakarta), generated-at time | Same | Scope and time remain visible beside the compact date filter |
| Priority analytics | Period shipment input, COD input, non-COD input, and authoritative issued outcomes | Same | Counts and COD/non-COD composition use the same tenant-scoped created-time range; issued uses authoritative provider resolution time and is labelled separately |
| Operational status | Draft/estimated work, current failed/unknown work | Same plus awaiting-payment and reconciliation exception counts | Current snapshot values sit below period analytics and link to the queue that produces them |
| Readiness | Read-only blocking notice with escalation guidance | Actionable outlet/provider readiness notice | Do not show a healthy decorative card; show only a condition that changes work |
| Exception queue | Shipment states the Operator may inspect or repair | Same plus unpaid recovery and reconciliation variance | Highest failure-cost items appear first; role-forbidden actions are absent |
| Recent shipments and follow-up (*Kiriman terbaru*) | One compact card merging the eight most recently updated permitted shipments (including outcomes that need no action, such as *Resi terbit*) with up to five actionable shipments; each shipment appears once and at most eight rows show, so the (at most five) actionable shipments read for the card always stay visible; further actionable shipments are reached through *Lihat semua kiriman* and the current-work cards. Actionable rows come first (exceptions, then drafts/estimates, newest first), followed by the remaining recent rows newest first. The description reads *Yang perlu ditindaklanjuti tampil lebih dulu.* Each row is a two-line list item: shipment reference link and lifecycle badge (text and icon), then a short absolute WIB time (for example *13 Sep, 12.03*, full instant in `<time dateTime>`) · recipient · destination area (truncated; outlet name only when the tenant has more than one outlet), and *AWB* only when the provider issued one — the AWB is never truncated and wraps to its own line when it does not fit. Only rows with a valid next action for the role carry that action button, in a right-hand column from `sm` and full width below the row on phones. No row may widen the document at 390px. Per-status guidance and the relative last-activity phrase are not repeated in the card; they live on shipment detail. *Lihat semua kiriman* sits in the card header and opens the full queue | Same, with Tenant Admin-only actions where permitted | Provider AWB appears only after authoritative `cnote_no`; role-forbidden actions are absent; no shipment is listed twice on the page |

- The overview has no free-floating “revenue”, “COD income”, or gross collection card. COD/non-COD cards count shipment inputs and may show explicitly labelled declared-goods value; they never describe receiver collection, principal liability, or revenue. If a Tenant Admin needs financial decisions, the overview shows an exception count and links to Keuangan; ledger meaning remains authoritative there.
- A first-run tenant sees outlet readiness and the next setup action instead of zero-filled analytics. A genuinely healthy/empty operational day says why no work is present and links to create/import shipment. Filtered empty names the active filters and offers reset.
- Background refresh may announce newer records but does not reorder a row under the pointer or keyboard focus. A visible refresh action and generated-at timestamp are always available.
- Ringkasan provides a shallow selected-versus-previous shipment trend before current work. Multi-dimensional historical exploration and export belong to Analitik; authoritative ledger entries and reconciliation mutations belong to Keuangan.

## UX-9 — Tenant analytics contract

- Owner: Product owner

**Decision sequence:** understand the selected period → compare against the prior equal period → identify lifecycle/courier change → inspect the exact filtered records.

1. **Filter bar:** preset/custom range, outlet, courier, lifecycle, fixed WIB context, and the detail/export basis (`created`, `issued`, provider `outcome`, or current `exceptions`). URL parameters are the shareable source of view state; mobile uses the accepted native disclosure around the same server-rendered form tree and retains active filter chips/count plus reset on the page. Unknown tenant scope or basis fails closed rather than broadening the result.
2. **KPI row:** created, issued, issuance success rate with denominator, and unresolved operational exceptions. Each includes basis, prior-period delta where valid, non-colour direction cue, and a link to supporting rows. Snapshot KPIs say `Saat ini` and cannot masquerade as period events.
3. **Primary trend:** two-series line chart for created versus issued by WIB/local day. Series differ by colour plus dash/marker; axes and units are named; every datum exists in an immediately associated semantic table.
4. **Breakdown:** a sorted courier comparison or lifecycle table appears only when the metric can answer an operator decision. Bars start at zero; low-volume rates show their denominator and do not imply certainty.
5. **Detail:** server-paginated shipment table with explicit timestamp or current-snapshot basis, lifecycle, courier, AWB availability, and permitted drill-down. Created, issued, success-rate, and unresolved-exception KPI links switch the table to the supporting `created`, `issued`, provider-`outcome`, or current-`exceptions` basis. Event bases preserve period and timezone; every basis preserves authorized outlet, courier, and lifecycle dimensions. Sort, page, basis, and filters survive reload/back navigation. Export uses that same basis and covers the filtered set, not merely the current page; a synchronous result above 10,000 rows is refused explicitly rather than truncated.
6. **Financial meaning:** COD principal outstanding/remitted, service-fee revenue, VAT payable, provider cost, and variance are separate labelled concepts. No chart or KPI sums principal into revenue or describes customer collection as earnings. A fifth, separate exception presents the latest signed reconciliation variance from the newest tenant-wide reconciliation record; it explicitly ignores analytics period, courier, and lifecycle filters, links to `/app/keuangan?status=VARIANCE#reconciliation-history-title`, and leaves Keuangan authoritative.

Required independent states are representative skeleton loading, no event data for the selected period, filtered empty, invalid/adjusted range, partial chart failure with retained KPIs/table, whole-query failure with retry, and stale/generated-at notice. Accessible text summarizes the chart's key comparison; tooltip-only values, colour-only series, and canvas-only data are prohibited.

## UX-10 — Provider location and outlet configuration contract

- Owner: Product owner

- Contact-address and shipment destination fields use server-backed Mengantar area search. The user searches and selects a readable area hierarchy; opaque provider IDs are hidden values and never editable text fields.
- A selected destination keeps its provider ID and displayed hierarchy as one value. Contact reuse may prefill that pair, but the server revalidates authority before a new operational snapshot proceeds. Clearing or changing the query cannot silently retain an old hidden ID.
- Destination loading, query-empty, no-result, malformed/unavailable-provider, selected, and retry states are local to the selector and preserve unrelated form input. Keyboard navigation, visible focus, accessible selection state, and recovery focus are required.
- Keep one navigation destination, **Outlet & koneksi**. Do not add a competing API menu.
- At 1280px, many outlets use a compact list-detail composition; at 390px and 768px, one outlet selector precedes the single active form. Do not render duplicate desktop/mobile forms.
- Order the detail by operator decision: **Lokasi pengiriman** first, then **Koneksi Mengantar**. Pickup uses an account-scoped searchable `Command` inside `Popover`; its trigger and results show readable provider labels, while the selected area is derived from the pickup and displayed read-only. Opaque IDs remain hidden persistence values and are revalidated server-side. Loading, no-result, provider-error/retry, legacy-unlabelled, selected, and disabled-save states are explicit and preserve the last saved choice.
- Connection mode uses explicit `Default GeraiCUAN` and `Akun Mengantar sendiri` choices. The tenant never edits the provider base URL.
- Private mode accepts a blank API-key password field only for create or replacement. A stored key is represented as `API key tersimpan` plus a safe timestamp; it is never prefilled, revealed, copied, or represented by fragments. Replacement opens a blank field and clears it after every result.
- `Tersambung` means a safe non-mutating provider verification succeeded. A database reference alone is labelled `Tersimpan, belum diverifikasi`. Authentication failure, provider unavailability, and missing/unreadable secret have distinct non-secret recovery guidance.
- Switching from private to platform default uses a named `AlertDialog`, keeps the existing private key until the server proves the platform default complete, and returns focus to the initiating control.
- Secret submission preserves non-secret outlet/location values, focuses the first safe field error or result summary, provides 44px actions, and never returns the submitted secret through action state.

## UX-11 — Post-change whole-system screening contract

- Owner: Paduka Ongki

- Screening is route- and job-complete, not screenshot-complete: 15 authenticated tenant pages, 4 authenticated platform pages, the public sales page, and both login entries must map to an actor, primary job, entry point, state matrix, permission boundary, and executable browser journey.
- Review operational correctness before presentation. Trace rendered information and actions through server authorization, validation, data ownership, lifecycle, audit/ledger effects, and recovery; visual polish cannot approve a broken or unreachable workflow.
- Reuse the existing deterministic scenario registry. Every applicable screen covers initial loading, system empty, filtered/query empty, populated, partial/stale, route or lookup error, unauthorized/read-only, pending mutation, conflict where possible, and primary success without exposing test controls in production.
- Screen tenant routes as one product across Ringkasan, Kiriman, Retur (RTS), Kontak, Impor, Label, Analitik, Keuangan, Outlet & koneksi, and Anggota & akses. Screen platform monitoring, tenant governance, and audit as a separate platform job; never blur global and tenant scope.
- UI/UX review compares 390px, 768px, and 1280px for hierarchy, density, shell/page rhythm, tables/charts/forms, status language, keyboard/focus, accessible names/states, 44px applicable actions, local overflow, and zero unexpected browser/runtime/network errors. Screens that already satisfy the contract remain unchanged.
- A material finding fails the screening boundary and names one owning requirement/task plus a reproducible state. Repair occurs in that atomic owner, receives the capability-appropriate independent review, and the failed screening reruns from a fresh baseline.

## UX-12 — Tokophi adaptation contract

- Direction recorded 2026-09-13; implements existing PR-17, PR-22, PR-25, and PR-26 through the Phase 12 tasks. Spec 10 owns the visual mapping and proposed blue palette.
- **Tenant home:** scope, role, period, and generated-at context → compact created/COD/non-COD/issued strip → comparative shipment line chart → ranked current attention list → recent shipments and valid next action. Preserve the explicit distinction between created-time inputs, resolved-time issuance, and current work snapshots. Operator never receives Tenant Admin-only recovery or finance controls.
- **Platform home:** persistent platform scope → ranked provider/queue exceptions → operational KPI strip → trend → aggregate or selected-tenant detail. It does not inherit the tenant home ordering or expose recipient information.
- **Analytics:** one URL-owned filter form → four operational KPIs → comparison trend → courier and current lifecycle breakdowns → supporting records and filtered export. Financial figures remain separately classified; tenant-wide reconciliation snapshots explicitly name their independent scope. No storefront visitor, conversion, product-ranking, or device widget is added.
- **Drill-down:** a period KPI opens its supporting basis with the applicable range, timezone, outlet, courier, and lifecycle dimensions preserved. Current exception links target the current source queue and do not pretend that a period filter applies. Generated-at timestamps describe the region that produced them.
- **Recovery:** first-run explains setup, filtered-empty offers reset, zero means measured zero, and unavailable data says unavailable. Loading follows final geometry; partial failures preserve successful sibling regions and filters. Network refresh never reorders focused work unexpectedly.
- **Verification:** T-94 validates the blue tokens and shell; T-98/T-99 validate role-specific home order; T-100 proves filter/KPI/chart/table/export parity and URL reload/Back behavior; T-108 reviews keyboard, mobile, empty/error/stale states across the affected surfaces. Source inspection alone cannot mark those tasks complete.


### T-111 refinement — 2026-09-14

Dashboard entry defaults to the last seven calendar days including today in WIB. Explicit URL ranges override the default. A successful zero-count multi-day result keeps the shipment chart and semantic table visible; errors retain their own recovery state. Current-work counts remain outside period filtering.


### T-113 — Shared admin workspace behavior

Primary period/outlet filters remain visible on narrow screens. Secondary filters share one labelled native disclosure inside the original GET form; selecting Custom opens dates immediately and saved custom values remain available. Submit/reset preserve existing URL and server-validation contracts. Dashboard order at T-113 was summary → comparative line chart → current work → actionable/recent records; Phase 13 supersedes it (see below). Analytics order is operational summary → trend → financial details → reconciliation → courier/detail tables; operational/financial summaries await the same scoped result. Contact and shipment forms retain every field, recovery state and independent action. Settings retains its outlet navigation and separate location/private/fallback forms. No persistent theme preference or provider action is added.


### Phase 13 — Ringkasan recomposition (T-119, 2026-09-14)

Ringkasan follows the shadcn-admin dashboard pattern: summary KPIs → chart plus recent-shipments card → current work. The page header carries the period/outlet filter row; a compact line below it names the applied dates, timezone, and outlet at every width. Period stat cards follow, and a supporting-record table appears when `support` is set. The comparative shipment chart and the *Kiriman terbaru* card share one 4:3 row from `lg` (both cards stretch to the row height) and stack below it. The current-work cards come last. The former separate eight-row *Kiriman terbaru* table and *Tindak lanjut* card are merged into that one card: both reads remain, each shipment is listed once, actionable rows lead with their role-specific next action, and recent rows that need no action (for example *Resi terbit*) keep their reference, status, recipient, destination, AWB when available, and a short absolute WIB time without an action button. Product owner decision (2026-09-14): the card stays compact — per-status guidance lives on the shipment detail page, not in the card rows. From `lg` both cards stretch to the row height and the chart plot grows into the extra height, so no blank area opens under the chart. URL parameters, drill-down links, role gating, metric bases (spec 19), and freshness disclosures are unchanged. Browser evidence for this order is owned by T-125 and is not yet recorded.

### PR-34–PR-37 operational refinement (2026-09-15)

The shared header provides role-filtered shadcn Dialog/Command page search and a hydration-safe live WIB clock with seconds. Search highlights the active option separately from the current page, returns focus on cancellation, and does not intercept editable contexts. On narrow screens the clock occupies a second header row.

Pengiriman exposes Buat kiriman and Histori kiriman alongside RTS and Kontak. Administration exposes one Pengaturan destination; outlet and member management remain internal tabs. Full tenant-authorized operational phone numbers and shipment references wrap without masking or ellipsis. Platform monitoring and logs continue to exclude recipient PII.

All date filters and date/year boundaries use WIB. Legacy timezone URLs normalize to Asia/Jakarta and the UI removes timezone selection; stored instants remain UTC. This supersedes earlier timezone-selection and tenant phone-masking descriptions.

### PR-39 / PR-40 — Quick rate-check screen

Entry: tenant-only Cek Tarif header action and search result; planned route `/app/cek-tarif`. The sidebar retains eight Admin/five Operator destinations, with two visible group headings and Dasbor first. Search additionally includes the rate tool; platform navigation remains unchanged. Pengaturan contains only outlet and membership governance.

Primary job: compare shipping prices before preparing a shipment. A focused form contains ready outlet (origin derived), searchable destination and weight in grams. Results show service, IDR shipping estimate, delivery window and COD support, plus WIB retrieval time. Use existing shadcn Field/Input/Select/Command/Button/Table primitives with the PR-38 single-focus treatment. No public/customer form or recipient phone/name is required.

States: loading route; no ready outlet with Admin configuration link or Operator contact-admin guidance; untouched form; local/server validation; pending quote with duplicate submit disabled; provider unavailable with preserved input/retry; rate-limited feedback; no eligible services; successful list; stale input change hides prior results. No default fabricated prices, total-payment claim, hidden order creation, or provider mutation. Closing/leaving the screen discards only unsaved quote state.

Persistence: local form/action state only; selected outlet may be initialized by authorized query, but no operational record is written. Server rate-limit bookkeeping remains an existing security side effect. Quotes are not reused as issuance authority.

Quick-rate origin context: before retrieval, explain that the selected outlet pickup determines the origin; show the authoritative area label with the returned quote. Do not guess an origin from outlet name or an unbound stored label.


### PR-42 — Analytics progressive disclosure

`/app/analitik` orders the existing filter/context, operational summary, compact current reconciliation alert, shipment trend, courier performance, financial context and supporting shipments. Charts, two principal/margin cards, COD liability guidance and the paginated supporting shipment table remain visible. Reconciliation retains its independent tenant-wide/current scope and count-based exception emphasis, including a nonzero count with zero net amount.

Three labelled native disclosures reveal the complete trend table, courier table and four cost cards. They start closed, use 44px keyboard-focusable summaries and preserve all rows, metric definitions, low-volume qualifications and recovery states. Labels describe already-loaded detail rather than implying a network load-more request. Browser-local open state is not a URL filter or persisted preference. Existing URL filters, KPI anchors, CSV export and shipment pagination keep their meanings. Loading follows the final order and compact geometry.

Shared ChartContainer retains Recharts accessibility behavior and supplies a visible 2px inset focus outline on its interactive SVG surface. This corrects the missing indicator found by real-browser verification.
