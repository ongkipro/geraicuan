# Security Architecture: GeraiCUAN

- Status: Draft
- Threat review owner: [TBD owner=Security reviewer; due=before production approval]

## Controls

### SEC-1 — Credential boundary
- Status: Accepted
- Owner: Security reviewer
- Source: PR-10, PR-27, TD-5, TD-15
- Statement: Mengantar API keys are accepted only by an authenticated Tenant Admin Server Action, encrypted immediately with a dedicated runtime key, and resolved only inside trusted server modules. Provider base URL remains platform-controlled and is never tenant input. A validated per-outlet private key takes precedence; otherwise the server resolves the complete platform default. Do not store plaintext in PostgreSQL, source control, browser payloads, analytics, error text, audit metadata, screenshots, or logs. Connection/read models expose only non-secret state and timestamps—never key fragments, credential-bearing URLs, ciphertext, nonce/tag material, or managed-secret references.

### SEC-2 — Authorization/isolation
- Status: Accepted
- Owner: Security reviewer
- Source: TEN-1, TEN-2, IAM-1, IAM-2, IAM-3
- Statement: Deny by default; server authorization and PostgreSQL RLS enforce `TEN-1`/`TEN-2`. Never trust tenant ID, price, service, AWB, or role from the browser.

### SEC-3 — Upstream integrity
- Status: Accepted
- Owner: Security reviewer
- Source: PR-6, PR-8, TD-3, TD-4
- Statement: Validate provider response schema, bind results to the submitting tenant/outlet/batch, use idempotency, and reconcile unknown submission states before retry.

### SEC-4 — Input and output safety
- Status: Accepted
- Owner: Security reviewer
- Source: PR-3, PR-4, PR-7, PR-12
- Statement: Validate imported rows, addresses, phone numbers, amounts, weights, and print rendering inputs. Escape all label/UI fields; limit file size/type and row count.

### SEC-5 — Auditability
- Status: Accepted
- Owner: Security reviewer
- Source: PR-1, PR-16, PR-21, TD-10
- Statement: Audit role, tenant state, connection-reference, submission, recovery, and print/reprint events with actor, tenant, target, correlation ID, and redacted outcome.

### SEC-6 — Secret mutation safety
- Status: Accepted
- Owner: Security reviewer
- Source: PR-27, TD-15, DATA-6
- Statement: Authenticate and authorize before reading secret-bearing form fields; constrain request size and key length; never preserve a submitted key in returned action state; rate-limit create/replace/verification attempts per tenant, actor, and outlet; use authenticated encryption with purpose/tenant/outlet-bound additional data; keep the prior working key if replacement fails; and require explicit confirmation plus a complete platform default before removing a private connection.

### SEC-7 — Host and session-cookie boundary
- Status: Accepted
- Owner: Security reviewer
- Source: PR-58, D-7, T-180
- Statement: One deployment serves the tenant host (`app.`) and the platform host (`bos.`); the apex is a separate static site. Session cookies are host-only: Better Auth's `crossSubDomainCookies` is never enabled and no cookie carries a `Domain` attribute, so a cookie set on one host is not sent to the other. Host routing (`src/proxy.ts`) refuses the other surface's routes with `404`, and is an additional boundary only: `requireCmsScope`, `resolvePlatformAccess` and the session-create hook each refuse a scope presented on the other surface's host, so a tenant session on `bos.` or a Super Admin session on `app.` gets no access even if a cookie were present or a Server Function were posted to an unguarded path. Routing reads only the `Host` header, never `X-Forwarded-Host`; the reverse proxy must pass the public host as `Host`. Better Auth builds verification and recovery links from the request's own host only when it is one of the two configured hosts, over the configured protocol, with `advanced.trustedProxyHeaders` unset; production has no fallback, so an untrusted `Host` gets no link. Production refuses to start without exact HTTPS tenant, platform and public origins on distinct hosts and trusted origins equal to the two CMS origins. Outside production, an unmatched host is served as a single origin for local development and audits.

### SEC-8 — Self-service sign-up, verification, recovery and the approval gate
- Status: Accepted
- Owner: Security reviewer
- Source: PR-59, PR-60, PR-61, PR-62, D-1 (amended), D-8, D-9, D-10, T-181, T-182, T-183, migration 0051
- Statement:
  - **Registration function.** The runtime role still holds no INSERT on `users` or `platform_roles`, and `tenants`/`memberships` inserts stay refused by RLS for it. A store registers only through `register_tenant_self_service(email, owner_name, password_hash, store_name, whatsapp)` (SECURITY DEFINER, `search_path` pinned, EXECUTE revoked from PUBLIC and granted to `geraicuan_app`). Its body generates the user and tenant ids, writes `email_verified = false`, a `local:credential` account with the caller's already-hashed password, a tenant fixed to `PROVISIONING` + `PRIVATE_ONLY`, that new user's `TENANT_ADMIN` membership, one outlet named after the store and a `TENANT_SELF_REGISTERED` audit row — in one transaction — and re-validates every input. It has no parameter naming a status, tenant, role or verification flag, returns NULL for an email that already has an account, and never writes `platform_roles`. The owner-scoped policies `tenants_self_registration_insert` and `memberships_self_registration_insert` (`CURRENT_USER` = the function's owner) let a non-superuser, non-BYPASSRLS migration owner run it and match only the shapes the function writes; the runtime role is never that owner.
  - **Review function.** `review_tenant_registration(target, decision, reason, attempt_id)` re-checks an ACTIVE `SUPER_ADMIN` from `app.user_id`, locks the tenant, requires `PROVISIONING`, requires a verified owner email to approve and a 1–500 character reason to reject, moves the tenant to `ACTIVE` or `ARCHIVED`, and writes `TENANT_REGISTRATION_APPROVED`/`_REJECTED` with from/to status and the reason. The trigger `tenants_registration_transition_guard` refuses any other path out of `PROVISIONING` (including the runtime role with the platform-admin setting) and any change to `mengantar_credential_policy`; the RESTRICTIVE policy `audit_events_tenant_registration_guard` lets only the owning function write each new action. Like the prefix functions, it trusts `app.user_id` as set by the application after session authentication.
  - **Grants moved.** `UPDATE (email_verified, updated_at) ON users` for Better Auth's verification; nothing else on `users` becomes writable. New `public_auth_rate_limits` (no RLS: anonymous boundary; keys are HMAC-SHA256 under `BETTER_AUTH_SECRET`, so no address or IP is stored).
  - **Better Auth.** `disableSignUp: true`; `requireEmailVerification: true`; `sendOnSignIn: false` (a sign-in attempt never sends mail); `autoSignInAfterVerification: false`; `revokeSessionsOnPasswordReset: true`. `disabledPaths` answers 404 for `/sign-up/email`, `/request-password-reset`, `/reset-password` and `/send-verification-email`; the server paths reach them through `auth.api`, which is not routed. `sendResetPassword` sends only to a tenant principal (never a Super Admin, a rejected or suspended store). The `EMAIL_NOT_VERIFIED` answer is returned only after the password matched.
  - **Anti-enumeration.** `/daftar`, `/lupa-password` and `/verifikasi-email` (and the login resend) return the same state for a registered, unregistered, verified or unverified address after a fixed minimum duration (1.8 s sign-up, 1.5 s recovery and resend); an existing address gets a mail (new verification link, or "already registered") instead of a second account. Validation messages never depend on existence.
  - **Rate limits.** Per client (Better Auth's `getIP` with the trusted proxy ranges) and per email, fixed one-hour windows: sign-up 5/client and 3/email, recovery 10/client and 3/email, verification resend 10/client and 3/email, reset submission 10/client. The attempt over the limit is counted and refused. Better Auth's own sign-in limit (5 per 60 s) is unchanged.
  - **Hosts.** Every server path refuses a request whose `Host` is not the tenant host (`requestHostAllowsScope`), so recovery links are only ever built on the trusted tenant host, whatever `X-Forwarded-Host` says (`trustedProxyHeaders` stays unset). The `sendResetPassword` host check alone is not sufficient for `auth.api` calls, which carry no `request`: the action's check is the guard (mutation M15).
  - **Mail.** Resend over `fetch` (`src/lib/mail.ts`). Production refuses to start without `RESEND_API_KEY` and a valid `RESEND_FROM_EMAIL`; development and test record each message, link included, to the server log and an in-memory sink. A production delivery failure logs the message kind and HTTP status only — never a recipient, link or token.
  - **Approval gate (three layers).** `requireCmsScope("tenant")` redirects a `PROVISIONING` tenant to `/app?persetujuan=diperlukan` unless the caller is store setup; `withTenantContext` throws `TenantApprovalPendingError` for it unless `allowPendingApproval` is passed (only the tenant layout, dashboard and the four settings pages and their actions do); every RLS policy on a table that ships still requires an ACTIVE tenant, as does `allocate_shipment_reference`.
  - **Credential policy (D-9).** `tenants.mengantar_credential_policy` (`PLATFORM_DEFAULT_ALLOWED` default for every existing and Super Admin-created tenant; `PRIVATE_ONLY` for self-registered stores). `resolveMengantarAccountCredentials`, `lockMengantarAccountAuthority` and the platform-default restore refuse a `PRIVATE_ONLY` tenant without a private connection (`MengantarPlatformCredentialsRefusedError`, a `MengantarConfigurationError`); RESTRICTIVE policies on `shipment_estimate_snapshots`, `provider_batches` and `provider_settlement_pulls` refuse a `platform_default` row for it.

## Residual risks
Host routing trusts the reverse proxy to forward the public host unchanged in `Host`; a proxy that rewrites `Host` to an internal name makes every request an unknown host (refused in production), and a container health check must send a CMS `Host` header to receive a non-`404` answer. Cookie presence decides only where `/` redirects; the session is validated on the destination page.

Provider API behavior and insurance payload are current-doc assumptions pending a sanitized sandbox estimate. There is no approved production secret, deployment, or penetration-test evidence in this staged plan.

Self-service sign-up (SEC-8): the review function, like the prefix functions, trusts `app.user_id` as set by the application, so SQL injection in the runtime role could forge a Super Admin id. A registrant can create unverified PROVISIONING stores up to the rate limits; they ship nothing and are listed for rejection. The mail sender, domain authentication (SPF/DKIM) and real delivery through Resend are unverified here: no key exists in this environment. There is no terms-of-use document; the sign-up checkbox states the two conditions it agrees to.
