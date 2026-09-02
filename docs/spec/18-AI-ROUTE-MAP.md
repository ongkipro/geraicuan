# AI Route Map & Code Navigation

This document provides a comprehensive map of the Next.js App Router structure and critical API endpoints for GeraiCUAN. It is intended strictly for AI agents and developer reference. It is NOT exposed to the public frontend.

## 1. Public & Auth Boundaries (Unauthenticated)
- `/` (`src/app/page.tsx`) -> Landing Page
- `/login/tenant` (`src/app/login/tenant/page.tsx`) -> Tenant / Outlet owner login
- `/login/super-admin` (`src/app/login/super-admin/page.tsx`) -> Super Admin platform login
- `/api/auth/[...all]` (`src/app/api/auth/[...all]/route.ts`) -> Better Auth endpoint

## 2. Tenant CMS (`/app/...`)
Requires active Tenant membership and valid session.
- `/app` (`src/app/app/page.tsx`) -> Tenant Dashboard / Ringkasan
- `/app/analitik` (`src/app/app/analitik/page.tsx`) -> Analytics & Metrics
  - `/app/analitik/export.csv` (`src/app/app/analitik/export.csv/route.ts`) -> CSV Export for Finance/Analytics
- `/app/anggota` (`src/app/app/anggota/page.tsx`) -> Member Governance & Team Management
- `/app/impor` (`src/app/app/impor/page.tsx`) -> Bulk Shipment Intake
  - `/app/impor/template.csv` (`src/app/app/impor/template.csv/route.ts`) -> CSV Template Download
- `/app/keuangan` (`src/app/app/keuangan/page.tsx`) -> Finance, COD, Billing
- `/app/kontak` (`src/app/app/kontak/page.tsx`) -> Address Book / Contacts List
  - `/app/kontak/baru` (`src/app/app/kontak/baru/page.tsx`) -> Create New Contact
  - `/app/kontak/[contactId]` (`src/app/app/kontak/[contactId]/page.tsx`) -> Contact Detail & Edit
- `/app/label` (`src/app/app/label/page.tsx`) -> Label Printing Scope
  - `/app/label/[shipmentId]` (`src/app/app/label/[shipmentId]/page.tsx`) -> Print View for Single Shipment
- `/app/pengaturan` (`src/app/app/pengaturan/page.tsx`) -> Outlet Settings & Provider Credentials
- `/app/pengiriman` (`src/app/app/pengiriman/page.tsx`) -> Shipment Queue
  - `/app/pengiriman/baru` (`src/app/app/pengiriman/baru/page.tsx`) -> Draft New Shipment
  - `/app/pengiriman/[shipmentId]` (`src/app/app/pengiriman/[shipmentId]/page.tsx`) -> Shipment Detail & Issue/Recover

## 3. Platform CMS (`/platform/...`)
Requires Super Admin role.
- `/platform` (`src/app/platform/page.tsx`) -> Platform Monitoring & Overview
- `/platform/audit` (`src/app/platform/audit/page.tsx`) -> Security & Activity Audit Logs
- `/platform/tenant` (`src/app/platform/tenant/page.tsx`) -> Global Tenant Directory
  - `/platform/tenant/[tenantId]` (`src/app/platform/tenant/[tenantId]/page.tsx`) -> Tenant Lifecycle Management

## Key Architectural Notes
- **Server-Only Boundaries:** Forms use Server Actions heavily (e.g., `actions.ts` files adjacent to pages).
- **Data Fetching:** Direct database access (`src/db/`) is common in React Server Components (`page.tsx`) protected by `ensureTenantSession()` or `ensurePlatformSession()`.
- **Styling:** Tailwind CSS + shadcn/ui components (`src/components/ui/`).
