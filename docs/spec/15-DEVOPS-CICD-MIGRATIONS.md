# Delivery and Migration Plan: GeraiCUAN

- Status: Draft
- Deployment target: Coolify (D-2) — one Next.js application serving `app.geraicuan.com` and `bos.geraicuan.com`, one static Astro site on `geraicuan.com`, one PostgreSQL database (DEP-1). Documented by T-185; build container, migration job and first Super Admin bootstrap recommended and built by T-194 (owner-authorised 2026-09-17). No deployment has been performed from this repository.

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

## DEP-1 — Production services on Coolify (T-185; PR-58, PR-63, D-2, D-7, D-11)
- Owner: Paduka Ongki (every step here is a production action the owner performs)

The operator runbook — order of operations, backup, smoke checklist and rollback — is in root `RELEASE.md` § "Production deploy runbook". This section is the reference it points to.

| Coolify resource | Source | Serves | Build | Runs |
|---|---|---|---|---|
| `geraicuan-app` (application) | repository root, the release commit; build pack **Dockerfile**, `/Dockerfile`, default (last) stage `app` | `https://app.geraicuan.com` and `https://bos.geraicuan.com` — both domains on this **one** application | multi-stage: `node:22.23.2-alpine3.24` (pinned by digest), pnpm `11.22.0` from `packageManager` via Corepack, `pnpm install --frozen-lockfile`, `pnpm build` with `output: "standalone"` | `node server.js` as user `node`, port 3000, image `HEALTHCHECK` (below) |
| `geraicuan-landing` (application) | the same repository, base directory `apps/landing`; build pack **Dockerfile**, `/Dockerfile` | `https://geraicuan.com` (and `www.` redirected to it) | `npm ci` then `npm run build` on the same pinned Node 22 (Astro 7.3.3, `engines.node >= 22.12.0`, npm lockfile — not pnpm) | `nginxinc/nginx-unprivileged:1.31.6-alpine3.24` (pinned by digest) serving `dist`, user `nginx`, port **8080**, `HEALTHCHECK` on `/` |
| `geraicuan-db` (PostgreSQL) | Coolify PostgreSQL resource, major version 16 (what `compose.yaml` and CI test against) | the app only; not publicly reachable | — | — |
| ops image (one-off jobs) | `docker build --target ops` of the release commit, on the Coolify server (DEP-3) | — | the `deps` stage (all dependencies, `drizzle-kit` included) plus `drizzle/`, `drizzle.config.ts`, `scripts/bootstrap-super-admin.mjs`; user `node` | default `pnpm db:migrate`; also `pnpm ops:bootstrap-super-admin` |

**Why a Dockerfile, not Nixpacks (T-194, recommended).** The image is pinned (Node version and digest, pnpm version) and built the same way locally, in CI (`docker-build` job, no push) and on Coolify, so a Nixpacks upgrade cannot change the runtime; it runs as a non-root user; and it carries a `HEALTHCHECK` that sends a CMS `Host`. `output: "standalone"` works with this app: the traced output includes `src/instrumentation.ts` (startup refusal verified in the image) and `src/proxy.ts` (host routing verified in the image). Measured 2026-09-17 with `docker build`: app image **308 MB**, ops image **1.63 GB** (full `node_modules`; one-off only, never deployed as a service), landing image **91 MB**.

**Why the landing site has its own Dockerfile rather than Coolify's static build.** Same pinned Node for the Astro build, and a local `docker build` + `curl` proves exactly what Coolify runs, instead of relying on Nixpacks' static-site mode, which cannot be exercised locally. The cost is one 20-line file. The `www` → apex redirect stays a Coolify/proxy setting (DEP-2).

**Build arguments.** `next build` imports route modules, which refuse to load without host routing (table below). The Dockerfile declares `GERAICUAN_TENANT_ORIGIN`, `GERAICUAN_PLATFORM_ORIGIN`, `GERAICUAN_PUBLIC_ORIGIN`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS` and `BETTER_AUTH_TRUSTED_PROXY_CIDRS` as build arguments **defaulting to the production values** (proxy default `10.0.0.0/8`, build only), and gives the build a placeholder `APP_DATABASE_URL` it never connects to. No secret is a build argument (BuildKit's `SecretsUsedInArgOrEnv` warning on the three `BETTER_AUTH_*` names is a name match; none holds a secret). The origins **must equal the runtime values**: `/daftar` is prerendered at build time and its HTML carries `GERAICUAN_PUBLIC_ORIGIN` (checked in the built image: `.next/server/app/daftar.html` contains `https://geraicuan.com` twice). The landing image takes `PUBLIC_APP_ORIGIN` the same way (a build with `--build-arg PUBLIC_APP_ORIGIN=https://app.staging.example.test` put that origin in all 8 CTA links). Whether Coolify passes a variable as a build argument depends on its "build variable" setting; confirm in the resource.

### What the application needs from the reverse proxy
- **The public host arrives as `Host`.** `src/proxy.ts` routes every request with `routeByHost` (`src/lib/host-routing.ts`), which reads only the `Host` header — never `X-Forwarded-Host`, which a client can forge. Coolify's proxy (Traefik) forwards the original `Host` by default; do not add a rule that rewrites it to the container name or `localhost`. In production a request whose `Host` is neither `app.geraicuan.com` nor `bos.geraicuan.com` gets `404 Not Found`, including `127.0.0.1:3000`, the apex, and any IP address.
- **Both CMS hosts on the same application.** Enter `https://app.geraicuan.com,https://bos.geraicuan.com` as the application's domains. Do not put the apex or `www` on it: they belong to the landing site, and the app would answer them `404`.
- **Client addresses only from the proxy.** `BETTER_AUTH_TRUSTED_PROXY_CIDRS` names the addresses the container sees the proxy connect from; Better Auth (`advanced.ipAddress.trustedProxies`) and the anonymous sign-up/recovery rate limits (`clientIdentifier` in `src/lib/public-auth.ts`) take the client IP from forwarded headers only when the connection comes from one of them. Find the range on the Coolify server with `docker network inspect coolify` (the network Coolify attaches its proxy and applications to by default; confirm the name with `docker network ls`) and use its subnet, for example `10.0.1.0/24`. A wrong value does not stop the app: every anonymous client then shares one rate-limit bucket (`no-trusted-ip`). **`BETTER_AUTH_TRUSTED_PROXY_CIDRS` must contain the address the proxy connects from.** The shared bucket is deliberate — the limit still holds, for all visitors at once, and is never skipped — so the symptom is legitimate sign-ups and recovery requests answered "terlalu banyak" under load. In production the first request that resolves no trusted client IP logs one warning, `[public-auth] No trusted client IP resolved: …` (T-198); seeing it after a deploy means this value does not match the proxy.
- **Container health check needs a CMS `Host`.** There is no health endpoint. A check that requests `http://localhost:3000/` gets `404` by design and marks a healthy container unhealthy. The image's `HEALTHCHECK` (T-194) therefore requests `http://127.0.0.1:$PORT/login` with `Host` set to the host of `GERAICUAN_TENANT_ORIGIN` and is healthy only on `200` (`/login` is rewritten to the tenant login page and needs no session or database read to render; the image has no `curl`, so the check is a one-line `node:http` request). Verified locally: the container reported `healthy` about 8 s after start. Whether Coolify uses the image's `HEALTHCHECK` or its own UI check, and whether that form can send a custom header, must be confirmed in the resource's health-check settings; do not assume it — if in doubt, leave Coolify's own check off. `/login/tenant` itself answers `308` → `/login` on the tenant host by design (T-180), so it is not a health path.
- **Cookies stay host-only.** Nothing to configure: Better Auth sets `__Secure-better-auth.session_token` with no `Domain` attribute (no `crossSubDomainCookies`), so a tenant session never reaches `bos.` and a Super Admin session never reaches `app.`. Do not add a proxy middleware that rewrites `Set-Cookie`.

### What the application refuses, and when
`next build` runs with `NODE_ENV=production` and imports route modules while collecting page data, so the checks that run at module load run **at build time too**:

| Moment | Check (owner file) | Refused when | Message |
|---|---|---|---|
| build and start | `src/db/client.ts` | `APP_DATABASE_URL` unset | `APP_DATABASE_URL is required.` |
| build and start | `src/db/client.ts` | `APP_DATABASE_URL` equals `DATABASE_URL` | `APP_DATABASE_URL must not use the migration role.` |
| build and start | `resolveHostRouting` (`src/lib/auth-config.ts`), loaded by `src/lib/auth.ts`, the login and `/daftar` pages | `GERAICUAN_TENANT_ORIGIN`, `GERAICUAN_PLATFORM_ORIGIN` or `GERAICUAN_PUBLIC_ORIGIN` missing, not an exact `https://` origin (no path, query, fragment, credentials or `*`), or two of them on the same host | `GERAICUAN_…_ORIGIN is required in production.` / `… must contain exact HTTPS origins without paths or wildcards.` / `The tenant, platform and public origins must be on distinct hosts.` |
| build and start | `resolveBetterAuthRuntimeConfig` (`src/lib/auth-config.ts`) | `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS` or `BETTER_AUTH_TRUSTED_PROXY_CIDRS` missing; a proxy entry that is not an IP or CIDR; trusted origins not exactly two exact HTTPS origins containing `BETTER_AUTH_URL`; trusted origins not equal to the tenant and platform origins | `BETTER_AUTH_URL is required in production.` and the other messages in that function |
| start only | `validateStartupConfiguration` (`src/lib/startup-validation.ts`, called from `register` in `src/instrumentation.ts` on the Node.js runtime) | everything in the two rows above, plus `RESEND_API_KEY` missing, or `RESEND_FROM_EMAIL` missing or not `email@domain` / `Name <email@domain>` (`resolveMailConfiguration`, `src/lib/mail.ts`); T-198: `BETTER_AUTH_SECRET` missing or shorter than 32 characters, `APP_DATABASE_URL` missing, or `APP_DATABASE_URL` equal to `DATABASE_URL` | logs `Refusing to start: <message>` and **exits with status 1**; the T-198 messages are `BETTER_AUTH_SECRET is required in production.`, `BETTER_AUTH_SECRET must be at least 32 characters.`, `APP_DATABASE_URL is required in production.` and `APP_DATABASE_URL must not use the migration role.` |

The exit matters: `next start` logs a throw from `register` and keeps listening, answering every request with `500` (found in T-180). With the exit, a misconfigured deploy never becomes healthy, and Coolify keeps the previous container if one is running. `next build` does not run `register`, so the Resend values are not needed to build.

Measured for T-185 on a scratch copy of the tree (`next build --webpack`, no other environment): with nothing set the build stops at "Collecting page data" with `APP_DATABASE_URL is required.`; with only `APP_DATABASE_URL` it stops with `GERAICUAN_TENANT_ORIGIN is required in production.`; with the seven build variables of DEP-4 (placeholder values, no secret) it exits 0 with `ƒ Proxy (Middleware)` in the route table. That build prints `BetterAuthError: You are using the default secret…` once per page-data worker; the message is not fatal at build time. Keep `BETTER_AUTH_SECRET` a runtime-only variable rather than exposing a secret to the build.

**Not checked at start** (the process starts and the failure appears on first use): `MENGANTAR_CREDENTIAL_ENCRYPTION_KEY` (saving or using a store's own Mengantar API key fails); the four platform-default `MENGANTAR_*` values (an estimate, area search or settlement pull that resolves to the platform default fails with a configuration error); a wrong database password or unreachable host (first database query fails).

## DEP-2 — DNS, TLS and email domain
- Owner: Paduka Ongki

| Name | Type | Value | Serves |
|---|---|---|---|
| `geraicuan.com` | `A` (and `AAAA` if the server has public IPv6) | the Coolify server's public IPv4 | `geraicuan-landing` |
| `www.geraicuan.com` | `CNAME` → `geraicuan.com` (or `A` to the same IPv4) | — | redirected to the apex by `geraicuan-landing` |
| `app.geraicuan.com` | `A` (and `AAAA`) | the Coolify server's public IPv4 | `geraicuan-app` |
| `bos.geraicuan.com` | `A` (and `AAAA`) | the Coolify server's public IPv4 | `geraicuan-app` |
| records Resend issues for the sending domain | `TXT` (DKIM), `MX` + `TXT` (SPF / return path), optional `TXT` `_dmarc` | exactly as shown in the Resend dashboard for that domain | email (DEP-5) |

- **TLS.** Coolify's proxy issues and renews a Let's Encrypt certificate for every domain entered with an `https://` scheme on a resource. The records above must resolve to the server first, and ports 80 and 443 must be open to the internet for the HTTP challenge. Enter `https://geraicuan.com` and `https://www.geraicuan.com` on the landing site (choose Coolify's redirect-to-non-www option, or a proxy redirect rule, so `www` answers `301`/`308` to `https://geraicuan.com`; the page's canonical URL is fixed to `https://geraicuan.com/`), and `https://app.geraicuan.com,https://bos.geraicuan.com` on the app.
- **Keep DNS-only (no CDN proxy) on `app.` and `bos.`** unless the owner decides otherwise: behind a CDN the connection comes from the CDN's addresses, so `BETTER_AUTH_TRUSTED_PROXY_CIDRS` and the proxy's own forwarded-header trust would have to include them, or every client shares one rate-limit bucket. See `RELEASE.md` § "Owner decisions".
- **No wildcard record is needed** and none is recommended: only the four hosts above exist.

## DEP-3 — Database roles, migrations and backup
- Owner: Paduka Ongki; migrations authored by Engineering owner

**Roles.** Three roles, never one:
1. The migration role in `DATABASE_URL`. It owns the tables and the SECURITY DEFINER functions (0040, 0051). On an **empty** database, migration `0000` creates the `NOLOGIN` group role `geraicuan_app`, so the migration role needs `CREATEROLE` for the first run (or the database superuser creates `geraicuan_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS` beforehand). It does not need to be a superuser (see "Environments" above).
2. The runtime login role in `APP_DATABASE_URL`, created once by the database superuser after `0000` has run, the same way `tests/integration-runtime-role.ts` creates the test role:
   ```sql
   CREATE ROLE geraicuan_runtime LOGIN PASSWORD '<generated-password>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT IN ROLE geraicuan_app;
   GRANT geraicuan_app TO geraicuan_runtime;
   ```
   It owns nothing. Every grant it uses arrives through `geraicuan_app` in the migrations.
3. The database superuser Coolify creates with the resource: backups, restores, role creation and the read-only pre-deploy checks below. Never put it in either URL.

**Applying migrations (recommended, T-194): a one-off ops container on the Coolify server, not a laptop tunnel.** `pnpm db:migrate` (`drizzle-kit migrate`, config `drizzle.config.ts`) applies every file in `drizzle/` not yet recorded in the database's Drizzle journal, in order, and is a no-op when none is pending. The runtime image holds no `DATABASE_URL` (least privilege). On the server, from a checkout of the release commit, with the migration role's URL in a `0600` env file (never on the command line or in shell history):
```bash
docker build --target ops -t geraicuan-ops:<commit> .
# /root/geraicuan-migrate.env (chmod 600): DATABASE_URL=postgresql://<migration-role>:<password>@<db-service-hostname>:5432/<database>
docker run --rm --network coolify --env-file /root/geraicuan-migrate.env geraicuan-ops:<commit>   # default command: pnpm db:migrate
```
(`<db-service-hostname>` is the internal hostname Coolify shows for the PostgreSQL resource; `coolify` is the network name to confirm with `docker network ls`.) Running on the server keeps the database unexposed and uses the app's own network path; run it inside `tmux`/`screen` so a dropped SSH session does not interrupt it. The order is always **backup → stop the app → migrate → deploy the application**: the new application reads columns the new migrations add, so a new image against an un-migrated database fails. Verified on a disposable database (T-194): the ops image migrated an empty database to head (`[✓] migrations applied successfully!`, 53 journal rows) and a second run applied nothing.

**First Super Admin (recommended, T-194).** `scripts/bootstrap-super-admin.mjs` (`pnpm ops:bootstrap-super-admin`, in the ops image) creates exactly one `ACTIVE`, email-verified user with a `credential` account (hash from Better Auth's own `hashPassword`, `better-auth/crypto`, the function its sign-in verifies against) and a `SUPER_ADMIN` `platform_roles` row, in one transaction that locks `platform_roles`. It refuses when any Super Admin exists or the email is taken, and never updates an existing user. The user is inserted verified, so the 0052 `users_email_verified_guard` (an `UPDATE` trigger) is never involved.
- **Role: the database superuser**, not the migration role. `platform_roles` has `FORCE ROW LEVEL SECURITY` and only `SELECT` policies, so even its owner cannot insert a row (checked on a disposable database: `new row violates row-level security policy for table "platform_roles"`) and cannot see an existing Super Admin to refuse on. The script checks `rolsuper OR rolbypassrls` first and refuses otherwise. Put the superuser's URL in a separate `0600` env file for this one run and delete it afterwards.
- **Inputs.** `--email` and `--name` only; the password is typed twice without echo on a terminal (`docker run -it`), or read from piped stdin, or from the file named by `BOOTSTRAP_PASSWORD_FILE`. Same length rule as sign-up and reset (8–128). Output is only `Created Super Admin user <id> <email>.`; the password, hash and connection string are never printed.
```bash
docker run --rm -it --network coolify --env-file /root/geraicuan-superuser.env geraicuan-ops:<commit> \
  pnpm ops:bootstrap-super-admin -- --email <owner-email> --name "<owner name>"
```
- **Not audited.** No `audit_events` row: the action CHECK has no bootstrap action and adding one needs a migration. The user's `created_at` and the operator's entry in `BUILD-LOG.md` are the trail.

**Migrations in the Phase 14–15 release and why a backup is required.** Each validates every existing row when it adds a constraint, so a row no rule describes makes the migration fail rather than succeed; none updates or deletes an existing row.

| Migration | Changes | Risk |
|---|---|---|
| `0048_cod_amount_gross_up` | `shipment_cod_totals.cod_formula_version` (existing rows become version 1), version-scoped COD CHECK constraints | money constraint |
| `0049_mengantar_settlement_money` | settlement evidence columns widened to `numeric(18,4)`; ledger type `MENGANTAR_COD_FEE_COST`; ledger CHECKs re-created | money constraint, column type change |
| `0050_cod_ongkir_payment_method` | `shipment_drafts.cod_shipping_only`, `shipment_cod_totals.cod_shipping_basis_idr`, version 3 CHECKs, re-created COD totals INSERT policy | money constraint, RLS policy |
| `0051_self_service_sign_up` | SECURITY DEFINER `register_tenant_self_service` and `review_tenant_registration`, `tenants.mengantar_credential_policy` and WhatsApp column, `public_auth_rate_limits`, audit guards, registration transition trigger, `GRANT UPDATE (email_verified, updated_at) ON users`, the PROVISIONING RLS policy set | security boundary, grants, RLS |

`0048` and `0049` were written so an instance still running the previous release keeps writing valid rows during the deploy (see the comments at the top of each file); `0050` and `0051` move policies and grants. The conservative sequence is therefore to stop issuance traffic for the window (or stop `geraicuan-app`), back up, migrate, then deploy.

**Backup before migrating.** Use the PostgreSQL resource's backup in Coolify ("backup now", with S3 storage if configured) or, as the superuser on the server, `docker exec <db-container> pg_dump -U <superuser> -Fc <database> > geraicuan-<release>-pre-migrate.dump`, copied off the server. Record its reference in `RELEASE.md` `Backup-Proof` before migrating. Prove it restores: `pg_restore --list <file>` must list the tables.

**In-flight COD check before deploy (T-179, updated by T-193).** Since T-193, `ensureCodTotalsForConfirmation` refuses a version-1 COD totals row that was never submitted (`CodTotalsFormulaRetiredError`, "buat kiriman baru dan estimasi ulang"), so no shipment is submitted with the old amount; a version-1 order already sent to Mengantar can still be retried and reads back its recorded result. Two read-only checks, as the superuser (the shipment tables force row-level security, so a non-superuser owner sees no rows), before migrating:
```sql
-- COD shipments the store will have to re-create after the deploy.
SELECT s.tenant_id, s.public_reference, s.status, s.updated_at
FROM shipments s
JOIN shipment_drafts d ON d.shipment_id = s.id
WHERE d.is_cod AND s.status IN ('DRAFT', 'ESTIMATED');

-- Queued, never-attempted batches carrying version-1 COD amounts; confirmation now refuses them.
SELECT s.tenant_id, s.public_reference, b.status, b.created_at
FROM provider_batches b
JOIN provider_order_snapshots o ON o.batch_id = b.id
JOIN shipments s ON s.id = o.shipment_id
JOIN shipment_cod_totals t ON t.shipment_id = s.id
WHERE b.status = 'SUBMISSION_QUEUED' AND b.submission_attempted_at IS NULL AND t.cod_formula_version = 1;
```
Zero rows in both: proceed. Any row: tell the store before the window that those shipments must be re-created and re-estimated after the deploy. While D-5 keeps production issuance disabled no shipment can be confirmed; run the checks anyway. (Both queries verified against the developer database on 2026-09-17: valid, 0 rows.)

**Migration order for this release (recommended, T-194).** `0050`–`0052` move policies, grants and a trigger (so would a `0053` shipped with the release). Stop `geraicuan-app` for the window rather than deploying rolling: backup → stop → migrate with the ops container → deploy the new image → smoke checklist. The previous image is not proven against the new policies, and a stopped app writes nothing a restore would lose.

**Migration checks before production.** On a throwaway copy, `MIGRATION_CHECK_DATABASE_URL=<empty database> pnpm test:migration-upgrade` must report `Migration upgrade check passed through 0052_sign_up_security_hardening.sql.`

## DEP-4 — Environment variables and secrets per service
- Owner: Paduka Ongki (values); Engineering owner (this list)

Every value is a Coolify environment variable on the named resource; secrets are marked secret there and never committed, pasted into a ticket, or printed in a log. "Build" means the variable must also be available during the build (Coolify's build-variable setting). This table is checked mechanically: `tests/deploy-environment-documentation.integration.test.ts` scans `src/`, `next.config.ts` (service `app`), `drizzle.config.ts` (service `migrate`) and `apps/landing/src` + `apps/landing/astro.config.mjs` (service `landing`) for every `process.env.*`, `import.meta.env.*`, `process.env[CONSTANT]` and validator `environment.*` read, and fails when a read has no row, a row has no read, or the "Read by" column is wrong. Keep one variable per row and the first two columns in this shape.

<!-- environment-variables:start -->
| Variable | Read by | Production | Purpose | Example shape (placeholder) |
|---|---|---|---|---|
| `APP_DATABASE_URL` | app | **Required, secret; runtime.** Start fails without it. The Dockerfile build uses a placeholder, so it is not a build variable. | Runtime connection: a login role inheriting `geraicuan_app`, not superuser, not `BYPASSRLS`, not a table owner (DEP-3). | `postgresql://geraicuan_runtime:<password>@<db-host>:5432/<database>` |
| `DATABASE_URL` | app, migrate | **Ops container only, secret.** Do not set on `geraicuan-app`. | The migration/owner role for `pnpm db:migrate`; the **database superuser** for the one `pnpm ops:bootstrap-super-admin` run (DEP-3). The app reads it only to refuse an `APP_DATABASE_URL` equal to it. | `postgresql://<migration-role>:<password>@<db-host>:5432/<database>` |
| `BOOTSTRAP_PASSWORD_FILE` | migrate | Optional; ops container, first Super Admin only. | Path of a file holding the first Super Admin's password (one trailing newline ignored). Unset: typed without echo on a terminal, or read from stdin. Never pass the password as an argument. Delete the file afterwards. | `/run/secrets/bootstrap-password` |
| `BETTER_AUTH_SECRET` | app | **Required, secret; runtime.** Not checked at start. | Better Auth's signing/encryption secret; HMAC key of the anonymous sign-up/recovery rate-limit rows; key source of the bulk-import preview envelope. Changing it signs every user out and invalidates outstanding previews. | 32+ random bytes, e.g. the output of `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | app | **Required; build and runtime; checked.** | Exact HTTPS origin, one of the two CMS origins; must appear in `BETTER_AUTH_TRUSTED_ORIGINS`. | `https://app.geraicuan.com` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | app | **Required; build and runtime; checked.** | Exactly the tenant and platform origins, comma-separated. | `https://app.geraicuan.com,https://bos.geraicuan.com` |
| `BETTER_AUTH_TRUSTED_PROXY_CIDRS` | app | **Required; build and runtime; checked.** | IPs/CIDRs of the reverse proxy as the container sees it; forwarded client IPs are trusted only from these. | `10.0.1.0/24` |
| `GERAICUAN_TENANT_ORIGIN` | app | **Required; build and runtime; checked.** | The tenant CMS host; routing, verification and recovery links, mail login links. | `https://app.geraicuan.com` |
| `GERAICUAN_PLATFORM_ORIGIN` | app | **Required; build and runtime; checked.** | The Super Admin host; a different host, same protocol. | `https://bos.geraicuan.com` |
| `GERAICUAN_PUBLIC_ORIGIN` | app | **Required; build and runtime; checked.** | The landing site; the "home" link on the login and sign-up pages. A third host. | `https://geraicuan.com` |
| `RESEND_API_KEY` | app | **Required, secret; runtime; checked at start** (D-10). | Resend API key used for `POST https://api.resend.com/emails`: verification, recovery, "already registered", approval and rejection mail. | `re_<redacted>` |
| `RESEND_FROM_EMAIL` | app | **Required; runtime; checked at start.** | Sender on the domain verified in Resend (DEP-5). | `GeraiCUAN <no-reply@geraicuan.com>` |
| `MENGANTAR_CREDENTIAL_ENCRYPTION_KEY` | app | **Required, secret, in practice:** every self-registered store must save its own Mengantar API key (D-9). Not checked at start. | AES key for stores' Mengantar API keys at rest; must be canonical base64 of exactly 32 bytes. Replacing it makes every stored key unreadable. | output of `openssl rand -base64 32` |
| `MENGANTAR_API_KEY` | app | Optional, secret. Set all four `MENGANTAR_*` platform-default values or none. | Platform-default Mengantar account for tenants whose credential policy allows it (tenants created before 0051). Never used by a `PRIVATE_ONLY` (self-registered) tenant. | `<mengantar-api-key>` |
| `MENGANTAR_BASE_URL` | app | Optional (with the other three). | HTTPS base URL of the Mengantar public API; no credentials in the URL. The captured contract fixtures record host `api-public.mengantar.com`. | `https://<mengantar-api-host>` |
| `MENGANTAR_ORIGIN_AREA_ID` | app | Optional (with the other three). | Platform-default origin area ID. | `<area-id>` |
| `MENGANTAR_PICKUP_ADDRESS_ID` | app | Optional (with the other three). | Platform-default pickup address ID. | `<pickup-address-id>` |
| `NODE_ENV` | app | Set to `production` by `next build` and by the Dockerfile's `app` stage; do not override. | Selects the production checks above and disables every development-only path. | `production` |
| `NEXT_RUNTIME` | app | Set by Next.js; never set it. | `register` validates only on the Node.js runtime. | `nodejs` |
| `NEXT_ALLOWED_DEV_ORIGINS` | app | Development only; leave unset. | `next dev` cross-origin allowance for a LAN/Tailscale host. | `100.127.67.86` |
| `GERAICUAN_ENABLE_DEMO_LOGIN_HINT` | app | Development only; ignored in production; leave unset. | Shows the local demo password on the login pages. | `1` |
| `DEV_LOCAL_PASSWORD` | app | Development only; ignored in production; leave unset. | The local fixture password the hint shows. | `<local-only>` |
| `GERAICUAN_ENABLE_SANCTIONED_ESTIMATE_FIXTURE` | app | Development/test only; ignored in production; leave unset. | Serves estimates from the sanitized fixture. | `1` |
| `GERAICUAN_ENABLE_SANCTIONED_ORDER_FIXTURE` | app | Development/test only; ignored in production; leave unset. | Fixture-backed issuance. Without it production issuance refuses (D-5). | `1` |
| `GERAICUAN_ENABLE_SANCTIONED_RECONCILIATION_FIXTURE` | app | Development/test only; ignored in production; leave unset. | Fixture-backed reconciliation. | `1` |
| `GERAICUAN_ENABLE_SANCTIONED_UNPAID_RECOVERY_FIXTURE` | app | Development/test only; ignored in production; leave unset. | Fixture-backed unpaid recovery. | `1` |
| `PUBLIC_APP_ORIGIN` | landing | **Build only.** Defaults to `https://app.geraicuan.com`. | Origin of both calls to action (`/daftar`, `/login`); a path, query or credentials fail the build. Public by design — the only value the landing build reads. | `https://app.geraicuan.com` |
<!-- environment-variables:end -->

Not in the table because no deployed code reads them: `PORT` and `HOSTNAME` (read by the standalone `server.js`; the Dockerfile sets `3000` and `0.0.0.0`, and the image `HEALTHCHECK` reads `PORT`; leave both unset); `MENGANTAR_WEBHOOK_SECRET` (the webhook route refuses every request and reads nothing); `BETTER_AUTH_SECRETS` / `AUTH_SECRET` (Better Auth alternatives; use `BETTER_AUTH_SECRET` only); `ASTRO_TELEMETRY_DISABLED` (set inside `apps/landing/package.json` scripts); `MIGRATION_CHECK_DATABASE_URL` and `POSTGRES_*` (CI and local tooling only).

Summary per service:
- `geraicuan-app` build (Dockerfile build arguments; the defaults are the production values; set them as build variables so a change is visible, always equal to runtime): `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `BETTER_AUTH_TRUSTED_PROXY_CIDRS`, `GERAICUAN_TENANT_ORIGIN`, `GERAICUAN_PLATFORM_ORIGIN`, `GERAICUAN_PUBLIC_ORIGIN`. Runtime: those six plus `APP_DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `MENGANTAR_CREDENTIAL_ENCRYPTION_KEY`, and optionally the four platform-default `MENGANTAR_*` values.
- ops container: `DATABASE_URL` (migration role for `db:migrate`; superuser for the bootstrap), optionally `BOOTSTRAP_PASSWORD_FILE`.
- `geraicuan-landing` build: `PUBLIC_APP_ORIGIN` (optional; the default is the production value).

## DEP-5 — Email through Resend (D-10)
- Owner: Paduka Ongki

1. In Resend, add the sending domain (`geraicuan.com`, or a subdomain such as `mail.geraicuan.com` if the owner prefers to keep the apex's mail reputation separate — owner decision) and copy the DNS records it issues (DKIM `TXT`, the SPF/return-path `MX` and `TXT`) into DNS exactly as shown. Add a `_dmarc` `TXT` record if the domain has none (start with `p=none` and a reporting address). Wait until Resend shows the domain **verified**.
2. Create an API key with sending access only, restricted to that domain if the dashboard offers it. Store it only as `RESEND_API_KEY` (secret) on `geraicuan-app`; it is shown once.
3. Set `RESEND_FROM_EMAIL` to an address on the verified domain, as `name@domain` or `Name <name@domain>`.
4. Without `RESEND_API_KEY`, or with a missing or malformed `RESEND_FROM_EMAIL`, production **refuses to start** (DEP-1). Outside production the app records the message and its link in the server log instead of sending. Production never logs a recipient, link or token: a failed delivery logs only `[mail] <kind> delivery failed: HTTP <status>` or `… transport unavailable` (operator guidance in `OBSERVABILITY.md`).

## DEP-6 — Mengantar credentials in production (D-5, D-9)
- Owner: Paduka Ongki

- **Resolution order** (TD-5): a complete private configuration on the outlet first, then the platform default from the four `MENGANTAR_*` variables. Values are never sent to the browser or logged.
- **Existing tenants** (created before 0051) keep the platform-default policy: if the four values are set, their outlets without a private connection use the platform's Mengantar account and spend its balance.
- **Self-registered stores are `PRIVATE_ONLY`** (`tenants.mengantar_credential_policy`, set by `register_tenant_self_service` and immutable afterwards): `resolveMengantarAccountCredentials` refuses the platform default for them, and RESTRICTIVE policies refuse platform-default estimate, batch and settlement rows in the database. They must save their own API key in Pengaturan → Koneksi, which needs `MENGANTAR_CREDENTIAL_ENCRYPTION_KEY`.
- **Issuance stays disabled (D-5).** No live Mengantar `/order` transport exists: `confirmShipmentIssuance` refuses in production with "Penerbitan dinonaktifkan karena fixture non-produksi yang disetujui belum diaktifkan." and the fixture flags are ignored when `NODE_ENV=production`. Estimates, area search and the settlement pull do call Mengantar with the resolved credentials. Enabling real issuance is a separate owner approval with its own evidence.
