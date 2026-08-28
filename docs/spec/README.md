# GeraiCUAN Development Pack

> Staged specification for a free multi-tenant Indonesian shipping-label SaaS. It is not implementation or production evidence.

## Product Boundary
- Public surface: sales page plus Tenant Login and Super Admin Login.
- Operational surface: authenticated CMS Admin only.
- Core service: tenant-scoped shipment creation, Mengantar order issuance, provider AWB labels, analytics, and operational reconciliation.
- Out of scope: subscriptions/billing, inventory, custom domains, custom courier pricing, statutory accounting, tax filing, and a public developer API.

## Read Order
1. `02-PRD.md` — requirements, decisions, and evidence.
2. `PLAN.md` — build order, delivery flow, visual/UX boundary.
3. `03-TECHNICAL-DESIGN.md` — provider, auth, finance, and UML flow.
4. `04-SYSTEM-ARCHITECTURE.md` — trust boundaries and containers.
5. `05-DATA-MODEL.md` — entities, money invariants, ERD.
6. `06-TENANT-ISOLATION.md`, `07-IAM-RBAC-ABAC.md`, `12-SECURITY-ARCHITECTURE.md` — isolation and controls.
7. `10-DESIGN-SYSTEM-WHITELABEL.md` — visual direction and required screens.
8. `13-COMPLIANCE-PRIVACY.md`, `15-DEVOPS-CICD-MIGRATIONS.md`, `16-OBSERVABILITY-RATE-LIMITING.md` — operations controls.
9. `TASKS.md` — canonical implementation queue.

## Evidence Status
- Mengantar non-mutating address, account estimate, and performance probes returned HTTP 200 on 2026-08-28.
- The observed estimate/performance response did not expose insurance fields; GeraiCUAN must not invent an insurance fee.
- No repository, migration, UI, runtime, or production evidence exists yet.

## Promotion Gate
After explicit development authorization, promote with `project-init --from-docs ~/Documents/work/prd/geraicuan/ --stack <selected-profile>`. The repository copy then becomes canonical.
