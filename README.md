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

## Deployment host boundary

The future production entry points are intentionally role-specific:

- Tenant CMS: `https://app.namadomain.com`
- Super Admin CMS: `https://cuan.namadomain.com`

Host routing improves entry-point clarity but does not replace server-side role
and tenant authorization. Configure Better Auth trusted origins and cookies for
only these exact hosts; do not enable cross-subdomain cookie sharing by default.
