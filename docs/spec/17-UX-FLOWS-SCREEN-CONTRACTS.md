# UX Flows and Screen Contracts: GeraiCUAN

- Status: Accepted for CMS redesign
- Locale: `id-ID`
- Primary device model: desktop operator console with tablet rail and mobile sheet
- Visual source: `10-DESIGN-SYSTEM-WHITELABEL.md`

## UX-1 — Operational frame

| Actor | Primary job | Success condition | Highest failure cost |
|---|---|---|---|
| Operator | Turn valid shipment data into a provider-issued AWB and printable label | The provider AWB is issued once and the label is reachable from the shipment | Duplicate or unknown provider submission |
| Tenant Admin | Keep an outlet operational and reconcile shipment, staff, and money exceptions | Outlet readiness, member access, unpaid recovery, and ledger variance are actionable | Cross-tenant access, secret exposure, or incorrect money state |
| Super Admin | Detect platform exceptions and govern tenant lifecycle | Affected tenant and safe next action are identifiable without shipment PII | Incorrect lifecycle action or credential/PII exposure |

## UX-2 — Information architecture

### Tenant CMS

1. **Operasional**
   - **Ringkasan** → `/app` — both tenant roles; daily command center and exception entry point.
   - **Pengiriman** → `/app/pengiriman` — both tenant roles; lifecycle queue. Create, import, detail, and label routes are contextual descendants and retain Pengiriman as current.
2. **Data**
   - **Kontak** → `/app/kontak` — both tenant roles; reusable sender and recipient directory.
3. **Analisis & keuangan**
   - **Analitik** → `/app/analitik` — Tenant Admin only; historical exploration, comparison, supporting rows, and export.
   - **Keuangan** → `/app/keuangan` — Tenant Admin only; authoritative ledger, reconciliation history, and permitted mutations.
4. **Pengaturan**
   - **Outlet & koneksi** → `/app/pengaturan` — Tenant Admin only.
   - **Anggota & akses** → `/app/anggota` — Tenant Admin only.

`Label & cetak` is not a separate primary object. Label preview and print history
remain reachable from an issued shipment and may also exist as a filtered issued
shipment view during migration.

### Platform CMS

One **Platform** group contains:

1. **Monitoring** → `/platform` — exception-first platform health.
2. **Tenant** → `/platform/tenant` — tenant list, detail, and lifecycle governance.
3. **Audit** → `/platform/audit` — append-only governed event history.

## UX-3 — Shared shell contract

- One shadcn-based shell serves tenant and platform scope without sharing authorization.
- Desktop uses a full sidebar, tablet uses an icon rail with tooltips and visible current location, and mobile uses a labelled Sheet.
- The top bar persistently identifies tenant/platform scope and authenticated role.
- Every route has one page title, optional description, and at most one dominant primary action.
- Shell, navigation, account menu, overlays, focus return, and skip navigation are keyboard operable.
- Filter, pagination, and saved-view state that users may share remains URL-addressable.
- Navigation is derived from authorized destinations. A forbidden direct request is redirected or rejected before protected data reads and never produces a denial page with Ringkasan falsely marked current. Operator requests for Tenant Admin-only tenant destinations redirect server-side to `/app`.

## UX-4 — Shipment lifecycle journey

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

| Screen | Primary job | Presentation | Required states | Primary components |
|---|---|---|---|---|
| CMS shell | Retain location and scope while moving between jobs | Persistent sidebar/rail/sheet plus compact top bar | active, collapsed, mobile open, sign-out pending/error | `Sidebar`, `Sheet`, `Tooltip`, `DropdownMenu`, `Separator`, `Button` |
| Shipment queue | Find the next shipment requiring action | Lifecycle tabs/filter bar plus dense server-paginated table | system empty, filtered empty, loading, error, partial/stale | `Button`, `Badge`, `Table`, `Select`, `Sheet`, `Pagination` |
| Shipment creation | Capture one valid shipment without losing data | Full-page grouped form with visible progress and action summary | pristine, validation error, saved, estimating, blocked outlet | `Field`, `Input`, `Textarea`, `Select`, `RadioGroup`, `Alert`, `Button` |
| Shipment detail | Understand immutable context and perform the one valid next action | Status header, next-action region, lifecycle timeline, grouped facts | every shipment lifecycle state, loading, missing, error | `Badge`, `Alert`, `Button`, `Separator`, `Table` |
| Issuance/recovery | Confirm a costly provider transition | Context-preserving confirmation with consequence | pending, success, provider failure, unknown, unauthorized | `AlertDialog`, `Alert`, `Button` |
| Bulk intake | Validate and commit only valid rows | Upload → validation → row review → confirmation → result | invalid file, mixed rows, pending, partial failure, success | `Field`, `Input`, `Table`, `Checkbox`, `Alert`, `Button` |
| Contacts | Find and maintain reusable party data | Searchable directory and dedicated detail form | system empty, filtered empty, archived, validation error | `Input`, `Badge`, `Table`, `Field`, `AlertDialog` |
| Outlet settings | Restore or maintain outlet readiness | One outlet selector/list-detail context followed by location and Mengantar connection sections | no outlet, incomplete, platform fallback, private unstored, private stored-unverified, connected, credential rejected, provider unavailable, secret missing, replacement pending/error/success, safe switch confirmation | `Card`, `Badge`, `Alert`, `Field`, `RadioGroup`, `Input`, `Select`, `AlertDialog`, `Button`; add combobox primitives only after the accepted area contract requires search |
| Members | Govern tenant access | Compact member list/table with contextual actions | empty, invited, active, deactivated, last-admin blocked | `Table`, `Badge`, `Select`, `AlertDialog`, `Button` |
| Analytics | Explore historical lifecycle performance without replacing financial authority | Four period/snapshot KPIs, trend and breakdowns, a separate latest tenant-wide signed variance exception, then supporting table/export | no data, filtered empty, adjusted filter, loading, partial error, stale | `Card`, `Chart`, `Table`, `Sheet`, `Button` |
| Finance | Reconcile money exceptions and inspect source entries | Summary strip, variance queue, then ledger table | matched, variance, reversal, loading, error | `Badge`, `Alert`, `Table`, `AlertDialog`, `Button` |
| Platform monitoring | Triage platform and tenant exceptions | Exception queue before trend and aggregate detail | healthy, warning, critical, degraded, empty | `Alert`, `Badge`, `Table`, `Chart`, `Sheet` |
| Label preview | Verify and print an issued provider label | Domain-specific 100×150 mm sheet plus compact toolbar/history | unavailable, overflow warning, COD mismatch, print success/error | `Button`, `Alert`, `Table`; semantic print markup remains custom |
| Tenant overview | Choose the next permitted operational action | Role-specific summary strip, exception queue, recent shipment table | first-run, healthy, actionable exceptions, partial/stale, loading, error | `Card`, `Alert`, `Badge`, `Table`, `Skeleton`, `Button` |

## UX-6 — Component and visual rules

- shadcn/ui is the source for the complete interactive vocabulary; native semantic HTML remains valid when it is smaller and equally accessible.
- Use one semantic token graph. Legacy `sales-*`, `ship-*`, `ops-*`, `an-*`, and `bulk-*` presentation classes are migration-only and must not appear in new CMS components.
- A legacy authenticated screen is not migrated until its rendered path no longer depends on those legacy presentation classes. Reuse shared shadcn components and semantic tokens; native `form`, `select`, `table`, and `details` remain valid where they are the smaller accessible primitive.
- No speculative dark mode, gradients, backdrop blur, decorative shadows, nested cards, or decorative KPI grids.
- Cards group a real concept; tables and dividers remain the default for dense operational data.
- Status always has readable text and, where direction matters, a non-colour cue.
- Destructive or provider-costly actions use an explicit named confirmation; reversible actions do not.

## UX-7 — Responsive acceptance

- `390px`: mobile Sheet navigation, locally contained data overflow, no document overflow, and 44px minimum primary touch targets.
- `768px`: icon rail retains current-location meaning through icon, active state, and tooltip.
- `1280px`: full sidebar and dense tables preserve readable hierarchy without decorative empty space.
- Every migrated screen is checked for keyboard order, visible focus, accessible names/states, loading, empty, error, and its primary success path.

## UX-8 — Tenant overview contract

The overview borrows the useful completeness of a mature shipping dashboard—summary, exceptions, trends, and source records—without copying another product's branding, information hierarchy, or unsupported business metrics.

Public Indonesian shipping-dashboard evidence supports this coverage: Mengantar documents COD collection states, shipment-status summaries, attention queues, and courier performance; KiriminAja documents balance/COD/status/issue summaries plus daily shipment and courier reports. GeraiCUAN transfers the decision pattern, not the nouns blindly: ticketing, withdrawal balance, affiliate income, delivery/return tracking, SLA, and destination geography stay absent until accepted requirements and authoritative data exist. Sources reviewed 2026-08-31: [Mengantar dashboard guide](https://help.mengantar.com/id/articles/5111202-dashboard) and [KiriminAja shipment-statistics guide](https://help.kiriminaja.com/article/panduan-laporan-statistik-pengiriman-di-dashboard-baru).

| Region | Operator | Tenant Admin | Completion rule |
|---|---|---|---|
| Scope and time | Tenant, URL-persisted date range, WIB or selected IANA timezone, generated-at time | Same | Scope and time remain visible beside the compact date filter |
| Priority analytics | Period shipment input, COD input, non-COD input, and authoritative issued outcomes | Same | Counts and COD/non-COD composition use the same tenant-scoped created-time range; issued uses authoritative provider resolution time and is labelled separately |
| Operational status | Draft/estimated work, current failed/unknown work | Same plus awaiting-payment and reconciliation exception counts | Current snapshot values sit below period analytics and link to the queue that produces them |
| Readiness | Read-only blocking notice with escalation guidance | Actionable outlet/provider readiness notice | Do not show a healthy decorative card; show only a condition that changes work |
| Exception queue | Shipment states the Operator may inspect or repair | Same plus unpaid recovery and reconciliation variance | Highest failure-cost items appear first; role-forbidden actions are absent |
| Recent outcomes | Recently updated permitted shipments with lifecycle, courier, AWB availability, and next action | Tenant-wide permitted outcomes | Provider AWB appears only after authoritative `cnote_no` |

- The overview has no free-floating “revenue”, “COD income”, or gross collection card. COD/non-COD cards count shipment inputs and may show explicitly labelled declared-goods value; they never describe receiver collection, principal liability, or revenue. If a Tenant Admin needs financial decisions, the overview shows an exception count and links to Keuangan; ledger meaning remains authoritative there.
- A first-run tenant sees outlet readiness and the next setup action instead of zero-filled analytics. A genuinely healthy/empty operational day says why no work is present and links to create/import shipment. Filtered empty names the active filters and offers reset.
- Background refresh may announce newer records but does not reorder a row under the pointer or keyboard focus. A visible refresh action and generated-at timestamp are always available.
- Ringkasan is deliberately shallow and action-first even when it carries a small period trend. Historical comparison, multi-dimensional exploration, and export belong to Analitik; authoritative ledger entries and reconciliation mutations belong to Keuangan.

## UX-9 — Tenant analytics contract

**Decision sequence:** understand the selected period → compare against the prior equal period → identify lifecycle/courier change → inspect the exact filtered records.

1. **Filter bar:** preset/custom range, outlet, courier, lifecycle, timezone, and the detail/export basis (`created`, `issued`, provider `outcome`, or current `exceptions`). URL parameters are the shareable source of view state; mobile moves controls into one Sheet but retains active filter chips/count and reset on the page. Unknown tenant scope or basis fails closed rather than broadening the result.
2. **KPI row:** created, issued, issuance success rate with denominator, and unresolved operational exceptions. Each includes basis, prior-period delta where valid, non-colour direction cue, and a link to supporting rows. Snapshot KPIs say `Saat ini` and cannot masquerade as period events.
3. **Primary trend:** two-series line chart for created versus issued by WIB/local day. Series differ by colour plus dash/marker; axes and units are named; every datum exists in an immediately associated semantic table.
4. **Breakdown:** a sorted courier comparison or lifecycle table appears only when the metric can answer an operator decision. Bars start at zero; low-volume rates show their denominator and do not imply certainty.
5. **Detail:** server-paginated shipment table with explicit timestamp or current-snapshot basis, lifecycle, courier, AWB availability, and permitted drill-down. Created, issued, success-rate, and unresolved-exception KPI links switch the table to the supporting `created`, `issued`, provider-`outcome`, or current-`exceptions` basis. Event bases preserve period and timezone; every basis preserves authorized outlet, courier, and lifecycle dimensions. Sort, page, basis, and filters survive reload/back navigation. Export uses that same basis and covers the filtered set, not merely the current page; a synchronous result above 10,000 rows is refused explicitly rather than truncated.
6. **Financial meaning:** COD principal outstanding/remitted, service-fee revenue, VAT payable, provider cost, and variance are separate labelled concepts. No chart or KPI sums principal into revenue or describes customer collection as earnings. A fifth, separate exception presents the latest signed reconciliation variance from the newest tenant-wide reconciliation record; it explicitly ignores analytics period, courier, and lifecycle filters, links to `/app/keuangan?status=VARIANCE#reconciliation-history-title`, and leaves Keuangan authoritative.

Required independent states are representative skeleton loading, no event data for the selected period, filtered empty, invalid/adjusted range, partial chart failure with retained KPIs/table, whole-query failure with retry, and stale/generated-at notice. Accessible text summarizes the chart's key comparison; tooltip-only values, colour-only series, and canvas-only data are prohibited.

## UX-10 — Outlet and Mengantar configuration contract

- Keep one navigation destination, **Outlet & koneksi**. Do not add a competing API menu.
- At 1280px, many outlets use a compact list-detail composition; at 390px and 768px, one outlet selector precedes the single active form. Do not render duplicate desktop/mobile forms.
- Order the detail by operator decision: **Lokasi pengiriman** first, then **Koneksi Mengantar**. Origin and pickup show readable provider labels and store opaque IDs only after TD-16 is accepted.
- Connection mode uses explicit `Default GeraiCUAN` and `Akun Mengantar sendiri` choices. The tenant never edits the provider base URL.
- Private mode accepts a blank API-key password field only for create or replacement. A stored key is represented as `API key tersimpan` plus a safe timestamp; it is never prefilled, revealed, copied, or represented by fragments. Replacement opens a blank field and clears it after every result.
- `Tersambung` means a safe non-mutating provider verification succeeded. A database reference alone is labelled `Tersimpan, belum diverifikasi`. Authentication failure, provider unavailability, and missing/unreadable secret have distinct non-secret recovery guidance.
- Switching from private to platform default uses a named `AlertDialog`, keeps the existing private key until the server proves the platform default complete, and returns focus to the initiating control.
- Secret submission preserves non-secret outlet/location values, focuses the first safe field error or result summary, provides 44px actions, and never returns the submitted secret through action state.
