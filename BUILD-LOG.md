# Build Log — geraicuan

Record only durable implementation changes, validation evidence, and gotchas that the next maintainer needs. Temporary task narration belongs in neither this file nor global memory.

## 2026-08-28 — Development contract initialized

- Added repository-local project context files.
- Bootstrap source state: native generator: create-next-app@latest.
- Selected stack: `Next.js (App Router, TypeScript)`; database: `postgres`; authentication:
  `better-auth`; deployment target: `coolify`.
- Capability selections are not operational claims. Their implementation and
  verification remain future requirement-linked work.

## 2026-08-28 — Bootstrap verification

- Installed generated pnpm dependencies.
- `project-check --full /home/ongki/Projects/geraicuan` passed:
  `pnpm run lint`, `pnpm run build`, and the repository delivery contract.
- This proves the generated Next.js scaffold and project contract only; no
  GeraiCUAN feature, database, auth, Mengantar, or deployment behavior is
  implemented or verified.

## 2026-08-28 — T-2 super-admin tenant lifecycle

- Added platform super-admin roster, tenant lifecycle service, append-only audit
  events, and migrations `0001`–`0002`.
- Lifecycle operations create ACTIVE tenants and atomically suspend/reactivate
  only valid prior states. Anonymous, tenant-scoped, malformed-ID, and failed
  transition requests are denied and audited.
- Database RLS forces app-role audit attribution and platform-role self
  visibility; the runtime rejects superuser and BYPASSRLS connection roles.
- Fresh PostgreSQL 16 migration plus `pnpm test:integration` (7 assertions),
  `pnpm lint`, and `pnpm build` passed.
