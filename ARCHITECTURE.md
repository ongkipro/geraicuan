# Architecture — GeraiCUAN

Updated: 2026-09-26 (v3.1)

GeraiCUAN is a free multi-tenant SaaS for *gerai ekspedisi* (spec 02 §v3.1): create a Mengantar order, print the gerai's own masked label, issue the customer nota. Detailed contracts live in `docs/spec/` (read order in `docs/spec/README.md`); this file is the one-page map.

## Stack (proven by code)

| Layer | Choice | Where |
|---|---|---|
| Web | Next.js 16 App Router, React 19, TypeScript | `src/app` |
| UI | Tailwind v4 + shadcn/ui (Radix) | `src/components/ui` (registry), `src/components/app` (shell, list, badges) |
| Data | PostgreSQL 16, Drizzle ORM + SQL migrations, forced RLS | `src/db/schema.ts`, `drizzle/*.sql` |
| Auth | Better Auth (email + password, email verification) | `src/lib/auth*`, `src/app/login`, `src/app/daftar` |
| Provider | Mengantar Public API, server-only | `src/lib/mengantar-*.ts` |
| Tests | Vitest integration suite on a disposable Postgres | `tests/*.integration.test.ts`, `pnpm test:integration` |
| Deploy target | Coolify container (not production-proven) | `RELEASE.md`, spec 15 |

## Surfaces

- **Public:** `/` sales page, `/login/tenant`, `/login/super-admin`, `/daftar`, password reset, email verification.
- **Tenant CMS** `/app/**`: Dasbor, Buat kiriman, Histori, Retur, Cetak resi + label, Invoice, Kontak, Cek resi, Cek tarif, Laporan (admin), Pengaturan and Anggota (admin).
- **Platform CMS** `/platform/**` (Super Admin): Ringkasan, Tenant, Pendaftaran, Audit.
- Route-by-route inventory: `docs/spec/18-SYSTEM-MAP.md`.

## Boundaries

- **Tenant isolation:** every tenant table carries `tenant_id`; composite FKs forbid cross-tenant links; the runtime role `geraicuan_app` runs under forced RLS with the tenant set per transaction (`src/db/tenant-context.ts`). Spec 06.
- **Mutations:** only server actions (`actions.ts`) and three route handlers; each re-checks scope and role on the server (`requireCmsScope`). UI visibility is never access control. Spec 07.
- **Mengantar:** the credential-bearing URL never leaves the server; a gerai may bring its own API key (encrypted in `managed_secret_payloads`) or use the platform default. `POST /order` is blocked in production until T-153 proves the request contract; the field register with evidence levels is spec 05 DATA-13.
- **Money:** integer rupiah; provider snapshots are never recomputed; ledger and invoices are insert-only (spec 05 DATA-3, DATA-4, DATA-14).

## Core data flow

1. Buat kiriman saves `shipment_drafts` + `shipment_parties` → one estimate snapshot (`shipment_estimate_snapshots/services`).
2. Issuance creates an idempotent `provider_batches` row and `provider_order_snapshots`; the outcome is Resi terbit, Menunggu pembayaran (unpaid recovery) or Perlu rekonsiliasi (unknown submission).
3. Label print writes `print_events`; the sheet masks the Mengantar pickup identity with the gerai's (PR-71).
4. Invoice issuance writes one `shipment_invoices` snapshot per shipment (PR-76).
5. The Tenant Admin status pull appends `provider_order_status_observations` and moves shipments only through allowed transitions.

## Decisions

`DECISIONS.md` (D-rows) and `docs/adr/` (ADR-0001 UI v3 rebuild).

## Verification

`pnpm lint`, `npx tsc --noEmit`, `pnpm test:integration` (disposable DB; reseed the demo afterwards), `pnpm test:migration-upgrade`, and browser screening per spec 10 §11 for visible changes.
