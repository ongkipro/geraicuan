# Design System and UI Contract: GeraiCUAN

- Status: Draft
- Locale: `id-ID`; no custom branding or white-labeling in MVP.

## Visual Direction
- Public sales page: Brand/Marketing mode. Designed light, cool off-white canvas, dark ink, one high-contrast accent, hairline-led surfaces, and one clear login intent. Dark mode is out of scope for MVP.
- CMS Admin: information-dense light operational surface with a persistent tenant/scope indicator, compact tables, explicit status badges, and no decorative dashboard cards where a filterable table is the decision tool.
- Responsive behavior: desktop full sidebar, tablet icon rail, mobile sheet navigation; analytics/table filters collapse into one filter drawer below 768px.

## Required surfaces
1. Public sales page: product explanation, feature summary, trust/support content, and Tenant Login / Super Admin Login entry links only; no public CMS data or operational actions.
2. Super Admin monitoring dashboard: global KPI row, trends, alert queue, and URL-addressable tenant/outlet/courier/status/date filters; all period labels show selected timezone.
3. Super Admin tenant list/detail: active/suspended state, outlet/configuration health, membership count, shipment lifecycle counts, provider queue/unpaid/error state, usage, operational ledger/reconciliation summaries, and append-only audit trail; destructive lifecycle actions require confirmation.
4. Tenant outlet configuration: private Mengantar connection status or `platform default` fallback, masked metadata, default pickup point, and safe connection errors without secret detail.
5. Tenant analytics and finance: operational KPI/trends, professional date filter presets/custom range, ledger table, reconciliation variance/status, and a clear distinction between COD principal, fees, VAT, and provider cost.
6. Reusable contact directory: sender/recipient role tags, multi-address list, search, create/edit/archive, and source-of-data indication when prefilled into a shipment.
7. Full-page shipment workspace: sender/recipient contact search or manual snapshot, package/declared value, COD/non-COD, provider estimates, confirmation, result, and print state.
8. Bulk intake with downloadable schema, row count, per-row errors, valid-row confirmation, and submission progress.
9. Issued shipment label preview/reprint history.

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

## UX requirements
- Indonesian labels, IDR formatting, flexible Indonesian name/address/phone fields, keyboard navigation, visible focus, semantic labels, and status announced to assistive technology.
- Never use a destructive implicit submit: changing tenant state, provider submission, and reprint require an explicit action and clear result state.
- Show provider values as returned, their retrieval timestamp, and a reload state; never imply an estimate guarantees AWB issuance.
- Print uses CSS `@page` 100mm × 150mm through Chromium desktop browser support; native printer service is out of scope.
