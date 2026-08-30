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

## 2026-08-28 — T-15 role-specific CMS authentication

- Added Better Auth 1.7.2 PostgreSQL persistence, database-backed sign-in rate
  limits, public tenant/super-admin login entries, and server-side CMS guards.
- Public registration is disabled. Platform/tenant roles and active
  user/membership/tenant status are re-resolved server-side for every CMS route.
- Production requires declared trusted proxy CIDRs before IP-based rate limiting
  can start; status checks are also enforced by PostgreSQL RLS migration 0006.
- Fresh PostgreSQL 16 migration plus `pnpm test:integration` (10 assertions),
  `pnpm lint`, `pnpm build`, browser auth checks, and independent security
  review passed.

## 2026-08-28 — T-3 Mengantar credential resolution

- Added tenant/outlet-scoped private connection references and default pickup
  metadata. Stored references are deterministically server-derived; plaintext
  credentials never enter PostgreSQL.
- Private managed credentials win over complete platform environment defaults;
  incomplete, non-HTTPS, foreign, or tampered configurations fail closed.
- Fresh PostgreSQL 16 migration plus 13 integration assertions, `pnpm lint`,
  `pnpm build`, and independent security review passed.

## 2026-08-28 — T-16 public sales page

- Replaced the generated placeholder with a static Indonesian GeraiCUAN sales
  page that explains the product and provides tenant/super-admin login entries.
- The page intentionally has no CMS availability lookup, session, database
  access, fetch, form, or operational data path; login availability remains
  owned by the login routes.
- Desktop and mobile browser checks verified the public surface, links, and
  responsive accessibility targets. `pnpm lint` and `pnpm build` passed.

## 2026-08-28 — T-4 individual shipment draft

- Added an additive draft-detail relation and immutable sender/recipient party
  snapshots, preserving pre-existing bare shipment lifecycle rows.
- The Server Action derives tenant/user scope from the authenticated session,
  validates all submission fields before its transaction, verifies the selected
  outlet belongs to the active tenant and is configured, and inserts the
  shipment, detail, and parties atomically under RLS.
- Fresh PostgreSQL 16 migrations, 15 integration assertions, browser validation
  and successful PRG/no-JavaScript submission checks, `pnpm lint`, and
  `pnpm build` passed.

## 2026-08-28 — T-5 bulk shipment intake validation

- Added a bounded server-side CSV parser with an authenticated template download,
  exact Indonesian headers, UTF-8/quoted-field support, 256 KB/100-row limits,
  and PII-safe row errors.
- CSV preview performs no writes. Confirmation revalidates selected hidden rows
  server-side and creates all selected tenant-scoped drafts in one transaction.
  Import attempts are atomically rate-limited by tenant and authenticated actor.
- Fresh PostgreSQL 16 migrations, 20 integration assertions, `pnpm lint`, and
  `pnpm build` passed. The authenticated browser fixture could not be completed,
  so no browser-flow claim is recorded.

## 2026-08-28 — T-13 reusable tenant contact directory

- Added tenant-scoped contacts and reusable multiple addresses with composite
  tenant keys, forced RLS, and active membership checks. Contact changes never
  link to or mutate historical shipment parties.
- Tenant users can create, search, update, and select active sender/recipient
  contacts. Tenant Admins can archive contacts; picker results mask phone
  numbers and omit full addresses until an explicit selection.
- Draft save re-resolves the selected server-scoped contact. It writes its
  current values only when the operator did not manually change the selected
  fields, preserving deliberate edits while preventing stale automatic values.
- Fresh PostgreSQL 16 migration through `0009`, `pnpm test:integration` (22
  assertions), `pnpm lint`, `pnpm build`, authenticated browser workflow, and
  independent security review passed.

## 2026-08-28 — T-11 migration and release rollback validation

- Added an unprivileged pull-request/main CI workflow that provisions isolated
  PostgreSQL databases, verifies the empty migration chain and representative
  pre-release fixture upgrade, then runs migrations, integration tests, lint,
  and build.
- Added a repeatable `pnpm test:migration-upgrade` check. It preserves and
  asserts a representative tenant, outlet, shipment, and immutable party
  records across the newest migration, and verifies the latest contact RLS
  policy exists.
- Documented the append-only migration recovery path: additive forward fixes
  are the default; Git rollback is not database rollback; restore needs an
  approved backup recovery decision.
- Local PostgreSQL 16 verification and independent CI review passed. Hosted CI
  evidence remains pending an authorized commit and push.

## 2026-08-29 — T-6 provider estimates

- Added Mengantar account-estimate retrieval with tenant/actor rate limiting,
  an HTTPS-only bounded adapter, provider `price` mapping, and fail-closed COD
  eligibility when the provider omits or blocks the flag.
- Added immutable tenant-scoped estimate snapshots/services in migration `0010`;
  re-estimates append a new snapshot without mutating prior provider values.
- The approved sandbox non-COD estimate returned HTTP 200; only a sanitized
  contract fixture is retained. No order was created.
- Fresh PostgreSQL 16 migration, 27 integration assertions, lint, build, and
  independent security review passed. Authenticated browser exercise remains
  unavailable without an approved local fixture session.
