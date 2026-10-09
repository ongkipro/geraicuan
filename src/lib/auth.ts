import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { sendResetPasswordMail, sendVerificationMail } from "@/lib/account-mail";
import { resolveBetterAuthRuntimeConfig } from "@/lib/auth-config";
import { resolveCmsPrincipal } from "@/lib/cms-principal";
import { hostAllowsScope } from "@/lib/host-routing";
import { platformSessionExpired } from "@/lib/platform-session";
import { consumePublicAuthRateLimit } from "@/lib/public-auth-rate-limit";
import { CONFIRM_EMAIL_PAGE, normalizeEmailInput } from "@/lib/public-auth-routes";

const { baseURL, hostRouting, trustedOrigins, trustedProxies, useSecureCookies } =
  resolveBetterAuthRuntimeConfig(process.env);

/**
 * Whether a principal of `scope` may act on a request that arrived with these
 * headers. Only the `Host` header is read (see `src/lib/host-routing.ts`).
 */
export function requestHostAllowsScope(
  requestHeaders: Headers,
  scope: "platform" | "tenant",
) {
  return hostAllowsScope(
    hostRouting,
    requestHeaders.get("host"),
    scope,
    process.env.NODE_ENV === "production",
  );
}

/** The one answer for any refused two-factor request (T-286): nothing about why. */
function twoFactorRefused() {
  return new APIError("FORBIDDEN", { code: "TWO_FACTOR_NOT_ALLOWED", message: "Two-factor is not available." });
}

export const auth = betterAuth({
  baseURL,
  trustedOrigins,
  // T-286 (M2): tenant sessions keep Better Auth's 7-day lifetime, refreshed daily. A Super Admin
  // session is further capped at 12 hours from sign-in (`src/lib/platform-session.ts`).
  session: {
    expiresIn: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    transaction: true,
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
    // D-1 amended: a store registers only through `/daftar`, whose server path
    // calls `register_tenant_self_service`; Better Auth never creates a user.
    disableSignUp: true,
    // D-10: an unverified account cannot sign in.
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Public recovery is a tenant-host capability (PR-62). `auth.api` calls
      // carry no Request, so the host is checked by every calling action
      // (`requestHostAllowsScope`) before it gets here. A Super Admin or a user
      // of a rejected or suspended store gets no link; the caller's response is
      // identical either way.
      const principal = await resolveCmsPrincipal(user.id);
      if (principal?.scope !== "tenant") return;
      await sendResetPasswordMail(user.email, url, !user.emailVerified);
    },
    // H1: for an account that was never verified, the reset link is the only
    // verification the owner of the inbox receives after sign-up. Setting a
    // password through it proves the inbox and replaces any password chosen by
    // whoever registered the address, so it also verifies the email.
    onPasswordReset: async ({ user }) => {
      if (user.emailVerified) return;
      await db
        .update(schema.users)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(and(eq(schema.users.id, user.id), eq(schema.users.emailVerified, false)));
    },
  },
  emailVerification: {
    expiresIn: 24 * 60 * 60,
    // A sign-in attempt never sends mail; the login page's resend sends a
    // set-password link instead (H1, `src/app/verifikasi-email/actions.ts`).
    sendOnSignIn: false,
    autoSignInAfterVerification: false,
    // Only `/daftar` calls this, for the account it has just created. A Super
    // Admin or a user of a rejected or suspended store never gets a link (L2).
    // T-198: the link opens `/verifikasi-email/konfirmasi`, never Better Auth's
    // GET `/verify-email` (disabled below), which would verify on the click
    // alone. Whoever registered chose the password; the page verifies only when
    // the inbox owner also knows it (`src/app/verifikasi-email/actions.ts`).
    sendVerificationEmail: async ({ user, token, url }) => {
      const principal = await resolveCmsPrincipal(user.id);
      if (principal?.scope !== "tenant") return;
      const link = new URL(CONFIRM_EMAIL_PAGE, new URL(url).origin);
      link.searchParams.set("token", token);
      await sendVerificationMail(user.email, link.toString());
    },
  },
  // These run only through the rate-limited, fixed-duration server paths in
  // `src/app/daftar`, `src/app/lupa-password`, `src/app/atur-ulang-password` and
  // `src/app/verifikasi-email`; the public HTTP endpoints answer 404. `auth.api`
  // calls are not routed, so the server paths still reach them.
  disabledPaths: [
    "/sign-up/email",
    "/request-password-reset",
    "/reset-password",
    "/send-verification-email",
    // T-198: a click alone must not verify a password the inbox owner did not set.
    "/verify-email",
    // T-286 (L2): account self-service the app never offers. Passwords change only through the
    // recovery path above; there is no social sign-in, account linking or self-deletion, and a
    // session is revoked through `/sign-out` or the governance paths, never by the browser.
    "/verify-password",
    "/change-password",
    "/change-email",
    "/update-user",
    "/update-session",
    "/delete-user",
    "/delete-user/callback",
    "/list-sessions",
    "/revoke-session",
    "/revoke-sessions",
    "/revoke-other-sessions",
    "/list-accounts",
    "/account-info",
    "/unlink-account",
    "/link-social",
    "/sign-in/social",
    "/get-access-token",
    "/refresh-token",
    // T-286: of the two-factor endpoints only enrollment and TOTP verification are served. No
    // email/SMS codes, no self-service backup codes, and 2FA cannot be switched off from a
    // browser session: recovery is the platform operator's (spec 12 §Super Admin two-factor).
    "/two-factor/disable",
    "/two-factor/get-totp-uri",
    "/two-factor/send-otp",
    "/two-factor/verify-otp",
    "/two-factor/generate-backup-codes",
    "/two-factor/verify-backup-code",
  ],
  plugins: [
    // T-286 (M2): TOTP for the Super Admin. Enrollment is refused to every other principal (the
    // `before` hook below), so only a Super Admin ever gets a challenge at sign-in. The plugin
    // limits a challenge to 5 codes and an account to 10 consecutive failures (15-minute lock).
    twoFactor({ issuer: "GeraiCuan" }),
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        // T-286 (M2): besides Better Auth's per-IP limit, a per-email limit, so attempts spread
        // over many addresses cannot guess one account's password. It counts every address,
        // known or not, so the answer says nothing about whether an account exists.
        const email = normalizeEmailInput(ctx.body?.email ?? null);
        if (email && !(await consumePublicAuthRateLimit("sign-in-email", email))) {
          throw new APIError("TOO_MANY_REQUESTS", { message: "Too many requests. Please try again later." });
        }
        return;
      }
      if (!ctx.path.startsWith("/two-factor/")) return;
      const requestHeaders = ctx.request?.headers ?? ctx.headers;
      if (
        !requestHeaders
        || requestHeaders.get("x-geraicuan-login-scope") !== "platform"
        || !requestHostAllowsScope(requestHeaders, "platform")
      ) {
        throw twoFactorRefused();
      }
      // A remembered device would skip the second factor for 30 days.
      if (ctx.path === "/two-factor/verify-totp" && ctx.body?.trustDevice) throw twoFactorRefused();
      // T-286 review L-2: enrolling from a session past the platform limit would mint a fresh
      // 12-hour session; the sign-in verification (no session yet, a two-factor cookie) is unaffected.
      if (ctx.path === "/two-factor/verify-totp") {
        const current = await getSessionFromCtx(ctx);
        if (current && platformSessionExpired(current)) throw twoFactorRefused();
      }
      if (ctx.path === "/two-factor/enable") {
        // Only a Super Admin within the platform session limit, and only once: enabling again
        // would replace a verified secret without proving the old one.
        const session = await getSessionFromCtx(ctx);
        if (
          !session
          || session.user.twoFactorEnabled === true
          || platformSessionExpired(session)
          || (await resolveCmsPrincipal(session.user.id))?.scope !== "platform"
        ) {
          throw twoFactorRefused();
        }
      }
    }),
    // T-286 review M-1: a verified TOTP leaves exactly one session — the one it just created. Any
    // password-only session of the same account (opened before enrollment, e.g. by someone who
    // only knows the password) would otherwise become full platform access the moment the
    // account's `two_factor_enabled` flips.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/two-factor/verify-totp") return;
      const fresh = ctx.context.newSession;
      if (!fresh) return;
      await db.delete(schema.sessions).where(and(
        eq(schema.sessions.userId, fresh.user.id),
        ne(schema.sessions.token, fresh.session.token),
      ));
    }),
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session, context) => {
          const requestedScope = context?.request?.headers.get(
            "x-geraicuan-login-scope",
          );
          if (
            (requestedScope !== "tenant" && requestedScope !== "platform")
            // A tenant session is never minted on the platform host, nor a
            // Super Admin session on the tenant host.
            || !context?.request
            || !requestHostAllowsScope(context.request.headers, requestedScope)
          ) {
            throw new APIError("UNAUTHORIZED", {
              code: "INVALID_EMAIL_OR_PASSWORD",
              message: "Invalid email or password",
            });
          }

          const principal = await resolveCmsPrincipal(session.userId);
          if (principal?.scope !== requestedScope) {
            throw new APIError("UNAUTHORIZED", {
              code: "INVALID_EMAIL_OR_PASSWORD",
              message: "Invalid email or password",
            });
          }
        },
      },
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": {
        max: 5,
        window: 60,
      },
    },
  },
  advanced: {
    // Session cookies stay host-only (D-7): never `crossSubDomainCookies` and
    // never a `domain` in `defaultCookieAttributes`, so a cookie set on the
    // tenant host is not sent to the platform host or the reverse.
    // `trustedProxyHeaders` stays unset so `X-Forwarded-Host` cannot choose the
    // base URL of a generated link.
    disableCSRFCheck: false,
    disableOriginCheck: false,
    useSecureCookies,
    ipAddress: {
      trustedProxies,
    },
  },
});
