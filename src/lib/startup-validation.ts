import { resolveBetterAuthRuntimeConfig } from "@/lib/auth-config";
import { resolveMailConfiguration } from "@/lib/mail";

/** Better Auth itself only warns below this length; production refuses. */
export const BETTER_AUTH_SECRET_MIN_LENGTH = 32;

/**
 * T-198: values that otherwise fail only on first use. Without
 * `BETTER_AUTH_SECRET` Better Auth throws on the first auth request and the
 * public rate limits refuse; `APP_DATABASE_URL` is checked when `src/db/client.ts`
 * loads, which a start does not do by itself. Messages name the variable, never
 * a value.
 */
function assertRuntimeSecrets(environment: NodeJS.ProcessEnv) {
  if (environment.NODE_ENV !== "production") return;
  const secret = environment.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required in production.");
  if (secret.length < BETTER_AUTH_SECRET_MIN_LENGTH) {
    throw new Error(`BETTER_AUTH_SECRET must be at least ${BETTER_AUTH_SECRET_MIN_LENGTH} characters.`);
  }
  if (!environment.APP_DATABASE_URL) throw new Error("APP_DATABASE_URL is required in production.");
  if (environment.APP_DATABASE_URL === environment.DATABASE_URL) {
    throw new Error("APP_DATABASE_URL must not use the migration role.");
  }
}

/**
 * Refuses to start a production server whose origins, trusted origins or proxy
 * ranges are missing or malformed (PR-58), that has no Resend key and sender
 * for verification and recovery mail (D-10), or that lacks the auth secret or
 * the runtime database login (T-198). A throw from `register` alone is not
 * enough: `next start` logs it and keeps listening, answering every request
 * with 500. Development still throws, so the error shows without killing the
 * dev server.
 */
export function validateStartupConfiguration() {
  try {
    resolveBetterAuthRuntimeConfig(process.env);
    // D-10: production sends verification and recovery mail through Resend.
    resolveMailConfiguration(process.env);
    assertRuntimeSecrets(process.env);
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        `Refusing to start: ${error instanceof Error ? error.message : "invalid configuration"}`,
      );
      process.exit(1);
    }
    throw error;
  }
}
