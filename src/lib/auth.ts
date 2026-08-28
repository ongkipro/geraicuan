import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import { db } from "@/db/client";
import * as schema from "@/db/schema";

const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const trustedProxies = process.env.BETTER_AUTH_TRUSTED_PROXY_CIDRS
  ?.split(",")
  .map((cidr) => cidr.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === "production" && !trustedProxies?.length) {
  throw new Error("BETTER_AUTH_TRUSTED_PROXY_CIDRS is required in production.");
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
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
