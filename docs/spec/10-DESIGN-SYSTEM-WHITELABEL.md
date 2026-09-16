# Design System and UI Contract: GeraiCUAN

- Status: Accepted for CMS redesign
- Locale: `id-ID`; no custom branding or white-labeling in MVP.

## Visual Direction
- Public sales page: Brand/Marketing mode. Designed light, cool off-white canvas, dark ink, one high-contrast accent, hairline-led surfaces, and one clear login intent. Dark mode is out of scope for MVP.
- Public audience/job: Indonesian outlet operators evaluating whether the product can make shipment handling and COD accounting safer. The visual character is restrained operational confidence rather than promotional spectacle.
- Public signature: a shipment docket/label composition in the hero makes lifecycle authority, AWB, print size, and COD classification tangible without decorative product mockups. Do not repeat that framed composition as a generic card pattern below the hero.
- Public direction decision: editorial utility was selected over a conventional centered SaaS hero or a dense application screenshot. It communicates the operating model with no new asset dependency, remains legible at 390px, and reuses the accepted semantic tokens. Design dials are variance 5, motion 2, density 4.
- CMS Admin: clean, information-dense light operational surface using the repository's shadcn/Radix primitives and Tailwind semantic tokens. T-132 adopts blue #2E47BA for interactive accents (with a light-blue dormant dark companion); neutral surfaces establish hierarchy; semantic green, amber, and red communicate status alongside text or icon cues. Use compact tables, explicit status badges, and no decorative dashboard cards where a queue or filterable table is the decision tool.
- Platform scope: the accepted Phase13 system uses the shared neutral role badge, navigation and context treatment. Scope is explicit text and authorized navigation, not a second brand accent. The former violet scope-marker proposal is superseded; T-94 does not restore it.
- Presentation is flat and hairline-led. Do not use gradients, backdrop blur, speculative dark mode, decorative shadows, or nested cards. Shadows are reserved for floating overlays.
- Responsive behavior: desktop full sidebar, tablet icon rail, mobile sheet navigation. Each metric workspace retains one server-rendered GET filter form. Primary period/outlet controls stay visible; secondary date/timezone dimensions use the existing labelled advanced disclosure. Do not mount separate mobile and desktop forms. Platform adopted this shared treatment in T-134. Narrow table regions retain semantic tables with a sticky leading column, horizontal scroll containment, and visible keyboard focus.
- Analytics: show selected timezone and period beside every KPI and chart. Use a two-series line chart for created versus issued shipments, retain its complete tabular data immediately below, and distinguish series by color and dashed stroke.
- Tenant operational home follows `overview → exceptions → recent detail`: a compact role-specific status strip, the highest-cost action queue, then recent shipments. It is not a decorative KPI grid and does not duplicate the full Analitik page.
- Product meaning is route-stable: Ringkasan is a daily command center, Analitik is read-only historical exploration, Pengiriman owns lifecycle work, and Keuangan is the authoritative ledger/reconciliation workspace. A cross-route link carries the user to the authority instead of restyling a summary as if it were authoritative.
- KPI anatomy is label, dominant value, comparison basis, direction icon/text, and timestamp or period. Positive/negative colour follows operational desirability rather than numeric sign and is never the only cue.
- Charts use semantic `--chart-*` tokens, direct labels/markers/dashes, readable axes, keyboard-reachable explanatory text, and a complete semantic table. Bars start at zero; chart tooltips are supplementary and never the only way to obtain a value.
### Shared CMS shell
- Tenant and Super Admin use one `cms-shell`: the same brand anchor, responsive desktop sidebar/tablet rail/mobile sheet, scope bar, account menu, main content spacing, page eyebrow, heading scale, focus treatment, and semantic surface vocabulary.
- Navigation content remains scope-specific and server-authorized. Tenant navigation is role-filtered; Super Admin exposes only platform monitoring, tenant, and audit routes. Shared presentation MUST NOT imply shared data access.
- Tenant navigation uses the exact group/destination model in UX-2. Contextual shipment descendants retain Pengiriman as current. A forbidden direct route is rejected or redirected before render; the shell MUST NOT highlight Ringkasan as a generic fallback for an unauthorized destination.
- Use shadcn `Button`, `Badge`, `Card`, `Skeleton`, `Alert`, `Input`, and `Label` where their interaction or state semantics apply. Preserve native semantic `form`, `select`, `table`, and `details` elements when they are the smaller accessible primitive.
- All authenticated CMS screens being migrated use shared shadcn primitives and semantic tokens rather than page-local visual systems. Existing `sales-*`, `ship-*`, `ops-*`, `an-*`, and `bulk-*` class families are a removal backlog: no new occurrence is permitted, and a migrated screen is incomplete while those presentation classes remain in its rendered path.
### Shared table usability — T-135
- Keep native semantic tables and existing server-owned rows, filters, pagination, captions and permissions. A small client scroll-region leaf measures the actual scroll owner and table with ResizeObserver; it does not fetch data or add a table engine.
- Show one muted horizontal-scroll hint immediately above the table only when content exceeds the region width. Associate it with the region through aria-describedby while retaining any existing description. Re-measure after viewport, content and disclosure changes. Nested plain Tables inside DataTableShell keep one scroll owner and one hint.
- Give pinned identity columns an opaque header matching the other headers and a one-pixel divider. Keyboard focus highlights the whole row, including its pinned cells. Preserve selected-row fill over focus/hover, semantic statuses and complete identifiers.
- At phone widths, pagination presents the result summary, page information and four 44px navigation controls in stable rows. Desktop retains numbered page links. Counts and page URLs remain server-authoritative; never infer a row range from a missing page size.
- Long platform tenant names wrap within a 12rem link ceiling with a 44px minimum target, retaining the full name and destination. Existing data column order, row density, actions and primary filters remain unchanged.

### Dashboard acceptance checks
- At 1280px, tenant and platform show the same full shell and no document-level horizontal overflow; each scope announces its own label and role.
- At 390px, the sidebar is replaced by the shared labelled navigation trigger; opening it exposes only routes permitted to that scope and role, and focus remains visible.
- Filters, status, empty, loading, error, table, and pager surfaces retain semantic labels and never cause horizontal page overflow. Wide table regions scroll locally rather than expanding the document.
- At every viewport, the selected WIB/IANA timezone, range, active filter count, and generated-at time remain visible without opening a chart tooltip.
- Loading skeletons mirror the final region, system-empty explains the next setup action, filtered-empty offers filter reset, and a region error retains successful sibling regions with a local retry.
- On mobile, compact count summaries use two columns; detailed current-work and full-IDR cards remain stacked to keep complete labels and amounts. Skeletons mirror those choices. Legends/annotations remain readable, primary filters stay visible and advanced dimensions use a labelled disclosure. T-134 delivers these mobile count grids and platform primary filters. Generic platform loading mirrors count-column choices, not every route-specific filter placeholder or pre-hydration shell geometry.

## Historical Tokophi reference and blue palette — 2026-09-13

Historical status: T-109/T-110 recorded and implemented this direction locally. T-111/T-112 and then T-118 superseded its palette; T-132 below is the current colour authority. Retain this earlier full palette as provenance; T-132 reuses its primary blue while preserving the established neutral surfaces.

### Runtime adoption checkpoint — T-110

The proposed palette and shared presentation are implemented locally on
`feat/tokophi-blue-ui` as of 2026-09-13. The broader T-94 foundation remains queued:
this pass adds no scope metrics, command palette, or new breadcrumb logic. Input
boundaries use `#7E8B9D` (3.26:1 against the canvas), while `#E2E8F0` remains a
decorative divider. Mobile role text is 12px and the scope title truncates within
its available width. Charts and severity colours retain their existing meaning.

Executed acceptance: 66 route/viewport checks with zero findings and 24 targeted
role/state/viewport checks at 390/768/1280; independent visual review inspected
Ringkasan mobile/desktop and Analitik desktop. Selected colours and focus are
computed browser evidence; hover is verified through the compiled CSS rule and
resolved token only. Native CDP Escape delivery was unavailable; DOM-dispatched
Escape exercised the actual dismissal handler and focus restoration. These
limitations do not represent native-keyboard or full production certification.

### Reference evidence and limits

- Tokophi local source inspected: `apps/admin/components/admin/sidebar.tsx`, `apps/admin/app/(admin)/dashboard-client.tsx`, and `apps/admin/app/(admin)/analitik/analitik-client.tsx` under the sibling `tokophi` repository. Observed: grouped sidebar navigation, compact headers, action queue, money strip, approximately 2:1 chart/activity and recent-order/supporting-content layouts, and separate analytical breakdowns. Source review is not browser validation.
- [Mengantar public site](https://www.mengantar.com/) was retrieved on 2026-09-13. Its public dashboard illustrations provide a shipping-product visual reference; no authenticated Mengantar admin was inspected. The user's blue preference is the direction authority; the palette below is a GeraiCUAN recommendation, not an extracted Mengantar brand specification. Public homepage HTML contains `#2E47BA`, `#203551`, and `#F6F8FC`; hover, selected background, and muted ink are adapted rather than asserted as Mengantar tokens. Commercial claims and provider features on that site do not define GeraiCUAN requirements.
- Carry over spacing discipline, strong heading/value hierarchy, stable tabular figures, and useful grouping. Keep GeraiCUAN's native GET filters, scoped data, accessible charts, and region-level recovery. Tokophi's client-local date state, inconsistently period-scoped widgets, product-ranking exports, and reused unrelated KPI sparklines are explicitly excluded.

### Semantic colour mapping

The following hex values describe the historical T-110 appearance only. Current code follows T-118 semantic tokens; computed browser colours remain verification authority.

| Role | Proposed colour | Use and contrast pairing |
|---|---|---|
| Primary blue | `#2E47BA` | Dominant button, interactive link, focus treatment; white button text |
| Primary hover | `#243A9B` | Hover/pressed treatment; white text |
| Selected surface | `#EEF2FF` | Active navigation/filter background with `#2E47BA` text and a non-colour active cue |
| Canvas | `#F6F8FC` | Page background with `#203551` body text |
| Surface | `#FFFFFF` | Tables, forms, and meaningful grouped regions |
| Main ink | `#203551` | Headings, body text, and dominant values |
| Muted ink | `#52647B` | Secondary labels on white or the canvas |
| Decorative divider | `#E2E8F0` | Non-essential separators only; not a sole input boundary or focus indicator |

- Under the historical T-110 palette the sidebar stayed light and blue marked interaction/current location. T-118 now supplies the shared neutral treatment.
- Preserve semantic green/amber/red status and the accessible chart palette/marker/dash rules. The historical violet scope marker is superseded by explicit neutral scope labels.
- No gradients, decorative shadows, nested cards, or new dark-mode work. Reuse the existing container tiers and responsive shell; Tokophi's 1400px container is reference evidence, not a mandatory width for every screen.
- Text pairs must meet 4.5:1; necessary control boundaries and focus cues must meet 3:1 against adjacent colours. Pale decorative dividers do not satisfy a control-boundary requirement. Computed-style and keyboard checks at 390/768/1280 remain required before theme acceptance.

### Composition mapping

| Tokophi region | GeraiCUAN treatment | Execution owner |
|---|---|---|
| Sidebar/header | Existing role-aware shell; grouped navigation and compact spacing, persistent tenant/outlet or platform scope | T-94 |
| Action queue and money strip | PR-25 period KPI strip first, then ranked current exceptions; money does not become a revenue strip | T-98 |
| Chart plus activity | Created/issued trend with existing supporting context; use a 2:1 split only when both regions answer a real job; no synthetic live feed | T-98 |
| Recent orders and supporting panel | Recent shipments and state-permitted next action; readiness appears only when actionable | T-98 |
| Platform dashboard | Exception-first global or selected-tenant monitoring with redacted detail | T-99 |
| Sales/category/channel analysis | Shipment trends, courier issuance performance, lifecycle distribution, and scoped supporting records | T-100 |
| Financial overview | Separately classified ledger-derived amounts; mutations and reconciliation remain on Keuangan | T-101 |

At mobile widths use the same DOM order as the accepted screen sequence. A desktop side region must not hide urgent work after a long table on mobile. Under PR-42, analytics charts remain visible and their complete supporting tables are available through labelled native disclosures that start collapsed.

## CMS page patterns

- Status: Accepted 2026-09-13. Provenance: Paduka Ongki approved the presented direction and instructed the work to proceed following its recommendations; individual rules were not selected one by one. Visual reference: the concept mockup "GeraiCUAN Administrasi Concept" v2 (non-authoritative illustration; this section wins where they differ, and its example values are not product data).
- Every authenticated CMS page route adopts exactly one pattern below (the complete mapping is the Route coverage table). CSV routes are not pages and have no pattern. A redesigned or new route is incomplete until it satisfies every rule of its pattern plus the shared foundation. Patterns describe presentation and interaction only; they never change authorization, validation, lifecycle, ledger, or provider rules owned elsewhere.
- Metric formulas, severity thresholds, chart rules, and diagrams referenced by these patterns are owned by `docs/spec/19-METRICS-ANALYTICS-CONTRACT.md`.

### Adoption reconciliation — T-131, 2026-09-14

Phase13 delivers shared shell, neutral tokens, PageHeader/StatCard/table/settings primitives and recomposed route families. The patterns below remain the target for unfinished interactions; a rendered route is not evidence that its command palette, breadcrumbs, navigation counts, ranked attention, added charts or full state matrix exists. Root TASKS T-88–T-108 records delivered parts and residual gates without duplicating the execution queue.

The accepted later choices supersede older prescriptions for blue/violet branding, one-surface KPI strips, hidden primary mobile filters and mobile row-list conversion. Existing DOM order on Ringkasan is summary → trend/recent group → current work; its urgent-work-before-long-table gap remains T-98. Its delivered current-versus-previous created-shipment trend is retained. T-134 aligns the existing Admin/Super Admin surfaces; it does not claim new Phase12 metric features or resolve D-3. Dark tokens are tested but dark-mode activation remains out of scope.

### Foundation (all CMS routes)

- **Navigation.** Keep the UX-2 group model. A navigation item may carry a count only for work that needs a human action (for example Kiriman: spec 19 ACT-NEEDED), never a total. Counts are server-derived inside the viewer's scope and role, and omitted rather than shown as `0`.
- **Location.** Every contextual descendant renders a breadcrumb to its parent in the top bar while the sidebar keeps the parent current. Detail and flow routes offer an explicit way back to their queue.
- **Command palette.** `⌘K` / `Ctrl+K` opens one `Command` dialog from every CMS route: navigate to permitted destinations, run the route's primary creation action, and search records. Record search is server-side, tenant- or platform-scoped by the session, bounded in result count, and never returns fields the viewer cannot already see on the owning route. Recipient phone numbers appear masked. The palette is a shortcut: every result remains reachable through visible navigation.
- **Status vocabulary.** Severity badges are round and read `Normal`, `Perhatian`, `Kritis`, or `Nonaktif`; lifecycle badges are square-cornered and use `SHIPMENT_STATUS_PRESENTATION` labels. Both always carry text plus a dot or icon. Red is reserved for `Kritis`, failure, and destructive actions. A severity is derived from a documented threshold, never hard-coded on a card.
- **Actions.** At most one semantic-primary action per page header. Row actions live in a `DropdownMenu` (`⋯`) whose items are exactly the actions valid for that row's state and role; an invalid action is absent, not disabled, unless its absence would hide a safety explanation, in which case it is disabled with a tooltip.
- **Confirmation ladder.** Reversible changes save directly. Costly or access-removing changes use a `Dialog`/`AlertDialog` that states consequences before the action. Tenant suspension or archival additionally requires typing the tenant name. Provider issuance and recovery remain subject to the TD-14 release gate.
- **Feedback.** Success and error results appear next to the control that caused them (section footer, dialog body, or row) and are announced through a polite live region. Global toasts are never the only record of an outcome.

### Pattern 1 — Command center

Routes: `/app`, `/platform`. References: [Stripe chart layout](https://docs.stripe.com/stripe-apps/patterns/chart-layout.md), [Stripe filter controls](https://docs.stripe.com/stripe-apps/patterns/filter-controls.md).

- Order on `/app` (PR-25, UX-8): page header with applied scope and period → one shared StatCard period-summary row → comparative shipment line chart → **Perlu perhatian** ranked list → recent shipments. Order on `/platform`: page header → **Perlu perhatian** ranked list → one shared StatCard summary row → trend chart → aggregate detail.
- *Perlu perhatian* is one list, not a card grid. Each row shows severity badge, plain-language condition, affected scope, count, and one action link to the filtered source records. Rows sort by severity, then by the failure-cost order defined in the metric contract. An empty list states why no work is present.
- Use the shared StatCard composition accepted in Phase13 for period summaries. Compact count cards use two columns on mobile; full money and detailed current-work cards stack. This supersedes the former mandatory single-surface KPI strip; ranked attention remains separate work in T-98/T-99.
- Applied filter summaries/chips reflect URL state. Editing uses one GET form with visible primary controls and an advanced disclosure for secondary dimensions. Chips are a view of URL state, not another form; remaining scope-chip work belongs to the queue task for that surface.
- Command-center and PR-42 analytics chart tables may start collapsed inside native disclosures labelled with row count. Charts and exceptions remain visible; the complete semantic data table follows its chart.

### Pattern 2 — Queue

Routes: `/app/pengiriman`, `/app/pengiriman/rts`, `/app/kontak`, `/app/label`, `/platform/tenant`, `/platform/audit`. References: [NN/g Data Tables: Four Major User Tasks](https://www.nngroup.com/articles/data-tables/), [Shopify layout](https://shopify.dev/docs/apps/design/layout).

- Full-width page. Header carries title, one-line job description, and the single primary action; secondary actions are outline buttons.
- Status tabs show counts and live in the URL. Search plus filter chips sit above the table. `Hapus filter` resets to the canonical URL.
- The table supports the four NN/g tasks: find (search, filters), compare (tabular numerals, right-aligned money), inspect one row (row link to detail), and act (row menu, bulk bar).
- A bulk bar appears only while rows are selected and offers only actions that are safe for many rows, such as label print and export. Provider submission and recovery are never bulk actions.
- System-empty and filtered-empty are distinct states; filtered-empty names the active filters and offers reset.
- At390px retain the accepted semantic table inside a labelled, keyboard-focusable local scroll region with an opaque leading identity column and full identifiers in wrapping cells. T-120/T-127 supersede the former mobile row-list proposal. Required row actions and source fields remain reachable.

### Pattern 3 — Detail

Routes: `/app/pengiriman/[shipmentId]`, `/app/kontak/[contactId]`, `/app/label/[shipmentId]`, `/platform/tenant/[tenantId]`. References: [Primer navigation](https://primer.style/product/ui-patterns/navigation/), [NN/g local navigation](https://www.nngroup.com/articles/local-navigation/).

- Order: breadcrumb → (platform only) scope-context banner → title with status badge and the one valid next action → key-facts strip → local tabs or grouped sections → activity timeline → danger zone.
- The platform scope-context banner names the tenant being viewed, states that customer data is redacted, and states that actions are audited.
- The activity timeline renders human-readable Indonesian sentences derived from audit and lifecycle events; raw event enums such as `PLATFORM_MONITORING_VIEWED` never reach the page.
- Destructive lifecycle actions sit in a separated danger zone at the bottom with an outline destructive button.
- `/app/label/[shipmentId]` applies the breadcrumb, header, and action rules to its toolbar and history; the thermal label sheet keeps its custom print markup (UX-5 Label preview; sizes and legibility in § T-176 below).

### Pattern 4 — Settings

Routes: `/app/pengaturan`, `/app/pengaturan/pickup`, `/app/pengaturan/outlet`, `/app/pengaturan/koneksi`, `/app/anggota`. References: [Shopify layout](https://shopify.dev/docs/apps/design/layout), [Stripe communicating state](https://docs.stripe.com/stripe-apps/patterns/communicating-state.md).

- Each section is two columns at 1024px and above — context (title, status badge, description) left, controls right — and one column below. Each section saves independently from its own footer.
- A readiness strip precedes the sections when the object can be not-ready. Its badge and its checklist derive from the same server readiness result, so they cannot disagree.
- Leaving a section with unsaved changes asks for confirmation. On mobile the save action sticks to the viewport bottom only while changes are unsaved.
- `/app/pengaturan` may show a "Tampil di label" preview built only from the selected pickup's provider labels. UX-10 remains authoritative for credentials and location authority.
- `/app/anggota` is one of the menu's pages, not a page of its own shape (T-159): a stack of three `SettingsCard`s — Ringkasan akses (the four counts), Daftar anggota (the ordered member list, its per-member *Kelola akses* disclosure and its confirmations), Undang anggota (the invite form, its submit in the card footer). No status tabs and no invite `Dialog`: the header *Undang anggota* button moves focus into the always-visible invite card. The last active Tenant Admin keeps its lock badge on the row **and** on the Daftar anggota card title, and its controls stay replaced by the protection sentence.
- The focus ring is one full-alpha 2px `--ring` on every variant. The upstream shadcn preset rings the destructive button with `ring-destructive/20`; measured on the contact detail page that is 1.41:1 against the card, so the override is removed rather than carried (T-159).

### Pattern 5 — Flow

Routes: `/app/pengiriman/baru`, `/app/impor`, `/app/kontak/baru`, and the tenant provisioning dialog hosted on `/platform/tenant`. A flow with a single step, such as `/app/kontak/baru`, omits the stepper and keeps every other rule. References: [Stripe progress stepping](https://docs.stripe.com/stripe-apps/patterns/progress-stepping.md), [Stripe action buttons](https://docs.stripe.com/stripe-apps/patterns/action-buttons.md).

- A stepper names every step; completed steps summarise the choice made and remain navigable back without losing input.
- Draft persistence state is visible (`Draf tersimpan HH.mm`).
- Money-bearing flows keep the money summary visible beside the step at 1024px and above and directly above the confirm action below it. Amounts shown before issuance are labelled as provider estimates with their retrieval time.
- The final action names its consequence (`Terbitkan resi`, `Buat 12 draf`) and uses the confirmation ladder.

### Pattern 6 — Analysis workspace

Routes: `/app/analitik`, `/app/keuangan`. References: [Stripe chart layout](https://docs.stripe.com/stripe-apps/patterns/chart-layout.md), [NN/g Data Tables](https://www.nngroup.com/articles/data-tables/).

- The route-specific contract keeps its order: UX-9 for `/app/analitik`; PR-20 and UX-5 Finance (summary strip → variance queue → ledger table) for `/app/keuangan`.
- One filter bar (the accepted single GET form) with applied-filter chips, one shared StatCard summary row, charts each followed by a labelled disclosure containing their complete semantic data table (PR-42), then the authoritative detail table. On `/app/keuangan` the UX-5 Finance order governs: summary strip → variance queue → optional variance chart → ledger table.
- Charts come only from the `docs/spec/19-METRICS-ANALYTICS-CONTRACT.md` M-3 catalogue. A chart is a non-authoritative view: it never replaces a table, it is captioned with the table it summarises, and it links to that table. On `/app/keuangan` the ledger and reconciliation tables remain the authority.

### Route coverage

| Route | Pattern |
|---|---|
| `/app` | 1 Command center |
| `/app/pengiriman`, `/app/pengiriman/rts`, `/app/kontak`, `/app/label` | 2 Queue |
| `/app/pengiriman/[shipmentId]`, `/app/kontak/[contactId]`, `/app/label/[shipmentId]` | 3 Detail |
| `/app/pengaturan`, `/app/pengaturan/pickup`, `/app/pengaturan/outlet`, `/app/pengaturan/koneksi`, `/app/anggota` | 4 Settings |
| `/app/pengiriman/baru`, `/app/impor`, `/app/kontak/baru` | 5 Flow |
| `/app/analitik`, `/app/keuangan` | 6 Analysis workspace |
| `/platform` | 1 Command center |
| `/platform/tenant`, `/platform/audit` | 2 Queue (provisioning dialog follows 5 Flow) |
| `/platform/tenant/[tenantId]` | 3 Detail |

### Pattern references and adoption

- Pattern references above were verified reachable on 2026-09-13. They inform structure only; GeraiCUAN tokens, copy, and domain rules win.
- Adoption order: foundation → Settings → Command center and Analysis workspace → Queue, Detail, and Flow, one route group per task (see `TASKS.md` Phase 12).

## Required surfaces
1. Public sales page: product explanation, feature summary, trust/support content, and Tenant Login / Super Admin Login entry links only; no public CMS data or operational actions.
2. Super Admin monitoring dashboard: global KPI row, trends, alert queue, and URL-addressable tenant/outlet/courier/status/date filters; all period labels show selected timezone.
3. Super Admin tenant list/detail: active/suspended state, outlet/configuration health, membership count, shipment lifecycle counts, provider queue/unpaid/error state, usage, operational ledger/reconciliation summaries, and append-only audit trail; destructive lifecycle actions require confirmation.
4. Tenant outlet configuration: a compact desktop outlet list-detail and one narrow-screen active-outlet selector; outlet-scoped location readiness followed by `platform default` versus private Mengantar mode; a blank password field for creating/replacing an API key; static stored/not-verified/connected/attention state without key fragments; the accepted provider-authoritative pickup selector with readable labels and derived origin; and safe connection errors without secret detail.
5. Tenant analytics and finance: operational KPI/trends with an accessible chart plus retained detail table, professional date filter presets/custom range, ledger table, reconciliation variance/status, and a clear distinction between COD principal, fees, VAT, and provider cost.
6. Reusable contact directory: sender/recipient role tags, multi-address list, search, create/edit/archive, and source-of-data indication when prefilled into a shipment.
7. Full-page shipment workspace: sender/recipient contact search or manual snapshot, package/declared value, COD/non-COD, provider estimates, confirmation, result, and print state.
8. Bulk intake with downloadable schema, row count, per-row errors, valid-row confirmation, and submission progress.
9. Issued shipment label preview/reprint history.
10. Tenant operational overview: role-specific priority summary, outlet/readiness warning where permitted, actionable shipment exception queue, and recent shipment outcomes; every summary links to its filtered source records.
11. Tenant analytics: period/comparison KPIs, created-versus-issued trend, lifecycle/courier breakdowns only where their denominator and time semantics are valid, and a server-paginated drill-down table whose visible `created`, `issued`, provider-`outcome`, or current-`exceptions` basis persists with the same authorized URL dimensions and export.
12. Provider mutation release state: production issuance and recovery controls remain unavailable while evidence is fixture-only; explain that the operation is not released without presenting an enabled control that could create a real provider order.

## Cross-screen screening standard

- Review the complete CMS after material workflow changes, but repair only evidenced regressions. A passing screen is not redesigned to make the audit look productive.
- Tenant review covers all 15 authenticated tenant pages as one system; platform review covers all 4 platform pages as one separate scope; public and login surfaces prove the public/CMS data boundary.
- At 390px, 768px, and 1280px compare shell gutters, page measure, PageHeader geometry, section rhythm, control and row density, status vocabulary, form behavior, table/chart semantics, and loading/empty/error/stale/pending/success treatments.
- Reject duplicate responsive form trees, nested cards, decorative KPI grids, ornamental badges, repeated padding, hidden opaque identifiers, desktop layouts merely scaled down for mobile, and any chart or status whose meaning depends only on colour or hover.
- Visual acceptance requires an operator-complete browser journey, keyboard/focus and overflow evidence, and correct data semantics; a screenshot or green build alone is insufficient.

## Screen Contracts
| Screen | Primary job | Critical states | Guardrails |
|---|---|---|---|
| Sales page | Understand product and choose login | normal, unavailable CMS link | Never render operational data. |
| Tenant Login | Enter authorized tenant CMS | invalid credential, suspended user/tenant, expired session | Generic failure wording; no account enumeration. |
| Super Admin Login | Enter platform CMS | invalid credential, unauthorized role, expired session | Never route tenant staff to platform admin. |
| Shipment workspace | Create one shipment and issue provider AWB | draft, estimating, COD unavailable, submitting, issued, unpaid, failed, unknown submission | Confirmation is explicit; print enabled only after provider AWB. |
| Bulk intake | Validate and submit many rows | upload validation, partial valid rows, queued, partial provider failure | Show row-level outcome; never hide partial failure. |
| Tenant analytics/finance | Reconcile operations | loading, no data, stale/failed query, variance | COD principal remains labelled as non-revenue. |
| Super Admin monitoring | Act on platform health | loading, empty, alert, filter mismatch | Filters and timezone are visible; credentials/PII remain redacted. |
| Tenant operational overview | Choose the next safe action | loading region, system empty, filtered empty, partial failure, stale snapshot, readiness/unpaid/submission exception | Operator never receives finance/governance data; Tenant Admin-only recovery and reconciliation actions remain server-authorized. |
| Tenant analytics | Compare lifecycle performance and investigate change | loading region, no period events, filtered empty, partial failure, invalid range/basis, stale result, export over limit | Event metrics and current snapshots are labelled distinctly; the latest signed tenant-wide variance is separated from filtered metrics and links to Keuangan; drill-down/export basis remains visible; COD principal is never labelled or totalled as revenue; chart data remains available as a table. |

## UX requirements
- Indonesian labels, IDR formatting, flexible Indonesian name/address/phone fields, keyboard navigation, visible focus, semantic labels, and status announced to assistive technology.
- Never use a destructive implicit submit: changing tenant state, provider submission, and reprint require an explicit action and clear result state.
- Show provider values as returned, their retrieval timestamp, and a reload state; never imply an estimate guarantees AWB issuance.
- While the production mutation release gate is closed, issuance/recovery copy and controls must state that only fixture validation is approved and must not offer an action that can call the real provider.
- Print uses CSS `@page` 100mm × 150mm through Chromium desktop browser support; native printer service is out of scope.


### T-111 refinement — 2026-09-14

T-111 removes generic introductory text and implementation terminology from operator-facing copy. Keep period/outlet/timezone and independent freshness visible, use concise status/action language, and preserve financial, authorization, and recovery qualifications. Analytics removes duplicated pre-KPI context; avoid repeating a filter summary in badges and paragraphs.

Historical T-111 instruction superseded the earlier home order: summary → comparative line chart → current work → recent shipments. Two daily series show SHP-CREATED in the selected range and preceding equal-length range, with solid/dashed strokes and dated table rows. The development-only `?demo=grafik` view labels its chart as sample data; surrounding operational data stays real.


The current Phase13 DOM order and the remaining T-98 priority gate are recorded in Adoption reconciliation above; historical T-111 composition does not override them.

### User-selected preset — 2026-09-14

The explicit `pnpm dlx shadcn@latest apply --preset b1Ymqvgky` instruction supersedes the hand-picked T-110 palette. Applied with shadcn 4.21.0: Radix Nova, Inter, neutral white canvas, primary `oklch(0.488 0.243 264.376)`, radius `0.45rem`, and the preset blue chart ramp. `cn` 0.3.0 is the generator's class merger. No dark-mode product surface is introduced.

Integration preserves the application's semantic CardTitle headings, named/focusable table scroll containers, mobile sidebar focus restoration and localized close label, 44px command input, alert text measure, mobile breakpoint subscription, chart SSR behavior, and print layout. Accessibility adaptations darken muted text to `oklch(0.52 0 0)`, use primary for full-alpha focus rings, use `#858585` input borders, retain the verified danger token, and use the darker preset blue for primary hover. The preset's neutral `accent` is a surface; interactive text uses `primary`. Inter is used by both Tailwind and legacy font aliases.


### Exact supplied palette — T-112, 2026-09-14

At T-112, the user's complete `:root` and `.dark` CSS superseded T-111's five accessibility token substitutions; T-118 subsequently replaced these values. Root muted-foreground is `oklch(0.556 0 0)`, destructive is `oklch(0.577 0.245 27.325)`, input is `oklch(0.922 0 0)`, and ring/sidebar-ring are `oklch(0.708 0 0)`. The complete supplied dark palette is now included; shared legacy aliases are declared on both `:root` and `.dark` so they resolve within the active scope. Light remains the default. No automatic preference detection, persistent preference, or theme-switch UI is introduced.

Historical T-112 evidence: exact palette fidelity was implemented, but its contrast gate failed: tinted destructive text measures 3.99:1 (required 4.5), muted text on the sunken surface 4.34:1 (required 4.5), and light focus ring on canvas 2.59:1 (required 3). Those historical failures were subsequently corrected and verified under T-118/T-126; do not interpret this retained record as a current failure or as permission to restore the old values. Existing custom status colors and print styling remain separate from the supplied shadcn palette.


### Admin composition redesign — T-113

Historical T-113 scope authorized a material composition pass while retaining T-112 tokens. The later T-118 neutral direction supersedes that token constraint. Use the installed shadcn Sidebar, Button, Card, Table, Field/Input and disclosure primitives as a consistent composition system. References inspected: [official dashboard block](https://ui.shadcn.com/blocks) and [sidebar composition](https://ui.shadcn.com/docs/components/sidebar); reuse hierarchy and density, not fixture metrics or generic navigation. Mengantar's public homepage does not provide evidence of authenticated admin behavior.

Chosen direction: a quieter sidebar, a clear workspace header, aligned title/actions, a compact period/outlet toolbar above the KPI summary, advanced filters in a labelled disclosure, a clearly grouped line-chart region, and tables with integrated headings/toolbars. Eliminate decorative access cards and repeated filter headings. Detail/settings forms use readable groups with clear labels and retained errors. Mobile keeps two columns for compact count summaries, stacks full money/detailed current-work cards, and retains one accessible control tree, local table scrolling and44px controls. Required scope, timezone, financial caveats, stale/error feedback, recovery actions and permission restrictions remain visible where decisions depend on them. No domain action or persistent preference is invented by this redesign.

### Historical black-and-white shadcn-admin foundation — T-118, 2026-09-14

Historical T-118 accepted black-and-white visuals and superseded the T-112 blue primary. Before T-132, `globals.css` carried the shadcn neutral palette on `:root` and `.dark`: primary `oklch(0.205 0 0)` with near-white text on light and `oklch(0.922 0 0)` with near-black text on dark, neutral secondary/accent/sidebar tokens, and a neutral ring. The T-112 contrast diagnostics are resolved by fixing tokens, not thresholds, and the departures from stock neutral are recorded here rather than made silently: light muted text `oklch(0.53 0 0)`, ring and sidebar-ring `oklch(0.556 0 0)`, light destructive `oklch(0.505 0.19 27.5)` so its `/10` and `/20` tints hold 4.5:1, dark destructive `oklch(0.78 0.13 22)` for its `/20` and `/30` tints, and explicit `--primary-hover` on both palettes. Semantic `--ok`, `--warn`, `--danger` status tokens and the colour-blind-safe chart ramp stay. The chart ramp is the Okabe-Ito categorical set (`--chart-1` `#0072b2`, `--chart-2` `#009e73`, `--chart-3` `#e69f00`, `--chart-4` `#cc79a7`, `--chart-5` `#d55e00`) on both palettes, restoring it after the shadcn preset's single-hue blue ramp (series differing only by lightness) re-entered with the palette swap. The essential trend strokes `--chart-4` and `--chart-2` measure at least 3:1 on the light and dark card; `--chart-3` (2.25:1 on white) is never an unmarked line stroke. `tests/design-token-contrast` also measures hue spread so a lightness-only ramp fails, and fails if any dark activation route is wired (a `prefers-color-scheme` rule, a `[data-theme]` selector, `color-scheme: dark`, a rebound `dark` custom variant, or source that applies the `dark` class or installs a theme provider); the `.dark` token block itself stays dormant. `tests/design-token-contrast` measures both palettes.

Page composition follows the MIT satnaing/shadcn-admin patterns through shared primitives in `src/components/cms`: `PageHeader` (muted eyebrow, `text-2xl font-bold tracking-tight` title, muted description, right-aligned actions), `StatCard` (KPI card), `DataTableToolbar` with `DataTableFacetFilter`, `DataTablePagination`, `DataTableShell`, and `SettingsLayout`/`SettingsCard` (`ContentSection` remains for the panels that have not moved to cards). Server-paginated tables keep filters, search, and page in the URL: the toolbar and pager navigate by links and GET forms, never by client table state. Status still never relies on colour alone.


### Shared blue interaction palette — T-132, 2026-09-14

Paduka Ongki authorized the recommended blue direction with "lanjut sempurnakan warna visual". This supersedes the temporary T-118 neutral interaction accent while retaining its neutral surfaces, typography, contrast adaptations and all T-134 composition. Both Admin and Super Admin consume the same tokens. This blue is GeraiCUAN's chosen accent, not a claim about Mengantar's official brand values.

| Role | Light | Dormant dark companion |
|---|---|---|
| Primary action, link, focus ring | `#2E47BA` | `#A5B4FC` |
| Primary hover | `#243A9B` | `#C7D2FE` |
| Primary foreground | `#FFFFFF` | `#171717` |
| Selected/menu accent surface | `#EEF2FF` | `#202B50` |
| Selected/menu accent foreground | `#2E47BA` | `#A5B4FC` |

Sidebar primary/foreground, accent/foreground and ring match their shared counterparts. Existing Button hover already consumes primary-hover. Neutral secondary/role badges and dark KPI values remain; no component or layout change is required. Semantic success/warning/danger/destructive and Okabe-Ito chart values remain independent and unchanged. The dark class stays dormant with no theme switch, persistence or automatic activation; temporary browser fixtures can inspect the companion without shipping that behavior.

Acceptance requires the existing light/dark token contrast checks, action/sidebar equality, all22routes at390/768/1440, independent screenshot review, and computed filled-button/selected-navigation/focus observations in both scopes. BUILD-LOG records executed evidence and its limits.

### PR-38 control precision

A field has a1px neutral resting border and exactly one2px contrasting focus indicator. Global native fallback focus belongs to the base layer so shadcn's owned focus is not doubled. Input, Textarea, SelectTrigger and explicit native select consumers use the same focus weight. InputGroup owns focus around the whole search field, while its inner input has no separate edge. Error text/border and disabled styling remain distinct. Full labels, minimum touch targets, blue palette and tenant data rules are preserved.

PR-42 (2026-09-15) supersedes earlier always-open analytics table guidance: keep charts visible, make full supporting tables and four secondary cost cards available on demand, and retain the paginated shipment table as the visible drill-down target. Reconciliation is a compact alert immediately after operational KPIs; color follows variance count, not the signed total.

## PR-44 — Tenant shipment number prefix

The shipment number prefix is a tenant identity element printed on the 100×150 mm label and shown wherever a shipment is identified (`TKP-10013`). It is 2–5 uppercase letters or digits, suggested from the tenant name's initials, set once by the Tenant Admin in Pengaturan and then locked; the default is `GC`. Labels must fit a 5-character prefix with a 6-digit number.

## T-148 — Stacked shipment table cells

Long admin shipment tables stack related facts in one cell instead of spreading them across columns (`src/components/cms/shipment-table-cells.tsx`): a timestamp is a `<time>` with the date on one line and a muted `HH.MM WIB` line below; courier/service sits above a monospace AWB (or "Belum ada resi"); a recipient is name, phone, then district–city (the two parts before the province of a Mengantar area label, after any postal code). The full address appears only on shipment detail and the printed label. Shipment numbers never wrap; AWBs and names may wrap.

## T-155 — Layered, not flat (supersedes the flat/hairline rule)

Owner steering 2026-09-16: the CMS read as one white sheet, and status was legible only to someone who already knew where to look. The earlier rule in this document — "presentation is flat and hairline-led… no decorative shadows" (§13, restated at §85) — is **rewritten here**, not quietly broken:

- **Ground and surface.** The CMS content area sits on `--surface-sunken` (the existing muted token, already contrast-asserted against `--ink` and `--ink-muted`), and cards stay `--card` white. The tonal step, not a border, is what makes a card read as a card.
- **One resting elevation.** `--elevation-resting` (light and dark) is exposed as `shadow-resting` and applied to `Card`. It is a single restrained step, paired with the existing hairline ring. Overlays keep their stronger shadow. Gradients, backdrop blur, nested cards and decorative shadows on non-card surfaces remain forbidden.
- **Card headline band.** A card's headline sits on `bg-muted/40` with a bottom hairline (`cardBandClassName` in `src/components/cms/cms-layouts.tsx`), so the title reads as a header rather than as body text.
- **One tone vocabulary.** `toneClass`/`toneIcon` in `src/components/cms/shipment-status-badge.tsx` is the single source for lifecycle, severity and finance tone. Severity maps Normal → ok, Perhatian → **warn** (it was a colourless outline chip while the amber token went unused), Kritis → danger, Nonaktif → neutral. Red stays reserved for Kritis, failure and destructive actions.
- **Status still never depends on colour alone.** Every tone carries an icon, and a coloured number keeps its sign: reconciliation variance is amber with an explicit `+`/`−`, and an exact zero reads neutral instead of printing `+Rp 0`.
- **Section markers.** Operational form sections carry a lucide marker beside the headline (`Warehouse`, `UserRound`, `MapPinHouse`, `Package`, `ClipboardList`, `Wallet`), always `aria-hidden` — decoration for scanning, never the only carrier of meaning.
- **Legibility for the audience.** Sidebar navigation labels step to 15px and sidebar group labels to 13px, with touch targets unchanged; helper text never drops below 13px.

Unchanged and still test-pinned: `--primary` `#2e47ba`, every AA text pair, the single 2px focus ring at 3:1, the Okabe-Ito chart ramp and its hue spread, and dark tokens that exist without any activation route.

### T-172 — table and control surfaces (extends the T-155 section)

Screenshot review showed the T-155 tokens had not reached the places an operator actually reads:

- **Table header** is `bg-muted` with a border-coloured bottom rule. The previous `bg-muted/40` over a white card computed to roughly `oklch(0.988)` — present in the class list, invisible on screen.
- **Rows alternate** (`bg-card` / `--table-stripe`), with hover and selection using `--accent` so state still reads stronger than the stripe. A pinned first column uses `bg-inherit`, never `bg-card`: painting the card colour over the row hid the stripe entirely.
- **Every fill a table row can take is opaque**, and `--table-stripe` exists for exactly that reason. `background-color: inherit` copies the parent's value verbatim, so a pinned column set to `bg-inherit` over a translucent stripe (`bg-muted/40`) becomes translucent itself — and a pinned column exists precisely because the rest of the row scrolls underneath it, so the scrolled text showed through on every second row. An alpha fill on `TableRow`, or a stripe equal to the card, fails `design-token-contrast`; the rendered pinned cell is measured on every route that pins a column by `scripts/ui-audit/admin-programme.mjs`.
- **Filter rows** sit on a card surface with the resting elevation instead of floating between two hairlines.
- **KPI change** is a tinted pill (`--ok-surface` / `--danger-surface` / muted), not loose coloured text, and a table's outcome total carries its tone while the row label and its icon keep the meaning without colour.
- **Page-level section headings** (headings that sit directly on the page ground, not inside a card) carry a 3px `--primary` rule via `sectionHeadingClassName`; cards keep the muted band instead.

### T-162 — state summary panel (PR-52)

- **One component, four pages.** `StateSummaryPanel` is the only shape a list-page state filter takes. Entries are cards on `--card` with a dashed border at rest and a solid `--primary` border plus `--muted` fill when pressed; the count is monospaced and tabular so a column of numbers aligns.
- **Focus.** The single 2px full-alpha `--ring` (`focus-visible:ring-2 focus-visible:ring-ring`). A half-alpha or 3px ring on this component fails `design-token-contrast`'s ring rule and the panel's own markup test.
- **State without colour.** The pressed entry carries a check glyph and a border-style change beside `aria-pressed`, so the selection survives a monochrome screen.
- **Targets.** `min-h-11` on every entry at every width, satisfying the 44 px rule below `md` without a second layout.

### T-163 — the date-range control and the calendar (PR-53)

Adapted from the owner's reference with four departures, three accepted in the task and the fourth forced by the fallback it asks for:

- **Focus.** The reference paints a 3px ring at half alpha. Ours is the single 2px full-alpha `--ring` (`focus-visible:ring-2 focus-visible:ring-ring`) everywhere in this control, including every day cell; a half-alpha ring is what `design-token-contrast` forbids.
- **Targets.** The reference's 28 px day cells become 44 px below `md` (`size-11 md:size-8`), and the trigger, the preset rows and both date inputs are 44 px below `md` too.
- **Locale.** `id-ID` weekday and month names from `Intl.DateTimeFormat`, and the week starts on Monday — the same day `minggu-ini` counts back to, so the highlighted week and the applied week are the same week.
- **Disclosure.** A native `<details>` panel rather than a Radix popover, because the named range controls must stay in the page's one GET form whether it is open or shut. `.cms-range-filter` and `.cms-range-popover` in `globals.css` give it the popover position from `md` and the bottom sheet below it.
- **Range colours.** The range's first and last day sit on `--primary`; the band between them is `--muted`. The accent stays the one accepted blue — the calendar introduces no second accent.


### T-156 — the settings menu and the settings card (PR-46)

- **`SettingsLayout`** takes `items` (icon, label, one-line description, href), `currentHref` and `indexHref`. From `lg` the menu is a left rail — `lg:w-44`, `xl:w-56` — beside a content column capped at `lg:max-w-[47.5rem]`. Below `lg` it has two shapes and only two: on the index the rail is the page (rows at `min-h-11`, description and `ChevronRight` visible), and on every other settings page the rail is `max-lg:hidden` and a single `lg:hidden` back link takes its place. The current item carries `aria-current="true"` and the `bg-muted` fill — never `aria-current="page"`, which the shell sidebar owns.
- **`SettingsCard`** is the PR-46 card anatomy over the shadcn `Card`: a `<section aria-labelledby>` wrapping title (`h2`, focusable by id so a hash can land on it), optional status badge in `CardAction` beside the title, description, body, and an optional footer separated by `CardFooter`'s divider — actions right-aligned from `md`, full width and `min-h-11` below it. A card with no actions renders no footer and therefore no divider.
- **Why cards, not bare panels.** Settings content on the `--surface-sunken` page ground put muted helper text at 4.46:1 against that ground. The white card restores the ground the tokens were measured against; `design-token-contrast` and the browser probe agree at 0 findings afterwards.

### T-176 — the thermal label (10 × 15 cm with a sender stub, and 10 × 10 cm)

The label is the product's core artefact, so it is designed for a 203 dpi thermal head (8 dots per mm, one dot = 0.125 mm) rather than for a screen.

- **Two sizes, one default.** **10 × 15 cm** is the default: one sheet in two parts. The upper **10 × 10 cm** is the package label and the lower **10 × 5 cm** is the sender's handover stub, separated by a cut line at exactly 100 mm. **10 × 10 cm** prints the package label alone — the stub and the cut line are not rendered at all, not merely hidden. `@page label-100x150` and `@page label-100x100` (margin 0) follow the choice through the sheet's `page` property; nothing else prints.
- **Cut line.** A dashed rule 2 CSS px thick (0.53 mm, four dots) across the sheet's width with a scissors mark and "potong di sini" at its centre, centred on 100 mm. The package label keeps 3 mm of padding above it and the stub 3 mm below it, so nothing but the line comes within **2 mm** of the cut on either side.
- **Package label (10 × 10).** Rows, top to bottom: courier (15 pt, 800) and service; Code 128 barcode of the AWB with the AWB in text beneath (12 pt monospaced, 700); recipient — name and phone on one line, then the destination area in bold, then the street address; sender on one clamped two-line row; COD box (2 px border, amount 13 pt 800) with its Mengantar breakdown, or the NON-COD instruction and Mengantar shipping; package facts (content, weight and colli, dimensions, declared value, Mengantar insurance); shipment number and issue time in WIB. The recipient row takes the remaining height and its type steps down with the existing `recipientDensity` tier — name/phone/area/address 12/11/9.5/9 pt compact, 10.5/10/8.5/8 long, 10/9.5/8/7.25 dense, 9.5/9/8/7 ultra — so a short address prints large for a courier at arm's length and a 480-character one still fits. The area line precedes the street address so any clipping past the over-capacity warning loses street detail, never the area a courier sorts by.
- **Sender stub (10 × 5).** "Bukti serah terima · untuk pengirim" with the outlet name; courier and service; COD amount when the shipment is COD, "NON-COD" otherwise; the AWB barcode (9 mm bars) and text; nomor kiriman, destination as district and city only, and "Diserahkan" — the recorded print request's time in WIB, or the current WIB minute until a print is recorded. **Never** on the stub: recipient name, street address or phone, the full area label (subdistrict, province, postal code), sender phone or address, package contents or value, or the COD breakdown. It leaves the building with the sender.
- **Legibility numbers.** Text floor **7 pt** (≈2.47 mm em, ≈20 dots). Bold (700 or heavier) for courier, AWB text, recipient name and phone, destination area, the COD box, the stub's COD amount and its facts. Code 128 subset B, narrow module **0.25 mm (2 dots)**, quiet zone **10 modules (2.5 mm)** each side drawn inside the SVG box, which no other element may enter; bars 10 mm high on the package label and 9 mm on the stub. An AWB too long to fit 94 mm at that module (more than 29 characters) prints as text only, and the page warns before printing. Rules are whole CSS px because Chrome snaps borders to them: 1 px (0.26 mm, two dots) between rows, 2 px for the COD box and the cut line.
- **Pure black on white.** Every element's ink is `#000`; backgrounds are transparent or white; no greys, tints, opacity, shadows, filters or background images — a thermal head renders them as noise and browsers drop backgrounds from print anyway. The screen preview frames the sheet with a 1 px outline that takes no space and is removed in print.
- **Preview equals print.** The preview is the sheet itself at its millimetre size; the audit compares every box's position and size between screen and print media.
