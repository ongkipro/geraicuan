# Release Manifest — geraicuan

Release-ID: RC-1
Base: 67beb92e4135da15afc7357d905a4473f7e17020
Environment: production
Declared-Risk: R4
Rollback-Ref: 2b3bd18121325ac70d153dd2bb38809cc8612e65
Rollback-Command: git checkout 2b3bd18121325ac70d153dd2bb38809cc8612e65
Backup-Proof: REQUIRED — migrations 0032 through 0036 change row-level
  security, table grants and column privileges. Capture a database backup
  before applying them and record its reference here.
Status: BLOCKED

## Why this manifest is BLOCKED

`RC-1` was prepared against `2b3bd18` and marked READY by T-62. That boundary no
longer describes this repository. Commit `67beb92` then shipped the Phase 9
market features without independent review or a passing test suite, and the
Phase 10 screening that followed has now finished.

What has changed since the READY declaration:

- Migrations `0032` through `0036` alter row-level security, table grants and
  column privileges; `0037` is an additive, independently-verified no-op
  (drizzle-kit metadata normalization — a stale CHECK-constraint snapshot
  representation, not a schema change; `pnpm db:generate` now reports "No
  schema changes"). `Backup-Proof` is therefore still required for `0032`
  through `0036`, unaffected by `0037`.
- `Declared-Risk` rose to `R4` when T-79's security audit closed a provider
  ingestion endpoint that implemented an unverified contract, and found the
  only tenant-owned table shipped without row-level security. Both are fixed.
- `Base` moved to `67beb92`, the commit this work sits on top of. The rollback
  reference deliberately stays at `2b3bd18`, the last boundary that passed a
  release gate.
- Phase 10 (`T-76` through `T-82`) is now complete: every task passed
  independent review where required (T-77 after twenty-three rounds; T-81 at
  R3), `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` (591/591),
  `pnpm test:migration-upgrade` (through `0037`), and `pnpm build` (zero
  errors or warnings, using the documented production env block) all pass
  against the current working tree. Every change since `67beb92` remains
  uncommitted at the time of writing, per this repository's own standing
  instruction to commit once, at the end, after the full Phase 10 queue is
  verified — not incrementally per task.

Do not gate or deploy from this file. `STATUS.md` is the runtime authority and
`TASKS.md` is the execution queue; both describe what remains. Phase 10
verification passing does not by itself return `Status` to `READY`: this
manifest's own contract requires T-62's verification to be rerun from a clean,
committed tree first, which has not happened. `Status` stays `BLOCKED` until
that rerun occurs after this segment's work is committed.

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

The `Status`, `Base` and `Backup-Proof` fields above still describe `RC-1` and stay
BLOCKED. A deploy of the Phase 14–15 work needs this manifest re-cut for that
release first (new `Base`, `Rollback-Ref`, `Declared-Risk`, and a `Backup-Proof`
that also covers migrations `0048`–`0051`).

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
   offer them to existing tenants. No secret is a build variable. Do **not** set
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
   Type the password twice at the prompt (not echoed; 8–128 characters). Expect
   `Created Super Admin user <id> <email>.`; delete the env file. A second run
   refuses (`Refused: A Super Admin already exists.`). Record the date and user id
   (not the email) in `BUILD-LOG.md`.

### 1. Before every deploy
1. Release commit chosen; on it `pnpm tsc --noEmit`, `pnpm lint`,
   `pnpm test:integration` and `pnpm test:migration-upgrade` pass (DEL-1).
2. List pending migrations: compare `drizzle/meta/_journal.json` with the
   production journal (`SELECT count(*) FROM drizzle.__drizzle_migrations;` as the
   superuser; the count is the number of migrations already applied).
3. **In-flight COD check** (T-179/T-193): run the two read-only queries in DEP-3
   as the superuser. Zero rows, or every listed store told that those shipments
   must be re-created and re-estimated after the deploy, before continuing.
4. Announce a short window. If any pending migration moves grants, policies or
   money constraints (`0048`–`0052` all do), **stop `geraicuan-app` for the
   window** (recommended, T-194; DEP-3 "Migration order for this release").
5. Build the ops image for the release commit on the server
   (`docker build --target ops -t geraicuan-ops:<commit> .`).

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
