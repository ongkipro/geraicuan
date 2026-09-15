# PRD: GeraiCUAN

## Document Control
- Status: Accepted product direction; latest execution and completion evidence remain in `TASKS.md`
- Accountable owner: Paduka Ongki
- Updated: 2026-09-15
- Source: User product direction; Mengantar Public API docs retrieved 2026-08-28 and reviewed for location authority on 2026-09-01

## Product Decision
GeraiCUAN is a free multi-tenant SaaS CMS for Indonesian shipping outlets. The only public product surface is a sales page; all operational workflows are inside authenticated CMS Admin. Any number of isolated tenants may use the platform; each tenant operates its own outlets and private Mengantar connection, while the platform Super Admin monitors the service. The MVP creates single or bulk shipments, uses an outlet default pickup point, obtains Mengantar AWBs, prints labels, and maintains an operational ledger.

## Scope
**In:** public sales page; separate Tenant and Super Admin login entry points; unlimited free tenant/onboarding lifecycle; tenant and outlet setup; per-tenant private Mengantar configuration with platform-default environment fallback; reusable tenant-scoped sender/recipient directory; individual/bulk intake; sender, recipient, package, declared value, COD/non-COD; account-specific Mengantar estimates; provider-returned insurance/shipping values; provider AWB; 100x150mm label; Super Admin and tenant analytics with professional date filters; operational financial ledger and reconciliation; Super Admin monitoring and tenant management.

**Out:** subscriptions/billing, custom domains/white-labeling, inventory, custom courier rates or insurance calculations, courier handover manifests, and production Mengantar order creation until its separate release gate is explicitly approved.

## Authenticated Product Boundaries
- **Ringkasan** is the daily command center for both tenant roles. It defaults to the last seven calendar days including today in WIB, gives shallow period context, and prioritizes current work and exceptions; it is not the historical analysis or ledger authority.
- **Pengiriman** owns lifecycle queues, shipment records, issuance, recovery guidance, labels, and state-valid operational actions.
- **Analitik** is the Tenant Admin historical exploration surface for comparison, trends, breakdowns, supporting rows, and export. It is read-only and does not become the financial system of record.
- **Keuangan** is the Tenant Admin authority for immutable ledger entries, reconciliation history, and permitted reconciliation mutations. Analitik and Ringkasan link into this source rather than redefining financial truth.
- Production provider issuance and recovery remain disabled for release. Only sanctioned sanitized local fixtures may exercise those mutations until a separately approved provider, security, reconciliation, and release review authorizes real order creation.

## Admin reference direction — 2026-09-13

- Source: Paduka Ongki requested Tokophi admin UI/UX mapping, including the initial summary and analytics, then requested supporting PRD/design architecture with blue inspired by Mengantar. This records a design direction, not completed runtime implementation or approval of new financial rules.
- Use Tokophi as the composition and interaction reference: grouped navigation, compact page headers, consistent density, actionable work lists, trend/detail hierarchy, and readable numbers. Adapt it to shipping operations and the existing PR-17, PR-22, PR-25, and PR-26 contracts.
- Use a restrained blue interactive accent with neutral light surfaces. Spec 10 owns the proposed palette and validation; exact colours remain a design recommendation until rendered verification. Do not import another product's branding, subscription controls, retail inventory, or storefront conversion metrics.
- Preserve PR-25's summary-first tenant home and the exception-first platform home. Tokophi's action-first tenant ordering is not adopted. Ringkasan, Analitik, Keuangan, and platform monitoring retain their separate authority and role boundaries.
- Spec 19 remains the sole metric authority. Its M-5 D-3 net-margin decision remains pending; presentation work cannot settle it or describe COD principal as earned revenue. Missing tracking or settlement evidence cannot become a delivery, return, payout, or margin claim.
- Delivery uses the existing Phase 12 queue: T-94 (shell), T-98/T-99 (command centers), T-100 (analytics), and T-108 (screening). T-109 records this documentation work only. No new product specification pack, runtime rewrite, schema migration, or competing execution queue is required.

## Actors
| Actor | Goal | Tenant relationship |
|---|---|---|
| Super Admin | Provision tenants and monitor platform/tenant operational health | Platform-global |
| Tenant Admin | Configure outlet, private integration, and reusable contacts | Tenant administrator |
| Operator | Create, submit, print shipments, and reuse permitted contacts | Tenant member |
| Sender/recipient | Shipment data subjects, not CMS users | Tenant shipment parties |

## Requirements
| ID | Statement | Priority | Acceptance | Owner | Status |
|---|---|---|---|---|---|
| PR-1 | When a Super Admin provisions, suspends, or reactivates a tenant, the system shall enforce the resulting tenant lifecycle without exposing other tenants. | Must | Authorized Super Admin succeeds; tenant user is denied; suspension blocks tenant operations. | Paduka Ongki | Accepted |
| PR-2 | When a Tenant Admin configures an outlet, the system shall store a default Mengantar pickup address and server-side credential reference scoped to that tenant. | Must | Another tenant cannot read/change it; credential never reaches browser/logs. | Paduka Ongki | Accepted |
| PR-3 | When an Operator submits one shipment draft, the system shall validate sender, recipient, selected destination, package, declared value, and COD/non-COD inputs before estimation. | Must | Invalid data prevents submission with field errors. | Paduka Ongki | Accepted |
| PR-4 | When an Operator imports a bulk shipment file, the system shall report row-level validation failures and create drafts only for valid rows. | Must | Invalid rows create no shipment. | Paduka Ongki | Accepted |
| PR-5 | When a valid draft has origin, destination, weight, and payment data, the system shall show account-specific Mengantar services and provider-returned shipping/insurance values, hide unsupported routes, and disable unsupported COD. | Must | `unsupported` services hidden; `unsupported_cod` blocks COD; no custom shipping/insurance price calculation. | Paduka Ongki | Accepted |
| PR-6 | When an Operator explicitly confirms estimated drafts, the system shall automatically push the relevant batch to Mengantar server-side and persist the provider result and lifecycle state. | Must | No second manual push exists; provider `cnote_no` is stored only on successful issuance; dynamic-AWB requests serialize per account. | Paduka Ongki | Accepted |
| PR-7 | When Mengantar returns an AWB, the system shall render a printable 100x150mm label containing the provider AWB, courier, sender, recipient, package, COD/non-COD and provider pricing details, and record print/reprint history. | Must | Browser print preview includes provider AWB and correct tenant data. | Paduka Ongki | Accepted |
| PR-8 | When a non-COD Mengantar batch returns unpaid without an AWB, the system shall mark it awaiting payment and allow a Tenant Admin to recover it with Mengantar pay-unpaid after the tenant has funded its Mengantar balance. | Must | Recovery persists returned AWBs; unauthorized/cross-tenant retry is denied. | Paduka Ongki | Accepted |
| PR-9 | When an Operator selects COD on a COD-eligible provider service, the system shall set the provider COD amount to declared goods value + Mengantar shipping fee + GeraiCUAN COD service fee + VAT, with service fee = 3% of goods value + shipping fee and VAT = 11% of that service fee. | Must | For IDR, round each fee component half-up to a whole rupiah and persist all four components; a deterministic fixture verifies the final COD amount. | Paduka Ongki | Accepted |
| PR-10 | When an outlet has an active private Mengantar configuration, the system shall use that tenant-owned configuration for all provider calls; otherwise it shall use only the platform default Mengantar environment configuration. | Must | Resolver preference is covered by tests; neither secret source is returned to browser, logs, or another tenant. | Paduka Ongki | Accepted |
| PR-11 | When a Super Admin opens platform monitoring, the system shall provide filtered aggregate and per-tenant operational visibility for tenant lifecycle, outlets, memberships, shipment lifecycle, provider health, queue/unpaid/error states, usage, and audit events without exposing credentials or unnecessary shipment PII. | Must | Dashboard filters are URL-addressable; aggregate and tenant views have consistent counts; secret/PII redaction tests pass. | Paduka Ongki | Accepted |
| PR-12 | When a Tenant Admin or permitted Operator saves a sender or recipient, the system shall maintain a tenant-scoped reusable contact directory with one or more addresses that can prefill future shipment forms without altering historical shipment label snapshots. | Must | Contact searches never cross tenants; updates affect new drafts only; a contact can be selected as sender, recipient, or both. | Paduka Ongki | Accepted |
| PR-13 | When a person signs in through Tenant Login or Super Admin Login, the system shall authenticate them and route them only to the CMS scope authorized by their server-side role. | Must | A Super Admin reaches platform admin only; tenant roles reach only their tenant CMS; suspended users/tenants and unauthorized roles are denied. | Paduka Ongki | Accepted |
| PR-14 | The public web surface shall be a sales page that explains GeraiCUAN and links to the appropriate login entry points; shipment, contact, finance, analytics, and provider controls shall not be publicly accessible. | Must | An unauthenticated browser can view the sales page but gets no operational data or actions. | Paduka Ongki | Accepted |
| PR-15 | When a Super Admin or Tenant Admin opens analytics or monitoring, the system shall provide professional timezone-aware date-range filters and role-appropriate operational/financial metrics with aggregate, trend, table, empty, loading, and error states. | Must | Preset and custom ranges are URL-addressable; metrics use the same displayed timezone and date boundaries. | Paduka Ongki | Accepted |
| PR-16 | When shipment, provider payment, or reconciliation state changes, the system shall append immutable tenant-scoped operational ledger entries and provide filtered daily/monthly reconciliation reports. | Must | COD principal is distinguished from fee revenue; provider cost, COD service fee, VAT, unpaid/recovery, and adjustments are traceable to source records. | Paduka Ongki | Accepted |
| PR-17 | When an authenticated CMS user enters their authorized scope, the system shall render one role-aware operational shell with persistent scope, truthful current-location navigation, and only the destinations and actions their role may use. | Must | Tenant navigation uses the accepted groups and routes in UX-2; platform navigation exposes only Monitoring, Tenant, and Audit; contextual shipment routes retain Pengiriman as current; a forbidden direct route is rejected or redirected before protected data reads and never marks Ringkasan as the current destination merely as a fallback. | Paduka Ongki | Accepted |
| PR-18 | When a tenant user needs to act on shipments after drafting, the system shall provide a tenant-scoped shipment queue and detail workspace with lifecycle status, estimates, AWB, unpaid/unknown recovery guidance, and label-history entry points. | Must | A user can locate a shipment by lifecycle state, inspect its immutable operational context, and reach only state-permitted actions without exposing another tenant. | Paduka Ongki | Accepted |
| PR-19 | When a Tenant Admin manages outlet readiness, the system shall provide a safe outlet and Mengantar configuration surface showing setup state, platform-default/private source, pickup/origin metadata, and actionable non-secret failure guidance. | Must | Tenant Admin can complete or amend own outlet setup; Operator cannot mutate it; no credential value or reference reaches the browser. | Paduka Ongki | Accepted |
| PR-20 | When a Tenant Admin reviews financial operations, the system shall provide the authoritative timezone-aware ledger and reconciliation workspace that distinguishes COD principal from revenue, exposes variance, and links every displayed amount to its permitted operational source. | Must | URL-addressable filters keep ledger, reconciliation, and summary boundaries consistent; Analitik and Ringkasan link to this authority instead of duplicating mutation semantics; no tenant may view another tenant's entries. | Paduka Ongki | Accepted |
| PR-21 | When a Super Admin manages tenant operations, the system shall provide a tenant list/detail workspace with lifecycle actions, outlet/configuration health, memberships, operational counters, and append-only audit history. | Must | Lifecycle actions require explicit confirmation and record an audit outcome; monitoring-only information remains redacted. | Paduka Ongki | Accepted |
| PR-22 | While a CMS route is used on desktop, tablet, or mobile, the system shall preserve navigation context, keyboard access, readable status, loading/empty/error states, and usable data-table behavior without horizontal page overflow. | Must | Browser checks at 390px, 768px, and 1280px prove the role shell and primary queues remain operable. | Paduka Ongki | Accepted |
| PR-23 | When a Tenant Admin manages tenant staff, the system shall provide an invitation, role, and deactivation workflow that preserves at least one active Tenant Admin and records governance outcomes. | Must | A Tenant Admin can invite, change role, and deactivate permitted members; the last active Tenant Admin cannot be removed; unauthorized and cross-tenant attempts are denied. | Paduka Ongki | Accepted |
| PR-24 | When a requirement names an authenticated actor, the system shall expose the actor's permitted workflow through the CMS without requiring a direct URL, seeded identifier, database access, or test-only entry point. | Must | Browser evidence demonstrates the named role can discover and complete the workflow from navigation or its contextual state. | Paduka Ongki | Accepted |
| PR-25 | When a tenant user enters the CMS, the system shall provide a role-specific daily command center that first shows shallow period context for shipment input, COD/non-COD composition, and authoritative issued outcomes, then preserves the next shipment or outlet exception to act on. | Must | The last seven calendar days including today in WIB are the default; a URL-persisted range with the fixed WIB timezone drives the shallow overview context without turning Ringkasan into historical exploration; Operator sees permitted aggregate/workload data without finance or governance data; Tenant Admin additionally sees outlet readiness, unpaid recovery, and reconciliation exceptions; every count links to tenant-scoped supporting records with matching event or snapshot semantics. | Paduka Ongki | Accepted |
| PR-26 | When a Tenant Admin opens analytics, the system shall provide read-only lifecycle-valid historical shipment and financial analysis through period comparison, accessible trends, breakdowns, and drill-down tables without treating COD principal as revenue or replacing Keuangan as authority. | Must | Created and issued metrics use their authoritative lifecycle timestamps; current backlog is labelled as a point-in-time snapshot; Fixed WIB (Asia/Jakarta) and inclusive-start/exclusive-end range are consistent across each period-filtered KPI, chart, table, and export; chart data remains available as a semantic table; the separately labelled latest signed reconciliation variance is a tenant-wide current exception that does not inherit period, courier, or lifecycle filters and links to the exact Keuangan reconciliation source. | Paduka Ongki | Accepted |
| PR-27 | When a Tenant Admin chooses a private Mengantar account for an owned outlet, the system shall accept a replacement API key through the authenticated settings workflow, encrypt it before persistence, use it only in trusted server-side provider calls, and allow an explicit return to a complete platform default without ever returning the submitted or stored secret. | Must | Authorized create/replace/switch succeeds atomically; Operator and cross-tenant attempts are denied before secret processing; browser payloads, validation errors, audit events, logs, database connection rows, and screenshots contain no key, key fragment, credential-bearing URL, or managed-secret reference; a missing runtime encryption key fails closed. | Paduka Ongki | Accepted |
| PR-28 | When an authorized tenant user selects a Mengantar pickup or destination, the system shall resolve provider-authoritative IDs through the currently accepted account-pickup or general area-search contract and present human-readable Indonesian labels without requiring opaque-ID entry. | Must | Sanitized contract tests bind each displayed pickup or area hierarchy to its provider ID; the server revalidates current account authority before persistence; no-result, malformed, timeout, unavailable, and stale-authority states fail safely or recover locally; the same ID/label pair reaches the permitted contact, draft, estimate, and order-payload boundaries; no local area dataset is promoted to authority. | Paduka Ongki | Accepted |

## Non-functional Requirements
| ID | Requirement | Evidence | Owner |
|---|---|---|---|
| NFR-1 | Every tenant-owned read/write must use authenticated tenant context and deny mismatched tenant access. | Cross-tenant integration tests. | Engineering owner |
| NFR-2 | Mengantar credentials and credential-bearing URLs must never reach client payloads or logs. Recipient PII remains redacted from logs and platform monitoring; authorized tenant operational surfaces expose complete phone numbers under PR-36. | Log-redaction and API-boundary tests. | Engineering owner |
| NFR-3 | Estimate and order endpoints must rate-limit retries per tenant/user without queueing concurrent dynamic-AWB batches. | Integration tests and telemetry. | Engineering owner |
| NFR-4 | Operational UI supports Indonesian (`id-ID`), keyboard operation, loading/error/empty states, and 100x150mm print media. | Browser and accessibility checks. | Engineering owner |
| NFR-5 | Dashboard and analytics meaning remains available without colour, hover, or a wide viewport; streamed regions expose representative loading skeletons and independent empty/error recovery. | Keyboard, screen-reader, reduced-width, and partial-failure browser checks. | Engineering owner |

## Decisions and Evidence
| ID | Decision/evidence | Owner | Status |
|---|---|---|---|
| D-1 | Use Better Auth with PostgreSQL, email/password, invitation-only tenant membership, server-side role checks, secure cookies, CSRF protection, and database-backed rate limiting. | Paduka Ongki | Accepted |
| D-2 | Deploy containerized Next.js and PostgreSQL through Coolify; production secrets remain Coolify environment secrets. | Paduka Ongki | Accepted |
| D-3 | Use Chromium desktop print support for 100x150mm labels; native printer service is out of scope. | Paduka Ongki | Accepted |
| E-1 | Sanitized live non-mutating Mengantar address/estimate/performance probes on 2026-08-28 returned HTTP 200; 15 estimate couriers and no insurance fields. Insurance fee stays unimplemented until Mengantar exposes a documented response/payload. | Engineering owner | Observed |
| E-2 | Official Mengantar documentation reviewed on 2026-09-01 defines account pickup lookup and general area search. TD-16 owns the accepted endpoint and response-field details; this documentation review is contract evidence, not proof of production availability or authorization for provider mutation. | Engineering owner | Observed |
| D-4 | Retain operational shipment, ledger, and audit records for five years; archived reusable contacts are deleted after 90 days unless referenced by retained shipment snapshots. This is a product retention policy, not a legal-compliance determination. | Paduka Ongki | Accepted |
| D-5 | Keep production Mengantar issuance and recovery disabled while provider mutation evidence is fixture-only. Enabling real order creation requires separate explicit approval with provider-contract, tenant-isolation, secret-handling, reconciliation, rollback, and release evidence. | Paduka Ongki | Accepted release blocker |

## Cross-document Contract
Data: `05-DATA-MODEL.md`; tenant isolation: `06-TENANT-ISOLATION.md`; authorization: `07-IAM-RBAC-ABAC.md`; provider flow: `03-TECHNICAL-DESIGN.md`; controls: `12-SECURITY-ARCHITECTURE.md`; tasks: `TASKS.md`.

## Phase 2 Roadmap: Market Standard Expansion
Based on Indonesian 3PL aggregator market research (Mengantar, Biteship, Shipper), the following features are planned to meet market completeness:
| ID | Statement | Priority | Status |
|---|---|---|---|
| PR-29 | **RTS (Return To Sender) Management:** System shall provide a dashboard to track failed COD deliveries and manage return workflows to reduce merchant losses. | Must | Queued |
| PR-30 | **Real-time Webhook / Tracking Updates:** System shall receive and process push webhook events from Mengantar to update shipment status instantly without manual sync. | Must | Queued |
| PR-31 | **Multi-Courier / Multi-Aggregator Expansion:** System architecture shall support adding secondary aggregators (e.g., AutoLaris, Biteship) for redundancy. | Should | Queued |
| PR-32 | **Duplicate Order Detection:** System shall warn the Operator if a bulk import or manual draft contains a recipient phone/address matching a recent (last 7 days) shipment to prevent double shipping. | Must | Queued |
| PR-33 | **COGS & Net Margin Tracking:** System shall allow Tenant Admins to input COGS (Cost of Goods Sold) per shipment to calculate true net margin in Analytics, beyond just gross COD collection. | Should | Queued |


## Accepted Indonesian operational refinement — 2026-09-15

Context: Paduka Ongki requested polished shadcn controls, navigation/search, a live GMT+7 clock, consistent Indonesian date filtering, full operational numbers, and an updated development map with parallel delivery. T-132 through T-138 already deliver the blue system, tables, local Mengantar connection, settings/member polish and corrected long-address pickup selection; those completed changes are preserved. New work is local development, with no implicit commit, push, provider mutation or production deployment.

| ID | Statement | Priority | Acceptance criteria | Owner | Status |
|---|---|---|---|---|---|
| PR-34 | When an authenticated user uses the CMS header, the system shall offer a shadcn search modal over their permitted navigation destinations and display a live date and HH:mm:ss clock in WIB (GMT+7). | Must | Search supports grouped matches, empty recovery, distinct hovered/active/current presentation, a visible close action, Ctrl/Cmd+K outside editable/other-modal contexts and deterministic focus restoration. Clock uses Asia/Jakarta, stable hydration and no per-second assistive announcements; header remains usable at320/390/768/1440. | Paduka Ongki | Accepted |
| PR-35 | When any operational date, month or year range is resolved or displayed, the system shall use WIB (Asia/Jakarta, GMT+7) consistently while storing instants in UTC. | Must | Shared date boundary logic normalizes obsolete timezone input to WIB, redundant timezone selectors disappear, and midnight/month/year boundary tests prove the same interval across summaries, analytics, finance and platform views. No metric formula or event basis changes. | Paduka Ongki | Accepted |
| PR-36 | While an authorized tenant user views operational shipment, recipient, destination or contact information, the system shall display complete phone numbers, AWBs and references without masking or destructive truncation. | Must | Authorized contact search/directory and shipment/RTS/label queues retain complete operational numbers. Tenant/outlet authorization is unchanged; platform monitoring, logs, secrets, API keys and auth tokens remain protected. Synthetic regression fixtures prove both full UI output and the unchanged cross-tenant boundary. | Paduka Ongki | Accepted |
| PR-37 | When a tenant user navigates the CMS, the sidebar shall expose shipment history and a single settings entry for authorized administrators. | Must | Pengiriman contains Buat kiriman, Histori kiriman (existing all-status /app/pengiriman), Retur and Kontak. Administrasi has one Pengaturan link; outlet/member tabs remain inside settings and both routes mark that destination current. Operator sees no settings; search uses the same canonical inventory. | Paduka Ongki | Accepted |

Timezone decision: the owner's explicit initial lock-to-GMT+7 request is the current execution direction, stated back during work. WIB/WITA/WIT tenant configuration was offered as an alternative but was not selected; it is not silently introduced as a schema or settings change. A later owner choice can supersede PR-35 explicitly. PR-35 supersedes former selected-timezone language in PR-25/PR-26 and the metrics contract. PR-36 supersedes blanket client-side phone minimization only for authenticated, scoped tenant operational workflows; it does not grant platform or public access to recipient data.

Delivery ownership: root handles header/navigation, shared documents, integration and browser verification. An isolated timezone worker implements PR-35; an isolated operational-number worker implements PR-36. Root TASKS remains the only execution queue. Independent reviewer and designer accept source and browser evidence before completion. No competing root PRD or planning file is created.

### PR-38 — Precise form-control focus and restrained navigation (accepted 2026-09-15)

When an operator focuses a text field, textarea, search field or select, the interface shall show one clear focus boundary without stacked outlines and shadows. Normal fields retain1px neutral borders; focused controls use one2px contrasting indicator. A search InputGroup owns the indicator around its icon and input together. Error and disabled states remain accessible. Native fallback focus remains visible; shadcn controls own their focus paint.

The sidebar shall retain implemented, role-permitted daily jobs and remove redundant group headings. Produk is explicitly excluded by the owner. Current designer direction is Dasbor; Pengiriman (Buat kiriman, Histori kiriman, RTS, Kontak); Pengelolaan (Analitik, Keuangan, Pengaturan). The market-based tools and quick-rate decision is being verified before adding destinations; labels from Mengantar are reference material, not authorization to create fictitious features or counts.

Acceptance: single-boundary geometry/contrast, actual input-group focus, focused/invalid/disabled controls at390/1440, no inaccessible native fallback, exact role inventory, and independent visual/correctness review.

## Indonesian outlet workflow research and accepted tools — 2026-09-15

Actor/job: authenticated Tenant Admin or Operator answers a customer's shipping-price question at the outlet before deciding whether to create a shipment. Success is a relevant provider quote for the outlet origin, destination and package weight without first collecting recipient PII or creating a draft. This is a product inference from official workflow evidence, not a customer-frequency study.

Primary evidence:
- [Mengantar Cek Ongkos Kirim](https://www2.mengantar.com/cek-ongkos-kirim/) documents origin, destination and weight followed by multi-courier results. This supports a dedicated rate-check entry point. Promotional percentages and advertised coverage are not copied into business rules.
- [Biteship Retrieve Courier Rates](https://biteship.com/en/docs/api/rates/retrieve) documents geographic inputs, gram weights and service/price/duration/capability results. It is a benchmark for quote clarity, not authorization to add a provider or infer unsupported Mengantar fields.
- [Mengantar courier comparison](https://help.mengantar.com/id/articles/5502313-jne-sicepat-sap-idexpress-jandt-lion-parcel-anteraja-atau-pos-ind) makes destination changes conditional on courier/status/support channels. A generic post-issue address-edit tool is therefore inappropriate without an explicit provider contract.
- [Mengantar ticketing](https://help.mengantar.com/id/articles/5110863-cara-mengecek-ticketing) treats tickets as operational response workflows. [Mengantar product update](https://help.mengantar.com/id/articles/14715369-mengantar-update-verifikasi-akun-pengiriman-full-darat-generate-api-key-dan-update-lainnya) exposes Buyer Score in export; neither page establishes an API contract for this repository.

| Requested reference | Accepted product treatment | Reason / boundary |
|---|---|---|
| Tarif Pengiriman / Beta | One Cek Tarif entry in the tenant header and page search | Same operator job; reuse the existing account-aware adapter |
| Buat Pesanan / Lengkap | Existing single Buat kiriman flow | Existing form already owns complete shipment data |
| Pelacakan / Riwayat / Pemantauan | Histori kiriman, its filters/detail and existing dashboard exceptions | No duplicate navigation or unverified live tracking claim |
| Laporan / Performa Kurir | Existing Analitik with courier breakdown | No invented performance score or metric |
| Kode Pos | Destination area search | Reuse actual provider area labels; do not invent a postal-code dataset |
| Riwayat Pengambilan | Deferred | No verified pickup-event source for a standalone history |
| Perubahan Berat / Tujuan | Shipment-context workflow only after provider contract acceptance | No generic operational mutation under settings |
| Skor Penerima | Deferred | Provider UI existence is not API availability |
| Halaman Pelanggan | Existing internal Kontak only | Public customer portal is outside accepted CMS scope |
| Info Terbaru / Onboarding | Contextual help/readiness | No permanent empty menu |
| Tiket / example49 and5 badges | Deferred | No ticket backend or authoritative counts to display |
| Produk | Excluded explicitly | Owner decision |
| Pengaturan | Outlet & koneksi, Anggota & akses tabs | Configuration/governance only |

**PR-39:** The system shall expose only implemented role-permitted tools; configuration remains in Pengaturan, daily jobs in operational navigation, and Produk is absent. Unsupported provider tools remain explicit deferred requirements rather than placeholder screens.

**PR-40:** When a tenant user selects Cek Tarif in the header or search, the system shall open an authenticated, responsive rate-check page where they select a ready outlet, an authoritative destination area, and package weight (1–100000grams). The system shall return available provider service names, shipping price in IDR, delivery estimate and COD eligibility using the existing Mengantar adapter, without saving a shipment, estimate snapshot or ledger entry. Origin/pickup and credentials come from server-derived outlet scope.

Acceptance: scoped ready outlets; authoritative destination validation; provider/account authority rechecked before quote publication; rate limiting; invalid/configuration/provider/rate-limited/empty/results states; no recipient PII required; stale results hidden when inputs change; keyboard/focus and320/390/768/1440 usability. Quotes show retrieval time in WIB and are labelled shipping estimates, not final COD/insurance/payment totals. The create-shipment flow still obtains its own persisted estimate and explicit issuance confirmation. No real order is created during verification.


### Shipment reference revision (owner request, 2026-09-15)

PR-41 supersedes PR-36 only where the previous implementation exposed shipment UUIDs as the human reference. Full operational phones and authoritative provider AWBs remain visible as previously accepted.

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| PR-41 | When a shipment is created, the system shall assign a persisted human reference composed of the creator's public numeric user number, the WIB creation date, and a per-user daily serial; existing shipments shall receive deterministic references without changing their UUIDs or business relations. | Must | Display e.g. `95758-260914-001`; user number has at least five digits and daily serial at least three, expanding instead of truncating. Use a full calendar day as allocator key and include year/month in the displayed date to avoid monthly collisions. Allocate atomically in PostgreSQL, enforce uniqueness and immutability, preserve retries and AWB authority. Existing records have no reliable creator audit: reserve `00000` for legacy/unattributed records rather than inventing a creator. UUID remains an internal PK/FK/route identifier. Backfill local data without resetting it. |


### Analytics progressive disclosure (owner request, 2026-09-15)

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| PR-42 | When a Tenant Admin reviews `/app/analitik`, the page shall prioritize summary and reconciliation exceptions, keep charts visible, and reveal long supporting tables and secondary cost details on request. | Must | Order: filters/context, operational KPIs, reconciliation exception, trend, courier performance, shipment values, paginated shipments. Label already-loaded details honestly (Lihat data tren / Lihat detail performa kurir / Lihat rincian biaya), rather than suggesting another network load. Keep COD principal liability and estimated net margin visible with qualifications; reveal four cost components without changing metrics. Preserve all errors, variance count even when net variance is zero, filters, URL state, CSV, table semantics, comparison and support links/pagination. |
