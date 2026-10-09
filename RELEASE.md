# Release Manifest — geraicuan

Release-ID: RC-2
Base: 223beda8db3fd5fbe0903515a025f128bd4e6128
Environment: production
Declared-Risk: R4
Rollback-Ref: 223beda8db3fd5fbe0903515a025f128bd4e6128
Rollback-Command: first deploy — stop `geraicuan-app` in Coolify; no earlier release exists to restore, so fix forward (section 4)
Backup-Proof: NOT_REQUIRED — the first deploy migrates an empty database (0000–0077); every later migration needs a backup reference here
Status: BLOCKED

## Why this manifest is BLOCKED

**RC-2 (2026-10-08).** The release is `main` at the commit carrying this manifest (Phase 20 complete, migrations `0000`–`0077`). `Base` is the previous `main` (`223beda`); nothing has ever been deployed to production, so this is the first deploy onto an empty database and `RC-1`'s rollback and backup fields no longer apply. Every Phase 20 task (T-276–T-293) passed its own independent review on its delivery-ledger run.

Release checks rerun on a clean checkout of `0f1b800`: see `BUILD-LOG.md` → "2026-10-08 — RC-2 release checks".

Open before `Status: READY` (owner actions, section 0 and "Owner decisions"):
1. Production infrastructure: DNS, Resend sending domain, the PostgreSQL resource, `geraicuan-app` and `geraicuan-landing` in Coolify.
2. `pg_trgm` available on the production PostgreSQL (section 1, step 6).
3. Platform-default Mengantar credentials: set or left unset (DEP-6).
4. `Backup-Proof`: `migration-risk` against `Base` is `M3` (the migrations since `Base`, 0020–0077, include destructive or compatibility-sensitive statements), and `rollback-check` refuses `NOT_REQUIRED` at M3 even on an empty database. After creating the production PostgreSQL (section 0, step 2) and before the first migration, take one backup of the empty database and record its structured reference here (`backup://…` / `snapshot://…`).
5. `Rollback-Command`: `rollback-check` accepts only an executable command (`git`, `docker`, `bash`, `./…`, …). Coolify's stop is a UI action today, so the field stays prose until the owner names an executable stop/rollback for `geraicuan-app`.
6. Open tasks: T-105, T-153, T-179, T-219, T-227, T-226 and T-245 are still unchecked in TASKS.md, and several checked tasks carry open sub-items (e.g. the `pg_trgm` gate under T-245, the "Open" notes under T-247–T-274); each needs a disposition (in this release, deferred, or dropped).

`production-gate` preflight on `7d6e346` (2026-10-09, T-295): see `BUILD-LOG.md` → "2026-10-09 — RC-2 production-gate preflight" for every gate and its disposition.

Production issuance stays off after the deploy (D-5): `MENGANTAR_LIVE_ORDERS_ENABLED` and `MENGANTAR_LIVE_ORDERS_PRODUCTION_APPROVED` unset until the owner approves it separately. Not yet proven live (T-285): pay-unpaid, a courier refusal's HTTP status, the stored-phone comparison for reconciliation.

## Contract

This file defines the current release boundary. It is repository truth for release-specific metadata and MUST describe only the release currently being prepared.

- `Base` is the last deployed/accepted commit and must be an ancestor of `HEAD`.
- `Declared-Risk` is the human/agent-declared release risk (`R0`–`R4`).
- `Rollback-Ref` is the commit to restore if deployment fails; normally it equals `Base`.
- `Rollback-Command` is an explicit supported repository/runbook command, not an assertion such as `true`. Do not put secrets here.
- `Backup-Proof` is `NOT_REQUIRED` unless migration risk requires a structured `backup://`, `snapshot://`, or artifact reference.
- Set `Status: READY` only after the release scope is frozen for production gating.

## Production deploy runbook (T-185)

Documentation only: nothing below has been performed from this repository. Every
step is a production action the owner performs. Reference detail — services,
proxy requirements, what the app refuses at build and start, DNS records, roles,
migrations and the full environment table — is in
`docs/spec/15-DEVOPS-CICD-MIGRATIONS.md` DEP-1 to DEP-6; this runbook gives the
order. Placeholders in `<angle brackets>` are never real values; never paste a
secret into this file, a ticket, or a shell history.

The fields above describe `RC-2`, the first deploy: migrations `0000`–`0077` run
on an empty database before `geraicuan-app` exists, so no stop-the-app window or
backup applies to it. Both apply to every later release.

### 0. One-time setup (first deploy only)
1. **DNS** (DEP-2): `A` records for `geraicuan.com`, `app.geraicuan.com`,
   `bos.geraicuan.com` to the Coolify server's public IPv4 (plus `AAAA` if it has
   IPv6), `www.geraicuan.com` as `CNAME` to `geraicuan.com`. DNS-only, no CDN proxy.
   Wait until `dig +short app.geraicuan.com` (and the other three) returns the
   server address.
2. **PostgreSQL** (DEP-3): create a PostgreSQL 16 resource, not publicly exposed.
   Create the migration role (with `CREATEROLE` for the first migration) and a
   database it owns. Configure scheduled backups.
3. **Resend** (DEP-5): add the sending domain, copy its DKIM/SPF records into
   DNS, wait for "verified", create a sending-only API key.
4. **Application `geraicuan-app`** (T-194): repository root at the release
   commit; build pack **Dockerfile** (`/Dockerfile`, final stage `app`), port
   3000; domains `https://app.geraicuan.com,https://bos.geraicuan.com`.
   Build variables (Dockerfile build arguments; the defaults already are these
   production values — set them anyway so a change is visible, and keep them
   equal to the runtime values): `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`,
   `BETTER_AUTH_TRUSTED_PROXY_CIDRS`, `GERAICUAN_TENANT_ORIGIN`,
   `GERAICUAN_PLATFORM_ORIGIN`, `GERAICUAN_PUBLIC_ORIGIN`. Runtime: those six plus,
   marked secret where applicable, `APP_DATABASE_URL`, `BETTER_AUTH_SECRET`,
   `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `MENGANTAR_CREDENTIAL_ENCRYPTION_KEY`,
   and the four platform-default `MENGANTAR_*` values only if the owner decides to
   offer them to existing tenants. `BETTER_AUTH_SECRET` also encrypts the Super
   Admin TOTP secrets (T-286): rotating it signs everyone out and breaks every
   TOTP enrollment. Optional, only once the Mengantar account's webhook is enabled
   (D-30): `MENGANTAR_WEBHOOK_ENABLED=1` and the secret `MENGANTAR_WEBHOOK_SECRET`.
   Leave `MENGANTAR_LIVE_ORDERS_ENABLED` and `MENGANTAR_LIVE_ORDERS_PRODUCTION_APPROVED`
   unset until D-5 approval (T-280). No scheduled task is needed: Mengantar status
   follows on Tenant Admin visits (T-284) and, once enabled, the webhook. No
   secret is a build variable. Do **not** set
   `DATABASE_URL`, `NEXT_ALLOWED_DEV_ORIGINS`, `GERAICUAN_ENABLE_DEMO_LOGIN_HINT`,
   `DEV_LOCAL_PASSWORD` or any `GERAICUAN_ENABLE_SANCTIONED_*` flag. Health
   check: the image's `HEALTHCHECK` sends the `GERAICUAN_TENANT_ORIGIN` host to
   `/login`; confirm in the resource's health-check settings which check Coolify
   uses, and leave Coolify's own check off if it cannot send a `Host` header (a
   plain `localhost` check gets `404`). `BETTER_AUTH_TRUSTED_PROXY_CIDRS`: the
   subnet of the Docker network the proxy uses (`docker network inspect coolify`).
5. **`geraicuan-landing`** (T-194): same repository, base directory
   `apps/landing`, build pack **Dockerfile** (`apps/landing/Dockerfile`), port
   **8080** (unprivileged nginx serving the Astro `dist`); domains
   `https://geraicuan.com` and `https://www.geraicuan.com` with `www` redirected
   to the apex. Build variable `PUBLIC_APP_ORIGIN=https://app.geraicuan.com` (the
   default; set it explicitly so a change is visible).
6. **Ops image and first Super Admin** (T-194, DEP-3). On the Coolify server, in a
   checkout of the release commit: `docker build --target ops -t geraicuan-ops:<commit> .`.
   After the first migration (section 2, step 2), create the only Super Admin
   with the **database superuser's** URL in a `0600` env file (the migration role
   cannot: `platform_roles` forces row-level security):
   ```bash
   docker run --rm -it --network coolify --env-file /root/geraicuan-superuser.env geraicuan-ops:<commit> \
     pnpm ops:bootstrap-super-admin -- --email <owner-email> --name "<owner name>"
   ```
   Type the password twice at the prompt (not echoed; 12–128 characters). Expect
   `Created Super Admin user <id> <email>.`; delete the env file. A second run
   refuses (`Refused: A Super Admin already exists.`). Record the date and user id
   (not the email) in `BUILD-LOG.md`.
   Then sign in on the platform host: the first sign-in opens `/verifikasi-dua-langkah`
   (T-286), which asks the password again, shows the authenticator setup key and
   switches TOTP on after one valid code. Platform pages stay closed until then.

### 1. Before every deploy
1. Release commit chosen; on it `pnpm tsc --noEmit`, `pnpm lint`,
   `pnpm test:integration` and `pnpm test:migration-upgrade` pass (DEL-1). On a
   fresh checkout run `pnpm exec next typegen` first: `PageProps`/`LayoutProps` are
   generated types, and without `.next/types` `tsc` reports them missing.
2. List pending migrations: compare `drizzle/meta/_journal.json` with the
   production journal (`SELECT count(*) FROM drizzle.__drizzle_migrations;` as the
   superuser; the count is the number of migrations already applied).
3. **In-flight COD check** (T-179/T-193): run the two read-only queries in DEP-3
   as the superuser. Zero rows, or every listed store told that those shipments
   must be re-created and re-estimated after the deploy, before continuing.
4. Announce a short window. If any pending migration moves grants, policies or
   money constraints (`0048`–`0052` all do; on the first deploy the app does not
   exist yet), **stop `geraicuan-app` for the window** (recommended, T-194; DEP-3 "Migration order for this release").
5. Build the ops image for the release commit on the server
   (`docker build --target ops -t geraicuan-ops:<commit> .`).
6. **`pg_trgm` gate (T-245, D-32; open — not confirmed by the owner).** As the
   superuser: `SELECT name, installed_version FROM pg_available_extensions WHERE name = 'pg_trgm';`
   must return a row, and the migration role must be allowed to create it (or the
   superuser runs `CREATE EXTENSION pg_trgm;` first). No row: do not migrate
   `0067`; it needs a variant without the trigram index first (spec 15 DEP-3).
7. **Duplicate order-id gate (T-292, migration 0076).** Only when the database
   already holds shipments (a database deployed before 0076, or a populated dev
   database): `SELECT tenant_id, provider_order_id, count(*) FROM provider_order_snapshots WHERE provider_order_id IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1;`
   must return no rows. A duplicate group fails 0076 and rolls back the whole
   migration batch; resolve it as a forward fix before migrating.

### 2. Backup, migrate, deploy
1. **Backup** the database (Coolify "backup now", or
   `docker exec <db-container> pg_dump -U <superuser> -Fc <database> > geraicuan-<release>-pre-migrate.dump`
   copied off the server). Check it: `pg_restore --list <file> | head` lists
   tables. Write its reference into `Backup-Proof` above. **No backup, no migrate.**
2. **Migrate** with the ops container on the server, app stopped (DEP-3):
   `docker run --rm --network coolify --env-file /root/geraicuan-migrate.env geraicuan-ops:<commit>`
   (default command `pnpm db:migrate`, migration role's `DATABASE_URL`). It must
   end with `[✓] migrations applied successfully!`; re-running it must apply
   nothing (the journal row count stays the same).
   Then, same container and env file, `pnpm wilayah:import` (T-245): one JSON line
   with `"rows":91047`; a second run reports 0 added / changed / removed.
3. **First deploy only:** create the runtime role (DEP-3 SQL) and put its URL in
   `APP_DATABASE_URL`; then create the first Super Admin (section 0, step 6).
4. **Deploy `geraicuan-app`** at the release commit. In the deployment log the
   build must reach `ƒ Proxy (Middleware)`; the container log must not contain
   `Refusing to start:` (if it does, the message names the variable — fix it and
   redeploy; the process exits with status 1 by design).
5. **Deploy `geraicuan-landing`** if `apps/landing` changed. The build log must
   show `1 page(s) built`.

### 3. Post-deploy smoke checklist

Tick every line; stop at the first failure and use "Rollback". Commands send no
credentials and change nothing.

**Hosts and TLS**
- [ ] `curl -sI https://app.geraicuan.com/` → `307`, `location: https://app.geraicuan.com/login`.
- [ ] `curl -sI https://bos.geraicuan.com/` → `307`, `location: https://bos.geraicuan.com/login`.
- [ ] `curl -s https://app.geraicuan.com/login | grep -c "Masuk ke toko Anda"` → at least `1`; `curl -s https://bos.geraicuan.com/login | grep -c "Masuk Super Admin"` → at least `1`.
- [ ] Each host answers only its own routes: `curl -s -o /dev/null -w '%{http_code}\n'` on `https://app.geraicuan.com/platform` → `404`; `https://bos.geraicuan.com/app` → `404`; `https://bos.geraicuan.com/daftar` → `404`; `https://app.geraicuan.com/daftar` → `200`.
- [ ] Old path moves hosts: `curl -sI 'https://app.geraicuan.com/login/super-admin?notice=x'` → `308`, `location: https://bos.geraicuan.com/login?notice=x`.
- [ ] Forged forwarding header is ignored: `curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Forwarded-Host: app.geraicuan.com' https://bos.geraicuan.com/app` → `404`.
- [ ] Proxy forwards the public `Host` (the two lines above could not pass otherwise); on the server, `docker inspect -f '{{.State.Health.Status}}' <app-container>` → `healthy` (the image check sends the tenant `Host` to `/login`), and `docker exec <app-container> node -e "require('http').get({host:'127.0.0.1',port:3000,path:'/login'},r=>console.log(r.statusCode))"` → `404` (no CMS `Host`).
- [ ] `curl -sI http://app.geraicuan.com/` redirects to `https://`; `curl -svI https://<each of the four hosts>/ 2>&1 | grep -i "subject:\|expire"` shows a valid certificate for that name.
- [ ] `curl -sI https://www.geraicuan.com/` → `301` or `308` to `https://geraicuan.com/`; `curl -sI https://geraicuan.com/` → `200`.

**Landing**
- [ ] `curl -s https://geraicuan.com/ | grep -o 'href="https://app.geraicuan.com/[a-z]*"' | sort | uniq -c` → `4 …/daftar"` and `4 …/login"`, and no other origin.
- [ ] In a browser, "Daftar" opens `https://app.geraicuan.com/daftar` and "Masuk" opens `https://app.geraicuan.com/login`.

**Cookies are host-only**
- [ ] Sign in on `https://app.geraicuan.com/login` with a tenant account. DevTools → Application → Cookies: `__Secure-better-auth.session_token` on `app.geraicuan.com` (no leading dot, no parent domain), `HttpOnly`, `Secure`, `SameSite=Lax`.
- [ ] Open `https://bos.geraicuan.com/platform` in the same browser: no session cookie is listed for `bos.geraicuan.com` and the page asks for Super Admin sign-in.
- [ ] Sign in on `bos.` as Super Admin, return to `app.`: the tenant session is unchanged, and `https://app.geraicuan.com/platform` still answers `404`.

**Sign-up → verification → approval → sign-in** (creates a real store; use a mailbox the owner controls)
- [ ] `https://app.geraicuan.com/daftar`: register a store; the confirmation page says to verify the email and that the store awaits approval.
- [ ] The email arrives from `RESEND_FROM_EMAIL` within a few minutes; its link starts with `https://app.geraicuan.com/`. In the message's original headers, `dkim=pass` and `spf=pass` for the sending domain. Resend's dashboard shows it delivered.
- [ ] Before clicking it, signing in shows the unverified-email state (no session).
- [ ] The link lands on the tenant login with the awaiting-approval notice; sign-in works and every page shows "Toko Anda menunggu persetujuan".
- [ ] **A pending store cannot create a shipment:** opening `https://app.geraicuan.com/app/pengiriman/baru`, `/app/cek-tarif` and `/app/impor` each redirects to `/app?persetujuan=diperlukan`. Pengaturan → Koneksi offers no platform-default option.
- [ ] On `https://bos.geraicuan.com/platform/pendaftaran` the store is listed with owner, email, WhatsApp, registration time and "verified"; "Setujui toko" succeeds and says the owner was emailed; the approval email arrives.
- [ ] The store signs in again: no banner, "Buat kiriman" opens. Do **not** issue an AWB: issuance refuses in production by design (D-5).
- [ ] "Lupa kata sandi?" on `app.` sends a reset email whose link opens `https://app.geraicuan.com/atur-ulang-password`; the new password works once, and the link is refused the second time.
- [ ] Afterwards, reject or otherwise retire the smoke-test store as the owner decides (rejection needs a reason and archives it).

**Startup refuses a missing secret** (on the Coolify server, against the image just built; placeholders only, no real secret, no database connection)
- [ ] Find the image: `docker images | head` (Coolify tags the app image with its resource UUID and commit).
- [ ] Run it without `RESEND_API_KEY` (the image already sets `NODE_ENV=production`):
  ```bash
  docker run --rm -e NODE_ENV=production \
    -e APP_DATABASE_URL=postgresql://placeholder@db.invalid:5432/placeholder \
    -e BETTER_AUTH_URL=https://app.geraicuan.com \
    -e BETTER_AUTH_TRUSTED_ORIGINS=https://app.geraicuan.com,https://bos.geraicuan.com \
    -e BETTER_AUTH_TRUSTED_PROXY_CIDRS=10.0.1.0/24 \
    -e GERAICUAN_TENANT_ORIGIN=https://app.geraicuan.com \
    -e GERAICUAN_PLATFORM_ORIGIN=https://bos.geraicuan.com \
    -e GERAICUAN_PUBLIC_ORIGIN=https://geraicuan.com \
    <app-image>; echo "exit $?"
  ```
  → `Refusing to start: RESEND_API_KEY is required in production.` and `exit 1`.
- [ ] The same command without `-e GERAICUAN_PLATFORM_ORIGIN=…` → `Refusing to start: GERAICUAN_PLATFORM_ORIGIN is required in production.` and `exit 1`.

Record the date, release commit and each result in `BUILD-LOG.md` (never a
secret, recipient address or token).

**Phase 20 checks (T-286, T-289, T-288; 2026-10-07)**
- [ ] Security headers on both hosts: `curl -sI https://app.geraicuan.com/login` and `https://bos.geraicuan.com/login` show `content-security-policy` with `frame-ancestors 'none'`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `strict-transport-security`.
- [ ] Signed in, a `/app` page response carries `Cache-Control` containing `no-store` (T-289 M9; in `next dev` Next's own `no-cache, must-revalidate` was seen, so confirm on the production build), and the versioned logo route still answers with its long-lived cache (the `/app/:path*` header must not have replaced it — performance only).
- [ ] `BETTER_AUTH_TRUSTED_PROXY_CIDRS` makes the sign-in rate limit see the real client IP (two sign-ins from different networks are counted separately).
- [ ] Every existing Super Admin enrolls TOTP on the next sign-in (`/verifikasi-dua-langkah`); recovery SQL is in SEC-9.
- [ ] Production issuance stays off until D-5's release evidence: `MENGANTAR_LIVE_ORDERS_PRODUCTION_APPROVED` unset.

### 4. Rollback

- **The new container refuses to start** (`Refusing to start: …`): nothing was
  served by it. Fix the named variable and redeploy. If migrations already ran,
  do not roll the image back instead (next point).
- **Migrations are forward-only.** `drizzle/` has no down migrations, and
  `0048`–`0051` change constraints, policies, grants and functions. The previous
  image is not proven to work against the migrated schema (only `0048` and `0049`
  state tolerance for a previous-release writer), so rolling back the image alone
  is not a supported path after `0050`/`0051` are applied. Two supported options:
  1. **Forward fix** (preferred when the data is sound): a new migration and/or
     code change through the normal gates, then this runbook again.
  2. **Restore the pre-migration backup** (when a migration or the release damaged
     data or security): stop `geraicuan-app`; restore into a **new** database on
     the same cluster — roles are cluster-level and are not in the dump, so
     `geraicuan_app`, the migration role and the runtime role must already exist —
     with `createdb -O <migration-role> <new-database>` then
     `pg_restore -U <superuser> -d <new-database> <file>` (keep ownership: do not
     pass `--no-owner`, SECURITY DEFINER functions depend on their owner); point
     `APP_DATABASE_URL` at it; redeploy `Rollback-Ref`. Anything written after the
     backup is lost — which is why the app stays stopped between backup and a
     passing smoke checklist. Never delete tenant shipment records as a rollback
     (MIG-1).
- **Landing site**: stateless; redeploy the previous commit of `geraicuan-landing`.
- **Mail failing after deploy** (sign-up works, no email): see `OBSERVABILITY.md`
  § "Mail delivery"; registrations are committed and the owner can resend from the
  login page once mail works, so this is not a rollback reason by itself.

### Owner decisions

Resolved as **recommended (T-194)**, owner-authorised 2026-09-17:
1. **First Super Admin in production** — `pnpm ops:bootstrap-super-admin` in the
   ops image, run once by the owner as the database superuser (section 0, step 6;
   DEP-3).
2. **Build pack and health check** — repository `Dockerfile` (app, `ops` target)
   and `apps/landing/Dockerfile`, pinned Node 22; the app image's `HEALTHCHECK`
   sends the tenant `Host` to `/login` (DEP-1).
3. **Where migrations run** — the one-off ops container on the Coolify server,
   not a laptop tunnel (DEP-3).
4. **Maintenance window** — stop the app during `0050`–`0052` (and any `0053` in
   the release), then deploy (DEP-3).

Still open — owner actions only (no repository change can settle them):
5. **DNS records at the registrar** (DEP-2) for the apex, `www`, `app.`, `bos.`.
6. **Resend sending domain** — the apex or a mail subdomain, its DKIM/SPF records,
   and the **DMARC policy** (DEP-5).
7. **Platform-default Mengantar credentials** — set them for existing tenants, or
   leave them unset so every tenant must use its own account (DEP-6).
8. **CDN in front of `app.`/`bos.`** — recommended off; turning it on requires the
   CDN's address ranges in the proxy trust and `BETTER_AUTH_TRUSTED_PROXY_CIDRS`.
9. **Smoke-test store** — reject it after the check, or keep it as a demo tenant.
