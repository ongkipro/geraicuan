# Data Model: GeraiCUAN

- Status: Draft
- Owner: Engineering owner — no named engineering owner is recorded (the PRD's accountable product owner is Paduka Ongki). The former "before first migration" due point has passed: migrations `drizzle/0000` through `drizzle/0072` exist and define the live schema, mirrored by `src/db/schema.ts`.

## Entities
Live set: every table created in `drizzle/0000`–`drizzle/0073` minus `shipment_reference_counters` (created 0038, dropped 0040) — 46 tables, the same set as the `pgTable` definitions in `src/db/schema.ts`. "RLS" is what the migrations state (`ENABLE` and `FORCE ROW LEVEL SECURITY`); grants are those of the runtime role `geraicuan_app`, with the migrations that set them. A table without RLS is either platform/identity data the Better Auth adapter reads, or a counter the runtime role cannot touch at all. No provider location cache exists (DATA-7).

**Identity and auth**

| Entity | Tenant-scoped | RLS · runtime grants | Purpose |
|---|---|---|---|
| `users` | No | None · `SELECT`, `UPDATE (email_verified, updated_at)` (0003, 0051), `UPDATE (two_factor_enabled)` (0073) | Authenticated principal identity; `two_factor_enabled` is the Better Auth two-factor flag, only a Super Admin can set it (DATA-25). |
| `sessions` | No (per user) | None · `SELECT, INSERT, UPDATE, DELETE` (0003) | Better Auth session: token, expiry, IP address and user agent for one signed-in user. |
| `accounts` | No (per user) | None · `SELECT, INSERT, UPDATE, DELETE` (0003) | Better Auth credential/provider account linked to a user (password hash or provider tokens); server-only. |
| `verifications` | No (platform) | None · `SELECT, INSERT, UPDATE, DELETE` (0003) | Better Auth short-lived verification values (identifier, value, expiry) such as email verification and password reset. |
| `two_factors` | No (per user) | None · `SELECT, INSERT, UPDATE, DELETE` (0073) | Better Auth TOTP factor of a Super Admin: encrypted secret and backup codes, verified flag, failure count and lock (DATA-25). |
| `rate_limits` | No (platform) | None · `SELECT, INSERT, UPDATE, DELETE` (0003) | Better Auth database rate-limit storage (`rateLimit.storage: "database"` in `src/lib/auth.ts`): key, count, last request. |
| `public_auth_rate_limits` | No (platform) | None · `SELECT, INSERT, UPDATE, DELETE` (0051) | Public sign-up/auth abuse counters keyed `scope:hmac-hex` with a fixed window (DATA-12). |

**Platform, reference and announcements**

| Entity | Tenant-scoped | RLS · runtime grants | Purpose |
|---|---|---|---|
| `platform_roles` | No (platform) | ENABLE + FORCE · `SELECT` (0001) | Grants a user the platform role; CHECK allows only `SUPER_ADMIN`. |
| `platform_announcements` | No (platform-wide) | ENABLE + FORCE | Info terbaru written by the Admin platform: title, plain-text body, category, pinned, `published_at` (NULL = draft) (DATA-21). |
| `platform_announcement_reads` | Per user | ENABLE + FORCE | One read receipt per (user, announcement), insert-only (DATA-21). |
| `wilayah_areas` | No (tenant-neutral reference) | ENABLE + FORCE · `SELECT` (0067) | Kemendagri kecamatan and kelurahan/desa with an upstream kode pos hint; suggests destination areas while typing, never a destination authority (DATA-22, D-32). |
| `audit_events` | Scope-tagged | ENABLE + FORCE | Security-sensitive Super Admin/tenant-admin changes. |

**Tenancy and configuration**

| Entity | Tenant-scoped | RLS · runtime grants | Purpose |
|---|---|---|---|
| `tenants` | No | ENABLE + FORCE | Platform customer lifecycle and status. |
| `memberships` | Yes | ENABLE + FORCE | User role in one tenant: `TENANT_ADMIN` or `OPERATOR`. |
| `outlets` | Yes | ENABLE + FORCE | Tenant shipment origin and operational pickup identity. Its `default_pickup_address_id`/`default_origin_area_id` pair and labels are the denormalized mirror of the outlet's default `outlet_pickup_points` row. |
| `outlet_pickup_points` | Yes | ENABLE + FORCE | The outlet's Mengantar pickup addresses as a list: provider `pickup_address_id`, its derived origin area, their labels, and which entry is the outlet default. |
| `mengantar_connections` | Yes | ENABLE + FORCE | Outlet private credential reference and non-secret connection metadata; row presence selects `private`, absence selects `platform_default`; never plaintext secrets. |
| `managed_secret_payloads` | Yes | ENABLE + FORCE | Server-only authenticated-encryption envelope for an outlet's private Mengantar API key, keyed by canonical purpose/reference and encryption-key version; never plaintext or browser-readable metadata. |
| `mengantar_credential_rate_limits` | Yes | ENABLE + FORCE · `SELECT, INSERT`, `UPDATE (count, last_request)` (0025, 0036) | Per tenant, outlet and actor request counters for private Mengantar credential operations. |
| `shipment_rate_limits` | Yes | ENABLE + FORCE · `SELECT, INSERT`, `UPDATE (count, last_request)` (0019, 0036) | Per tenant, actor and operation request counters for shipment and provider operations (for example `settlement-pull`, 0039). |
| `tenant_label_settings` | Yes | ENABLE + FORCE | Per-size choice of which fields the thermal label prints (Informasi label, DATA-17). |
| `tenant_brand_settings` | Yes | ENABLE + FORCE | Gerai logo (validated bytes), catatan resi, kategori usaha, email CS, website, default label size and switched-off couriers (DATA-20). |
| `tenant_logo_versions` | Yes | ENABLE + FORCE | Every gerai logo ever saved, content-addressed by SHA-256, append-only; an issued invoice names the version it printed (DATA-20, T-247). |
| `tenant_shipment_counters` | Yes (no RLS, no runtime privilege) | None · `REVOKE ALL` from the runtime role (0040) | Per-tenant shipment numbering state (`last_number`, `shipment_prefix`, lock time); touched only by SECURITY DEFINER functions (DATA-10). |

**Contacts**

| Entity | Tenant-scoped | RLS · runtime grants | Purpose |
|---|---|---|---|
| `contacts` | Yes | ENABLE + FORCE | Reusable sender/recipient directory entry with role tags, normalized contact details, an optional kategori and a per-tenant `contact_number` that addresses its detail page (DATA-19). |
| `tenant_contact_counters` | Yes (no RLS, no runtime privilege) | None · `REVOKE ALL` from the runtime role (0064) | Contact numbering state per tenant; written only by the before-insert allocator (DATA-19). |
| `contact_addresses` | Yes | ENABLE + FORCE | One or more reusable addresses for a contact, including selected Mengantar address metadata. |

**Shipment and estimate**

| Entity | Tenant-scoped | RLS · runtime grants | Purpose |
|---|---|---|---|
| `shipments` | Yes | ENABLE + FORCE · `SELECT, INSERT`, `UPDATE (status, cogs_amount_idr, updated_at)`; no `DELETE` (0000, 0033, 0035) | The shipment aggregate: tenant, outlet, creator, per-tenant number and `public_reference` (DATA-10), and lifecycle `status` (DATA-2). |
| `shipment_drafts` | Yes | ENABLE + FORCE · `SELECT, INSERT`, column-scoped `UPDATE`; no `DELETE` (0008, 0033, 0035, 0042) | Editable intake fields of one shipment before issuance (one row per shipment, `shipment_id` PK): destination, package, declared value, COD/payment method, pickup choice. |
| `shipment_parties` | Yes | ENABLE + FORCE | Immutable sender/recipient contact snapshots used for provider payload and label history. |
| `shipment_estimate_snapshots` | Yes | ENABLE + FORCE · `SELECT, INSERT` (0010) | One Mengantar estimate request per shipment: origin/destination area, weight, COD request, credential source, retrieval time. |
| `shipment_estimate_services` | Yes | ENABLE + FORCE · `SELECT, INSERT` (0010) | Each courier service returned by an estimate snapshot: provider-returned shipping, insurance, normal/special price, COD fee and eligibility. |
| `shipment_cod_totals` | Yes | ENABLE + FORCE · `SELECT, INSERT` (0011) | Immutable COD components for one shipment and its selected estimate service, with `cod_formula_version` (DATA-3). |
| `shipment_rts_events` | Yes | ENABLE + FORCE · `SELECT, INSERT` (0032) | Return-to-sender timeline notes per shipment (DATA-8); read by the RTS page, no application writer in `src/` today. |

**Provider**

| Entity | Tenant-scoped | RLS · runtime grants | Purpose |
|---|---|---|---|
| `provider_batches` | Yes | ENABLE + FORCE | Idempotency key, courier, upstream batch ID, queue/status. |
| `provider_order_snapshots` | Yes | ENABLE + FORCE | Sanitized request/response fields, provider order ID, AWB, fees, `is_paid`. |
| `provider_unpaid_recoveries` | Yes | ENABLE + FORCE · `SELECT, INSERT`, `UPDATE (status, safe_response_code, attempted_at, completed_at, updated_at)` (0014) | Tenant Admin request to pay an unpaid non-COD Mengantar order, one per order snapshot (DATA-5 "Pay-unpaid"). |
| `provider_order_history_events` | Yes | ENABLE + FORCE | Courier tracking events per shipment, append-only, both roles read (DATA-18). |

**Money, ledger and settlement**

| Entity | Tenant-scoped | RLS · runtime grants | Purpose |
|---|---|---|---|
| `ledger_entries` | Yes | ENABLE + FORCE | Immutable operational money entry, source transition, effective time, and reversal reference. |
| `reconciliation_runs` | Yes | ENABLE + FORCE | Daily/monthly tenant reconciliation period, source totals, variance, status, and actor. |
| `provider_settlement_pulls` | Yes | ENABLE + FORCE · `SELECT, INSERT` (0039) | One row per read-only Mengantar settlement/status pull (DATA-9). |
| `provider_settlement_items` | Yes | ENABLE + FORCE · `SELECT, INSERT` (0039) | Matched per-AWB settlement, charge and refund evidence from a pull (DATA-9). |
| `provider_order_status_observations` | Yes | ENABLE + FORCE · `SELECT, INSERT` (0039) | Provider status seen per matched shipment per pull and the transition decision it caused (DATA-9, 0047). |

**Print, handover and invoice**

| Entity | Tenant-scoped | RLS · runtime grants | Purpose |
|---|---|---|---|
| `print_events` | Yes | ENABLE + FORCE | Shipment label print/reprint event and actor/time. |
| `shipment_handover_events` | Yes | ENABLE + FORCE | "Tandai sudah diserahkan": append-only handover and undo events per shipment — who, when (server time), method, note; the latest event is the current state (DATA-24). |
| `shipment_invoices` | Yes | ENABLE + FORCE | Immutable nota for one issued shipment: number, issuer, snapshot document and charge (DATA-14). |

## DATA-1 — Isolation invariant
- Owner: Engineering owner

Every tenant-owned table has non-null `tenant_id`; foreign keys and composite uniqueness prevent associations across tenant IDs. Application queries use tenant context; RLS policies use the same tenant identity defense-in-depth.

## DATA-2 — Shipment lifecycle
- Owner: Engineering owner

`DRAFT → ESTIMATED → SUBMISSION_QUEUED → SUBMISSION_UNKNOWN|ISSUED|AWAITING_UPSTREAM_PAYMENT|FAILED`. `ISSUED` requires a provider `cnote_no`. Print events reference issued shipments only.

### Lifecycle diagram (from code)
The pre-issuance line above is the original contract. The diagram below is drawn from the code as it stands: the status set is `shipmentStatuses` (`src/lib/domain-enums.ts`, mirrored by the `shipments_status_valid` CHECK, last replaced in 0063). Edges up to `ISSUED`/`AWAITING_UPSTREAM_PAYMENT`/`FAILED` come from the writers (`estimate-repository.ts`, `order-batch-repository.ts`, `shipment-reconciliation-repository.ts`, `unpaid-recovery-repository.ts`). Edges after issuance are exactly `ALLOWED_TRANSITIONS` (`src/lib/provider-delivery-status.ts`), with its SQL twin `provider_delivery_outcome` (replaced in 0068). `FAILED` is reached only by reconciling an unknown submission; nothing in `src/` moves `SUBMISSION_QUEUED` straight to `FAILED`.

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> ESTIMATED : estimate saved
    ESTIMATED --> ESTIMATED : re-estimate
    ESTIMATED --> SUBMISSION_QUEUED : operator confirms
    SUBMISSION_QUEUED --> ISSUED : provider returns cnote_no
    SUBMISSION_QUEUED --> AWAITING_UPSTREAM_PAYMENT : non-COD, unpaid, no cnote_no
    SUBMISSION_QUEUED --> SUBMISSION_UNKNOWN : outcome not known
    SUBMISSION_UNKNOWN --> ISSUED : reconciled
    SUBMISSION_UNKNOWN --> AWAITING_UPSTREAM_PAYMENT : reconciled unpaid
    SUBMISSION_UNKNOWN --> FAILED : reconciled failed
    AWAITING_UPSTREAM_PAYMENT --> ISSUED : unpaid recovery paid
    ISSUED --> IN_TRANSIT
    ISSUED --> PROBLEM
    ISSUED --> DELIVERED
    ISSUED --> RTS_QUEUED
    ISSUED --> RTS_IN_TRANSIT
    ISSUED --> CANCELLED
    AWAITING_UPSTREAM_PAYMENT --> IN_TRANSIT
    AWAITING_UPSTREAM_PAYMENT --> PROBLEM
    AWAITING_UPSTREAM_PAYMENT --> DELIVERED
    AWAITING_UPSTREAM_PAYMENT --> RTS_QUEUED
    AWAITING_UPSTREAM_PAYMENT --> RTS_IN_TRANSIT
    AWAITING_UPSTREAM_PAYMENT --> CANCELLED
    IN_TRANSIT --> PROBLEM
    IN_TRANSIT --> DELIVERED
    IN_TRANSIT --> RTS_QUEUED
    IN_TRANSIT --> RTS_IN_TRANSIT
    IN_TRANSIT --> CANCELLED
    PROBLEM --> DELIVERED
    PROBLEM --> RTS_QUEUED
    PROBLEM --> RTS_IN_TRANSIT
    PROBLEM --> CANCELLED
    RTS_QUEUED --> RTS_IN_TRANSIT : return resi seen
    RTS_QUEUED --> RTS_RECEIVED
    RTS_IN_TRANSIT --> RTS_RECEIVED
    FAILED --> [*]
    DELIVERED --> [*]
    CANCELLED --> [*]
    RTS_RECEIVED --> [*]
    note right of ISSUED
        Handover overlay (DATA-24) - HANDED_OVER and UNDONE
        events in shipment_handover_events. Recorded only
        while ISSUED, printed, with cnote_no. Never changes
        status - the pickup scan (ISSUED to IN_TRANSIT) does.
    end note
    note left of RTS_RECEIVED
        Return to sender. No provider value
        reaches RTS_RECEIVED yet (DATA-13 gap).
    end note
```

- **RTS.** Mengantar's single `RTS` value maps to `RTS_QUEUED`; `RTS` with a return resi (`cnote_no_rts`) maps to `RTS_IN_TRANSIT`. A return never becomes a delivery. `RTS_RECEIVED` is in the graph but no captured or documented provider value reaches it today (DATA-13 gap).
- **Terminal.** `FAILED`, `DELIVERED`, `RTS_RECEIVED` and `CANCELLED` have no outgoing edge. `CANCELLED` is set only from a Mengantar report; no GeraiCUAN action sets it. `AWAITING_UPSTREAM_PAYMENT → CANCELLED` was added in 0068 (T-247, D-33).
- **Not lifecycle states.** `PENDING PICKUP`, `ACTIVE` and similar provider values are recorded and leave the status unchanged (`NO_LIFECYCLE_STATE`). The handover overlay is not a status either: Cetak resi's queues (Belum dicetak, Siap diserahkan, Diserahkan) are derived from print and handover events on `ISSUED` shipments (spec 19 LBL-*).

## DATA-3 — Money and provider snapshots
- Owner: Engineering owner

Store currency as `IDR` and all amounts as whole integer rupiah, except provider settlement evidence (`provider_settlement_items`, T-178), which stores Mengantar's own fractional figures exactly as `numeric(18,4)`. Persist user-declared goods value, provider-returned shipping and insurance values, the COD fee, VAT, and final provider COD amount separately. Final COD always equals the sum of goods, shipping, fee, and VAT. `shipment_cod_totals.cod_formula_version` names the rule a row was written with, and the database checks each version's own arithmetic; a row is never recomputed under a newer version because it records what was submitted to the provider. Version 1 (rows before migration 0048): `service_fee = round_half_up((goods_value + shipping_fee) × 3%)`, `vat = round_half_up(service_fee × 11%)`. Version 2 (T-175, migration 0048): `cod = ceil((goods_value + shipping_fee) × 10000 / 9667)`, `service_fee = round_half_up((cod − goods_value − shipping_fee) × 100 / 111)`, `vat` the remainder. Version 3 (T-186, migration 0050, COD Ongkir): `provider_cod_amount_idr` is the shipping charge alone, `cod_shipping_basis_idr` (NULL on versions 1 and 2, required on 3) is the shipping Mengantar deducts, `provider_cod_amount_idr × 9667 ≥ cod_shipping_basis_idr × 10000`, and `service_fee + vat = round_half_up(provider_cod_amount_idr × 333 / 10000)` split 100/111; the goods + shipping + fee + VAT identity is scoped to versions 1 and 2, so the goods are never part of a version 3 amount. The INSERT policy requires version 3 exactly for a `cod_shipping_only` draft and binds the basis to the selected service's `coalesce(special_price_idr, normal_price_idr, shipping_amount_idr)`. The column defaults to 1 so a writer that names no version is held to the additive rule; the application names 2 (or 3). `scripts/verify-migration-upgrade.mjs` writes a version 1 row before 0048 and proves it survives unchanged. As DATA-11 records for origins, a change to the formula the application computes is incomplete until these checks move with it. Preserve a sanitized estimate/order snapshot tied to the selected service; do not recompute provider shipping or insurance totals.

## DATA-4 — Operational ledger
- Owner: Engineering owner

`ledger_entries` is append-only. Amounts are IDR integers; source event and shipment/provider batch references are mandatory. Corrections create an `ADJUSTMENT` or reversal entry, never modify an existing entry. `COD_PRINCIPAL_COLLECTABLE` is a liability and is never reported as GeraiCUAN revenue. Reconciliation compares ledger/source totals by tenant, outlet, and professional date-range contract.

**Cancellation reversal (T-290, D-42; no migration).** COD shipments only (a prepaid order's wallet charge stays booked until a settlement REFUND proves otherwise). A shipment's authoritative transition to `CANCELLED` — the app's confirmed `DELETE /order` (`recordShipmentCancelled`) or a status pull (`applyProviderDeliveryTransitions`, which also catches up a shipment it finds already CANCELLED, e.g. by the webhook) — appends in the same transaction one `ADJUSTMENT` per `COD_PRINCIPAL_COLLECTABLE`, `MENGANTAR_SHIPPING_COST`, `MENGANTAR_INSURANCE_COST`, `MENGANTAR_COD_FEE_COST`, `GERAICUAN_COD_SERVICE_FEE_REVENUE` and `COD_SERVICE_FEE_VAT_PAYABLE` entry of that shipment (`CANCELLATION_REVERSED_ENTRY_TYPES`, `appendLedgerReversalsForCancelledShipments`, `src/db/ledger-repository.ts`): `amount_idr` = −original, the original's `financial_class`, outlet, batch and order snapshot, `effective_at` = the original's, `reverses_entry_id` = the original, `source_event` `MANUAL_ADJUSTMENT` (the only source event `ledger_entries_source_event_valid` admits for an ADJUSTMENT) with `source_event_id` = the original id, actor = the Tenant Admin who decided (`ledger_entries_active_tenant_insert` requires a USER actor and, for ADJUSTMENT, a Tenant Admin). `ledger_entries_source_event_type_key` makes it one reversal per entry, shared with manual adjustments, so a repeated CANCELLED decision appends nothing (`ON CONFLICT DO NOTHING`). Only a shipment of the context tenant that is CANCELLED now is touched. `NON_COD_UPSTREAM_PAYMENT` is not reversed (it records a wallet payment; a refund is only what a settlement REFUND line proves). Reconciliation's issued source leaves CANCELLED shipments out, so a reversed cancel matches and an unreversed one (a webhook cancel before the next pull: the webhook has no user principal) shows as variance. Ceiling: a cancellation reversal is told apart from a manual one by its CANCELLED shipment and its original `effective_at`; a dedicated source event needs a migration.

**COD fee reclassification (T-178, migration 0049, 2026-09-17).** `shipment_cod_totals.service_fee_idr` is Mengantar's COD fee carried to the buyer: Mengantar deducts it at settlement and GeraiCUAN never receives it (evidence: `tests/fixtures/mengantar-cod-identities.json` → `settlement`). Until this change the issuance appended it as `GERAICUAN_COD_SERVICE_FEE_REVENUE` (`REVENUE`). **Effective point:** every issuance ledgered by the release carrying migration 0049 appends it as `MENGANTAR_COD_FEE_COST` (`EXPENSE`), same amount, same source event; the point is per issuance, not a timestamp — an issuance whose `PROVIDER_ORDER_ISSUED` entries already include the revenue type was posted before the change. No historical entry is updated or deleted: `ledger_entries_immutable` (0015) still refuses UPDATE and DELETE, `geraicuan_app` still holds SELECT and INSERT only, and the revenue type stays valid in `ledger_entries_type_valid`, `_type_class_valid`, `_source_event_valid` and `reconciliation_runs_entry_type_valid` so history, its `ADJUSTMENT` reversals and an instance on the previous release during a deploy (which appends it inside the AWB-recording transaction) keep working. Reconciliation classifies each COD issuance's stored fee by that same per-issuance rule, so both types reconcile exactly in a period that straddles the change. `COD_SERVICE_FEE_VAT_PAYABLE` is not reclassified by this change.

**One COD fee, VAT inside it (T-193, D-13, 2026-09-17; no migration).** Mengantar keeps `COD × 0.0333` and the 11% VAT is inside that 3.33%, so VAT was never GeraiCUAN's liability. **Effective point, per issuance:** every issuance ledgered by the release carrying T-193 appends `MENGANTAR_COD_FEE_COST` at `round_half_up(provider_cod_amount_idr × 333 / 10000)` (`mengantarCodFeeIdr`, whatever formula version the totals row has) and **no** `COD_SERVICE_FEE_VAT_PAYABLE`. No historical entry is updated or deleted, and no CHECK moves: the VAT type stays valid in all four constraints so history, its reversals and an instance on the previous release during a deploy keep working. Readers present historical VAT rows (and `ADJUSTMENT`s reversing them) as "PPN dalam biaya COD (dipotong Mengantar)", part of the fee, outside any payable total (`summarizeLedger(...).legacyCodFeeVatIdr`, platform `legacyCodFeeVatIdr`, Keuangan's class column). **Reconciliation** classifies each COD issuance by the entries it already carries: a `GERAICUAN_COD_SERVICE_FEE_REVENUE` entry → the stored `service_fee_idr` as revenue and `vat_amount_idr` as VAT (before T-178); a VAT entry but no revenue entry → the stored service fee as `MENGANTAR_COD_FEE_COST` and the stored VAT (T-178 until T-193); neither → Mengantar's fee as `MENGANTAR_COD_FEE_COST` and no VAT (T-193 on), so a missing fee entry still surfaces on the current type. Known ceiling: a T-178-era issuance that lost only its VAT entry is read as T-193-era and can surface as at most a small fee variance rather than a missing VAT row. `shipment_cod_totals.service_fee_idr`/`vat_amount_idr` keep their per-version CHECK arithmetic and are no longer a displayed fee. **In flight:** a version 1 totals row is immutable and one per shipment (INSERT/SELECT grants, `shipment_cod_totals_shipment_tenant_key`), so it cannot be recomputed as version 2; `ensureCodTotalsForConfirmation` refuses it (`CodTotalsFormulaRetiredError`) unless its order was already attempted at Mengantar, in which case a retry reads the recorded result back and submits nothing.

**COD principal for COD Ongkir (T-186, 2026-09-17).** `COD_PRINCIPAL_COLLECTABLE` is the goods money a courier collects on the seller's behalf. A COD Ongkir issuance (formula version 3) collects a shipping charge only — the goods were paid outside GeraiCUAN — so it appends `COD_PRINCIPAL_COLLECTABLE` at **0**, not the declared goods value and not the charge. The entry is still appended so every COD issuance carries the same entry set and "no goods principal" is a recorded fact. The charge is not principal: Mengantar keeps the shipping (`MENGANTAR_SHIPPING_COST`) and its fee (`MENGANTAR_COD_FEE_COST` + `COD_SERVICE_FEE_VAT_PAYABLE`, together 3.33% of the charge; from T-193 `MENGANTAR_COD_FEE_COST` alone, VAT inside) and remits the seller's difference, which RPT-SHP-COD-DISBURSEMENT-EST-IDR estimates and settlement records. No new entry type was added and no CHECK moved. Reconciliation's source principal counts `goods_value_idr` only for rows whose `cod_formula_version <> 3`, the same rule. Append-only is unchanged. As DATA-11 records, the database checks moved in the same change as the application rule. `scripts/verify-migration-upgrade.mjs` writes a revenue-typed entry and whole-rupiah settlement evidence before 0049 and proves them unchanged after it.

## DATA-5 — Source-of-truth transitions
- Owner: Engineering owner

| Trigger | Required outcome |
|---|---|
| Confirmed COD shipment | Persist selected estimate and calculated COD components; no ledger revenue is recognized yet. |
| Provider AWB issued | Append provider shipping/insurance cost where returned; append the COD fee as `MENGANTAR_COD_FEE_COST` (expense) at `round_half_up(COD × 333 / 10000)`, VAT inside it, only for COD (T-193; before it the stored service fee plus a `COD_SERVICE_FEE_VAT_PAYABLE` row, and before T-178 `GERAICUAN_COD_SERVICE_FEE_REVENUE`). |
| Non-COD unpaid | Mark awaiting upstream payment; no AWB/print and no paid-cost entry until provider confirms recovery. |
| Pay-unpaid success | Persist AWB, append non-COD upstream-payment cost, then allow print. |
| Reconciliation variance | Preserve source totals and append an adjustment/reconciliation entry; never mutate prior ledger entries. |

## DATA-6 — Managed credential invariant
- Owner: Engineering owner

`mengantar_connections` stores no ciphertext or secret fragment. Each active private connection resolves exactly one purpose-bound encrypted payload for the same tenant and outlet. The envelope stores ciphertext, nonce, authentication tag, key version, and timestamps; authenticated additional data binds purpose, tenant, outlet, and canonical reference so rows cannot be replayed across scope. Replacement is transactional and never exposes the prior value. Removing a private connection is allowed only after the platform default is complete and records a redacted audit outcome.

## DATA-7 — Provider location invariant
- Owner: Engineering owner

Persist provider IDs together with their last accepted human-readable label at operational snapshot boundaries. Outlet pickup configuration stores `default_pickup_address_id` with `default_pickup_address_label` and `default_origin_area_id` with `default_origin_area_label`; both labels are null for legacy rows or non-null as one pair. New writes accept only a pickup from the current account-scoped provider response and derive the area ID and both labels from that same response. A cached area row is never sufficient evidence that an ID remains supported; estimate/order behavior remains authoritative. No provider location cache exists. Since D-32 (T-245) a local Kemendagri reference, `wilayah_areas` (DATA-22), suggests areas while typing; it carries no provider ID, no tenant table references it, and only a provider option from a live search is ever stored or verified.

## ERD
Relationships are the foreign keys in `drizzle/0000`–`drizzle/0073` (cross-checked against `src/db/schema.ts`; no FK added by a migration is missing from the schema file and none was dropped later). Most tenant-owned FKs are composite — `(parent_id, tenant_id) → parent(id, tenant_id)` — so a child cannot point at another tenant's row (DATA-1); the diagrams draw them as one edge. Tables without a foreign key appear as stand-alone entities. Four diagrams by domain keep each one readable; an entity repeated across diagrams is the same table.

### ERD 1 — Identity, auth, platform and reference
```mermaid
erDiagram
    USERS ||--o{ SESSIONS : signs_in
    USERS ||--o| TWO_FACTORS : verifies_with
    USERS ||--o{ ACCOUNTS : authenticates
    USERS ||--o| PLATFORM_ROLES : holds
    USERS ||--o{ MEMBERSHIPS : joins
    TENANTS ||--o{ MEMBERSHIPS : has
    USERS |o--o{ AUDIT_EVENTS : acts
    TENANTS |o--o{ AUDIT_EVENTS : scopes
    USERS ||--o{ PLATFORM_ANNOUNCEMENTS : writes
    PLATFORM_ANNOUNCEMENTS ||--o{ PLATFORM_ANNOUNCEMENT_READS : read_by
    USERS ||--o{ PLATFORM_ANNOUNCEMENT_READS : reads
    USERS {
      text id PK
      text email
    }
    TENANTS {
      uuid id PK
      text status
    }
    MEMBERSHIPS {
      uuid tenant_id FK
      text user_id FK
      text role
    }
    VERIFICATIONS {
      text id PK
      text identifier
    }
    RATE_LIMITS {
      text id PK
      text key
    }
    PUBLIC_AUTH_RATE_LIMITS {
      text key PK
      integer count
    }
    WILAYAH_AREAS {
      text code PK
      smallint level
      text district_name
    }
```

### ERD 2 — Tenancy, configuration and contacts
```mermaid
erDiagram
    TENANTS ||--o{ OUTLETS : owns
    OUTLETS ||--o{ OUTLET_PICKUP_POINTS : lists
    TENANTS ||--o{ MENGANTAR_CONNECTIONS : scopes
    OUTLETS ||--o| MENGANTAR_CONNECTIONS : configures
    TENANTS ||--o{ MANAGED_SECRET_PAYLOADS : scopes
    OUTLETS ||--o{ MANAGED_SECRET_PAYLOADS : encrypts_for
    TENANTS ||--o{ MENGANTAR_CREDENTIAL_RATE_LIMITS : scopes
    OUTLETS ||--o{ MENGANTAR_CREDENTIAL_RATE_LIMITS : throttles
    USERS ||--o{ MENGANTAR_CREDENTIAL_RATE_LIMITS : actor
    TENANTS ||--o{ SHIPMENT_RATE_LIMITS : scopes
    USERS ||--o{ SHIPMENT_RATE_LIMITS : actor
    TENANTS ||--o{ TENANT_LABEL_SETTINGS : per_label_size
    TENANTS ||--o| TENANT_BRAND_SETTINGS : brands
    TENANTS ||--o{ TENANT_LOGO_VERSIONS : saves
    TENANTS ||--o| TENANT_SHIPMENT_COUNTERS : numbers_shipments
    TENANTS ||--o| TENANT_CONTACT_COUNTERS : numbers_contacts
    TENANTS ||--o{ CONTACTS : owns
    CONTACTS ||--o{ CONTACT_ADDRESSES : has
    TENANTS {
      uuid id PK
      text status
    }
    OUTLETS {
      uuid id PK
      uuid tenant_id FK
      text default_pickup_address_id
    }
    MENGANTAR_CONNECTIONS {
      uuid id PK
      uuid outlet_id FK
      text secret_reference
    }
    TENANT_SHIPMENT_COUNTERS {
      uuid tenant_id PK
      integer last_number
      text shipment_prefix
    }
```

### ERD 3 — Shipment, estimate and provider order
```mermaid
erDiagram
    OUTLETS ||--o{ SHIPMENTS : originates
    USERS |o--o{ SHIPMENTS : creates
    SHIPMENTS ||--o| SHIPMENT_DRAFTS : drafts
    SHIPMENTS ||--o{ SHIPMENT_PARTIES : snapshots
    SHIPMENTS ||--o{ SHIPMENT_ESTIMATE_SNAPSHOTS : estimates
    OUTLETS ||--o{ SHIPMENT_ESTIMATE_SNAPSHOTS : origin
    SHIPMENT_ESTIMATE_SNAPSHOTS ||--o{ SHIPMENT_ESTIMATE_SERVICES : returns
    SHIPMENTS ||--o| SHIPMENT_COD_TOTALS : totals
    SHIPMENT_ESTIMATE_SNAPSHOTS ||--o{ SHIPMENT_COD_TOTALS : priced_by
    SHIPMENT_ESTIMATE_SERVICES ||--o{ SHIPMENT_COD_TOTALS : selected
    OUTLETS ||--o{ PROVIDER_BATCHES : submits
    PROVIDER_BATCHES ||--o{ PROVIDER_ORDER_SNAPSHOTS : contains
    SHIPMENTS ||--o{ PROVIDER_ORDER_SNAPSHOTS : ordered_as
    SHIPMENT_ESTIMATE_SNAPSHOTS ||--o{ PROVIDER_ORDER_SNAPSHOTS : quoted_by
    SHIPMENT_ESTIMATE_SERVICES ||--o{ PROVIDER_ORDER_SNAPSHOTS : service
    PROVIDER_ORDER_SNAPSHOTS ||--o| PROVIDER_UNPAID_RECOVERIES : recovers
    MEMBERSHIPS ||--o{ PROVIDER_UNPAID_RECOVERIES : requests
    SHIPMENTS ||--o{ PROVIDER_ORDER_HISTORY_EVENTS : tracks
    SHIPMENTS ||--o{ SHIPMENT_RTS_EVENTS : returns
    SHIPMENTS {
      uuid id PK
      uuid tenant_id FK
      uuid outlet_id FK
      text created_by_user_id FK
      integer tenant_number
      text status
    }
    PROVIDER_ORDER_SNAPSHOTS {
      uuid id PK
      uuid batch_id FK
      uuid shipment_id FK
      text cnote_no
      boolean is_paid
    }
    SHIPMENT_COD_TOTALS {
      uuid id PK
      uuid shipment_id FK
      integer cod_formula_version
    }
```

### ERD 4 — Money, ledger, settlement, print, handover and invoice
```mermaid
erDiagram
    SHIPMENTS |o--o{ LEDGER_ENTRIES : sources
    PROVIDER_BATCHES |o--o{ LEDGER_ENTRIES : sources
    PROVIDER_ORDER_SNAPSHOTS |o--o{ LEDGER_ENTRIES : sources
    RECONCILIATION_RUNS |o--o{ LEDGER_ENTRIES : adjusts
    MEMBERSHIPS |o--o{ LEDGER_ENTRIES : actor
    LEDGER_ENTRIES |o--o{ LEDGER_ENTRIES : reverses
    OUTLETS ||--o{ RECONCILIATION_RUNS : closes
    MEMBERSHIPS ||--o{ RECONCILIATION_RUNS : actor
    OUTLETS ||--o{ PROVIDER_SETTLEMENT_PULLS : pulls
    PROVIDER_SETTLEMENT_PULLS ||--o{ PROVIDER_SETTLEMENT_ITEMS : matches
    SHIPMENTS ||--o{ PROVIDER_SETTLEMENT_ITEMS : settled_by
    PROVIDER_SETTLEMENT_PULLS |o--o{ PROVIDER_ORDER_STATUS_OBSERVATIONS : observes
    SHIPMENTS ||--o{ PROVIDER_ORDER_STATUS_OBSERVATIONS : observed
    SHIPMENTS ||--o{ PRINT_EVENTS : printed
    PROVIDER_ORDER_SNAPSHOTS ||--o{ PRINT_EVENTS : prints_awb
    SHIPMENTS ||--o{ SHIPMENT_HANDOVER_EVENTS : handed_over
    SHIPMENTS ||--o| SHIPMENT_INVOICES : invoiced
    PROVIDER_ORDER_SNAPSHOTS ||--o{ SHIPMENT_INVOICES : charges
    TENANT_LOGO_VERSIONS |o--o{ SHIPMENT_INVOICES : prints_logo
    LEDGER_ENTRIES {
      uuid id PK
      uuid tenant_id FK
      uuid shipment_id FK
      uuid reverses_entry_id FK
      text entry_type
      bigint amount_idr
    }
    SHIPMENT_HANDOVER_EVENTS {
      uuid id PK
      uuid shipment_id FK
      integer sequence
      text kind
      text method
    }
    SHIPMENT_INVOICES {
      uuid id PK
      uuid shipment_id FK
      text invoice_number
      text logo_sha256 FK
    }
```

## Migration rule
Add `tenant_id` and tenant indexes before any tenant data. Expand-contract migrations only; backfill and constraint enforcement are separate deploy steps. Retention periods are pending privacy review.

## DATA-8 — Market Expansion (Phase 2 Roadmap)
- Owner: Engineering owner

To support market standards (Return to Sender, and originally Net Margin — withdrawn 2026-09-17 by T-177), these schema expansions were planned:
1. **RTS Tracking:** `shipments` table will receive an expanded status enum covering `RTS_QUEUED`, `RTS_IN_TRANSIT`, and `RTS_RECEIVED`. A new `shipment_rts_events` table will record the return timeline.
2. **COGS Tracking — withdrawn 2026-09-17 (T-177).** `shipments.cogs_amount_idr` and `shipment_drafts.cogs_amount_idr` were added for a net-margin KPI. The owner withdrew margin reporting ("Laporan saja"): no application path writes or reads either column any more, existing values are left untouched, and dropping the columns is a separate migration for the migration owner.


### PR-41 — Persisted operational shipment references (superseded by PR-44, migration 0040)

Shipments retain their UUID primary key, composite tenant/outlet foreign keys, URLs and idempotency semantics. New human `public_reference` is immutable and unique, with `created_by_user_id`, numeric `reference_user_number`, full WIB calendar `reference_date`, and `daily_sequence`. Users receive a stable numeric `public_number` starting10000; display widths are minimums, never truncation limits. The reference is e.g.95758-260914-001; counter keys use the full date and concurrent allocation uses one atomic counter-row upsert. YYMMDD is the accepted display; the unique constraint fails closed on century reuse and must be replaced by YYYYMMDD before that horizon.

A private counter table and a narrowly scoped, pinned-search-path PostgreSQL trigger allocate the reference. Runtime actors are checked against server-derived app.user_id and tenant membership; clients cannot set or change reference components or use the counter table. Existing shipments have no reliable creator record: backfill deterministic00000 legacy references ordered by created_at/id within each WIB date, without attributing them to an administrator. Existing UUIDs, snapshots, ledger records, parties, orders and AWBs remain unchanged. Local migration is explicitly authorized; test fresh/upgrade/concurrency and preserve local account data before applying it. No reset/reseed.

## DATA-9 — Provider settlement evidence (PR-43, T-146)

Append-only, tenant-scoped, Tenant Admin RLS (SELECT/INSERT only). No receiver, recipient, phone, address, goods, pickup, name or email column exists on any of these tables; a repository test asserts it.

| Table | Purpose | Key constraints |
|---|---|---|
| `provider_settlement_pulls` | One row per pull: outlet, actor, credential source, provider account key, period, account-wide invoice/order counts, matched counts | `(outlet_id, tenant_id)` → outlets; account key `^[0-9a-f]{64}$`; `period_end > period_start`; `invoice_count`, `order_count` and `unmatched_awb_count` must be NULL unless `credential_source = 'private'` |
| `provider_settlement_items` | Matched per-AWB SETTLEMENT/CHARGE/REFUND evidence: invoice id/number/status/created time, `amount_idr numeric(18,4)`, `cod_amount_idr bigint`, `cod_fee_idr numeric(18,4)`, `shipping_amount_idr numeric(18,4)` (the invoice's `estimatedSpecialPrice`: discounted shipping plus the unrounded COD fee). Migration 0049 (T-178) widened them from bigint / numeric(16,2); every stored value is kept (verified by the upgrade script) and the observation key compares by value | `(shipment_id, outlet_id, tenant_id)` → shipments; `(pull_id, tenant_id)` → pulls; unique `(tenant_id, provider_invoice_id, item_type, cnote_no, invoice_status, amount_idr)`: an identical re-pull adds nothing, while a changed status or corrected amount is a new observation and the review reads the latest per invoice line |
| `provider_order_status_observations` | Latest provider status seen per matched shipment per pull, **and what that report did to the shipment** (T-169) | unique `(pull_id, shipment_id)`; same composite shipment and pull foreign keys; `provider_order_status_observations_transition_valid` |

Migration `0039_provider_settlement.sql` is additive; it also admits `settlement-pull` in `shipment_rate_limits_operation_valid`.

### Delivery-transition decision on the observation (0047 — T-169, 2026-09-16)

`provider_order_status_observations` gains `from_status`, `mapped_status` and `transition_outcome`, all nullable and all written with the observation itself — the table keeps SELECT + INSERT and is never updated, so a decision is stored beside the evidence that caused it rather than in a second table. All three are NULL on rows recorded before 0047, when a pull stored provider evidence and transitioned nothing.

`transition_outcome` is one of `APPLIED`, `UNCHANGED`, `REFUSED`, `NO_LIFECYCLE_STATE` or `UNRECOGNISED`. The check constraint refuses a row that claims a transition it cannot evidence: every non-NULL decision names the state the shipment stood in, and only the two "nothing to write" outcomes may carry no `mapped_status`. `UNRECOGNISED` is how a provider status outside the observed vocabulary is kept — recorded and surfaced, never mapped to the nearest lifecycle state.

**No transition rule is encoded in row-level security, deliberately.** The mapping changes whenever a new provider status is captured, and DATA-11 records what happened the last time a policy hardcoded a value the application computes: T-157 moved the estimate origin to the draft's own pickup point and three INSERT policies did not move with it, so the database refused every COD estimate from a non-default point. The policies here check tenancy; the application owns which state may follow which, bound by `tests/provider-delivery-transitions.integration.test.ts`.

## DATA-10 — Per-tenant shipment numbers (PR-44, T-147)

- `shipments.tenant_number integer NOT NULL`, unique `(tenant_id, tenant_number)`, `>= 10000`, immutable. `shipments.public_reference` is the displayed `PREFIX-number`; CHECK `^[A-Z0-9]{2,5}-[0-9]{5,}$` with its number part equal to `tenant_number`, which together with the number key makes it unique per tenant. UUID primary/foreign keys are unchanged.
- `tenant_shipment_counters (tenant_id PK → tenants ON DELETE CASCADE, last_number NULL|>=10000, shipment_prefix DEFAULT 'GC' CHECK ^[A-Z0-9]{2,5}$, shipment_prefix_locked_at)` holds all numbering state. It is deliberately not on `tenants` (FORCE RLS) and grants the runtime role nothing; only SECURITY DEFINER functions touch it. `last_number` is NULL when a prefix was saved before any shipment.
- **2–3 rule for new prefixes (D-21, T-225, migration 0060).** The column CHECK stays `^[A-Z0-9]{2,5}$`, so every stored prefix remains valid; trigger `tenant_shipment_counters_new_prefix_guard` (`guard_new_shipment_prefix()`, BEFORE INSERT OR UPDATE OF `shipment_prefix`) refuses with `22023` any inserted or changed prefix outside `^[A-Z0-9]{2,3}$`, for every role including the migration owner. A trigger was chosen over `CHECK … NOT VALID` because PostgreSQL checks a NOT VALID CHECK on every later update of a row, and the allocation trigger updates `last_number` on every shipment — a tenant with a legacy 4–5 character prefix would lose shipment creation. Invoice numbers (`INV-` || `public_reference`, DATA-14) and `public_reference` keep their 2–5 CHECKs and need no change. Application: `SHIPMENT_PREFIX_PATTERN` (`src/lib/shipment-number.ts`) is 2–3 for input and suggestions (at most three initials); the route and reference parsers still accept 2–5.
- Lock semantics: saving a prefix locks it; a tenant's very first allocation locks an unsaved `GC` (audited as implicit, with the tenant as `target_id`; until migration 0069 `tenant_id` was left NULL so the automatic row would not pin tenant retention — since 0069 it stores the tenant, DATA-23). Later allocations never lock, so migrated tenants and tenants unlocked by a Super Admin keep their one choice until they save.
- Migration `0040_tenant_shipment_numbers.sql` drops PR-41's global `public_reference` uniqueness before backfilling, numbers existing shipments per tenant by `(created_at, id)` from 10000, writes `GC-n`, seeds counters with unlocked prefixes, drops `reference_user_number`, `reference_date`, `daily_sequence`, their constraints and `shipment_reference_counters`, and adds `SHIPMENT_PREFIX_LOCKED` / `SHIPMENT_PREFIX_UNLOCKED` audit actions with a RESTRICTIVE insert guard. `users.public_number` is retained but no longer used for references.

### Draft destination verification and provider field parity (0041, 0042 — 2026-09-16)

`shipment_drafts` gains `shipping_instruction text NULL` (≤500), `dropshipper_name text NULL` (≤120), `dropshipper_phone text NULL` (canonical `0` + Indonesian NSN), `is_hazardous boolean NOT NULL DEFAULT false`, `recipient_address_landmark text NULL` (≤160) and `destination_area_verified_at timestamptz NULL`. Invariants: the dropshipper pair is all-or-nothing under a NULL-safe CHECK, and `destination_area_verified_at IS NULL` means **explicitly unverified** — it blocks provider submission rather than being treated as "probably fine". Rows created before 0041 are therefore unverified by definition; 0042 grants the column-scoped UPDATE (`destination_area_verified_at`, `updated_at`) so the re-verification action can stamp them after the provider re-confirms the stored area id and label. No backfill marks old rows verified.

`shipment_estimate_services` gains `normal_price_idr`, `special_price_idr`, `cod_fee_idr` and `discount_idr` (all `integer NULL`; NULL means the provider omitted the key, never zero), with a non-negative constraint and `special_price_idr <= normal_price_idr`.

Party phones are stored in one canonical Indonesian form (`0` + NSN), so `+62…` and `08…` converge to the same value. Rows written before this rule keep their original spelling; duplicate detection and contact search compare exact strings, so a pre-existing row in the old form will not match the canonical one until it is rewritten.

### Dropshipper fields removed (0044 — 2026-09-16)

`shipment_drafts.dropshipper_name`, `dropshipper_phone` and `shipment_drafts_dropshipper_pair_valid` are **dropped** by owner decision: the product no longer offers "kirim sebagai dropshipper", so the columns leave with the feature rather than lingering as unused state. This is a deliberate destructive migration, approved as such; the fields shipped on 2026-09-16 and no provider order had ever been created through a real transport, so no operational data depended on them. The provider payload keys `is_dropshipper`, `dropshipper_name` and `dropshipper_phone` are removed in the same change.


### Payment method on the draft (0050 — 2026-09-17, T-186)

`shipment_drafts.cod_shipping_only boolean NOT NULL DEFAULT false`, CHECK `shipment_drafts_cod_shipping_only_requires_cod` (`NOT cod_shipping_only OR is_cod`). The method is `NON_COD` when `is_cod` is false, `COD_ONGKIR` when `cod_shipping_only`, else `COD` (`paymentMethodOf`, `src/lib/payment-method.ts`). The default keeps every earlier draft and any previous-release writer exactly what `is_cod` says; no row was updated. `is_cod` stays true for COD Ongkir, so the estimate and order-snapshot policies (which compare `is_cod`) did not need to move; the COD totals INSERT policy did (DATA-3 version 3). The app role holds no UPDATE on the column. `scripts/verify-migration-upgrade.mjs` writes a version 1 and a version 2 COD total and a COD and a non-COD draft before 0050 and proves them unchanged after it.

## DATA-11 — Outlet pickup points (PR-46/PR-47, T-157, migration 0045)

| Table | Contents | Constraints |
|---|---|---|
| `outlet_pickup_points` | One row per provider `pickup_address_id` an outlet may ship from, with `origin_area_id` and both readable labels, and `is_default` | `(outlet_id, tenant_id)` → outlets; `UNIQUE (tenant_id, outlet_id, pickup_address_id)`; partial `UNIQUE (tenant_id, outlet_id) WHERE is_default` so at most one default exists per outlet; opaque ids 1–160 chars, labels 1–320; FORCE RLS with select/insert/update/delete policies; `geraicuan_app` holds SELECT/INSERT/DELETE and UPDATE only on `pickup_address_label`, `origin_area_id`, `origin_area_label`, `is_default`, `updated_at` |

- **Conversion.** Every outlet that already had a complete pickup pair becomes exactly one default pickup point; an incomplete pair converts to zero rows and the outlet stays "needs attention", which is what it already was.
- **Mirror invariant.** `outlets.default_pickup_address_id`, `default_pickup_address_label`, `default_origin_area_id` and `default_origin_area_label` always equal the outlet's `is_default` row, or are all NULL when it has none. Readiness, the estimate origin and the order payload keep reading that one pair.
- **Row-level security follows the same rule (migration 0046).** The INSERT policies on `shipment_estimate_snapshots`, `shipment_cod_totals` and `provider_order_snapshots` check that the snapshot's origin matches `coalesce(shipment_drafts.origin_area_id, outlets.default_origin_area_id)`. They previously required the *outlet* default alone, which — after the application moved to the draft's own point — made the database refuse every COD estimate and order from a non-default pickup point. An application change to which origin a shipment uses is incomplete until these three policies move with it.
- **A pickup point in use cannot be removed.** `removeOutletPickupPoint` refuses while a DRAFT or ESTIMATED shipment still holds that address, because the order payload reads the draft's pickup address at submission: deleting the row would send the provider an address it no longer has, and falling back to the outlet default would ship from a point nobody chose.
- **Per-shipment choice.** `shipment_drafts.pickup_address_id` and `origin_area_id` snapshot the point a shipment leaves from, the same way the destination area is snapshotted. NULL is a pre-0045 draft and falls back to the outlet mirror through `coalesce(...)` in the estimate and order-batch reads. The application resolves the pair against the outlet's own pickup points before writing, so a forged id fails the submission rather than reaching the provider.

## DATA-12 — Self-service sign-up and the approval gate (PR-59–PR-61, D-8, D-9, D-10, T-181–T-183, migration 0051)

| Change | Contents | Constraints and grants |
|---|---|---|
| `tenants.mengantar_credential_policy` | `PLATFORM_DEFAULT_ALLOWED` (default) or `PRIVATE_ONLY` | CHECK `tenants_mengantar_credential_policy_valid`; immutable (trigger `tenants_registration_transition_guard`); the runtime role holds no UPDATE on it |
| `tenants.contact_whatsapp` | The store's WhatsApp from sign-up, `0` + Indonesian NSN (`normalizePartyPhone`); editable by the gerai's Tenant Admin since 0058 (DATA-16) | NULL or `^0[2-9][0-9]{7,11}$`; no runtime UPDATE grant — written only by `set_tenant_contact_whatsapp` |
| `public_auth_rate_limits` | `key` (`scope:hmac-hex`), `count`, `window_started_at` | CHECKs on key shape and count > 0; runtime SELECT/INSERT/UPDATE/DELETE; no RLS (anonymous boundary, no identifier stored) |
| `audit_events_action_valid` | adds `TENANT_SELF_REGISTERED`, `TENANT_REGISTRATION_APPROVED`, `TENANT_REGISTRATION_REJECTED` | RESTRICTIVE `audit_events_tenant_registration_guard`: each only from its owning function |
| `users` | `GRANT UPDATE (email_verified, updated_at)` for Better Auth's verification | nothing else on `users` writable |
| Functions | `register_tenant_self_service`, `register_tenant_self_service_with_prefix` (0060), `review_tenant_registration` (SECURITY DEFINER), `guard_tenant_registration_transition` (trigger) | EXECUTE revoked from PUBLIC; the two definer functions granted to `geraicuan_app` |
| View | `platform_registration_queue` (security_barrier, platform-admin setting): PROVISIONING tenants with the first Tenant Admin's name, email and verification | SELECT to `geraicuan_app` |

- **Existing rows are not updated.** Every existing tenant gets `PLATFORM_DEFAULT_ALLOWED` and NULL WhatsApp through the column defaults; no user, membership, platform role or audit row changes. In particular 0051 does **not** mark existing users verified: an account created before 0051 with `email_verified = false` must verify through the tenant login's resend (or be set by the operator) before it can sign in. The local seed already writes `true`.
- **One registration** writes, in one transaction: `users` (unverified), `accounts` (`credential`, `local:credential`), `tenants` (`PROVISIONING`, `PRIVATE_ONLY`), `memberships` (`TENANT_ADMIN`, `ACTIVE`), one `outlets` row named after the store (the application has no outlet-creation path), and the audit row.
- **Chosen prefix (T-225, migration 0060).** The application calls `register_tenant_self_service_with_prefix(email, owner, hash, store, whatsapp, prefix)` (SECURITY DEFINER, `search_path` pinned, EXECUTE revoked from PUBLIC and granted to `geraicuan_app`). It refuses a prefix outside `^[A-Z0-9]{2,3}$` (`22023`), calls the 0051/0052 function unchanged — so the policies that name `register_tenant_self_service(text,text,text,text,text)` keep their meaning — and, only when a tenant was created, inserts its `tenant_shipment_counters` row with that prefix, `last_number` NULL and **unlocked**: the owner can still change it in Pengaturan, and the first shipment locks it (DATA-10). The 5-argument function keeps its grant (local seed); a tenant created through it starts at `GC`. The server validation (`validateRegistration`) upper-cases the field and, when a stale page posts none, uses the gerai name's initials.
- **Review** moves `PROVISIONING` → `ACTIVE` (approval, owner verified) or → `ARCHIVED` (rejection, reason in audit `metadata.reason`). Nothing else may move a tenant out of `PROVISIONING`.
- **Policies moved for setup** and the shipping policies left ACTIVE-only are listed in `06-TENANT-ISOLATION.md` TEN-5. As DATA-11 records, the application rule and the database rule move together: the approval gate in `withTenantContext` is backed by the unchanged ACTIVE-only shipping policies, and the D-9 resolver refusal by RESTRICTIVE `*_credential_policy` INSERT policies on `shipment_estimate_snapshots`, `provider_batches` and `provider_settlement_pulls`.
- **Upgrade proof.** `scripts/verify-migration-upgrade.mjs` writes ACTIVE, SUSPENDED and legacy PROVISIONING tenants, verified/unverified/suspended users, memberships, a platform role and four audit rows before 0051, refuses to compare fewer than the expected rows, proves them unchanged after, checks the constraints validated, the exact set of `PROVISIONING` policies, ≥30 ACTIVE-only shipping policies and the allocation function, and exercises the runtime role (no self-transition, no forged audit action, verification column writable, name not, registration shape).

## DATA-14 — Shipment invoices (PR-76–PR-80, T-221, planned migration 0055)
- Owner: Engineering owner
- Status: Accepted design 2026-09-26; not built until T-221.

`shipment_invoices` is a tenant-scoped, **insert-only** nota for one issued shipment. It is a charge document, not payment evidence (spec 02 §v3.1; GeraiOS spec 11 BILL-1/3/4).

| Column | Rule |
|---|---|
| `id` uuid PK; `tenant_id`, `shipment_id` NOT NULL | FK `(shipment_id, tenant_id)` → `shipments(id, tenant_id)` ON DELETE RESTRICT; **UNIQUE (`shipment_id`)** — at most one invoice per shipment. |
| `provider_order_snapshot_id` NOT NULL | FK `(id, tenant_id)` → `provider_order_snapshots`; the snapshot must carry `cnote_no` (checked in the issuing statement, which reads it in the same transaction). |
| `invoice_number` text NOT NULL | `'INV-' || shipments.public_reference`; UNIQUE (`tenant_id`, `invoice_number`); CHECK `^INV-[A-Z0-9]{2,5}-[0-9]{5,}$`. Derived, so no counter or gap handling is needed. |
| `issued_at` timestamptz NOT NULL default now(); `issued_by_user_id` NOT NULL | Issuer identity for audit. |
| `template_version` smallint NOT NULL default 1 | Rendering version; a reprint uses the stored version. T-271 (D-40): issuance writes 2 (`INVOICE_TEMPLATE_VERSION`); rows issued earlier keep 1 and render byte-identical to before. Version 2 needs no new column: a COD nota's customer split is derived at render from the stored immutable `courier_collection_idr` and `declared_value_idr` (Ongkir = collected − Nilai barang, CUSTOMER-ONGKIR-IDR; COD Ongkir: the whole charge); Non-COD renders the version 1 lines. No migration, no backfill. |
| `document` jsonb NOT NULL | The rendered snapshot: `gerai {name, whatsapp, address}`, `resi`, `courierService`, `sender {name, phone, city}` (the label sender after masking, PR-71), `recipient {name, city}` (no full address or phone — privacy minimum), `items [{name, quantity}]` (≤ 20), `weightGrams`, `deliveryEstimate`. CHECK `jsonb_typeof(document) = 'object'`. |
| `shipping_charge_idr` integer NOT NULL ≥ 0 | The confirmed provider `price` (`provider_order_snapshots.shipping_amount_idr`); for `COD_SHIPPING_ONLY` the charge the courier collects (`provider_cod_amount_idr`), which is what the customer is charged for shipping (audit 2026-09-26: the list price contradicted the collection line). Never the gerai's cost (`provider_charged_shipping_idr`). |
| `insurance_idr` integer NOT NULL ≥ 0 | Returned insurance, 0 when none and for `COD_SHIPPING_ONLY`. |
| `total_idr` integer NOT NULL | CHECK `total_idr = shipping_charge_idr + insurance_idr`. |
| `collection_mode` text NOT NULL | `NON_COD` \| `COD_SHIPPING_ONLY` \| `COD`, copied from the draft (`is_cod`, `cod_shipping_only`). |
| `courier_collection_idr` integer NULL | `provider_cod_amount_idr` for COD modes; NULL for `NON_COD` (CHECK pairs mode and nullability). Shown as "Ditagih kurir ke penerima", never added to `total_idr`. |
| `declared_value_idr` integer NOT NULL ≥ 0 | Information line only. |
| `logo_sha256` text NULL (T-247, migration 0068) | The gerai logo version at issuance: FK (`tenant_id`, `logo_sha256`) → `tenant_logo_versions` RESTRICT. Written by the issuing statement from `tenant_brand_settings.logo_sha256` joined to its kept version; NULL when the gerai had no logo then, and on every invoice issued before 0068 (those render no logo — the logo they printed was never recorded). |

**Grants and RLS.** `GRANT SELECT, INSERT` to `geraicuan_app` only (no UPDATE/DELETE: immutability, BILL-4). RLS policy on `tenant_id = current tenant` for both commands, same helper as `shipment_parties`.

**Issuance.** One statement: `INSERT … SELECT … FROM shipments JOIN provider_order_snapshots … WHERE cnote_no IS NOT NULL AND shipments.status <> 'CANCELLED' ON CONFLICT (shipment_id) DO NOTHING`, then `SELECT` the row. Concurrent requests therefore return the same invoice; a shipment without a resi yields no row and the action returns `NOT_ISSUED`; a shipment Mengantar cancelled (T-238) yields no row and returns `CANCELLED` — decided inside that statement, not by a check before it (T-247, review L2). No provider call is made.

**Reprint.** Renders `document` and the money columns only; nothing is re-read from `tenants`, `contacts` or `shipment_drafts`. Reprints are not persisted in v3.1 (`// lazy:` ceiling — add `invoice_print_events` if the owner needs reprint audit).

## DATA-13 — Mengantar provider field register (PR-84, T-223, T-237)
- Owner: Engineering owner
- Updated: 2026-09-26 (T-237), from the official public docs `api-public.mengantar.com/docs` (read 2026-09-26 through a web fetcher, no API call) plus the earlier read-only comparison with `~/Projects/adsbookcms` / `~/Projects/zvarashop` and this repository's sanitized captures. 2026-10-07 (T-282): the Pay unpaid answer and the two Reconciliation rows, from the docs text fetched 2026-10-06 and the contract shape fixture. 2026-10-07 (T-281): the two Delete order rows, from the same docs text (Delete Orders). **No live call was made for this register.**

Evidence: **L** observed live and captured in `tests/fixtures`; **D** documented by Mengantar — the docs' JSON examples (Create Order request/response, Add Time, Pay Unpaid) were quoted as code blocks and their keys are used verbatim; **D-s** documented but read through the fetcher's summary of a table or prose (key names reliable, wording may be paraphrased); **A** assumed (stub or hand-written fixture). An **A** field is never sent to Mengantar in production (PR-84). Nothing below is sent live until TD-14 opens; the one owner-approved live proof is `scripts/probe-mengantar-order-documented.mjs` (D-26, not run).

| Area | Field | GeraiCUAN today | Evidence | Action |
|---|---|---|---|---|
| Estimate | `price` → ongkir; `unsupported` hides service | used | L | keep |
| Estimate | `unsupported_cod`, `coverage_cod`, `unsupportedCodCheckFirstSap` | COD offered unless `unsupported_cod === true`, `coverage_cod === false` or (D-30) `unsupportedCodCheckFirstSap === true`; `unsupported_cod` is absent on JNE, JNECargo, SiCepat, SiCepatCargo captures; `unsupportedCodCheckFirstSap` is a per-service key on SAP, SAPLite, SapCargo (captured `false`) | L (keys), D-s (`unsupported_cod`, `coverage_cod`) | done T-223, T-237 (`tests/mengantar-estimate.integration.test.ts`, `tests/mengantar-order-documented.integration.test.ts`); service hidden on `unsupportedOrigin*`/`unsupportedPickup === true` |
| Estimate | Ninja | removed (owner "ninja hapus aja"): not in `MENGANTAR_COURIERS`, the display map or `public/couriers/`; the quote is dropped by the estimate normalizer (Buat kiriman, Cek tarif) and from stored pre-D-29 snapshots (`isMengantarServiceOffered`, `buildShipmentEstimateOptions`); refused by the order builder (`ORDER_COURIER_UNDOCUMENTED`); a historical shipment renders the plain text "Ninja" (`CourierLogo` text fallback, no image) and an extra recap column | D-s ("Ninja (discontinued 1 September 2026) — … HTTP 400 … `code: \"COURIER_DISABLED\"`") | done T-237 (D-29) |
| Estimate | cargo keys `JNECargo`, `SiCepatCargo`, `SapCargo`, `iDexpressCargo` | ongkir = `cargoPrice ?? price`; normal/special/discount = `cargoEstimatedPrice`/`cargoEstimatedSpecialPrice`/`cargoDiscount` (0 = absent); estimate text `estimate_delivery_cargo`. The regular `estimatedPrice`/`estimatedSpecialPrice` on a cargo key can be the regular service's (SiCepatCargo 6 000/4 200 vs cargo 30 000) | L (values), D-s (`cargoEstimatedPrice` "Cargo total before discount", `cargoEstimatedSpecialPrice` "Cargo discounted total") | done T-237 (`tests/mengantar-order-documented.integration.test.ts`) |
| Estimate | `minimumWeightCargo` | a cargo service is hidden when the parcel (exact grams) is below it; an unreadable value hides it; captured only on SapCargo (`5`) | L, D-s ("shown only for couriers that support cargo shipments") | done T-237 |
| Estimate | `spx` (Shopee Express), `paxel` | quoted (catalogue L) and shown under their names; **not orderable**: the documented `courier` lists of Create Order, Check Shipping Fee and Pay Unpaid contain no SPX or Paxel value, so confirmation is refused `ORDER_COURIER_UNDOCUMENTED` | L (quote), D-s (courier lists) | owner asked "spx → cargo juga aktif" (2026-09-26): needs Mengantar to document the SPX `courier` value (and whether SPX has cargo) |
| Estimate | `codFee` | always 0 in captures; fee is 3.33% of `COD_AMOUNT` | L | keep the 3.33% rule (DATA-3 v3) |
| Estimate | `isDangerousGoods` (query) / `isDangerousGoodsSupported` | T-283: sent as `isDangerousGoods=true` for a draft with `is_hazardous`; a service is offered only when `isDangerousGoodsSupported === true` and `unsupported` is not true (docs: "Check both fields before creating an order"); not sent otherwise | D (docs) | `fetchMengantarEstimate`, `normalizeMengantarEstimateServices`; `tests/mengantar-estimate` (T-283), `tests/shipment-estimate-authority-action` |
| Estimate / order | weight | the estimate quotes `toBillableWeightKg` (whole kg, ≥ 1); the order sends grams ÷ 1000 exactly (docs: "total weight in kg") | D | watch: whether Mengantar re-prices a non-integer order weight — proven in T-285 |
| Order request | wrapper | `POST {BASE_URL}/api/public/{API_KEY}/order`, `Content-Type: application/json`, body `{courier, pickup, orders: [one order]}` (`buildMengantarOrderRequest`); the old bare snake_case array (refused 14/14 live, T-153) is removed | D | T-153: one owner-approved non-COD `dropOff` probe (`scripts/probe-mengantar-order-documented.mjs`) turns this L |
| Order request | `courier` | documented values "JNE", "SiCepat", "Sap", "iDexpress", "JT", "lion", "anteraja", "pos" (`mengantarDocumentedOrderCourier`: our `SAP` → "Sap"); no service key exists in the body | D-s | done T-237; `SAPLite` has no documented way to be ordered → `ORDER_SERVICE_UNDOCUMENTED` |
| Order request | `orders[].cargo` | `true` only for a `<courier>Cargo` service key; the docs name the cargo couriers "(JNE, SiCepat, Sap, iDexpress)" and "Dangerous goods cannot be combined with cargo service" → `ORDER_CARGO_DANGEROUS_GOODS` | D-s (key); the key-to-flag mapping is A | confirm on the first cargo order after T-153 |
| Order request | `pickup.type` / `address_id` / `time_id` / `volume` | `"dropOff"` for DROP_OFF and pre-T-211 drafts; `"scheduledPickup"` with `time_id` (from `POST /time`) and `volume` `volumeMotor`/`volumeMobil`/`volumeTruck` (from `pickup_vehicle`, required for a scheduled pickup) | D (example), D-s ("required for scheduledPickup") | no live `POST /time` transport exists: a scheduled pickup is refused before claim (`ORDER_PICKUP_TIME_UNAVAILABLE`, `…_VOLUME_MISSING`, `…_SLOT_UNAVAILABLE`); the sanctioned fixture transport simulates `/time` |
| Order request | recipient | `customerName`, `customerPhone` (10–15 digits), `customerAddress`, `customerAddressDataId` (area `_id` from `/address/search`) | D | done T-237 |
| Order request | goods | `parcelContent`, `quantity`, `weight` = stored grams ÷ 1000 exactly ("Total weight in kg"; the estimate still asks with the billable whole-kg weight) | D | watch the first live order for a re-price between the ceil-kg quote and the exact weight |
| Order request | sender (masking) | **not sent**: the body has no sender keys, only `dropShipper {id, name, phone}` referencing a saved Mengantar dropshipper, which D-30 keeps off; the masked sender stays on our label only | D-s | none |
| Order request | hazardous, landmark, instruction | `isDangerousGoods` (always sent), `destinationMark`, `deliveryInstruction` (sent only when filled) | D; stored keys `isDangerousGoods`, `destinationMark` L (read side) | done T-237 |
| Order request | COD amount | COD: `COD` = the recorded version 2 total; COD Ongkir: `COD` = ongkir + biaya COD (D-28, version 3 break-even), goods 0; `goodsValue` only for non-COD ("Required for non-COD orders"; `COD` "required if goodsValue is empty"; "COD value = Goods Value + Shipping Fee + COD Fee") | D, D-s | a non-COD draft with goods value 0 sends `goodsValue: 0`, which Mengantar may read as empty — verify live |
| Order request | insurance | not sent | no documented key | none until documented |
| Order response | identity | `_id` → `ORDER_ID` → `order_id`/`id`; `cnote_no` (null when unpaid), `isPaid` boolean (else fails closed) | D (example), L (stored `_id`, `ORDER_ID`) | done T-223/T-237 |
| Order response | `batch` / `batch_id` | the documented example carries both **at the top level and inside each `data[]` item**: `batch` a readable code ("26013014BBQFMM"), `batch_id` an object id. `provider_order_snapshots.provider_batch_id` stores `batch_id` (item, else envelope; `mengantarBatchIdLocation` reports which); item and envelope must agree or the order is `ORDER_RESPONSE_IDENTITY_AMBIGUOUS`; a `batch` code alone stores NULL. **Legacy meaning (T-247, review L8).** Rows accepted between T-223 and T-237 stored `batch` here; no reliable discriminator separates the two (only two documented examples; a shape rule such as "24 lowercase hex" would guess Mengantar's id format and could refuse a real `batch_id`), so none is applied. No such row exists outside test and dev fixtures: GeraiCUAN has never created a live order (`POST /order` is blocked, T-153; issuance runs only on the sanctioned fixture). If one ever appears, pay-unpaid would send a `batch` code as `batch_id`; any refusal or unreadable answer lands the recovery in `PAYMENT_UNKNOWN` (never retried before reconciliation), and nothing is issued | D (example); stored records carry `batch` only — L | done T-237 (supersedes T-223's "store `batch`"); the live probe records the location seen |
| Pay unpaid | request | `{courier, batch_id}` with the documented courier spelling; `batch_id` example "6332f5b98c3ea4bc8e15f72d" (object id) | D | done T-223/T-237; NULL batch refused before claim (`PAY_UNPAID_BATCH_ID_MISSING`) |
| Pay unpaid | response | `{success, data: <number paid>, cnote_no: [...]}` — nothing echoed; one order per batch, so `data === 1` and one AWB, else unknown (`PAY_UNPAID_ORDER_CORRELATION_UNKNOWN` / `…_RESPONSE_SCHEMA_UNKNOWN`) | D | done T-237 (the old parser read an assumed `data: {batch_id, courier, cnote_no}` object; its hand-written fixture was corrected) |
| Concurrency | `409` on JT/Ninja/SiCepat | advisory lock for those three | D | done T-223 (`tests/order-batch.integration.test.ts`): every courier serialized per account; 409 retried ≤ 3 attempts (500/1000 ms), a final 409 → `SUBMISSION_UNKNOWN` `ORDER_PROVIDER_CONFLICT` |
| Status | `status` plain string (RTS, DELIVERED, DELIVERY PROBLEM, PENDING PICKUP); unknown refused | mapped | L | keep; capture an in-transit value when seen |
| Status | Mengantar app "Status Parcel" vocabulary (analysis §9.3: Error, Unpaid Order, Menunggu Penjemputan, Origin gateway, Close by system, Proses gateway, Proses masuk, On delivery, Terkirim (Pending/Completed), Shipment breach, Tertahan, Kendala transportasi, Pengiriman Terkendala, Return Origin, Canceled, Gagal Kirim, Masalah pengiriman, Paket Hilang) | mapped in a separate `PROVIDER_DELIVERY_STATUS_UNVERIFIED_MAP`: trouble → `PROBLEM`, movement and "Terkirim (Pending)" → `IN_TRANSIT`, only "Terkirim (Completed)" → `DELIVERED`, Unpaid Order / Menunggu Penjemputan → no state; same transition graph; anything else stays `UNRECOGNISED` | **UNVERIFIED** — app display text only, never seen in an API `status` | done T-231 (`tests/provider-delivery-vocabulary.integration.test.ts`); move a value to the verified map when captured live |
| Status | "Tanpa update 48 jam / 4 hari" | Histori filters `STALE_48H` / `STALE_4D` over ISSUED/IN_TRANSIT/PROBLEM: latest observation's `last_history_at`, else its `observed_at`, else issuance `resolved_at`; Tenant Admin only (observations are admin-only under RLS, T-146) | L (inputs) | done T-231 (`tests/shipment-queue.integration.test.ts`) |
| Status | documented values (T-238): webhook `status_category` "PENDING PICKUP", "PICKED UP", "ON DELIVERY", "DELIVERED", "UNDELIVERED", "PICKUP FAILED", "RTS", "ACTIVE/WAITING NEXT PROCESS", "ERROR", "CANCELED"/"CANCELLED"; `GET /order` `status` filter `DELIVERED_PENDING`, `DELIVERED_COMPLETED`, `RTS`; example record `status: "active"` | in `PROVIDER_DELIVERY_STATUS_UNVERIFIED_MAP`: PICKED UP / DELIVERED_PENDING → `IN_TRANSIT`, DELIVERED_COMPLETED → `DELIVERED`, UNDELIVERED / PICKUP FAILED / CANCELLED → `PROBLEM`, ACTIVE and ACTIVE/WAITING NEXT PROCESS → no state; the live-verified map is unchanged | D-s (`"active"` D, from the quoted example) | done T-238 (`tests/provider-delivery-vocabulary.integration.test.ts`); move to the verified map when captured |
| Status | `history[{date, desc}]` — "returned only when using `?tracking_id=` or `?order_id=`" | parsed when present (never seen live: the pull uses the list query), with `lastHistory` as the fallback event; stored in `provider_order_history_events` (DATA-18) | D-s (history), L (`lastHistory`) | done T-238 (`tests/mengantar-tracking-t238.integration.test.ts`); per-AWB `tracking_id` reads are not made (no live call) |
| Status | `cnote_no_rts` (return resi) | `provider_order_status_observations.cnote_no_rts` + `provider_order_snapshots.return_cnote_no`; `RTS` + a return resi → `RTS_IN_TRANSIT` | L key (3/100 records, always `null`), value shape unseen; not in the docs | done T-238; nothing documented or captured reports a received return, so `RTS_RECEIVED` stays unreachable (gap; candidate evidence `pod_code` 402 on 96/96 RTS captures — ask Mengantar) |
| Status | `isBreach`, `lastUndeliveredCode`, `claimStatus` (statusApproved/Disapproved/Pending), `ticketStatus` (none/Closed/Replied) | observation columns `is_breach`, `last_undelivered_code`, `claim_status`, `ticket_status`; Detail "Catatan dari Mengantar" (Tenant Admin) | L (`isBreach`, `ticketStatus` also D in the `GET /order` example) | done T-238; no Histori filter |
| Webhook | headers `x-timestamp` (ms) / `x-signature` = hex HMAC-SHA256 of `{x-timestamp}.{raw body}` keyed with the Webhook Secret; body `cnote_no`, `order_id`, `courier`, `status_category`; any 2xx within 5 s; up to 3 retries (~1 s, 5 s, 15 s); "reject anything older than a few minutes" (example 5 min); deliveries "can arrive out of order" | receiver built, **closed by default** (D-30): `MENGANTAR_WEBHOOK_ENABLED=1` + `MENGANTAR_WEBHOOK_SECRET`; platform-default account only | D (test vector and signing code quoted; our HMAC reproduces `05826dec…a111`), D-s (retry/timeout prose) | done T-238 (`tests/mengantar-webhook.integration.test.ts`); capture a real delivery when the account enables it |
| Status | `lastHistory {date "DD-MM-YYYY HH:mm", desc, code}`, `pod_code` | not stored | L | done T-223 (`tests/provider-settlement-repository.integration.test.ts`, `tests/mengantar-settlement.integration.test.ts`): `last_history_desc`, `last_history_at` (WIB → timestamptz), `pod_code` (0056); unreadable → NULL |
| Pickup time | `POST /time` `{address_id, date "mm-dd-yyyy", time}`; `time` one of "9:00 … 18:00"; "at least 90 minutes from current time"; response `data._id` = `time_id` | D-27: GeraiCUAN offers starts 09:00–17:00 (one-hour windows inside 09.00–18.00 WIB; an 18:00 start would end at 19.00 and the 0061 CHECK `^(0[89]\|1[0-7]):00$` refuses it, no migration). `mengantarPickupTimeRequest` re-checks the slot at send time and sends `time` as "9:00"; a legacy 08:00 draft stays valid and shown but is refused at send (`ORDER_PICKUP_SLOT_UNAVAILABLE`) — re-picked on a new shipment. `normalizeMengantarPickupTimeResponse` checks the echoed time/address | D (example), D-s (value list, 90-minute rule); content type of `/time` not confirmed (the AdsBookCMS stub used form-urlencoded) | a live `/time` transport is part of T-153 |
| Order answer | HTTP status of `POST /order` | T-280: 2xx → normalized; 409 → retried in the account lock, a final 409 → `MengantarOrderRefusedError` (`ORDER_PROVIDER_CONFLICT`, batch back to the queue); 400/403 (Create Order docs: dropshipper and dangerous-goods validation; Pos COD eligibility and the dropshipper feature) → refused, `ORDER_PROVIDER_REFUSED_<status>` with the provider's short `message` (dropped if it quotes the key); anything else — 422, 5xx, an unreadable body or a lost answer — → SUBMISSION_UNKNOWN (`ORDER_RESPONSE_HTTP_STATUS`, `ORDER_TRANSPORT_FAILED`) | D (docs) for the refusal set; not yet L | `readMengantarOrderAnswer` (`src/lib/mengantar-order.ts`), `tests/order-batch`, `tests/mengantar-live-transport-t280` |
| Pay unpaid | HTTP status of `POST /order/pay-unpaid` | T-282: 2xx → normalized as above; 400/403 → `MengantarPayUnpaidRefusedError` (`PAY_UNPAID_REFUSED_<status>`), the recovery returns PAYING → PAYMENT_QUEUED (`releaseUnpaidRecoveryClaim`; the 0014 CHECKs require `attempted_at`, `completed_at`, `safe_response_code` NULL there, so the refusal code is not stored) and the owner is told to top up the Mengantar wallet, with Mengantar's short `message` (dropped if it quotes the key); a failure before the request was sent is released the same way (`PAY_UNPAID_NOT_SENT`); anything else — 401, 422, 5xx, an unreadable body or a lost answer — → PAYMENT_UNKNOWN (`PAY_UNPAID_HTTP_STATUS`, `PAY_UNPAID_TRANSPORT_FAILED`). The claim is re-proved inside the account lock (`refreshUnpaidRecoveryClaim`) | A for the statuses: the docs list no error for Pay Unpaid (read 2026-10-06); 400/403 are read as Create Order documents them on the same account | watch in T-285: the real answer to an underfunded pay-unpaid (status and `message`) |
| Reconciliation | `GET /order` list (`page`, `size`, `courier`, `dateRange={startDate,endDate}`) | T-282 (D-43): for a SUBMISSION_UNKNOWN shipment, `courier` = the documented order value, `dateRange` = `submission_attempted_at` − 10 min … + 60 min, `size` 50, at most 10 pages; the listing is complete only when the answer's `total` equals the rows read (a short page alone, or no `total`, is not proof; review F3). A stored order matches only on ALL of: `RECEIVER_PHONE` (national number: digits with a leading `62` or `0` removed, so a bare "812…" equals "0812…"; review F4), `RECEIVER_NAME` (NFKC, whitespace, case), area by name (`RECEIVER_SUBDISTRICT`, `RECEIVER_DISTRICT`, `RECEIVER_CITY`, `RECEIVER_REGION` against the stored area label — stored orders carry no area `_id`; `receiver_area` is on 1/100 contract records and is a code), `WEIGHT` (exact kg, or the billable whole kg), `COD_AMOUNT` (COD) or `GOODS_AMOUNT` (non-COD), `createdAt` in the window, `isDeleted` not true, and an `_id` no other shipment of the tenant owns. One match: `cnote_no` + boolean `isPaid` → ISSUED; no `cnote_no`, `isPaid: false`, non-COD → AWAITING_UPSTREAM_PAYMENT; `status: error` or anything else → undecided; `provider_order_id` = `_id`, applied only on a private account (on the shared platform-default account another gerai's order is invisible under RLS, review F1) and under a transaction advisory lock on the order id that refuses an id another snapshot of the gerai holds (review F2); since T-292 the partial unique index `provider_order_snapshots_tenant_provider_order_key` (`tenant_id, provider_order_id` WHERE NOT NULL, migration 0076) refuses it in the database as well. No automatic FAILED (D-43 amended, review F5): an absence stays undecided until T-285 proves the `dateRange` and stored-phone semantics. Otherwise nothing changes | D (query keys, record keys from the docs example), L (record keys in `tests/fixtures/mengantar-order-contract.shape.json`) | `tests/mengantar-live-t282.integration.test.ts`; watch in T-285: whether `dateRange` filters on `createdAt` and whether Mengantar normalizes the stored phone |
| Reconciliation | batch `_id` for `provider_batch_id` (T-227 #3) | a stored order carries `batch` (readable code, "260904105T3QKW"), not the `_id` `pay-unpaid` takes; `batch_id` on the record is used when present (undocumented), else `GET /batch` (same `courier` and `dateRange`, bounded paging): the one batch whose `id` is that code and whose `orderData` (required) lists the `ORDER_ID` gives `_id`. Written by `applyAuthoritativeShipmentReconciliation` (grant 0056). Not proven: ISSUED keeps NULL; AWAITING_UPSTREAM_PAYMENT stays SUBMISSION_UNKNOWN, since an unpaid order without its batch `_id` could never be paid from GeraiCUAN | D (Get batches example: `_id`, `id`, `orderData[].orderId`) | done T-282 |
| Delete order | pull | T-281 review: a `GET /order` record with `isDeleted: true` whose status is still deletable (active, error, PENDING PICKUP, PICKUP FAILED, PICKUP_FAILED_API) is flagged `deletedBeforePickup` with its raw status kept (the observation row stores the raw value; `mapped_status` CANCELLED marks the inference); the pull applies CANCELLED only while our shipment is ISSUED or AWAITING_UPSTREAM_PAYMENT — from any later state the observation is REFUSED, and (T-290) such a refused inferred cancel — REFUSED + mapped CANCELLED whose raw value does not itself mean CANCELLED — is never the "latest provider status": `latestProviderStatusCandidate` (`src/db/shipment-event-predicates.ts`) skips it in the cancel rules, Pencairan review, owner money, Cek resi, the detail page and the stale filter, so the shown status never goes back to the deleted record's stale value (the row stays stored as evidence) — and a live record for the same AWB outranks the deleted one; any other deleted record is skipped (the production capture holds a deleted DELIVERED order — removed from the list, not cancelled) | D + L (capture) | `normalizeMengantarOrderPage`, `decideInferredCancel`, `tests/mengantar-settlement`, `tests/provider-delivery-transitions`, `tests/cancel-ledger-reversal-t290` T-285 live: a deleted order did not appear in `GET /order` at all (by tracking id or date range) right after deletion, so this inference applies only if Mengantar lists such a record later; the app's own cancel records CANCELLED itself. |
| Delete order | request | T-281: `DELETE {BASE_URL}/api/public/{API_KEY}/order` `{courier, ids: [provider_order_snapshots.provider_order_id]}` (`resolveLiveMengantarCancelTransport`; our `_id`, never `orderIds`; the documented courier spelling via `mengantarDocumentedOrderCourier`, so "anteraja" and "Sap"); serialized per Mengantar account. Sent only while the shipment is ISSUED or AWAITING_UPSTREAM_PAYMENT, the latest observed provider `status` is one of the documented deletable values "active", "error", "PENDING PICKUP", "PICKUP FAILED", "PICKUP_FAILED_API" or none was observed, no unpaid payment is PAYING/PAYMENT_UNKNOWN, and for Anteraja ≥ 5 minutes after `resolved_at` (docs: "only after 5 minutes from order created") | D (docs read 2026-10-07; no live call) | done T-281; watch for T-285: whether an unpaid order's observed status (app "Unpaid Order") is deletable — refused here because the docs do not list it |
| Delete order | response | `{success, message, deletedCount, deletedOrderIds, deletedOrderIdsHumanReadable}`: `success: true` and `deletedOrderIds` names our `_id` → CANCELLED; `success: true` without it → skipped ("the request simply skips that order" past pickup), unchanged; 4xx or `success: false` → refused with the key-free provider message ("the courier rejects … an error message from the courier is returned"), unchanged; lost answer, 5xx, unreadable → unknown, unchanged (`readMengantarDeleteOrderAnswer`) | D | done T-281; watch for T-285: the HTTP status of a courier refusal (not documented) and whether a deleted order still appears in `GET /order` — the status pull skips `isDeleted: true` records (`normalizeMengantarOrderPage`), so after a lost answer a pull may not show CANCELED and the owner checks the Mengantar app Proven live 2026-10-07 (T-285): the app's cancel answered `success: true` with our `_id` in `deletedOrderIds`, and the T-237a probe cleanup answered `{success: true, deletedCount: 1, message: "1 orders are deleted from 1 selected orders"}`; afterwards the order is absent from `GET /order?tracking_id=` and from the day's `dateRange` list. |

**Live proof (T-237a, 2026-09-28, owner-approved, one order).** `scripts/probe-mengantar-order-documented.mjs` sent one non-COD `dropOff` JNE order (weight 1, goodsValue 10 000, destination Kebon Jeruk / Jakarta Barat 11530) to production `api-public.mengantar.com`: HTTP 200, `success: true`. This moves the order-request wrapper, `courier`, `pickup.type`/`address_id` (dropOff), recipient, goods and `goodsValue` rows, and the order-response identity and batch rows, from D to **L**. Observed: the item carries `_id`, `ORDER_ID` and `cnote_no` (issued at once), `isPaid: true`; `batch_id` and `batch` sit **both** in the envelope and in the item; the envelope also carries `courier`, `errors: []`, `ordersClosedDestination: []` and `jtOrdersUnsuported: null`. The capture is `tests/fixtures/mengantar-order-documented.live.json` (allow-list sanitized: only the test order's own identifiers verbatim), and `normalizeMengantarOrderResponse` reads it to the same stored fields (`tests/mengantar-order-documented`). Not answered by this order: `POST /time` (scheduled pickup), COD and COD Ongkir amounts, cargo, the SPX `courier` value and SAP Lite ordering; how `goodsValue: 0` is treated (the probe sent 10 000); whether the exact-kg weight is re-priced (the response keeps `WEIGHT`/`price` as shapes in the capture).
Not ported: AdsBookCMS's JSON-flag status parser (contradicts L evidence), `x-client-source`, cargo filtering. Their tracking sync likely fails on the plain-string `status` — reported to the owner, not fixed here.

## DATA-18 — Tracking history, return resi and webhook observations (T-238, D-30, migration 0063)
- Owner: Engineering owner
- Status: Built 2026-09-26. No live Mengantar call.

`provider_order_history_events` — `id`, `tenant_id`, `shipment_id`, `outlet_id` (FK (`shipment_id`, `outlet_id`, `tenant_id`) → `shipments`, RESTRICT), `occurred_at` (courier time, WIB → timestamptz), `description`, `source` `HISTORY` | `LAST_HISTORY`, `created_at`. UNIQUE (`tenant_id`, `shipment_id`, `occurred_at`, `description`): a re-pull appends nothing (`INSERT … ON CONFLICT DO NOTHING`).

- **Both roles read it (decision).** Observations stay Tenant Admin evidence (T-146: they carry transition outcomes and sit beside settlement money). The courier's journey is operational — an operator packing, answering a buyer or receiving a return needs it — so the history table has its own policy: SELECT for any ACTIVE member (ACTIVE user) of an ACTIVE tenant; INSERT only for an ACTIVE Tenant Admin (only the status pull writes); no UPDATE/DELETE grant; FORCE RLS.
- **PII.** `description` is courier free text and can name the receiver ("DELIVERED TO [BUDI | …]"); both roles already see the receiver's name, phone and address on the shipment, so no new exposure. It is cleaned exactly like `last_history_desc` (control characters → space, whitespace collapsed, ≤ 500 characters) and a CHECK refuses control characters and empty or over-long text. No phone, address or photo key (`lastHistory.photo1…8`) is read.
- **Return resi.** `provider_order_snapshots.return_cnote_no` (runtime `UPDATE (return_cnote_no)` grant under the existing active-member UPDATE policy) is written by the pull only when a value is reported; an absent value never clears it; each observation keeps what it saw in `cnote_no_rts`. Shown on Detail, Cek resi and Retur for both roles.
- **Observation changes.** `pull_id` nullable; `source` `PULL` (default; every pre-0063 row) | `WEBHOOK`; `provider_event_at` (webhook `x-timestamp`); CHECK: a pull row has a pull and no event time, a webhook row the reverse. Partial UNIQUE (`tenant_id`, `shipment_id`, `provider_event_at`, `provider_status`) WHERE `source = 'WEBHOOK'` makes a retried delivery a no-op. Attention columns `cnote_no_rts`, `last_undelivered_code`, `is_breach`, `claim_status`, `ticket_status` (NULL when absent or unreadable; Tenant Admin only like the rest of the row). The transition CHECK gains `SUPERSEDED` (a webhook delivery older than one already recorded is kept as history, never applied).
- **Webhook write path.** `record_mengantar_webhook_event(account_key, cnote_no, provider_status, mapped_status, recognised, event_at)`: SECURITY DEFINER, `search_path` pinned, EXECUTE only for `geraicuan_app`. Validates its arguments (`22023`), resolves the AWB to exactly one shipment on an order of that account key in an ACTIVE tenant (else `NOT_FOUND`), sets `app.tenant_id`, locks the shipment, decides with `provider_delivery_outcome` (the SQL twin of `decideProviderDeliveryTransition`, parity-tested over every state pair), appends one WEBHOOK observation and writes `shipments.status` only on APPLIED. Owner-only policies (needed for a non-superuser owner under FORCE RLS): SELECT on `provider_order_snapshots`, `provider_batches`, `tenants`, `shipments`; UPDATE on `shipments` and SELECT/INSERT on observations limited to the tenant the function set, inserts only `source = 'WEBHOOK'`. Trust boundary: the route verifies the signature before the call; the function trusts its caller (the runtime role) for the mapping, as the pull path does. The route passes the platform-default account key only (one secret).
- **Unpaid cancellation (T-247, review M1, D-33, migration 0068).** `AWAITING_UPSTREAM_PAYMENT → CANCELLED` joins the transition graph in both twins (`ALLOWED_TRANSITIONS` and `provider_delivery_outcome`, replaced in 0068). Unpaid recovery refuses a batch whose shipment is `CANCELLED` although its order snapshot still reads unpaid (`prepareUnpaidRecoveries` joins `shipments.status`). **Known gap:** neither the pull nor the webhook can reach an unpaid order today — both match on the AWB (`cnote_no`), which an unpaid order does not have (CHECK `provider_order_snapshots_unpaid_state_valid`), and the pull skips records without one. Reaching it needs matching by the provider order id, whose webhook form (`order_id`) is documented but not captured (TASKS T-247 open item).
- **Webhook ordering and dedupe (known limit, T-247 L6).** Supersession and the retry dedupe key use the delivery's `x-timestamp`, the time Mengantar *sent* that delivery, not when the courier event happened: the documented body (`cnote_no`, `order_id`, `courier`, `status_category`) carries no event time. A retry that Mengantar re-signs with a new timestamp is recorded again (harmless: `UNCHANGED`), and two events sent out of courier order are ordered by send time. If Mengantar documents a body event time, use it instead. The receiver is closed by default (D-30).
- **Upgrade proof.** `scripts/verify-migration-upgrade.mjs` writes a pre-0063 pull observation and checks it unchanged (plus `source = 'PULL'`, new columns NULL), both CHECKs validated, the history grants/RLS, a WEBHOOK row with a pull refused (`23514`), the function's `NOT_FOUND`/`22023`; nothing left behind.

## DATA-15 — Pickup vehicle (PR-90, D-19, T-232, migration 0057)
- Owner: Engineering owner
- Status: Built 2026-09-26.

`shipment_drafts.pickup_vehicle text NULL` — `MOTOR` | `MOBIL` | `TRUK` (CHECK `shipment_drafts_pickup_vehicle_known`), and NULL unless `handover_type = 'PICKUP'` (CHECK `shipment_drafts_pickup_vehicle_pickup_only`). Required for a new pickup since T-285 (2026-10-07): Mengantar's `scheduledPickup` needs `pickup.volume`, and the first live pickup order was refused before sending for a draft without one; `validateShipmentDraft` refuses a pickup without a vehicle and the form preselects Motor. Older pickup drafts may still hold NULL (refused at issuance with `ORDER_PICKUP_VOLUME_MISSING`); a drop-off never stores one. Written once at draft insert and part of the replay comparison (another vehicle is another submission); never UPDATEd, so no column grant was added (the 0008 table-level INSERT/SELECT covers it). Shown in the Buat kiriman form, saved view, summary rail and Detail kiriman "Penyerahan" through `handoverSummary`. Since T-237 the documented order builder maps it to `pickup.volume` (`volumeMotor`/`volumeMobil`/`volumeTruck`, required for a scheduled pickup); sent live since T-280 and proven by the T-285 scheduled-pickup order (DATA-13). Every pre-0057 row is NULL and satisfies both CHECKs (validated; `scripts/verify-migration-upgrade.mjs`).

## DATA-16 — Gerai WhatsApp edit (T-233, migration 0058)
- Owner: Engineering owner
- Status: Built 2026-09-26.

`tenants.contact_whatsapp` (DATA-12) is changed only through `public.set_tenant_contact_whatsapp(requested text)`, a SECURITY DEFINER function (`search_path` pinned, EXECUTE revoked from PUBLIC and granted to `geraicuan_app`). It checks the same pattern as the column CHECK (`22023` otherwise), requires `app.user_id` to be an ACTIVE Tenant Admin (ACTIVE user) of `app.tenant_id` whose tenant is ACTIVE or PROVISIONING (store setup, PR-60; `42501` otherwise), locks the row, writes only that column and `updated_at`, and appends `TENANT_CONTACT_UPDATED` (actor role `TENANT_MEMBER`, target the tenant, metadata `{field, hadPrevious}` — no phone numbers). Saving the current value is a no-op without an audit row.

- **Why a function, not a grant.** The runtime role holds `UPDATE (name, status, updated_at)` on `tenants` for the Super Admin path; a tenant-admin UPDATE policy would have let a Tenant Admin rename or reactivate their tenant, because row policies cannot limit columns. The runtime role gets no UPDATE on `contact_whatsapp` (asserted by `tests/tenant-isolation-posture`).
- **Policies.** `tenants_contact_whatsapp_function_update` (PERMISSIVE UPDATE for the function owner only, needed when the owner is not a superuser/BYPASSRLS role, FORCE RLS since 0034); RESTRICTIVE `audit_events_tenant_contact_guard` lets only the function owner append the new action. `audit_events_action_valid` gains `TENANT_CONTACT_UPDATED`; every existing row still passes.
- **Snapshots stay.** Issued invoices keep the number in `document.gerai.whatsapp` (DATA-14); existing shipments keep their `shipment_parties` sender. Invoices issued later and new shipments whose sender is "Alamat gerai" use the new number.
- **Upgrade proof.** `scripts/verify-migration-upgrade.mjs` compares every tenant and audit row before and after 0058/0059 and probes the runtime role (admin save accepted, invalid `22023`, direct UPDATE `42501`, nothing left behind).

## DATA-17 — Label field settings (PR-86, T-229, migration 0059)
- Owner: Engineering owner
- Status: Built 2026-09-26.

`tenant_label_settings` — PK (`tenant_id`, `label_size`), FK `tenant_id` → `tenants` ON DELETE RESTRICT; `label_size` `10x15` | `10x10` (CHECK); booleans `show_sender_address`, `show_sender_phone`, `show_recipient_name`, `show_recipient_phone`, `show_recipient_address_detail` (default true) and `show_return_warning` (default false); `updated_by_user_id` (non-blank), `created_at`, `updated_at`.

- **Defaults = the label before 0059.** No row for a size means the defaults (`DEFAULT_LABEL_FIELDS`, `src/lib/label-fields.ts`), so every existing tenant prints exactly as before until a Tenant Admin saves. The migration writes no rows.
- **No pickup-identity column.** The Mengantar pickup identity is never printable (PR-71); there is nothing to switch on.
- **Grants and RLS.** `SELECT, INSERT` plus `UPDATE` on the six choices, `updated_by_user_id` and `updated_at` only (tenant and size are immutable). FORCE RLS: SELECT for any ACTIVE member (ACTIVE user) of the current tenant (ACTIVE or PROVISIONING), so both roles' label prints read it; INSERT and UPDATE only for an ACTIVE Tenant Admin of the current tenant with `updated_by_user_id = app.user_id`. Writes are an upsert of both sizes (`saveTenantLabelFields`).
- **Printing.** `LabelSheet` takes both sizes and applies the print context's size: sender phone/address hidden from the sender line (the ` · ` goes with the address); recipient name/phone hidden from the name line; address detail off prints `formatCityProvince` (city, province) instead of the area line and street; the warning replaces the footer's issue time ("Sebelum retur, konfirmasi dulu ke pengirim · Nomor kiriman …", measured one 7 pt line with a 13-character reference). Label geometry and `label.css` are unchanged. The label page and the batch view (`/app/label/cetak`) load it in their tenant transaction.

## DATA-20 — Gerai brand, Mitra kurir and pickup notes (T-243, migration 0065)
- Owner: Engineering owner
- Status: Built 2026-09-26.

`tenant_brand_settings` — PK `tenant_id` → `tenants` ON DELETE RESTRICT; nullable `business_category` (CHECK `FASHION`, `BEAUTY`, `FOOD`, `ELECTRONICS`, `HEALTH`, `OTHER`), `label_note` (1–60 chars, trimmed, no control characters), `cs_email` (≤ 254, `local@domain.tld`), `website` (≤ 200, `https://` only); `default_label_size` `10x15` | `10x10` (default `10x15`); `disabled_couriers text[]` (default empty, ≤ 32); the logo as `logo_bytes bytea` + `logo_mime` (`image/png` | `image/jpeg` | `image/webp`) + `logo_sha256` (64 hex) + `logo_updated_at`, all four NULL together (CHECK) and ≤ 204 800 bytes; `updated_by_user_id` (non-blank), `created_at`, `updated_at`.

- **Logo validation.** The Server Action sniffs the type and pixel size from the magic bytes (`sniffLogo`, `src/lib/gerai-settings.ts`; no image library): PNG, JPEG or WebP only, the declared type must match, ≤ 200 KB, ≤ 1000 × 1000 px; SVG and anything else is refused. The validated original is stored; nothing is re-encoded.
- **Serving.** Only `GET /app/brand/logo` returns the bytes: tenant from the session (401 without one, 404 without a logo), `Cache-Control: private, no-cache`, `ETag` = the SHA-256, `304` on `If-None-Match`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`. `?v=` (first 16 hex of the hash) only busts caches; there is no tenant id in the URL.
- **Grants and RLS.** Same shape as DATA-17: `SELECT, INSERT` plus column `UPDATE` on everything except `tenant_id` and `created_at`; FORCE RLS, SELECT for any ACTIVE member of the current tenant (both roles print the logo), INSERT/UPDATE only for an ACTIVE Tenant Admin with `updated_by_user_id = app.user_id`. No row means no logo, no catatan, 10 × 15 and every courier offered.
- **Label switches.** `tenant_label_settings` gains `show_courier_logo`, `show_gerai_logo`, `show_label_note` (default true, column UPDATE granted). The gerai logo and catatan print only when the switch is on **and** the value exists; the courier print logo (`public/couriers/print/<courier>.svg`) falls back to bold text for a courier without one. None moves a label row (DATA-17 geometry).
- **Mitra kurir.** `disabled_couriers` holds `MengantarCourier` codes; `filterTenantCourierServices` removes their services where Cek tarif (`checkShippingRates`) and Buat kiriman (page loader and the issuance step on the detail page) present options. At least one courier stays on; an unknown courier in a quote is kept.
- **Pickup notes.** `outlet_pickup_points` gains nullable `pic_name` (1–80), `pic_phone` (national `0…`, 9–13 digits), `pickup_schedule` (1–120), `driver_access_note` (1–240), CHECK `outlet_pickup_points_notes_valid`, column UPDATE granted. Internal only — never part of a Mengantar request.
- **Upgrade proof.** `scripts/verify-migration-upgrade.mjs` applies 0065 over existing tenant, label and pickup rows and checks they are unchanged, plus runtime probes (admin write accepted, operator write and invalid values refused).
- **Logo versions (T-247, review L3, migration 0068).** `tenant_logo_versions` — PK (`tenant_id`, `sha256`), `tenant_id` → `tenants` RESTRICT, `bytes bytea` (1–204 800), `mime` (PNG/JPEG/WebP), `created_by_user_id` (non-blank), `created_at`. `saveTenantLogo` inserts the version (`ON CONFLICT DO NOTHING`) in the same transaction as the brand row; replacing or removing the logo never deletes a version. 0068 backfills each existing logo as its first version. Grants `SELECT, INSERT` only (append-only); FORCE RLS: SELECT for any ACTIVE member of the current tenant, INSERT for an ACTIVE Tenant Admin with `created_by_user_id = app.user_id`. Served by the same route with `?sha=<64 hex>` (tenant from the session, 404 for a malformed, unknown or other tenant's sha; `Cache-Control: private, max-age=31536000, immutable`, since a version never changes). `// lazy:` versions are never pruned; a gerai that re-uploads often keeps every ≤ 200 KB logo — prune versions no invoice references if storage ever matters.

## DATA-19 — Contact numbers, kategori and shipment attribution (T-241, migration 0064)
- Owner: Engineering owner
- Status: Built 2026-09-26.

- **`contacts.contact_number integer NOT NULL`**, unique `(tenant_id, contact_number)` (`contacts_tenant_number_key`), CHECK `>= 1`. It is the only contact identifier in a URL: `/app/kontak/pengirim/<n>` and `/app/kontak/penerima/<n>` (spec 10 §11 — never a name or phone; the UUID stays the primary/foreign key and the Buat kiriman selection key). Allocation mirrors DATA-10: `tenant_contact_counters (tenant_id PK → tenants ON DELETE CASCADE, last_number >= 1)` holds the state, carries no RLS and grants the runtime role nothing; trigger `contacts_allocate_number` (BEFORE INSERT, `allocate_contact_number()`, SECURITY DEFINER, `search_path` pinned, EXECUTE revoked) upserts the counter and **overwrites any supplied number**. The counter row lock serializes concurrent inserts per tenant; the contact's own RLS WITH CHECK still decides the insert, and a refused insert rolls its allocation back. The runtime role has no UPDATE grant on `contact_number` (0035's column-scoped grants), so a number never moves. Numbers are never reused (an archived contact keeps its number).
- **Backfill.** 0064 locks `contacts`, numbers existing rows per tenant by `(created_at, id)` from 1, seeds one counter per tenant that has contacts, then sets NOT NULL and adds the constraints. `scripts/verify-migration-upgrade.mjs` proves the order (a `created_at` tie broken by id), the counters, that no other contact value changed, and the runtime probes (insert numbered, kategori set, bad kategori `23514`, moving a number or reading counters `42501`).
- **`contacts.category text NULL`**, CHECK `contacts_category_valid`: NULL or one of `PIC_UTAMA`, `STAF_GUDANG`, `DROPSHIPPER`, `PENGRAJIN`, `OPERASIONAL_CABANG`, `ADMIN_PENGIRIMAN`, `RESELLER`, `PELANGGAN_TETAP`, `PEMBELI_BARU` (labels in `src/lib/contact-category.ts`). Runtime UPDATE is granted on this column. Set on create and on the detail's Kontak card; the Peran card omits the field and leaves it unchanged.
- **Primary address.** "Jadikan utama" (`setPrimaryContactAddress`) locks the active contact, clears `is_primary` on its other addresses and sets it on the chosen active address in one transaction, so a contact keeps exactly one primary.
- **Shipment attribution rule (read-only, no schema).** `shipment_parties` stores an immutable snapshot and **no contact id**, so a shipment is attributed to a contact when, **in the same tenant**, its party row of the page's role (`SENDER` on Pengirim, `RECIPIENT` on Penerima) has the same **national phone number** as the contact: digits only, a leading `62` or `0` removed — the rule `checkDuplicateShipment` already uses, so a `+62…` snapshot matches a `08…` contact. Consequences: a shipment made by typing the same number counts even if the contact was not picked; two contacts sharing a number show the same shipments; a contact whose phone changed shows the shipments of its current number. Every attributed shipment counts, drafts included (SHP-CREATED's basis). Reads: `src/db/contact-shipment-repository.ts` (`loadContactShipmentCounts`, `loadContactShipmentSummary`, `loadContactShipmentHistory`), each with the table's own `tenant_id` predicates; metrics CON-SHP-* in spec 19. No Mengantar data or score (D-30). `// lazy:` the phone expression has no index; add an expression index if a tenant's history makes the list slow.

## DATA-21 — Info terbaru: platform announcements and read receipts (T-244, PR-91, D-31, migration 0066)
- Owner: Engineering owner
- Status: Built 2026-09-26.

- **`platform_announcements`** — platform-wide content, not tenant-owned: `id uuid`, `title` (CHECK 1–120 trimmed characters, no control characters), `body` (plain text, CHECK 1–2,000 trimmed characters, line feed the only control character; rendered as escaped text with line breaks, never HTML/markdown), `category` (CHECK `FITUR_BARU`, `INFO_KURIR`, `JADWAL`, `PEMELIHARAAN`, `LAINNYA`; labels in `src/lib/announcements.ts`), `pinned boolean`, `published_at timestamptz NULL` (NULL = draft; publishing an already-live row keeps its first publication time), `created_by` → `users` (RESTRICT), `created_at`, `updated_at`; index on `published_at`.
- **`platform_announcement_reads`** — PK `(user_id, announcement_id)`, `read_at`; both FKs `ON DELETE CASCADE`. Unread = published announcements without the caller's receipt (sidebar badge, Dasbor line).
- **Grants and RLS (FORCE).** Runtime `geraicuan_app`: SELECT on announcements, SELECT+INSERT on receipts, no UPDATE/DELETE anywhere. Policies: an ACTIVE member of an ACTIVE or PROVISIONING gerai (tenant context) reads published rows only; the platform context of an active `SUPER_ADMIN` reads every row; receipts are visible and insertable only for `app.user_id` and only for a published announcement.
- **Writes.** Only through SECURITY DEFINER `save_platform_announcement(target, title, body, category, pinned, publish)` and `unpublish_platform_announcement(target)`: each re-checks `app.platform_admin = 'true'` and an active `SUPER_ADMIN` (else SQLSTATE 42501) and appends the audit event (`ANNOUNCEMENT_SAVED` / `ANNOUNCEMENT_PUBLISHED` / `ANNOUNCEMENT_UNPUBLISHED`, target type `PLATFORM`, metadata without the body) in the same statement. A write policy admits only the functions' owner; restrictive `audit_events_announcement_guard` keeps the runtime role from forging the three actions. The audit action CHECK is re-created as a superset.
- **Evidence.** `tests/announcements-t244.integration.test.ts` (member reads published only, per-user read state, member write/receipt/audit forgery refused, publish/edit/unpublish audited, invalid content refused); `scripts/verify-migration-upgrade.mjs` 0066 probes.

## DATA-22 — Wilayah reference: kecamatan, kelurahan/desa and kode pos (T-245, D-32, migration 0067)
- Owner: Engineering owner
- Status: Built 2026-09-26 (dev and test databases); production import waits on the `pg_trgm` release gate (spec 15).

- **`wilayah_areas`** — public government reference data, tenant-neutral by construction (no `tenant_id`; spec 06). One row per kecamatan (`level` 3, code `PP.KK.CC`) and per kelurahan/desa (`level` 4, code `PP.KK.CC.DDDD`): `code` PK, `district_code`, `regency_code`, `village_name`/`village_kind` (`KELURAHAN` for village digit 1, `DESA` for 2 and 3 = desa adat; NULL at level 3), `district_name`, `regency_name` (as published, "Kabupaten …" / "Kota …"), `regency_kind` (`KAB` for KK 01–69, `KOTA` for 71–99; the import refuses a name that disagrees), `province_name`, `postal_code` (NULL or `^[1-9][0-9]{4}$`; level 4 only), `search_text` (normalized lower-case ASCII words with a leading space, so a word-start match is `LIKE '% word%'`), `name_search`, `district_search`, `dataset_version`. CHECKs pin the level shape, code format, kinds, kode pos format and search-text shape.
- **Indexes.** GIN `gin_trgm_ops` on `search_text` (`pg_trgm`, created by the migration with `CREATE EXTENSION IF NOT EXISTS`); partial btree on `postal_code`.
- **Grants and RLS (FORCE).** Runtime `geraicuan_app`: SELECT only; `wilayah_areas_read` admits every row. `wilayah_areas_owner_write` admits writes only for the table owner (the migration role running the import); INSERT/UPDATE/DELETE by the runtime role fail `42501`.
- **No authority.** A wilayah row never carries, implies or substitutes for a Mengantar area id. `contact_addresses`, `shipment_drafts` and `destination_area_verified_at` are written only from a provider option validated by `validateMengantarDestinationAreaSelection`, exactly as before. Kode pos is upstream help text; the provider `ZIP_CODE` stays the stored label's ZIP. No wilayah code or kode pos is stored on a contact address (owner decision 2026-09-26; revisit for RTS-by-area reporting).
- **Source and refresh.** `data/wilayah/` vendors `cahyadsn/wilayah` `db/wilayah.sql` (commit `0d1237a5eef926629c69d287cf2282006144f4fa`; README: Kepmendagri 300.2.2-2430/2025, file header still cites 2138) and `cahyadsn/wilayah_kodepos` `json/wilayah_kodepos.min.json` (commit `ba8497156c5cc9bcbfc527f7b8875d403eda2354`, aligned to 2138/2025, completeness flagged unverified upstream) as gzip TSV with both MIT licences and `SOURCE.json` (upstream and vendored SHA-256, counts). Published counts: 38 provinsi, 514 kab/kota, 7,285 kecamatan, 83,762 kelurahan/desa (8,496 kelurahan + 75,266 desa); all 83,762 carry a kode pos. `npm run wilayah:import` verifies checksums and counts, validates every row (unique codes, parents present, kind by code, name bounds, kode pos format and target), then replaces the rows in one transaction and asserts row count and an md5 content fingerprint before COMMIT; a re-run changes nothing. Refresh = `node scripts/wilayah-vendor.mjs <wilayah checkout> <kodepos checkout> "<decree>"` on new pinned checkouts, review the diff, then the import (spec 15). Nothing tenant-owned references a code, so a refresh cannot break a stored address.
- **Search.** `searchWilayahAreas` (`src/db/wilayah-repository.ts`): every query word must start a word of the row; order = exact kode pos, the row's own name equal to / starting with the query, the query naming the row plus more words, rows inside a matching kecamatan, the rest; kecamatan before kelurahan/desa; limit 20. A query of only "kab"/"kota" is refused (it matches most of the table).
- **Measured (full import, dev DB 55461, runtime role).** 91,047 rows; first load: heap 24.5 MB, trigram index 14.1 MB, 44.4 MB total. EXPLAIN ANALYZE, median of 5 (planning + execution): named kecamatan/kelurahan/kode pos queries 2.0–9.0 ms (e.g. `coblong` 3.4, `dago bandung` 5.0, `40135` 2.4, `kab bekasi` 7.2); bare province words ≤ 36 ms median (`jawa` 35.6, max 39.7). Bitmap index scan on the trigram index in every case.
- **Evidence.** `tests/wilayah-t245.integration.test.ts` (validation refusals, vendored checksum refusal, idempotent one-transaction load with rollback, runtime SELECT-only, ranking, Kab./Kota disambiguation, shared kecamatan names, kode pos lookup, resolver strictness, authority unchanged); `scripts/verify-migration-upgrade.mjs` 0067 probes.

## DATA-23 — Audit rows about a gerai carry its tenant (T-259, D-35, migration 0069)
- Owner: Engineering owner
- Status: Built 2026-09-27 (dev and test databases).

- **Invariant.** Every `audit_events` row whose target is a gerai, a membership or an outlet stores that gerai in `tenant_id`, taken from server-side context (the shipment's own tenant, `app.tenant_id` of an authorized member, the verified lifecycle target), never from client input. `tenant_id` may be NULL only for a `PLATFORM` target (Info terbaru, the global monitoring view) or a `DENIED` `TENANT_CREATED`/`TENANT_SUSPENDED`/`TENANT_REACTIVATED`/`TENANT_ARCHIVED` (0075) attempt whose gerai was never verified (unauthenticated caller, malformed or unknown id).
- **Writers (inventory 2026-09-27).** Application: `tenant-lifecycle.ts` `appendAudit` (tenant set on SUCCESS and on DENIED with a found target), `member-governance-repository.ts` `appendAudit` (`context.tenantId`), `managed-secret-repository.ts` (two, `context.tenantId`), `outlet-readiness-repository.ts` (`context.tenantId`), `platform-context.ts` monitoring view (tenant for tenant scope, NULL + `PLATFORM` for global). SQL functions (latest definitions): `allocate_shipment_reference` (0069), `set_tenant_shipment_prefix` (0051), `unlock_tenant_shipment_prefix` (0040), `register_tenant_self_service` (0052), `review_tenant_registration` (0053), `set_tenant_contact_whatsapp` (0058) — all store the tenant; `save_platform_announcement`/`unpublish_platform_announcement` (0066) are platform-wide. The only defect was the implicit prefix lock in `allocate_shipment_reference` (0040), which stored NULL.
- **Fix forward only.** 0069 re-creates `allocate_shipment_reference()` with `tenant_id = NEW.tenant_id` (owner and the 0040 REVOKEs kept; the trigger still points at it). No existing audit row is read, updated or deleted; implicit locks recorded before 0069 keep `tenant_id` NULL. The row now pins its tenant through the existing `ON DELETE RESTRICT` FK like every other tenant audit row; the application never deletes tenants, test cleanups delete the tenant's audit rows first.
- **Guard.** `CHECK audit_events_tenant_recorded (tenant_id IS NOT NULL OR target_type = 'PLATFORM' OR (outcome = 'DENIED' AND action IN ('TENANT_CREATED','TENANT_SUSPENDED','TENANT_REACTIVATED','TENANT_ARCHIVED'))) NOT VALID` (0075 re-adds it with the archive action, still NOT VALID). Fail closed: a future action is tenant-scoped unless it targets the platform. A CHECK binds every role, including the migration owner and SECURITY DEFINER functions that RLS does not restrict; `NOT VALID` skips the pre-0069 rows (`convalidated = false`, never to be validated) and PostgreSQL still checks every new INSERT. Unlike DATA-10's prefix rule, the NOT VALID caveat on later UPDATEs does not bite: audit rows are never updated (no UPDATE grant). `pg_dump` restores NOT VALID checks after the data. No grant, policy or RLS changed.
- **Presentation.** `/platform/audit` and the Ringkasan feed show "Platform" for a tenantless `PLATFORM` row and "Gerai tidak tercatat" for any other tenantless row (`auditTenantFallbackLabel`, spec 10 "Audit rows", spec 17, spec 18); the platform view already exposes `target_type`.
- **Evidence.** `tests/audit-tenant-recorded.integration.test.ts` (constraint NOT VALID; every action × gerai target refused without a tenant and accepted with one, as the owner; platform and refused-lifecycle rows accepted; a legacy tenantless row survives the 0069 statement unchanged and the next one is refused); `tests/shipment-reference-repository.integration.test.ts` (implicit lock stores the tenant, also under a non-superuser, non-BYPASSRLS function owner); `scripts/verify-migration-upgrade.mjs` 0069 probes.

## DATA-24 — Handover to the courier: `shipment_handover_events` (T-267, D-36, migrations 0070–0072)
- Owner: Engineering owner
- Status: Built 2026-09-30 (dev and test databases).

- **Job.** The counter records that printed parcels physically went to the courier — picked up at the gerai (`PICKUP`) or dropped at a courier outlet (`DROP_OFF`) — so "Siap diserahkan" empties and the owner sees which parcels changed hands. It never changes `shipments.status`: Mengantar's pickup scan (`ISSUED → IN_TRANSIT`) is what takes a parcel off the queue.
- **Columns.** `id uuid PK`, `tenant_id uuid NOT NULL`, `shipment_id uuid NOT NULL` (composite FK `(shipment_id, tenant_id) → shipments(id, tenant_id) ON DELETE RESTRICT`), `sequence integer NOT NULL` (1, 2, 3 … per shipment, `UNIQUE (shipment_id, sequence)`), `kind` `HANDED_OVER` | `UNDONE`, `method` `PICKUP` | `DROP_OFF` (HANDED_OVER only), `note text` (HANDED_OVER only, 1–160 characters, trimmed; e.g. the courier's name), `actor_user_id text NOT NULL`, `actor_role` `TENANT_ADMIN` | `OPERATOR`, `created_at timestamptz DEFAULT now()` (server time, shown in WIB). CHECKs `…_sequence_positive`, `…_kind_valid`, `…_actor_role_valid`, `…_shape_valid`. Indexes `(tenant_id, shipment_id, sequence)`, `(tenant_id, created_at)`; `UNIQUE (id, tenant_id)`.
- **Current state.** The shipment's event with the highest `sequence`: `HANDED_OVER` = handed over (its `created_at`, method, note, actor), `UNDONE` or none = not handed over (`handedOverAtSql`, `loadShipmentHandover`). Every read is scoped by the context's `tenant_id` column as well as RLS.
- **Order trigger (every role).** `shipment_handover_events_enforce_order` (BEFORE INSERT, invoker's rights): `sequence = 1 + the shipment's highest`, and kinds alternate — `HANDED_OVER` only when not handed over, `UNDONE` only when handed over (`23514` otherwise). A policy cannot read its own table (`42P17`), hence the trigger.
- **Row-level security (FORCE).** SELECT: `tenant_id = app.tenant_id` and an active membership of the reading user in the ACTIVE gerai. INSERT: the same tenant, `actor_user_id = app.user_id` with that membership's `role = actor_role`, the shipment still `ISSUED`; a `HANDED_OVER` additionally needs the shipment's order `ISSUED` with its `cnote_no` and at least one `PRINTED` print event (the application's eligibility, again at the database). Runtime grants: `SELECT, INSERT` only — no `UPDATE`, no `DELETE` (append-only; `tenant-isolation-posture`).
- **Application rules (`shipment-handover-repository.ts`).** Mark: ≤ 50 of the tenant's own shipment numbers (the print batch cap), shipments locked `FOR UPDATE` in id order in one transaction; eligible = `ISSUED`, order `ISSUED` with `cnote_no`, printed ≥ 1×; already handed over → no-op ("ALREADY", no second event); refused per row: `NOT_FOUND`, `NOT_ISSUED` (no resi / awaiting payment / failed), `NOT_PRINTED`, `PICKED_UP` (Mengantar reported movement or a later state), `ORDER_CANCELLED`. Undo: both roles, only while the shipment is `ISSUED`; nothing to undo → no-op. A concurrent duplicate waits on the lock and then sees the first event.
- **Audit.** One `audit_events` row per mark and per undo: `SHIPMENT_HANDOVER_RECORDED` / `SHIPMENT_HANDOVER_UNDONE`, target type `SHIPMENT` (new), `target_id` = shipment id, `tenant_id` = the gerai (DATA-23), metadata `{ eventId, sequence[, method, hasNote] }` — never the note. Restrictive policy `audit_events_shipment_handover_guard`: only a gerai member of the context tenant, for an existing event of the same tenant, shipment, actor and kind (since 0071 checked by the SECURITY DEFINER boolean `shipment_handover_audit_event_matches`: the 0070 policy read the table directly, so every other SECURITY DEFINER audit writer owned by a non-superuser failed with `permission denied for table shipment_handover_events` — caught by `shipment-reference-repository` and `tenant-registration`. T-268, 0072: the function answers only for the context tenant (`app.tenant_id`) — its owner bypasses RLS, so the table's FORCE RLS does not scope it — and EXECUTE is the runtime role's only (0071 had granted PUBLIC); every role that appends an audit row needs EXECUTE, as the migration owner of the definer writers has by ownership); partial unique index `audit_events_shipment_handover_event_key` on `metadata->>'eventId'` for these actions (one row per event).
- **Derived metrics (spec 19).** LBL-PRINTED (printed, no current handover), LBL-HANDED-OVER, LBL-HANDED-OVER-TODAY, QUE-HANDOVER-OVERDUE (handed over ≥ 24 h, still `ISSUED`, inside QUE-ATTENTION).
- **Label.** The 10 × 15 sender stub prints "Diserahkan <WIB time>" only while a handover is recorded (`PrintableLabel.handedOverAt`); none recorded or undone → no row (T-265).
- **Evidence.** `tests/shipment-handover-t267.integration.test.ts` (grants, FORCE RLS, cross-tenant read/write refused, forged actor/role, order trigger, shape CHECK, unprinted refused at the database, audit guard + one row per event, eligibility matrix, idempotency, concurrency, undo rules, counts, 24 h rule); `tests/handover-render-t267.integration.test.ts`; `scripts/verify-migration-upgrade.mjs` (0070 probes).

## DATA-25 — Super Admin two-factor and session revocation (T-286, migration 0073)
- **`two_factors`** (Better Auth `twoFactor` plugin, model `twoFactor`): `id` text PK, `secret` and `backup_codes` (text, encrypted by Better Auth with the auth secret), `user_id` → `users.id` ON DELETE CASCADE with UNIQUE `two_factors_user_id_unique` (one factor per user), `verified` (false between enrollment and the first valid code), `failed_verification_count`, `locked_until`. No RLS, runtime SELECT/INSERT/UPDATE/DELETE, like the other Better Auth tables: the adapter reads it before any tenant context exists.
- **`users.two_factor_enabled`** boolean NOT NULL DEFAULT false; runtime `UPDATE (two_factor_enabled)`. True only after a Super Admin proved one code; `resolvePlatformAccess` requires it (SEC-9).
- **`revoke_suspended_tenant_sessions(target uuid) → integer`**, SECURITY DEFINER, `search_path` pinned, EXECUTE for `geraicuan_app` only: requires an ACTIVE `SUPER_ADMIN` in `app.user_id` (else 42501) and `tenants.status = 'SUSPENDED'` — since 0075 also `'ARCHIVED'` (DATA-27) — (else 55000), then deletes the `sessions` of every user with a membership in the store. Owner-bound policy `memberships_session_revocation_read` lets a non-superuser owner read the memberships (same pattern as 0051/0053).
- **Lock-light (MIG-1).** The column has a constant default (no table rewrite); the table is new, so its index and foreign key need no scan.
- **Evidence.** `tests/auth-hardening-t286.integration.test.ts`.

## DATA-26 — Shipment cancelled on Mengantar: `SHIPMENT_CANCELLED` (T-281, D-42, migration 0074)
- Owner: Engineering owner
- Status: Built 2026-10-07 (test database). No live Mengantar call.

- **State.** A confirmed `DELETE /order` (DATA-13 "Delete order") moves `shipments.status` to `CANCELLED` (`recordShipmentCancelled`, `src/db/shipment-cancellation-repository.ts`): the shipment is locked `FOR UPDATE`, its status re-read and moved only along `ALLOWED_TRANSITIONS` (ISSUED, AWAITING_UPSTREAM_PAYMENT, and — if a pull moved it meanwhile — IN_TRANSIT/PROBLEM → CANCELLED); already CANCELLED (a pull or the webhook got there first) writes no status; T-290: the confirmed deletion is still audited once there when a provider observation APPLIED the CANCELLED (none means the app recorded it earlier, already audited), and the reversal runs again (idempotent). `provider_order_snapshots` is not changed (a pull-observed CANCELLED leaves it too), so `cnote_no` stays the provider's AWB of record. Existing grants cover it (`UPDATE (status, updated_at)` on `shipments`, 0035).
- **Ledger reversal (T-290, D-42).** The same transaction reverses the shipment's issuance entries with append-only `ADJUSTMENT`s (`appendLedgerReversalsForCancelledShipments`, "Cancellation reversal" under the ledger section above); a status pull that applies CANCELLED does the same. Reports already count CANCELLED as Gagal and owner money excludes it; an issued invoice stays and reads Dibatalkan (T-238).
- **Audit.** One `audit_events` row in the same transaction: `SHIPMENT_CANCELLED`, actor role `TENANT_MEMBER`, target `SHIPMENT` = shipment id, `tenant_id` = the gerai (DATA-23), metadata `{ courier, fromStatus }` — no recipient data, no provider message. `audit_events_action_valid` gains the action (re-added `NOT VALID`, then `VALIDATE`, MIG-1). Restrictive `audit_events_shipment_cancelled_guard`: outcome SUCCESS, `from_status`/`to_status` NULL, tenant = `app.tenant_id`, and SECURITY DEFINER `shipment_cancel_audit_allowed(tenant, target, actor)` (search_path pinned, EXECUTE for `geraicuan_app` only, answers only for `app.tenant_id` and `app.user_id`): the actor is an ACTIVE `TENANT_ADMIN` of the ACTIVE gerai and the shipment is that gerai's and already CANCELLED. The runtime role cannot append it for another gerai, as an Operator or for a live shipment. One row per shipment follows from the lock, the per-account serialization and the CANCELLED re-check (with T-290's APPLIED-observation rule for a provider-first cancel), not from a unique index (a new `audit_events` index would need `CREATE INDEX CONCURRENTLY`, MIG-1).
- **Evidence.** `tests/shipment-cancel-t281.integration.test.ts`; the non-superuser definer owners in `shipment-reference-repository` and `tenant-registration` get EXECUTE on the new lookup like 0072's.

## DATA-27 — Archive a gerai: `TENANT_ARCHIVED` (T-279, migration 0075)
- Owner: Engineering owner
- Status: Built 2026-10-07 (test database).

- **State.** `executeTenantLifecycle(…, "archive", …)` (`src/db/tenant-lifecycle.ts`) moves `tenants.status` ACTIVE or SUSPENDED → `ARCHIVED` in the platform context: the tenant row is locked `FOR UPDATE`, the typed name (trimmed) must equal `tenants.name` and is required, PROVISIONING (registration review only, DATA-20 trigger) and ARCHIVED are refused. `ARCHIVED` is terminal: no lifecycle transition leaves it (suspend needs ACTIVE, reactivate needs SUSPENDED) and the UI offers no unarchive. Rows of the gerai are kept; nothing is deleted except sessions.
- **Sessions.** In the same transaction `revoke_suspended_tenant_sessions` (DATA-25, widened by 0075 to SUSPENDED or ARCHIVED) deletes the sessions of every member. The CMS principal, tenant context and session-create hook admit only ACTIVE/PROVISIONING gerai, so a member of an archived gerai cannot sign in, recover a password or open any tenant scope.
- **Audit.** One `TENANT_ARCHIVED` row (actor `SUPER_ADMIN`, target `TENANT` = gerai, `from_status` ACTIVE/SUSPENDED, `to_status` ARCHIVED, metadata `{ attemptId, fingerprint }`); refusals write a DENIED row like the other lifecycle actions. `audit_events_action_valid` gains the action (NOT VALID + VALIDATE, MIG-1); `audit_events_tenant_recorded` is re-added NOT VALID with it; the attempt-receipt read policy includes it. Restrictive `audit_events_tenant_archived_guard`: a success needs the platform context, `SUPER_ADMIN`, the gerai already ARCHIVED, `from_status` ACTIVE/SUSPENDED and an attempt receipt; otherwise only the two DENIED shapes 0024 allows. The 0024 unique receipt index is not widened (an `audit_events` index rebuild needs CONCURRENTLY, MIG-1); one receipt per attempt follows from the per-attempt advisory lock.
- **Evidence.** `tests/platform-tenant-lifecycle.integration.test.ts` (roles, typed name, status refusals, success from ACTIVE and SUSPENDED, replay, forged rows), `tests/auth-hardening-t286.integration.test.ts` (sessions, sign-in and tenant scope after archive), `tests/cms-auth.integration.test.ts`, `tests/platform-tenant-actions.integration.test.ts`.
