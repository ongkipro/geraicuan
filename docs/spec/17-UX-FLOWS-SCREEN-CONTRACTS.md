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
   - **Pengirim** → `/app/kontak/pengirim` and **Penerima** → `/app/kontak/penerima` — both tenant roles; reusable sender and recipient contacts as two menus in the Data group (T-188, PR-65). `/app/kontak` redirects to Pengirim (or Penerima for `?peran=penerima`).
3. **Wawasan** (rendered as the **Laporan** group since PR-54)
   - **Analitik** → `/app/analitik` — Tenant Admin only; historical exploration, comparison, supporting rows, and export.
   - **Laporan pengiriman** → `/app/laporan/pengiriman` — Tenant Admin only; the kiriman record per periode, outlet, kurir and lifecycle, with CSV export (PR-55, T-165).
   - **Riwayat cetak resi** → `/app/laporan/cetak-resi` — Tenant Admin only; the recorded print attempts with their outcome, reason, actor role and reprint count (PR-55, T-166).
   - **Keuangan** → `/app/keuangan` — Tenant Admin only; authoritative ledger, reconciliation history, and permitted mutations.
4. **Administrasi**
   - **Pengaturan** → `/app/pengaturan` — Tenant Admin only. Its own menu holds Profil toko (`/app/pengaturan`), Titik pickup (`/app/pengaturan/pickup`), Outlet (`/app/pengaturan/outlet`), Koneksi Mengantar (`/app/pengaturan/koneksi`) and Anggota & akses (`/app/anggota`).
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

**Payment method (PR-64, D-12, T-186).** The draft form's "Nilai dan pembayaran" card offers three large radio choices — **Non-COD**, **COD**, **COD Ongkir** — each a bordered label with a title and a one-line consequence, ≥ 56 px tall (≥ 44 px targets below `md`), selected state by border and tint. Only the chosen method's panel is rendered, so another method's field is never in the form or submitted; its appearance is announced through a polite `role="status"` live region. Non-COD: "Nilai barang untuk asuransi (Rp)". COD: "Nilai barang (Rp)" plus a note that the total the courier collects is computed after a service is chosen (goods + ongkir + Mengantar's 3.33%) and is never typed. COD Ongkir: "Nilai barang yang sudah dibayar (Rp)" (not collected) plus a note that the shipping charge is set per service, starts at break-even and may only go up. The goods value typed in one panel carries to the next. The server refuses an unknown method and a zero goods value for COD and COD Ongkir.

**COD Ongkir charge.** Shown per COD-eligible service in the draft estimate panel (a preview, not saved) and for the selected service in "Pilih layanan dan terbitkan AWB" (submitted as `codShippingChargeIdr`). It states the shipping Mengantar deducts and the break-even, starts at break-even, refuses a lower or non-whole value inline with the exact minimum and shortfall (`role="alert"`, `aria-invalid`), and states Mengantar's 3.33% and the seller's difference live (`aria-live="polite"`). The confirm checkbox and button stay disabled while the charge is refused, and the server refuses the same charge (and any charge on a shipment that is not COD Ongkir, and any change to a recorded charge) with an Indonesian message naming the figure. The thermal label prints "COD ONGKIR — TAGIH ONGKIR SAJA" with the charge and "Barang sudah dibayar · JANGAN DITAGIH", the goods value as "Nilai (lunas)", and no goods breakdown; the stub prints "COD ONGKIR" and the charge. Shipment detail, Laporan pengiriman and Analitik name the method.

The lifecycle describes the accepted product flow, not current production release permission. While TD-14 remains closed, issuance and unpaid-recovery controls are disabled or absent in production and explain that only sanctioned sanitized fixture validation is approved; no role can override this gate.

## UX-5 — Screen contracts

- Owner: Product owner

| Screen | Primary job | Presentation | Required states | Primary components |
|---|---|---|---|---|
| CMS shell | Retain location and scope while moving between jobs | Persistent sidebar/rail/sheet plus compact top bar; expanded/mobile groups are an always-visible tree (all groups open by default, current-route group always open) whose whole group row is the disclosure button (T-187); icons mark top-level rows only (Dasbor and group headers), submenu items are text in the tree and the rail flyout (T-192) | active, collapsed, mobile open, sign-out pending/error | `Sidebar`, `Sheet`, `Tooltip`, `DropdownMenu`, `Separator`, `Button` |
| Shipment queue | Find the next shipment requiring action | Data-table toolbar (search plus URL-addressed facet filters and Reset) over a dense server-paginated table in a labelled overflow region | system empty, filtered empty, loading, error, partial/stale | `Button`, `Badge`, `Table`, `Select`, `Sheet`, `Pagination` |
| Shipment creation | Capture one valid shipment without losing data | Full-page stepped flow (spec 10 Pattern 5) with provider-authoritative destination search, summarised completed steps, visible draft persistence, and a persistent action/money summary | pristine, destination loading/no-result/error, validation error, saved, estimating, blocked outlet | `Field`, `Input`, `Textarea`, `Command`, `Popover`, `RadioGroup`, `Alert`, `Button` |
| Shipment detail | Understand immutable context and perform the one valid next action | PR-45 detail pattern (T-151): a `Status kiriman` rail with status, next-action region, stale-operation/reconciliation/unpaid-recovery panels, resi and label entry, and lifecycle timeline; grouped facts in the main column, with recovery warnings at its top. Below the split the rail follows the main column | every shipment lifecycle state, loading, missing, error | `Badge`, `Alert`, `Button`, `Separator`, `Table` |
| Issuance/recovery | Confirm a costly provider transition | Context-preserving confirmation with consequence | pending, success, provider failure, unknown, unauthorized | `AlertDialog`, `Alert`, `Button` |
| Bulk intake | Validate and commit only valid rows | Upload → validation → row review → confirmation → result | invalid file, mixed rows, pending, partial failure, success | `Field`, `Input`, `Table`, `Checkbox`, `Alert`, `Button` |
| Contacts | Find and maintain reusable party data | Searchable directory and dedicated detail form with provider-authoritative address-area selection | system empty, filtered empty, archived, destination loading/no-result/error, validation error | `Input`, `Command`, `Popover`, `Badge`, `Table`, `Field`, `AlertDialog` |
| Outlet settings | Restore or maintain outlet readiness | One outlet selector/list-detail context followed by location and Mengantar connection sections | no outlet, incomplete, pickup loading/account-empty/query-empty/error, legacy unlabelled, platform fallback, private unstored, private stored-unverified, connected, credential rejected, provider unavailable, secret missing, replacement pending/error/success, safe switch confirmation | `Badge`, `Alert`, `Field`, `RadioGroup`, `Input`, `Command`, `Popover`, `Select`, `AlertDialog`, `Button` |
| Members | Govern tenant access | Status tabs, compact member table with row `⋯` actions, and one header invite `Dialog` | empty, invited, active, deactivated, last-admin blocked | `Table`, `Badge`, `DropdownMenu`, `Dialog`, `AlertDialog`, `Tooltip`, `Button` |
| Analytics | Explore historical lifecycle performance without replacing financial authority | Four period/snapshot KPIs, trend and breakdowns, a separate latest tenant-wide signed variance exception, then supporting table/export | no data, filtered empty, adjusted filter, loading, partial error, stale | `Card`, `Chart`, `Table`, native filter disclosure, `Button` |
| Finance | Reconcile money exceptions and inspect source entries | Summary strip, variance queue, then ledger table | matched, variance, reversal, loading, error | `Badge`, `Alert`, `Table`, `AlertDialog`, `Button` |
| Platform monitoring | Triage platform and tenant exceptions | Threshold-ranked *Perlu perhatian* list before one KPI strip, trend chart with collapsible data table, and aggregate detail | healthy, warning, critical, degraded, empty | `Badge`, `Table`, `Chart`, `Sheet`, `Button` |
| Label preview | Verify and print an issued provider label | Size choice (10 × 15 cm default with sender stub, or 10 × 10 cm) above the print control, then the thermal sheet at that size, then history (T-176) | unavailable, overflow warning, COD mismatch, AWB too long for a barcode, print success/error | `Button`, `Alert`, `Table`, native radio `fieldset`; semantic print markup remains custom |
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

- The overview has no free-floating “revenue”, “COD income”, or gross collection card. COD/non-COD cards count shipment inputs only; since T-177 (2026-09-17) they carry no declared-goods value, and they never describe receiver collection, principal liability, or revenue. If a Tenant Admin needs financial decisions, the overview shows an exception count and links to Keuangan; ledger meaning remains authoritative there.
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

`/app/analitik` orders the existing filter/context, operational summary, compact current reconciliation alert, shipment trend, courier performance, financial context and supporting shipments. Charts, the three COD money cards (Biaya kirim Mengantar, Biaya COD, Estimasi dana dicairkan Mengantar — T-177, owner decision 2026-09-17; the COD principal, COGS and net-margin cards are withdrawn), the note that the disbursement is an estimate with actual payouts in Keuangan, and the paginated supporting shipment table remain visible; the fee split (Biaya layanan COD, PPN biaya layanan COD) sits in the closed cost disclosure. Reconciliation retains its independent tenant-wide/current scope and count-based exception emphasis, including a nonzero count with zero net amount.

Three labelled native disclosures reveal the complete trend table, courier table and four cost cards. They start closed, use 44px keyboard-focusable summaries and preserve all rows, metric definitions, low-volume qualifications and recovery states. Labels describe already-loaded detail rather than implying a network load-more request. Browser-local open state is not a URL filter or persisted preference. Existing URL filters, KPI anchors, CSV export and shipment pagination keep their meanings. Loading follows the final order and compact geometry.

Shared ChartContainer retains Recharts accessibility behavior and supplies a visible 2px inset focus outline on its interactive SVG surface. This corrects the missing indicator found by real-browser verification.

### PR-43 — Keuangan Mengantar settlement (T-146)

- Placement: after "Jalankan rekonsiliasi", before "Entri ledger". Section "Pencairan Mengantar" states the matching rule and that variance = provider payout − ledger expectation (provider COD amount − ledger provider cost), then the latest pull summary. A shared platform account shows only this tenant's matched counts, never account-wide totals. A failed settlement read shows its own destructive alert while the ledger workspace stays usable.
- Empty states: "Data Mengantar belum pernah ditarik." before any pull; "Belum ada resi GeraiCUAN yang cocok." when a pull found no tenant AWB.
- Table (region scroller, sticky first column, max 100 recent shipments): Kiriman (public reference link), Resi, Outlet, Status Mengantar, Dana cair, Ekspektasi ledger, Selisih (signed), Potongan ongkir, Retur/refund, Kategori badge — Nominal beda, Terkirim belum cair, Biaya retur, Klaim/refund, Cocok, Dalam proses.
- "Tarik data Mengantar" card: outlet select and one submit (≥44 px). No confirmation dialog because the action is read-only toward the provider and append-only locally. Pending text is a polite status; the result alert (`role=status` success, `role=alert` error) receives focus. Throttle, configuration, period-too-large and provider errors each have a distinct message. The workspace period is reused and capped at 62 days.

### PR-44 — Shipment numbers, URLs and prefix setting (T-147)

- Every shipment identifier on screens, tables, labels and exports is `PREFIX-number` (e.g. `GC-10013`); the PR-41 `creator-YYMMDD-serial` form no longer appears. Detail and label URLs are `/app/pengiriman/10013` and `/app/label/10013`; a pasted `GC-10013` or an old UUID link redirects there.
- Pengaturan → "Awalan nomor kiriman" (Tenant Admin): while unlocked, an input prefilled with the suggested initials (or the current prefix after an unlock), current prefix, live preview `PREFIX-10013`, and "Simpan dan kunci awalan". Submitting opens a confirmation dialog stating that every existing number changes and the prefix cannot be changed again; only the dialog's confirm button carries `confirmation=locked`, so a pre-hydration submit is rejected. Errors render in a focused destructive alert. When locked: read-only "Awalan terkunci: TKP-" with lock time and a pointer to Super Admin.
- Platform tenant detail (Super Admin): current prefix with lock state ("terkunci sejak …" or "belum terkunci"); "Buka kunci awalan" is disabled unless locked and asks for confirmation that printed labels will no longer match; success and error results receive focus and the page revalidates.

### T-148 — Compact shipment tables

- Histori kiriman columns: Nomor kiriman, Status / Pembayaran, Penerima (name · phone · district, city), Paket / Outlet, Ekspedisi / Resi, Aktivitas terakhir (date over time).
- Analytics supporting shipments: Kiriman, Status, Dibuat and Resi terbit (each date over time), Ekspedisi / Resi, Outlet, Total COD; the table fits its 1440 px container without local scrolling.
- Label list: Ekspedisi / Resi (sticky), Terbit (date over time), Penerima stack; the separate Tujuan column is removed. RTS queue: Penerima stack and stacked status time. Keuangan ledger entries: stacked Efektif time.
- No column shows a full address; at 390 px tables scroll inside their own region and the page does not scroll horizontally.

### T-160, T-161, T-168 — dashboard, Cek resi and freshness (2026-09-16)

- **Dasbor order:** period filter → period KPI summary → **Hasil pengiriman** (Terkirim / Retur / Gagal × COD / Non-COD / Total) → **Rekap per kurir** (Kurir, Kiriman, Terkirim, Retur, Biaya kirim) → chart → recent shipments. The snapshot block "Saat ini · Pekerjaan yang perlu diperhatikan" is removed by owner decision; the work it listed is reached from the queue it filters. Both new regions caption their basis: counts follow the created-date cohort with current status, cost follows the ledger's effective date, and shipments without a courier (draft or estimate) are excluded. Empty states: "Belum ada hasil pada periode ini", "Belum ada kurir pada periode ini". The cost column exists only for Tenant Admin. There is no margin column: D-3b is withdrawn (T-177, owner decision 2026-09-17), so no margin, COGS or goods-value figure is reserved or captioned.
- **Cek resi (`/app/cek-resi`):** input accepts a shipment number (`10013`), a prefixed number (`GC-10013`) or an AWB this tenant issued. States: idle prompt, pending, found, not found, invalid input, rate-limited, route error. Found shows lifecycle status with its guidance line, the latest provider observation with its WIB timestamp, destination **area label only**, courier/service, AWB, COD or non-COD, and a link to the shipment. **Privacy contract:** an unknown key and another tenant's key produce the same wording and the same absent result, with no provider call; the result never carries recipient name, phone or address. The key is posted through a Server Action, never through the URL. Invalid input focuses the field; every other outcome announces politely; rate-limited and unavailable use `role="alert"`. Targets stay ≥44 px below `md`.
- **Navigation:** Cek tarif moves from the header into the sidebar "Cek" group, so tenant and platform headers share one row.
- **Freshness:** no CMS surface shows a "Muat ulang" button. Data refreshes itself once per generated instant while the tab is visible; a scope whose data is still stale after that attempt keeps a "Perlu diperbarui" marker, and the refresh interval is stated for screen readers.
- **Card headings** on the dashboard sit on a muted band with a bottom hairline, so a card's title reads as a header rather than as body text.

### T-155 — visual tone (amends UX-6)

UX-6's "no decorative shadows… flat" clause is amended by the T-155 section of `docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md`: the CMS content area sits on the muted ground with white cards, and cards carry one resting elevation. Cards must still group a real concept, tables and dividers remain the default for dense operational data, and status still carries text plus an icon or a sign — never colour alone. Coloured numbers are limited to reconciliation variance, which keeps its sign, and to the tone icons beside outcome labels.

### T-171 — dashboard order and courier recap

Dasbor order: filter → period KPI cards → Hasil pengiriman → chart and recent shipments → **Rekap per kurir** last. The KPI comparison shows a trend marker whose colour follows meaning, not sign: green where a rise is good, red where a rise is bad, muted where neither is; the arrow and the signed number remain the non-colour cues, so the meaning survives without colour. The courier recap is one small table per courier — Kiriman, Terkirim, Retur, and Biaya kirim for Tenant Admin — covering every courier in the Mengantar catalogue, with "Belum dipakai" on the ones without a shipment in the period and a stated total below the grid.

### T-188 — Pengirim and Penerima menus (PR-65)

Supersedes the T-167 role tabs. The Data group holds two menus over one contact table: **Pengirim** (`/app/kontak/pengirim`) and **Penerima** (`/app/kontak/penerima`). Each list is the directory scoped to its role: a compact header (title, one-line description, "Pengirim baru"/"Penerima baru"), then one toolbar row with a segmented status filter — **Aktif N · Diarsipkan N · Semua N**, Aktif by default, each segment a pressed-state button with a check glyph, its explanation available to screen readers — beside search (the privacy note is an info icon with a tooltip). The result line is short ("14 penerima · Dapat dipilih saat membuat draf kiriman."). A contact holding both roles is listed in both menus and carries a small outline badge with a two-way arrow next to its name — "Juga pengirim" on Penerima, "Juga penerima" on Pengirim — never the page's own role; the badge has a tooltip and an accessible meaning ("Kontak ini juga tersimpan sebagai pengirim"). From `md` the list is a table (Nama with badge, Telepon, Alamat with muted district/city and postal code, Status only on Semua, WhatsApp and copy actions); below `md` each contact is a card with the same content. Empty states name the role ("Belum ada penerima", "Belum ada pengirim diarsipkan") and offer the create action where it makes sense.
- **Detail layout.** Back link to the originating list above the header; the header holds the name, a chip per held role (originating role filled), an Aktif/Diarsipkan badge, and Ubah, Arsipkan (Tenant Admin) and Pakai di kiriman baru. Cards: Kontak (name, phone, copy, WhatsApp), Peran (each role with what it does; saving here never changes the name or phone), Alamat. Archived: a notice, read-only Kontak card, no edit or archive actions.
- **Create layout.** Cards Kontak, Peran (preselected), Alamat pertama.

- **Create.** "Pengirim baru" / "Penerima baru" open `/app/kontak/baru?peran=<role>` with only that role ticked; the other checkbox stays available and the form says a dual-role contact appears in both menus. The success panel links to the contact detail and back to the list the form was opened from, or to the contact's first role when that role was unticked.
- **Detail.** `/app/kontak/<id>?dari=<role>`: the eyebrow, "Kembali ke daftar <role>" button, the sidebar's current item and the archive redirect all follow `dari`. A detail URL without a valid `dari` redirects to the contact's first role.
- **Old links.** `/app/kontak` → Pengirim; `/app/kontak?peran=penerima` → Penerima (permanent redirect, query kept).

### T-167 — Kontak by role (superseded by T-188)

`/app/kontak` carried `peran=pengirim|penerima|semua` beside its existing `status`; an unrecognised value falls back to `semua` and says so, like the status recovery already does. A contact holding both roles appears in both views. Each row states: name (link), phone with a WhatsApp affordance and no masking (PR-36), street address (hidden below `sm`), `kecamatan, kota` with the postal code, and the role and status badges. District, city and postal code are read from the stored Mengantar area label counted from its end; an address saved before area selection says "Area belum dipilih" and a contact with no address says "Belum ada alamat" — neither renders a blank cell. Addresses beyond the primary appear as "+N alamat" linking to the contact detail, which keeps the full address.

### T-162 — state summary panel on operational list pages (PR-52)

Every operational list page opens with the same panel: a wrapping grid of entries, each stating a label, its count, and one line of what that state means. An entry is a filter, not decoration — choosing it applies that filter to the list below and writes the page's own URL state, so the view is shareable.

- **Entries.** Histori kiriman: Semua kiriman, Siap dilanjutkan, Resi terbit, Dalam perjalanan, Terkirim, Perlu perhatian. Retur (RTS): Semua retur, Antre retur, Retur dalam perjalanan, Retur diterima, Bermasalah. Cetak resi: Semua resi, Belum dicetak, Sudah dicetak. Pengirim: Semua pengirim, Aktif, Diarsipkan; Penerima: Semua penerima, Aktif, Diarsipkan (T-188). The label of every entry that names one lifecycle state is the shared presentation label, not a second word for the same status — the badge in the row below says "Terkirim", so the entry above it does not say "Sampai tujuan". The operator-facing meaning ("Draf dan estimasi yang belum punya nomor resi") lives in the entry's description line instead.
- **Marking the active entry.** `aria-pressed="true"`, a check glyph, and a solid rather than dashed border — three cues, none of them colour. No filter claims `aria-current`; the shell keeps the one truthful current page.
- **Keyboard.** Each entry is a real submit button, so Tab reaches it and Enter or Space applies it. Targets are at least 44 px at every width.
- **Responsive.** Two columns at 390 px, three from `sm`, six from `xl`; the panel wraps and never becomes a horizontal scroller.
- **Counts.** Current snapshots that ignore any period the page carries, read in the same tenant-scoped pass as the list, each mapped to a metric ID in `docs/spec/19`. On Cetak resi the list is capped at 100 rows, so when a count exceeds what is listed the page says so rather than letting the two numbers disagree.

### T-163 — one date-range filter (PR-53)

Every page with a time basis carries the same control: an outline trigger with a calendar icon whose label *is* the resolved range ("18 Agu 2026 – 16 Sep 2026") and `aria-expanded`. It is a `<summary>` over a labelled group, not a dialog trigger: the reference's `aria-haspopup="dialog"` was dropped with the dialog role once departure 4 made the panel a native disclosure whose content never unmounts, traps no focus and has no modality — and a permanently mounted `role="dialog"` also collided with the command palette's own, which `header-tools.mjs` caught on `/app`. Opening it reveals a preset list on the left and a two-month range calendar on the right from `lg`; below `lg` the presets collapse into a select above the calendar; below `md` the whole panel is a bottom sheet with 44 px rows.

- **Presets.** Hari ini, Kemarin, Minggu ini, Bulan ini, **Bulan lalu**, 7 hari terakhir, 30 hari terakhir, Rentang khusus. The active one is a checked radio (and the selected option in the collapsed select) — programmatic, never colour alone.
- **Typed path.** The two native `type="date"` inputs stay, below the calendar. Typing a date, or dragging a range on the calendar, moves the preset to "Rentang khusus" on its own.
- **Stated in text.** The panel prints "Rentang aktif: <range> · WIB (UTC+07:00)" and, where the page compares periods, the span it is compared against. The pages that had a summary line keep it.
- **Fallbacks.** Unchanged: an unknown preset, an incomplete or reversed custom range, a range over 366 days, or a future end date each fall back with the message they already had. Keuangan keeps its 62-day settlement ceiling, and WIB stays locked — there is no timezone control.
- **Where it applies.** `/app`, `/app/analitik`, `/app/keuangan`, and now `/app/pengiriman`, `/app/pengiriman/rts` and `/app/label`. On the three list pages it composes with the PR-52 state panel: the rows and the panel counts answer to the same window, and the default window is the shared 30 days, so an older shipment is outside the page until the range is widened.


### T-165, T-166 — the two Laporan pages (PR-55)

Laporan gains two read-only records beside Analitik. Both are **Tenant Admin only**, like Analitik, so an operator never sees the Laporan group at all; the repository reads refuse a non-admin context as well, so the page redirect is not the only control. Both carry the T-163 range control and the shared outlet select in the one GET filter form their route owns, and neither shows recipient name, phone or street address — the destination area is the only recipient fact either surface, or the export, carries.

- **Laporan pengiriman** (`/app/laporan/pengiriman`). One table over the PR-55 columns in a fixed order — nomor kiriman (with its outlet beneath), dibuat, resi terbit, area penerima, kurir, layanan, lifecycle, pembayaran, biaya kirim Mengantar, biaya COD, estimasi dana dicairkan Mengantar, status cetak — with the first column pinned and inheriting its row's opaque fill. Above it, two small tables: total per kurir (kiriman, biaya kirim Mengantar, biaya COD, estimasi dana dicairkan Mengantar) and total per lifecycle. Both totals describe **the filtered set, not the page**, and the page says so in words. Filters: periode, outlet, and a "Filter lanjutan" disclosure holding kurir and lifecycle, opened server-side whenever one of them is active. Server pagination at 50 rows. "Ekspor CSV" sits in the page header and carries exactly the filters the table is showing, minus the page number; it disappears when there is nothing to export. Empty period and filtered-empty are different sentences with different actions. Since T-177 the page carries no COD amount total, goods value or margin: COD money is what Mengantar charges (shipping, COD fee) and the estimated disbursement, and the summary sentence states that the disbursement is an estimate (COD amount less shipping and the COD fee).
- **Riwayat cetak resi** (`/app/laporan/cetak-resi`). One table of recorded print attempts, newest first: nomor kiriman (linking to its label, with the outlet beneath), waktu cetak, peran pelaku, hasil, alasan, urutan cetak, cetak ulang. Machine values are never shown — the outcome reads "Berhasil dicetak" or "Ditolak sistem", and the block reason that is also a lifecycle state reuses the shared lifecycle label so one state never has two names. **Actor identity is not on this page**: only the role the record stores, which is what PR-55 authorizes. The reprint count is stated per row and read off that shipment's own recorded print sequences over its whole record, with one line saying a first print is not a reprint. Filters: periode (printed-at basis) and outlet. The list is capped at 200 newest rows and states the difference when the period holds more.
- **Export refusal.** The CSV reuses the analytics export contract unchanged, including its row ceiling: above it the request is refused with the row count and an instruction to narrow the filters, never a truncated file that looks complete.

### T-156, T-157, T-158 — settings as a menu of pages (PR-46, PR-47)

Pengaturan stops being one page with internal tabs. It is a menu of five pages, each a stack of titled cards with its own save action, and the shell keeps Pengaturan current for all of them.

- **The menu.** Profil toko, Titik pickup, Outlet, Koneksi Mengantar, Anggota & akses — in that order, each with an icon, a label and one line of description. From `lg` it is a left rail (≈176px, ≈224px from `xl`) beside content capped at ≈760px. Below `lg` the index **is** the menu: full-width rows of at least 44 px with the description and a chevron; every other settings page replaces the rail with one "← Pengaturan" back link (`aria-label="Kembali ke Pengaturan"`). No JavaScript is involved in either shape.
- **Profil toko** (`/app/pengaturan`). Tenant name read-only, with "Hubungi Super Admin bila nama toko perlu diubah"; the shipment-prefix card with its unchanged one-time lock and dialog confirmation; and a card that states the fixed basis every displayed date and number uses — Indonesia (`id-ID`), WIB (`Asia/Jakarta`, UTC+7) — as a fact, not a control. An old `/app/pengaturan?outlet=…` link redirects to the Outlet page rather than dropping the selection.
- **Titik pickup** (`/app/pengaturan/pickup`). The outlet's Mengantar pickup addresses as a list, each stating its label, its derived origin area, and whether it is the outlet's **Utama**. Rows that are not the default offer "Jadikan utama"; every row offers "Hapus" behind a confirmation dialog. Removing the default is refused while other points remain — promote another one first — and removing the last one leaves the outlet explicitly unable to ship. Adding picks from the provider's own list in the shared combobox; the area asal fills itself from the chosen address and is never typed.
- **Outlet** (`/app/pengaturan/outlet`). Readiness summary, outlet selector, the location pair the default pickup point produces, and the connection source in a sentence. Read-only: each card links to the page that owns whatever is missing.
- **Koneksi Mengantar** (`/app/pengaturan/koneksi`). Platform default versus the outlet's own account, the replacement API key field (always blank, never echoed), and the destructive switch behind its confirmation. The "Digunakan" badge follows the persisted source, not the radio's draft choice.
- **Anggota & akses** (`/app/anggota`, T-159). Keeps its URL and every governance rule, and joins the menu's card anatomy: **Ringkasan akses** (total, aktif, Tenant Admin aktif, nonaktif), **Daftar anggota** (the ordered list, active members first, each row's role and status badges, and the per-member "Kelola akses" disclosure with its role-change and deactivate confirmations), **Undang anggota** (email and role, its submit in the card footer, associated to the form by `form=` so the action reads as the card's own). The single-active-admin Alert stays above the stack and the same protection is repeated as a badge on the Daftar anggota card title; the last admin's controls are still replaced by the protection sentence rather than disabled. Authorization, Server Actions, audit and the Operator redirect are untouched.
- **Buat kiriman.** When the chosen outlet has more than one pickup point, the Gudang asal section offers a "Titik pickup" select defaulting to the outlet's main point, and states the origin area that follows from it. With exactly one point the same fact is stated as text. The chosen point is what the provider order carries.
- **The compact stepper** (below the Buat kiriman split). The three tinted bars carry no text: a `sr-only` span is clipped to a pixel but still painted, so the per-step words inside the current bar inherited page ink over `--primary` and measured 2.57:1. The bars are the graphic; one `sr-only` line on the page ground states every step and its state (T-159).

### T-176 — printing the thermal label

The operator's job on `/app/label/[shipmentId]` is to print one label, stick the package part on the parcel, and — at the default size — cut off the stub and hand it to the sender as proof of handover.

- **Order.** Header → warnings (address over capacity, COD breakdown inconsistent, AWB too long for a barcode) → **Ukuran label termal** → print control with the recorded-request count → the preview → history.
- **Size choice.** A native radio group in a `fieldset` with a legend, before the print control: "10 × 15 cm — Label paket 10 × 10 cm dan bukti pengirim 10 × 5 cm, dipotong di garis putus-putus. Bawaan." and "10 × 10 cm — Label paket saja, tanpa bukti pengirim." Each option is a ≥44 px label row. The print button names the size ("Cetak label 10 × 15 cm"), the preview region is labelled with it, and the post-print message says the paper size follows it.
- **Remembered per operator, in this browser.** The choice is stored in `localStorage` under `geraicuan.label-size.<userId>`, read through `useSyncExternalStore` so the server and the first client render both show the default. Storage that is missing, blocked or throwing falls back to 10 × 15 cm, and a choice made on the page still applies for that page even when it cannot be stored. It is not URL state and not persisted on the server.
- **What prints is what is shown.** The preview is the sheet at its millimetre size; switching the size re-renders it (the stub and cut line appear or disappear) before any print dialog.
- **Handover time.** Pressing the print control records the request exactly as before (`recordLabelPrint`, unchanged); the stub's "Diserahkan" takes that recorded time before `window.print()` runs. A print started with Ctrl+P without the control carries the current WIB minute and is not recorded, as before.
- **Privacy.** The stub carries shipment number, AWB and barcode, courier and service, destination district and city, COD amount when COD, handover time and outlet — never recipient name, street address or phone. Contract details in `docs/spec/10` § T-176.

### T-181, T-182, T-183 — sign-up, recovery, both logins and the approval queue (PR-59–PR-62)

Designed for store owners aged 40+: 17px body, 28px headings, 48px fields, a 52px primary action, 44px links, Indonesian copy that says what to do next. Every error names the field and the fix; no message depends on whether an email is registered.

- **Tenant login** (`app./login`). Surface badge "Untuk toko" on a light ground with the brand top rule. Email, password with a visible "Tampilkan / Sembunyikan" button (`aria-pressed`, `aria-controls="password"`), "Masuk", then "Lupa kata sandi?" and "Belum punya akun? Daftarkan toko". States: wrong email or password → "Email atau kata sandi salah" (never which); too many attempts → wait a minute; **email not verified** (only after the password matched) → explanation, the subject line to look for, and "Kirim ulang email verifikasi" (rate-limited, same answer for any address); **awaiting approval** (`?notice=email-terverifikasi`, where the verification link lands) → the store awaits Super Admin approval, the owner can sign in and set up outlet, pickup and Mengantar account now; failed verification link → "Minta tautan baru" to `/verifikasi-email`; `?notice=kata-sandi-diperbarui` after recovery. Audit contract kept: first `form`, `#email`, `#password`, `.auth-submit`.
- **Super Admin login** (`bos./login`). Dark ground, amber "Khusus Super Admin" badge and top rule; no sign-up, no recovery link (the description says to contact the platform operator); an unverified Super Admin is told to contact the operator.
- **Daftar** (`/daftar`). Three fieldsets — Data toko (nama toko, nomor WhatsApp with example), Pemilik akun (nama, email "tautan verifikasi dikirim ke alamat ini"), Kata sandi (min 8, repeat, both with toggles) — and one agreement checkbox in a 44px bordered label. Invalid submit: a focused summary "Periksa N isian berikut" linking to each field, plus the message under each field (`aria-invalid`, `aria-describedby`); passwords are never echoed. Valid submit: "Periksa email Anda" naming the address (and that an already-registered address receives sign-in instructions instead), three numbered next steps (verify within 24 h, sign in and set up, wait for approval) and "Ke halaman masuk". Rate-limited: try again in an hour.
- **Lupa kata sandi** (`/lupa-password`) → "Periksa email Anda" (same for any address; link valid 1 h). **Atur ulang kata sandi** (`/atur-ulang-password?token=`): new password + repeat with toggles; a used, expired or missing token shows "Tautan sudah tidak berlaku" with "Minta tautan baru"; success revokes every session and links to the login. The page sends no referrer. **Verifikasi email** (`/verifikasi-email`): one email field to request a new link.
- **Store awaiting approval** (tenant CMS). An amber status banner "Toko Anda menunggu persetujuan" above every page. `/app` shows "Siapkan toko Anda": four steps with state badges — Verifikasi email (Selesai), Hubungkan akun Mengantar, Atur titik pickup (each with its button until done), Persetujuan Super Admin (Menunggu). Opening a shipment page (Buat kiriman, Impor, Cek tarif, …) or submitting a shipment action lands here with "Pengiriman belum terbuka". Koneksi Mengantar hides the GeraiCUAN default for a private-only store and asks for its own API key; Outlet and the readiness copy say the connection is required.
- **Pendaftaran** (`bos./platform/pendaftaran`, sidebar "Pendaftaran"). Oldest first, one card per store: name, registered at (WIB), verification badge, owner, email, WhatsApp, Mengantar policy. "Setujui toko" (disabled until the owner's email is verified, with the reason) opens a confirmation dialog; "Tolak pendaftaran" opens a reason field (5–500 characters, sent to the owner). The decided card stays with its result ("Toko disetujui" / "Pendaftaran ditolak", and whether the owner was emailed) until the next visit. Empty: "Tidak ada pendaftaran yang menunggu".
- Evidence: `scripts/ui-audit/sign-up-approval.mjs` (1440 and 390 px, shared probe plus a 44px target check).

### T-196 — field input rules (PR-66)

Every text field belongs to one character class from `src/lib/field-character-classes.ts`. The client lock (`CharacterClassInput`, `CharacterClassTextarea`, or `useCharacterClass` for a raw input) cleans only the text an edit inserts — typed, pasted, dropped, autofilled, or committed through an IME at `compositionend` — keeps the caret after the accepted text, and never rewrites characters already in the field. A refusal shows a short hint directly under the field in an `aria-live="polite"` region for 3 seconds; repeated refusals while it shows are not re-announced. The server applies the same class with an Indonesian message naming the field (for example "Nama penerima hanya boleh berisi huruf, spasi, titik, koma, apostrof, dan tanda hubung."), on every Server Action and on each CSV import row; a stored value that breaks its class is refused on save, not changed.

| Class | Typed or pasted | Server accepts | Hint | Keyboard |
|---|---|---|---|---|
| NUMERIC_INTEGER | `0-9` | `0-9` | Hanya angka. | `inputMode="numeric"`, `type="text"` (no spinner) |
| RUPIAH | `0-9` (no separators while typing) | `0-9`, or `1.250.000` grouping | Hanya angka. | `inputMode="numeric"`, `type="text"` |
| PHONE | `0-9`, one `+` as the first character | the same plus spaces, `-`, `( )`; `normalizePartyPhone` stays the authority for 08…/62…/+62… | Hanya angka, boleh diawali +. | `inputMode="tel"` |
| PERSON_NAME | letters in any script (`\p{L}\p{M}`), space, `. ' ’ - ,`; no emoji; a combining mark is refused as the first character | the same, and the value needs at least one letter (`\p{L}`) and may not start with a combining mark | Hanya huruf; tanda . ' - , boleh. | text |
| ADDRESS | printable text: letters and marks, digits (`\p{N}`), space, any punctuation (`\p{P}`, including `’ & ; " @ _`) and `+ = ° ~`; no emoji; a combining mark is refused as the first character | the same, and the value needs at least one letter or digit and may not start with a combining mark | Alamat hanya boleh huruf, angka, spasi, dan tanda baca; emoji tidak dapat dipakai. | text |
| BUSINESS_NAME | anything except control or format characters (`\p{Cc}\p{Cf}`) and emoji (`©`, `®`, `™` stay allowed) | the same | Emoji dan karakter tersembunyi tidak dapat dipakai. | text |
| FREE_TEXT | anything except control or format characters | the same | Karakter tersembunyi tidak dapat dipakai. | text |

A line break or tab typed or pasted into a text class becomes a space and is not reported as a refusal; the server still refuses control characters.

T-199 amendments:
- **Space separators.** Every `\p{Zs}` character (non-breaking U+00A0, narrow U+202F, figure, ideographic U+3000, …) is one plain space. The client lock maps it while typing or pasting through `normalizeSpaceSeparators`, without a refusal hint; every server reader (Buat kiriman and each CSV import row, contact create, contact identity and address edits, tenant creation) reads text through `normalizeFieldText`, which applies the same normaliser, collapses runs of spaces to one, and trims. "Siti Aminah" pasted or imported with U+00A0 is stored as "Siti Aminah".
- **Emoji.** Every class that refuses emoji (PERSON_NAME, ADDRESS, BUSINESS_NAME) refuses the same set: `\p{Extended_Pictographic}` (except `©`, `®`, `™`), `\p{Regional_Indicator}` flag halves, `\p{Emoji_Modifier}` skin tones, the zero-width joiner of emoji sequences, variation selectors U+FE00–U+FE0F, the keycap mark U+20E3, and tag characters. The client cleans by grapheme cluster (`Intl.Segmenter`): a cluster that is an emoji (👍🏽, 🇮🇩, 👨‍👩‍👧, 1️⃣) is dropped whole, so no orphan modifier or flag half remains; a stray modifier or joiner attached to a plain character is dropped on its own.

| Form | Field | Class |
|---|---|---|
| Buat kiriman | Nama pengirim | BUSINESS_NAME (owner decision: a sender may be a store, "Toko 88") |
| Buat kiriman | Nama penerima | PERSON_NAME |
| Buat kiriman | Nomor telepon (pengirim, penerima) | PHONE |
| Buat kiriman | Alamat pengirim, Alamat penerima, Patokan rumah | ADDRESS |
| Buat kiriman | Isi paket, Instruksi pengiriman | FREE_TEXT |
| Buat kiriman | Berat (gram), Jumlah paket, Panjang/Lebar/Tinggi (cm) | NUMERIC_INTEGER |
| Buat kiriman | Nilai barang (Non-COD, COD, COD Ongkir) | RUPIAH |
| Buat kiriman preview, Detail kiriman issuance | Ongkir ditagih kurir (COD Ongkir) | RUPIAH |
| Impor CSV | nama_pengirim (BUSINESS_NAME), nama_penerima (PERSON_NAME), telepon_*, alamat_*, isi_paket, berat_gram, jumlah_paket, *_cm, nilai_barang | as the draft fields, per-row errors |
| Pengirim / Penerima baru, detail | Nama kontak | by role: Pengirim only → BUSINESS_NAME; Penerima only → PERSON_NAME; both roles → BUSINESS_NAME, because the sender rule governs a contact that must still be usable as a sender. The create form switches the lock as the Pengirim checkbox changes; the detail name card follows the stored roles, and a roles change that leaves a recipient-only contact with a digit in its name is refused with the name error. |
| Pengirim / Penerima baru, detail | Nomor telepon | PHONE |
| Pengirim / Penerima baru, detail | Label alamat | BUSINESS_NAME |
| Pengirim / Penerima baru, detail | Alamat | ADDRESS |
| Cek tarif | Berat paket (gram) | NUMERIC_INTEGER |
| Daftar | Nama toko | BUSINESS_NAME |
| Daftar | Nomor WhatsApp toko | PHONE |
| Daftar | Nama pemilik | PERSON_NAME |
| Platform tenant | Nama tenant (provisioning) | BUSINESS_NAME |
| Platform pendaftaran | Alasan penolakan | FREE_TEXT |

Unchanged: email and password fields (login, daftar, lupa/atur-ulang kata sandi, verifikasi email, anggota invite), every search box (contact picker "nama atau nomor", area/district search, contact list, Cetak resi, platform tenant search, table toolbars), Cek resi tracking key, the shipment-prefix field (its own `A-Z0-9` rule), Mengantar username and API key, date controls, and the platform "ketik nama tenant" confirmation, which must match the stored name exactly. Weight is grams everywhere, so no decimal-weight field exists. Evidence: `tests/field-character-classes.integration.test.ts` and `scripts/ui-audit/field-character-classes.mjs` (1440 and 390 px).
