# Design System and UI Contract: GeraiCUAN

- Status: Accepted for CMS redesign
- Locale: `id-ID`; no custom branding or white-labeling in MVP.

## Visual Direction
- Public sales page: Brand/Marketing mode. Designed light, cool off-white canvas, dark ink, one high-contrast accent, hairline-led surfaces, and one clear login intent. Dark mode is out of scope for MVP.
- Public audience/job: Indonesian outlet operators evaluating whether the product can make shipment handling and COD accounting safer. The visual character is restrained operational confidence rather than promotional spectacle.
- Public signature: a shipment docket/label composition in the hero makes lifecycle authority, AWB, print size, and COD classification tangible without decorative product mockups. Do not repeat that framed composition as a generic card pattern below the hero.
- Public direction decision: editorial utility was selected over a conventional centered SaaS hero or a dense application screenshot. It communicates the operating model with no new asset dependency, remains legible at 390px, and reuses the accepted semantic tokens. Design dials are variance 5, motion 2, density 4.
- CMS Admin: clean, information-dense light operational surface using the repository's shadcn/Radix primitives and Tailwind semantic tokens. Cobalt is the sole interactive accent; neutral surfaces establish hierarchy; semantic green, amber, and red communicate status alongside text or icon cues. Use compact tables, explicit status badges, and no decorative dashboard cards where a queue or filterable table is the decision tool.
- Presentation is flat and hairline-led. Do not use gradients, backdrop blur, speculative dark mode, decorative shadows, or nested cards. Shadows are reserved for floating overlays.
- Responsive behavior: desktop full sidebar, tablet icon rail, mobile sheet navigation. Analytics/table filters collapse into one filter drawer below 768px. Narrow table regions retain semantic tables with a sticky leading column, horizontal scroll containment, and visible keyboard focus.
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
### Dashboard acceptance checks
- At 1280px, tenant and platform show the same full shell and no document-level horizontal overflow; each scope announces its own label and role.
- At 390px, the sidebar is replaced by the shared labelled navigation trigger; opening it exposes only routes permitted to that scope and role, and focus remains visible.
- Filters, status, empty, loading, error, table, and pager surfaces retain semantic labels and never cause horizontal page overflow. Wide table regions scroll locally rather than expanding the document.
- At every viewport, the selected WIB/IANA timezone, range, active filter count, and generated-at time remain visible without opening a chart tooltip.
- Loading skeletons mirror the final region, system-empty explains the next setup action, filtered-empty offers filter reset, and a region error retains successful sibling regions with a local retry.
- On mobile, KPI summaries stack, chart legends move above the plot, annotations become text below it, and dense filters move into one labelled Sheet while the applied filter state remains visible on the page.



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
