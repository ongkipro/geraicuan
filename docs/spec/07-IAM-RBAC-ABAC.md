# IAM and Authorization: GeraiCUAN

- Status: Accepted
- Authentication provider: Better Auth with PostgreSQL persistence and server-side authorization

| ID | Role | Scope | Permitted actions |
|---|---|---|---|
| IAM-1 | `SUPER_ADMIN` | Platform | Sign in through Super Admin Login; provision/suspend/reactivate tenants; monitor aggregate and tenant-filtered operational/financial health, usage, provider queues, reconciliation state, and audit events; never read credentials. |
| IAM-2 | `TENANT_ADMIN` | One tenant | Sign in through Tenant Login; manage members, outlets, private Mengantar configuration metadata, and reusable contacts; submit/recover own tenant batches only when the separate provider-mutation release gate is open; view tenant shipment/print history, Analitik, Keuangan ledger, and reconciliation reports. |
| IAM-3 | `OPERATOR` | One tenant | Sign in through Tenant Login; create/import drafts, estimate, submit permitted shipments only when the separate provider-mutation release gate is open, save/reuse contacts, and print/reprint; no Analitik, Keuangan, membership, connection, tenant lifecycle, ledger adjustment, or reconciliation-close access. |

## Policy
Authorization evaluates authenticated principal, role, active tenant, target record tenant ID, tenant status, and action. Deny by default. Super Admin has platform monitoring scope but is not an implicit tenant member: monitoring uses a dedicated server-side read model and returns no credentials or unnecessary shipment-party PII. Support impersonation remains out of scope until a separately approved audited design exists.

Role-filtered navigation is presentation of authorization, not its enforcement. A request for a forbidden destination is rejected or redirected before its protected read model executes; the authorized destination then owns current-location state, so the shell never marks Ringkasan as current while showing a denial for Analitik or Keuangan. Operator direct requests to `/app/analitik`, `/app/keuangan`, `/app/pengaturan`, and `/app/anggota` redirect server-side to `/app`.

Provider mutation has an additional environment release gate. Current fixture evidence does not authorize a real Mengantar order or unpaid-recovery request in production, even for a role permitted by this table. The server and UI fail closed until the explicit TD-14 release decision is recorded.

## Lifecycle
Tenant Admin invites/deactivates tenant members. Prevent removal of the final active Tenant Admin. Tenant suspension revokes operational authorization. Changes to roles, outlet connection configuration, and tenant state write audit events.
