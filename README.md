# GeraiCUAN

Tenant shipping operations and Super Admin platform monitoring are implemented with
Next.js App Router, PostgreSQL, Drizzle, and Better Auth.

## Local development

The local database runs in Docker and is bound to `127.0.0.1:55433` only. Its
named volume persists across `docker compose down` / `up` unless explicitly
removed. Do not use this configuration or its local fixture accounts in
production.

```bash
pnpm install

export POSTGRES_PASSWORD='choose-a-local-database-password'
docker compose up -d db

export DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:55433/geraicuan_test"
export APP_DATABASE_URL='postgresql://geraicuan_test_runtime:admin123@127.0.0.1:55433/geraicuan_test'
export DEV_HOST='localhost' # Set to the LAN/Tailscale IP when opening from another device.
export DEV_ORIGIN="http://${DEV_HOST}:3000"
export BETTER_AUTH_URL="$DEV_ORIGIN"
export BETTER_AUTH_TRUSTED_ORIGINS="$DEV_ORIGIN"
export NEXT_ALLOWED_DEV_ORIGINS="$DEV_HOST"
export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
export DEV_LOCAL_PASSWORD='admin123'
export GERAICUAN_ENABLE_DEMO_LOGIN_HINT='1'

pnpm db:migrate
pnpm db:seed-local
pnpm dev
```

Open `$DEV_ORIGIN`. When using a LAN/Tailscale address, set `DEV_HOST` to that
address before starting Next.js; this permits development assets and Better Auth
origin checks for the same explicit host.

### Local fixture accounts

| Role | Email | Password | Expected destination |
| --- | --- | --- | --- |
| Tenant Admin | `tenant@geraicuan.com` | `admin123` | `/app` |
| Operator | `operator@geraicuan.com` | `admin123` | `/app` |
| Super Admin | `super@geraicuan.com` | `admin123` | `/platform` |

`pnpm db:seed-local` only accepts `127.0.0.1` and the database
`geraicuan_test` (or a disposable `geraicuan_<name>_seed`), written as
`postgres://user:password@127.0.0.1:port/database` with no query parameters
(pg lets `?host=`, `?port=` or `?options=` override the URL, so any query is
refused), and it connects with the parsed fields
(`scripts/local-database-target.mjs`). No hostname guard can see through a
tunnel: a `127.0.0.1` port forwarded over SSH to a remote database passes the
check, so never point the seed, least of all `--reset`, at such a port. It refreshes the
fixture users, the runtime role password from `DEV_LOCAL_PASSWORD`, and one
demo dataset, without calling Mengantar or sending mail. It imports
`src/lib/*.ts` directly, so it needs Node.js 22.18+ (type stripping).

| What | Seeded |
| --- | --- |
| Store | **Sekar Batik Nusantara** (ACTIVE, id `70000000-0000-4000-8000-000000000001`), outlet *Gudang Jakarta Barat* with 3 labelled pickup points (default Kebon Jeruk, Tanah Abang, Bekasi) |
| Approval queue (`/platform/pendaftaran`) | *Kopi Senja Nusantara* (PROVISIONING, email verified), *Dapur Sambal Bu Tini* (PROVISIONING, email not verified), *Grosir Aksesoris HP 99* (rejected → ARCHIVED); all `PRIVATE_ONLY`, written by `register_tenant_self_service` and `review_tenant_registration`; owners sign in with the same password |
| Contacts | 23 across Jabodetabek, Bandung, Surabaya, Yogyakarta, Semarang, Malang, Medan, Makassar, Denpasar, Palembang: 5 active + 1 archived senders, 18 active + 2 archived recipients, 3 dual-role; synthetic phones `0812-9000-xxxx` |
| Shipments | 60 over the last ~60 days (Asia/Jakarta), `GC-10000`–`GC-10059` in creation order: 28 delivered, 10 issued (6 printed — one paid through unpaid recovery — and 4 not yet printed), 2 problem, 7 returns, 1 awaiting upstream payment, 2 failed, 1 queued, 1 unknown submission, 4 estimated, 4 drafts; Non-COD 22 / COD 27 / COD Ongkir 11; JNE, SiCepat, J&T, Shopee Express, SAP, AnterAja, ID Express, Lion Parcel, POS |
| Money | COD totals v2 and COD Ongkir v3 from `src/lib/mengantar-cod-fee.ts`; issuance and recovery ledger entries, one manual reversal, 7 settlement pulls (settlement, return-charge and refund lines; delivered/problem/RTS transitions), a matched monthly and a daily reconciliation with one variance |

Two modes:

```bash
pnpm db:seed-local              # replace the seed-owned rows; keep rows you created
pnpm db:seed-local -- --reset   # also delete every tenant and user the seed does not own
```

A plain run deletes and rewrites only the seed's own rows (fixed ids), so it
is idempotent and moves the demo dates forward when re-run on a later day.
`--reset` additionally deletes every other tenant with all its rows (for
example leftover `Rate Limit Tenant` and `T24 Tenant` fixtures), every user
except the three accounts above, every operational row of the demo store
(including shipments you created there), sessions, verifications and rate
limits, then reseeds in the same transaction and prints row counts per tenant
before and after. The demo store's Mengantar connection, if you configured
one, is kept. Back up the database first.

## Running the checks

The integration suite needs a **different** environment from the dev server
above. `tests/auth-session-boundary.integration.test.ts` hardcodes its origin,
and the demo login hint changes rendered output, so reuse of the dev values
produces five failures that look exactly like code defects.

```bash
export DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:55433/geraicuan_test"
export APP_DATABASE_URL='postgresql://geraicuan_test_runtime:admin123@127.0.0.1:55433/geraicuan_test'
export BETTER_AUTH_URL='http://127.0.0.1:3110'
export BETTER_AUTH_TRUSTED_ORIGINS='http://127.0.0.1:3110'
export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
unset GERAICUAN_ENABLE_DEMO_LOGIN_HINT

pnpm tsc --noEmit
pnpm lint
pnpm test:integration
```

**The suite destroys the local demo data.** Several suites tear down with
`TRUNCATE ... tenants, users CASCADE`, which removes the seeded
demo store `Sekar Batik Nusantara` along with everything else. Nothing is corrupted, but
open the browser after a suite run and the CMS looks empty. Re-seed first:

```bash
pnpm db:seed-local
```

### Browser-based UI audit

`pnpm test:ui-audit` drives the dev server through headless Chrome (CDP) and
checks contrast, keyboard focus rings, headings, layout, sticky columns,
loading skeletons, and every route/scenario/viewport combination the
repository declares (66 route pairs, 300+ scenario pairs). It needs the dev
server already running (the "Local development" block above) and
`POSTGRES_PASSWORD` exported; it starts its own headless Chrome if one is not
already reachable on `CDP_PORT` (default `9411`), and points at
`UI_AUDIT_ORIGIN` (default `http://localhost:3000`, matching `pnpm dev`'s
default port):

```bash
pnpm test:ui-audit
```

`pnpm test:ui-audit:mutations` re-runs the guard/probe mutation suites
under `scripts/ui-audit/` that prove the audit's guards actually bind to the
defects they claim to catch, not just to incidental spellings in the current
source. It also needs the dev server running. See
`scripts/ui-audit/README.md` for what each script does and why the coverage
looks the way it does.

`pnpm build` needs a production-shaped configuration, because `next build`
loads the auth and database modules and they fail closed without it — the runtime
database URL, the three host origins, and Better Auth's origins and trusted proxy
allowlist (placeholders are enough; no secret is needed to build):

```bash
APP_DATABASE_URL='postgresql://placeholder@db.invalid:5432/placeholder' \
BETTER_AUTH_URL='https://app.example.com' \
BETTER_AUTH_TRUSTED_ORIGINS='https://app.example.com,https://bos.example.com' \
BETTER_AUTH_TRUSTED_PROXY_CIDRS='10.0.0.0/8' \
GERAICUAN_TENANT_ORIGIN='https://app.example.com' \
GERAICUAN_PLATFORM_ORIGIN='https://bos.example.com' \
GERAICUAN_PUBLIC_ORIGIN='https://example.com' \
pnpm build
```

The production images build with `docker build .` (app, standalone output),
`docker build --target ops .` (migrations and the first Super Admin bootstrap)
and `docker build apps/landing`; see `docs/spec/15-DEVOPS-CICD-MIGRATIONS.md`
DEP-1 and DEP-3.

`pnpm test:migration-upgrade` verifies the migration chain from an empty
database and takes `MIGRATION_CHECK_DATABASE_URL`, which must point at a
database with no tables:

```bash
MIGRATION_CHECK_DATABASE_URL='postgresql://postgres:'"${POSTGRES_PASSWORD}"'@127.0.0.1:55433/geraicuan_migration_check' pnpm test:migration-upgrade
```

## Provider integration surface

The verified Mengantar surface is estimate, order and pay-unpaid; each has a
sanitized capture under `tests/fixtures/`. `/api/webhooks/mengantar` is mounted
but **closed** — it refuses every request. No provider push contract has been
verified, so the handler that previously implemented one had invented its
headers, payload fields and status vocabulary. See the comment in
`src/app/api/webhooks/mengantar/route.ts` for what must exist before it may
accept traffic. `MENGANTAR_WEBHOOK_SECRET` is read by nothing while it is
closed.

## Deployment host boundary

Production serves three hosts (D-7): `https://geraicuan.com` (the Astro landing
site in `apps/landing`), `https://app.geraicuan.com` (tenant CMS, sign-up and
recovery) and `https://bos.geraicuan.com` (Super Admin), the last two from one
Next.js deployment routed by the `Host` header with host-only session cookies.
Host routing does not replace server-side role and tenant authorization.

How to deploy, every environment variable per service, DNS/TLS, Resend, migrations,
the smoke checklist and rollback: `docs/spec/15-DEVOPS-CICD-MIGRATIONS.md`
(DEP-1 to DEP-6) and the runbook in `RELEASE.md`.
