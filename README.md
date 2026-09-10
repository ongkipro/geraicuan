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

`pnpm db:seed-local` only accepts a database at
`127.0.0.1/geraicuan_test`. It refreshes the local fixture users and the
runtime role password from `DEV_LOCAL_PASSWORD`.

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
`Local Development Tenant` along with everything else. Nothing is corrupted, but
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

`pnpm build` needs a production-shaped configuration, because startup fails
closed without it — two exact HTTPS origins and a trusted proxy allowlist:

```bash
BETTER_AUTH_URL='https://app.example.com' BETTER_AUTH_TRUSTED_ORIGINS='https://app.example.com,https://cuan.example.com' BETTER_AUTH_TRUSTED_PROXY_CIDRS='10.0.0.0/8' pnpm build
```

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

The future production entry points are intentionally role-specific:

- Tenant CMS: `https://app.namadomain.com`
- Super Admin CMS: `https://cuan.namadomain.com`

Host routing improves entry-point clarity but does not replace server-side role
and tenant authorization. Configure Better Auth trusted origins and cookies for
only these exact hosts; do not enable cross-subdomain cookie sharing by default.
Production startup fails closed unless `BETTER_AUTH_URL` is one of exactly two
explicit HTTPS origins in `BETTER_AUTH_TRUSTED_ORIGINS` (tenant and platform),
with no wildcard, credentials, path, query, or fragment. A trusted proxy CIDR
allowlist is also required.
