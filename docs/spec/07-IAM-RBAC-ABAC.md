# IAM and Authorization: GeraiCUAN

- Status: Draft
- Authentication provider: [TBD owner=Engineering owner; due=before implementation]

| ID | Role | Scope | Permitted actions |
|---|---|---|---|
| IAM-1 | `SUPER_ADMIN` | Platform | Sign in through Super Admin Login; provision/suspend/reactivate tenants; monitor aggregate and tenant-filtered operational/financial health, usage, provider queues, reconciliation state, and audit events; never read credentials. |
| IAM-2 | `TENANT_ADMIN` | One tenant | Sign in through Tenant Login; manage members, outlets, private Mengantar configuration metadata, and reusable contacts; submit/recover own tenant batches; view tenant shipment/print history, analytics, ledger, and reconciliation reports. |
| IAM-3 | `OPERATOR` | One tenant | Sign in through Tenant Login; create/import drafts, estimate, submit permitted shipments, save/reuse contacts, print/reprint; no membership, connection, tenant lifecycle, ledger adjustment, or reconciliation-close changes. |

## Policy
Authorization evaluates authenticated principal, role, active tenant, target record tenant ID, tenant status, and action. Deny by default. Super Admin has platform monitoring scope but is not an implicit tenant member: monitoring uses a dedicated server-side read model and returns no credentials or unnecessary shipment-party PII. Support impersonation remains out of scope until a separately approved audited design exists.

## Lifecycle
Tenant Admin invites/deactivates tenant members. Prevent removal of the final active Tenant Admin. Tenant suspension revokes operational authorization. Changes to roles, outlet connection configuration, and tenant state write audit events.
