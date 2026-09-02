# Context Record

> This record captures engineering context and candidate applicability. It is not a legal, tax, privacy, security, audit, or certification conclusion.

## Document Control

| Field | Value |
|---|---|
| Owner | Specification owner |
| Status | Repository context verified in part; legal and deployment unknowns remain open |
| Reviewed | 2026-08-31 |
| Depth profile | platform |
| Decision approvers | [TBD owner=Product and architecture approvers; due=before approval] |

## Context Facts

| ID | Dimension | Statement | Status | Confidence | Evidence | Owner | Recheck trigger |
|---|---|---|---|---|---|---|---|
| CTX-1 | Product surface | Public sales/login entry points plus authenticated tenant and platform CMS surfaces are implemented in this repository. | Observed | High | `src/app`; PR-13, PR-14, PR-17 | Specification owner | When route or host boundaries change |
| CTX-2 | Operating entities | GeraiCUAN is designed as a platform operator serving isolated tenant businesses and their outlets; the legal operating entities remain unrecorded. | Observed with legal unknown | Medium | PR-1, PR-2; `06-TENANT-ISOLATION.md` | Specification owner | Before production deployment or contracting |
| CTX-3 | Target markets | Product and locale contracts target Indonesian shipping outlets; production market authorization remains unrecorded. | Observed with release unknown | Medium | PRD actors/scope; `10-DESIGN-SYSTEM-WHITELABEL.md` | Specification owner | Before production launch or market expansion |
| CTX-4 | Users and data subjects | CMS users are Super Admin, Tenant Admin, and Operator; shipment senders and recipients are data subjects but not CMS users. | Observed | High | PRD Actors; IAM-1..IAM-3 | Specification owner | When roles or data-subject categories change |
| CTX-5 | Storage, processing, backup, and support locations | Unknown; repository evidence not recorded. | Unknown | Low | Not yet recorded | Specification owner | Before specification approval |
| CTX-6 | Processors and subprocessors | Unknown; repository evidence not recorded. | Unknown | Low | Not yet recorded | Specification owner | Before specification approval |
| CTX-7 | Sector and age groups | Unknown; repository evidence not recorded. | Unknown | Low | Not yet recorded | Specification owner | Before specification approval |
| CTX-8 | Commerce, payment, and tax roles | GeraiCUAN records an operational ledger; COD principal is a liability, service-fee revenue and VAT payable are separate, and statutory accounting/tax filing is out of scope. Legal and tax-role determinations remain unknown. | Observed product boundary | High | PR-16, PR-20; TD-10 | Specification owner | Before production financial operations or tax claims |
| CTX-9 | AI provider or deployer role | No AI feature or model-provider role exists in the accepted product scope. | Not applicable | High | `02-PRD.md` scope | Specification owner | If an AI capability is proposed |
| CTX-10 | Locales and regional behavior | Authenticated UI is `id-ID`, currency presentation is IDR, and operational time defaults to `Asia/Jakarta` until an accepted outlet IANA timezone applies. | Observed | High | NFR-4; TD-9, TD-12; UX-7..UX-9 | Specification owner | When locale, currency, or timezone support changes |
| CTX-11 | Accessibility commitments | CMS contracts require keyboard operation, visible focus, semantic chart tables, non-colour cues, responsive local table scrolling, and no document overflow at 390px, 768px, and 1280px. | Observed | High | NFR-4, NFR-5; UX-3, UX-6, UX-7 | Specification owner | When UI technology or accessibility target changes |
| CTX-12 | Customer and contractual commitments | Unknown; repository evidence not recorded. | Unknown | Low | Not yet recorded | Specification owner | Before specification approval |
| CTX-13 | Capability decision | The context input activated capability 'persistence'; repository evidence must be confirmed before approval. | Decision | Medium | Context-file capabilities.persistence | Specification owner | When repository evidence or operating scope changes |
| CTX-14 | Capability decision | The context input activated capability 'schema-migration'; repository evidence must be confirmed before approval. | Decision | Medium | Context-file capabilities.schema-migration | Specification owner | When repository evidence or operating scope changes |
| CTX-15 | Capability decision | The context input activated capability 'maintained-deployment'; repository evidence must be confirmed before approval. | Decision | Medium | Context-file capabilities.maintained-deployment | Specification owner | When repository evidence or operating scope changes |
| CTX-16 | Explicit specification override | The operator explicitly activated 'multi-tenant'; underlying applicability still requires repository review. | Decision | Medium | CLI --overlay multi-tenant | Specification owner | When repository evidence or operating scope changes |
| CTX-17 | Explicit specification override | The operator explicitly activated 'identity'; underlying applicability still requires repository review. | Decision | Medium | CLI --overlay identity | Specification owner | When repository evidence or operating scope changes |
| CTX-18 | Explicit specification override | The operator explicitly activated 'personal-data'; underlying applicability still requires repository review. | Decision | Medium | CLI --overlay personal-data | Specification owner | When repository evidence or operating scope changes |
| CTX-19 | Explicit specification override | The operator explicitly activated 'localized-ui'; underlying applicability still requires repository review. | Decision | Medium | CLI --overlay localized-ui | Specification owner | When repository evidence or operating scope changes |
| CTX-20 | Candidate jurisdiction | The operator requested engineering assessment for Indonesia. | Decision | Medium | CLI --jurisdiction ID | Specification owner | When repository evidence or operating scope changes |

## Overlay and Capability Decisions

| ID | Capability/overlay | Status | Trigger facts | Selected artifacts | Owner | Reason | Review gate |
|---|---|---|---|---|---|---|---|
| OVR-1 | identity | Active | CTX-17 | iam, security | Specification owner | Explicit operator override | Confirm against repository evidence before approval |
| OVR-2 | localized-ui | Active | CTX-10, CTX-19 | LOC-1, UX-3, UX-7 | Specification owner | Indonesian operational UI and regional behavior are repository requirements | Re-run when supported locales change |
| OVR-3 | maintained-deployment | Active | CTX-15 | delivery | Specification owner | Context-file decision | When the triggering facts change |
| OVR-4 | multi-tenant | Active | CTX-16 | multi-tenant, observability, security | Specification owner | Explicit operator override | Confirm against repository evidence before approval |
| OVR-5 | persistence | Active | CTX-13 | data-model | Specification owner | Context-file decision | When the triggering facts change |
| OVR-6 | personal-data | Active | CTX-18 | privacy, security | Specification owner | Explicit operator override | Confirm against repository evidence before approval |
| OVR-7 | schema-migration | Active | CTX-14 | data-model, delivery | Specification owner | Context-file decision | When the triggering facts change |

## Artifact Selection

| Artifact | Decision | Reason | Owner | Review gate |
|---|---|---|---|---|
| brd | Not applicable for current evidence | No active trigger | Specification owner | Activate when the document-map trigger is observed |
| prd | Selected | required baseline for platform profile | Specification owner | Re-run selection when context changes |
| technical-design | Selected | platform profile implies material component boundaries | Specification owner | Re-run selection when context changes |
| architecture | Selected | platform profile implies multiple runtime or trust boundaries | Specification owner | Re-run selection when context changes |
| data-model | Selected | active capability/overlay: persistence; active capability/overlay: schema-migration | Specification owner | Re-run selection when context changes |
| multi-tenant | Selected | active capability/overlay: multi-tenant | Specification owner | Re-run selection when context changes |
| iam | Selected | active capability/overlay: identity | Specification owner | Re-run selection when context changes |
| custom-domain | Not applicable for current evidence | No active trigger | Specification owner | Activate when the document-map trigger is observed |
| public-api | Not applicable for current evidence | No active trigger | Specification owner | Activate when the document-map trigger is observed |
| localized-ui | Selected | active capability/overlay: localized-ui | Specification owner | Re-run selection when context changes |
| commerce | Not applicable for current evidence | No active trigger | Specification owner | Activate when the document-map trigger is observed |
| security | Selected | active capability/overlay: multi-tenant; active capability/overlay: identity; active capability/overlay: personal-data; candidate jurisdiction requires applicability and control review | Specification owner | Re-run selection when context changes |
| privacy | Selected | active capability/overlay: personal-data; candidate jurisdiction requires applicability and control review | Specification owner | Re-run selection when context changes |
| high-availability | Not applicable for current evidence | No active trigger | Specification owner | Activate when the document-map trigger is observed |
| delivery | Selected | active capability/overlay: schema-migration; active capability/overlay: maintained-deployment | Specification owner | Re-run selection when context changes |
| observability | Selected | active capability/overlay: multi-tenant | Specification owner | Re-run selection when context changes |

## Jurisdiction Decisions

| ID | Territory | Trigger facts | Authority/source | Source status | Publication date | Effective date | Retrieved date | Decision | Qualified owner | Engineering impact | Next review |
|---|---|---|---|---|---|---|---|---|---|---|---|
| JUR-ID-1 | Indonesia | CTX-18, CTX-20; GeraiCUAN processes names, phones, and addresses of Indonesian senders and recipients for tenant shipment creation | Badan Pemeriksa Keuangan — official legislation database: https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022 | unknown | Unknown | Unknown | 2026-08-28 | Unknown | [TBD owner=privacy/legal owner; due=before production approval] | PRIV-1, SEC-1, SEC-2, DATA-1 | Before production deployment, qualified applicability approval, a source-status change, or a material processing/location change |

## Sector Decisions

| ID | Sector | Trigger facts | Decision | Qualified owner | Official source/status | Next review |
|---|---|---|---|---|---|---|
| JUR-SECTOR-0 | None selected | None | Unknown | Specification owner | None; status=unknown | When sector or age group changes |

## Cross-Border Transfer Records

| ID | Trigger facts | Exporter role/location | Importer role/location | Data subjects/categories | Purpose | Storage/remote access | Mechanism review | Safeguards | Onward transfers | Retention/deletion | Evidence | Owner | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| XFER-0 | None | Unknown | Unknown | Unknown | Unknown | Unknown | Not assessed | Unknown | Unknown | Unknown | Not recorded | Specification owner | Unknown |

## Locale Contracts

| ID | Locale | Fallback | Regional rules | Accessibility | Test evidence | Owner | Status |
|---|---|---|---|---|---|---|---|
| LOC-0 | Unknown | Unknown | Unknown | Unknown | Not recorded | Specification owner | Unknown |
| LOC-1 | `id-ID` | Technical terms remain English where translation would reduce precision | IDR through `Intl`, `Asia/Jakarta` default, accepted outlet IANA timezone where configured, inclusive-start/exclusive-end date boundaries | Keyboard operation, visible focus, semantic chart tables, non-colour status cues, local table overflow, and responsive checks at 390px/768px/1280px | EVID-LOC-1 | Paduka Ongki | Observed |

## EVID-LOC-1 — Localized UI verification

- Evidence: Authenticated responsive, keyboard, focus, timezone, semantic-chart-table, and zero-document-overflow checks are recorded in repository-owned root `TASKS.md` and `BUILD-LOG.md`.
- Status: Observed on 2026-08-31; production deployment is not implied.

## Approval Gate

- [x] Repository product-surface and implemented runtime facts cited above are verified; production deployment remains outside this check.
- [ ] Unknowns have an owner and a concrete recheck trigger.
- [ ] Active overlays have non-unknown triggering `CTX-*` facts.
- [ ] Jurisdiction and sector candidates have qualified review.
- [ ] Transfer and locale records have downstream requirements and tests.
- [ ] Selected and omitted artifacts have been reviewed.
