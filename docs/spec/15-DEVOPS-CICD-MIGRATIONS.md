# Delivery and Migration Plan: GeraiCUAN

- Status: Draft
- Deployment target: [TBD owner=Engineering owner; due=before repository initialization]

## DEL-1 — Release gates
- Owner: Engineering owner

CI must run type checks, unit/integration tests, tenant-isolation tests, sanitized Mengantar contract tests, and migration checks. Production deployment, live Mengantar order creation, and credential configuration need explicit approval and separate evidence.

## MIG-1 — Database changes
- Owner: Engineering owner

Use versioned Drizzle/PostgreSQL migrations. Apply additive schema first, backfill separately, then enforce non-null/unique/RLS constraints. Test empty-database and representative fixture upgrades. A failed migration uses a documented forward fix or verified rollback; never delete tenant shipment records as rollback.

## Environments
Use isolated local/test/staging/production databases and Mengantar credentials. Sandbox verification is limited to a documented non-COD estimate until a separate approval allows order creation. Secrets live outside repository and CI output.

The migration role uses `DATABASE_URL`; the Next.js runtime uses a distinct
`APP_DATABASE_URL` login that inherits `geraicuan_app`. It must not be a
superuser, a `BYPASSRLS` role, or a table owner. Login credentials remain
environment secrets; the migration provisions only the non-login grant role.

PR-44 (migration 0040) adds SECURITY DEFINER numbering functions owned by the migration role. They do not require that role to be a superuser or `BYPASSRLS`: `shipment-reference-repository.integration.test.ts` re-owns them to a NOSUPERUSER NOBYPASSRLS role and exercises every path. That owner needs what a table owner already has — SELECT on users/memberships/tenants/outlets/platform_roles, SELECT/INSERT/UPDATE on `tenant_shipment_counters`, UPDATE(`public_reference`) and SELECT on shipments, INSERT on audit_events, and EXECUTE on policy helper functions such as `tenant_member_governance_authorized`.
