# GeraiCUAN Development Pack

> Canonical repository specification for GeraiCUAN, a free multi-tenant SaaS for Indonesian *gerai ekspedisi* (expedition aggregator counters) on Mengantar. Runtime and release evidence remains owned by root `STATUS.md`, `BUILD-LOG.md`, `OBSERVABILITY.md`, and `RELEASE.md` rather than this pack.

## Product Boundary
- Public surface: sales page plus Tenant Login and Super Admin Login.
- Operational surface: authenticated CMS Admin only.
- Three cores (spec 02 §v3.1): **kirim** (Mengantar order + resi), **cetak resi** (gerai label masking the Mengantar airway bill), **invoice** (one immutable nota per issued shipment, not a payment receipt). Tracking, returns, contacts and shipment reports support them.
- Removed in v3 (data kept, pages gone): bulk CSV import, Keuangan, Analitik.
- Out of scope: any charge for using GeraiCUAN (it is free), payment collection, tax invoices, inventory, custom domains, custom courier pricing, statutory accounting, and a public developer API.

## Read Order
1. `02-PRD.md` — requirements, decisions, and evidence.
2. `../../PLAN.md` — build order, delivery flow, visual/UX boundary.
3. `03-TECHNICAL-DESIGN.md` — provider, auth, finance, and UML flow.
4. `04-SYSTEM-ARCHITECTURE.md` — trust boundaries and containers.
5. `05-DATA-MODEL.md` — entities, money invariants, Mengantar field register (DATA-13), invoices (DATA-14).
6. `06-TENANT-ISOLATION.md`, `07-IAM-RBAC-ABAC.md`, `12-SECURITY-ARCHITECTURE.md` — isolation and controls.
7. `10-DESIGN-SYSTEM-WHITELABEL.md` — the single design contract (v3.1; §13 pending Mengantar-look decision, UI rebuilt from zero per `../adr/ADR-0001-ui-v3-rebuild.md`): measured tokens from the owner's HTML reference, shell, anatomy, components, states, screening. Spec 20 (glass) was removed in T-209.
8. `13-COMPLIANCE-PRIVACY.md`, `15-DEVOPS-CICD-MIGRATIONS.md`, `16-OBSERVABILITY-RATE-LIMITING.md` — operations controls.
9. `17-UX-FLOWS-SCREEN-CONTRACTS.md` — operator journeys, information architecture, screen states, and component boundaries.
10. `18-SYSTEM-MAP.md` — page-by-page route inventory and code navigation map (v3 rewrite: T-224).
11. `19-METRICS-ANALYTICS-CONTRACT.md` — metric definitions, severity rules, chart catalogue, lineage diagrams, and pending metric decisions.
12. `../../TASKS.md` — the sole canonical implementation queue.

## Repository Status Boundary
- Mengantar non-mutating address, account estimate, and performance probes returned HTTP 200 on 2026-08-28.
- Official Mengantar documentation reviewed on 2026-09-01 now owns the accepted account-pickup and general area-search contracts in `03-TECHNICAL-DESIGN.md`; documentation acceptance is not production availability evidence.
- The observed estimate/performance response did not expose insurance fields; GeraiCUAN must not invent an insurance fee.
- Open work is Phase 18 (UI v3 screens) and Phase 19 (invoice UI, Mengantar precision, system map, sign-in polish) in root `TASKS.md`.
- Local fixture and browser evidence is not production provider-mutation evidence. Production Mengantar issuance and recovery remain blocked until the separate TD-14 release gate is explicitly approved.
- No deployment or production readiness claim is made by this specification pack.

## Authority
This repository copy is canonical. Any retained pre-repository planning snapshot is non-authoritative and must not be used to overwrite these files.
