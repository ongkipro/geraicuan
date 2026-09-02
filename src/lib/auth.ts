import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, betterAuth } from "better-auth";

import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { resolveBetterAuthRuntimeConfig } from "@/lib/auth-config";
import { resolveCmsPrincipal } from "@/lib/cms-principal";

const { baseURL, trustedOrigins, trustedProxies } =
  resolveBetterAuthRuntimeConfig(process.env);

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
    disableSignUp: true,
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session, context) => {
          const requestedScope = context?.request?.headers.get(
            "x-geraicuan-login-scope",
          );
          if (requestedScope !== "tenant" && requestedScope !== "platform") {
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
    disableCSRFCheck: false,
    disableOriginCheck: false,
    ipAddress: {
      trustedProxies,
    },
  },
});
