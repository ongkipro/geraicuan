import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, betterAuth } from "better-auth";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { sendResetPasswordMail, sendVerificationMail } from "@/lib/account-mail";
import { resolveBetterAuthRuntimeConfig } from "@/lib/auth-config";
import { resolveCmsPrincipal } from "@/lib/cms-principal";
import { hostAllowsScope } from "@/lib/host-routing";
import { CONFIRM_EMAIL_PAGE } from "@/lib/public-auth-routes";

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

export const auth = betterAuth({
  baseURL,
  trustedOrigins,
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
  ],
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
