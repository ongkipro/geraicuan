# GeraiCUAN Development Pack

> Canonical repository specification for a free multi-tenant Indonesian shipping-label SaaS. Runtime and release evidence remains owned by root `STATUS.md`, `BUILD-LOG.md`, `OBSERVABILITY.md`, and `RELEASE.md` rather than this pack.

## Product Boundary
- Public surface: sales page plus Tenant Login and Super Admin Login.
- Operational surface: authenticated CMS Admin only.
- Core service: tenant-scoped shipment creation, Mengantar order issuance, provider AWB labels, analytics, and operational reconciliation.
- Out of scope: subscriptions/billing, inventory, custom domains, custom courier pricing, statutory accounting, tax filing, and a public developer API.

## Read Order
1. `02-PRD.md` — requirements, decisions, and evidence.
2. `../../PLAN.md` — build order, delivery flow, visual/UX boundary.
3. `03-TECHNICAL-DESIGN.md` — provider, auth, finance, and UML flow.
4. `04-SYSTEM-ARCHITECTURE.md` — trust boundaries and containers.
5. `05-DATA-MODEL.md` — entities, money invariants, ERD.
6. `06-TENANT-ISOLATION.md`, `07-IAM-RBAC-ABAC.md`, `12-SECURITY-ARCHITECTURE.md` — isolation and controls.
7. `10-DESIGN-SYSTEM-WHITELABEL.md` — visual direction and required screens.
8. `13-COMPLIANCE-PRIVACY.md`, `15-DEVOPS-CICD-MIGRATIONS.md`, `16-OBSERVABILITY-RATE-LIMITING.md` — operations controls.
9. `17-UX-FLOWS-SCREEN-CONTRACTS.md` — operator journeys, information architecture, screen states, and component boundaries.
10. `18-SYSTEM-MAP.md` — route inventory and code navigation map.
11. `19-METRICS-ANALYTICS-CONTRACT.md` — metric definitions, severity rules, chart catalogue, lineage diagrams, and pending metric decisions.
12. `../../TASKS.md` — the sole canonical implementation queue.

## Repository Status Boundary
- Mengantar non-mutating address, account estimate, and performance probes returned HTTP 200 on 2026-08-28.
- Official Mengantar documentation reviewed on 2026-09-01 now owns the accepted account-pickup and general area-search contracts in `03-TECHNICAL-DESIGN.md`; documentation acceptance is not production availability evidence.
- The observed estimate/performance response did not expose insurance fields; GeraiCUAN must not invent an insurance fee.
- Completed dashboard, analytics, credential, and pickup-selector increments are recorded in root `TASKS.md` and `BUILD-LOG.md`. The only open implementation sequence is destination authority and downstream ID/label binding, followed by responsive many-outlet settings completion.
- Local fixture and browser evidence is not production provider-mutation evidence. Production Mengantar issuance and recovery remain blocked until the separate TD-14 release gate is explicitly approved.
- No deployment or production readiness claim is made by this specification pack.

## Authority
This repository copy is canonical. Any retained pre-repository planning snapshot is non-authoritative and must not be used to overwrite these files.
