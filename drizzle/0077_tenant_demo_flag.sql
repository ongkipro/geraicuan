-- T-293: a demo gerai never makes a mutating or account-wide Mengantar call (order, cancel,
-- pay-unpaid, reconciliation, status pull); assertNotDemoTenant (src/lib/mengantar-demo-tenant.ts)
-- refuses them in mengantar-live-transport.ts and mengantar-status-pull.ts, before any request.
-- No app path sets it; the local seed does, as the migration role. geraicuan_app keeps the
-- column-scoped UPDATE (name, status, updated_at) of 0035, so the runtime cannot clear it.
--
-- MIG-1 lock-light: a constant default adds the column without a table rewrite.
ALTER TABLE "tenants" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;