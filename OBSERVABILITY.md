# Observability Contract — geraicuan

Updated: 2026-08-28
Status: REQUIRED

Probe format:

```text
Probe: <name>|<url>|<expected-status>|<contains-or-TBD>|<max-latency-ms>
```

The expected status may be an exact code (`200`) or an inclusive range
(`200-299`). Every configured probe is mandatory. Use stable, non-secret public
endpoints only; private-network probes require an explicit local-test override.

Probe: app|TBD|200-399|TBD|2000
Probe: health|TBD|200-299|TBD|1000

## Recommended production probes

Add probes for database connectivity, background jobs, queue/worker health, or a
critical-error sentinel when the application exposes stable HTTP endpoints for
them. Keep vendor-specific credentials and query tokens out of this file.

Examples:

```text
Probe: database|https://example.com/health/db|200-299|ok|750
Probe: background-jobs|https://example.com/health/workers|200-299|ok|1000
Probe: critical-errors|https://example.com/health/errors|200-299|critical_errors=0|1000
```

## Production probes for the three hosts (T-185)

The two `TBD` probes above stay `TBD` until the owner has deployed; nothing is
live yet. After a deploy that passes the smoke checklist in `RELEASE.md`, replace
them with these. The application has no health endpoint; each login page renders
without a session or a database read. Every probe must reach the public host
through the proxy: the app answers `404` to any other `Host`, including
`localhost` and the container IP, so a probe aimed at the container directly is
wrong, not a failure of the app.

```text
Probe: tenant-login|https://app.geraicuan.com/login|200|Masuk ke toko Anda|2000
Probe: platform-login|https://bos.geraicuan.com/login|200|Masuk Super Admin|2000
Probe: landing|https://geraicuan.com/|200|GeraiCUAN|2000
```

Inside the server, the images carry their own container checks (T-194): the app
image's `HEALTHCHECK` requests `/login` on `127.0.0.1` with the host of
`GERAICUAN_TENANT_ORIGIN` as `Host` and is healthy only on `200`; the landing
image checks `/` on port 8080. `docker inspect -f '{{.State.Health.Status}}'
<container>` shows the result; a container that refused to start never becomes
healthy.

## Startup refusal (PR-58, D-10)

A production container that logs `Refusing to start: <message>` and exits with
status 1 is doing its job: `src/lib/startup-validation.ts` found a missing or
malformed configuration value and stopped before serving (without the exit,
`next start` would stay up and answer every request with `500`). The message
names the variable; it never contains a value.

| Message starts with | Fix |
|---|---|
| `GERAICUAN_TENANT_ORIGIN` / `GERAICUAN_PLATFORM_ORIGIN` / `GERAICUAN_PUBLIC_ORIGIN` `is required in production.` | Set it on `geraicuan-app` as an exact `https://` origin. |
| `… must contain exact HTTPS origins without paths or wildcards.` | Use the bare origin: no path, query, fragment, `*` or credentials. |
| `The tenant, platform and public origins must be on distinct hosts.` | `app.`, `bos.` and the apex must differ. |
| `BETTER_AUTH_URL is required in production.` / `BETTER_AUTH_TRUSTED_ORIGINS …` | `BETTER_AUTH_URL` is one CMS origin; trusted origins are exactly the two CMS origins, comma-separated. |
| `BETTER_AUTH_TRUSTED_PROXY_CIDRS …` | Set the proxy's Docker network subnet as IP/CIDR entries. |
| `RESEND_API_KEY is required in production.` | Set the Resend key (secret). |
| `BETTER_AUTH_SECRET is required in production.` / `BETTER_AUTH_SECRET must be at least 32 characters.` | Set a random secret of at least 32 characters (e.g. `openssl rand -base64 32`), runtime only, never a build argument. Changing it signs every session out and voids open verification and reset links. |
| `APP_DATABASE_URL is required in production.` / `APP_DATABASE_URL must not use the migration role.` | Set the runtime login that inherits `geraicuan_app` (DEP-1 § Environments), distinct from the migration `DATABASE_URL`. |
| `RESEND_FROM_EMAIL is required when RESEND_API_KEY is set.` / `RESEND_FROM_EMAIL must be an email address or "Name <email>".` | Set a sender on the verified domain, e.g. `GeraiCUAN <no-reply@geraicuan.com>`. |

A build that stops at "Collecting page data" with `APP_DATABASE_URL is required.`
or `GERAICUAN_TENANT_ORIGIN is required in production.` has the same cause at
build time: the seven build variables in `docs/spec/15-DEVOPS-CICD-MIGRATIONS.md`
DEP-4 must be available to the build.

Failures that do **not** stop startup and show on first use:
`MENGANTAR_CREDENTIAL_ENCRYPTION_KEY` missing or not 32 base64 bytes (saving a
store's Mengantar key fails); an unreachable database or wrong runtime password.
(`BETTER_AUTH_SECRET` and `APP_DATABASE_URL` are refused at start since T-198.)

A running server that logs `[public-auth] No trusted client IP resolved: …` once
(T-198) is not refusing anything: anonymous sign-up, verification and recovery
attempts from every visitor now count against one shared rate-limit bucket, so
real owners will soon see "terlalu banyak". Fix `BETTER_AUTH_TRUSTED_PROXY_CIDRS`
to the subnet the reverse proxy connects from (DEP-1, "Client addresses only from
the proxy") and restart; the line never contains an address.

## Mail delivery (D-10)

Production logs carry no recipient, link or token. What appears instead:

| Log line | Where | What the user saw | Operator action |
|---|---|---|---|
| `[mail] <kind> delivery failed: HTTP <status>` | `src/lib/mail.ts`; `<kind>` is `verify-email`, `reset-password`, `account-exists`, `registration-approved` or `registration-rejected` | the same answer as a success (sign-up, resend and recovery never reveal delivery) | `401`/`403`: Resend refused the key or the sender (key wrong, revoked or without sending access, or the sender's domain not verified) → check `RESEND_API_KEY` and the domain's status in Resend. `422`: Resend refused the request as invalid, most often the sender → check `RESEND_FROM_EMAIL`. `429`: rate or quota limit → check the Resend plan. `5xx`: Resend side → check Resend's status page. The Resend dashboard's log for the key shows the exact reason for each refused request. |
| `[mail] <kind> delivery failed: transport unavailable` | `src/lib/mail.ts` (network error or the 10 s timeout) | same | Check the server's outbound HTTPS to `api.resend.com` (firewall, DNS). |
| `[daftar] registration mail was not delivered` | `src/app/daftar/actions.ts` | "check your email" — the store **was** created | After mail works, the store owner uses "Kirim ulang email verifikasi" in the login page's unverified state, or `https://app.geraicuan.com/verifikasi-email`. |
| `[verifikasi-email] verification link was not delivered` | `src/app/verifikasi-email/actions.ts` | the identical "sent" answer | Same as the first row; the user can ask again (rate-limited, 3 per email per hour). |
| `[lupa-password] reset link was not delivered` | `src/app/lupa-password/actions.ts` | the identical "sent" answer | Same; the user can ask again (3 per email per hour). |
| (no log line) Super Admin sees "Email ke pemilik belum terkirim; hubungi pemilik secara langsung." | `src/app/platform/pendaftaran/actions.ts` | the approval or rejection **was** recorded | Contact the store owner directly; the decision does not need repeating. |

A burst of these lines right after a deploy is a configuration problem (key,
sender or domain), not load: fix the variable and redeploy.
