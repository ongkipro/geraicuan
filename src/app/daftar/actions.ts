"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { registerSelfServiceTenant } from "@/db/tenant-registration-repository";
import { sendAccountExistsMail } from "@/lib/account-mail";
import { auth, requestHostAllowsScope } from "@/lib/auth";
import { consumePublicAuthRateLimit } from "@/lib/public-auth-rate-limit";
import { clientIdentifier, requestSetPasswordLink, withMinimumDuration } from "@/lib/public-auth";
import { validateRegistration, type RegistrationField } from "@/lib/self-registration";

export type RegistrationValues = Partial<Record<"email" | "ownerName" | "storeName" | "whatsapp", string>>;

export type RegistrationActionState =
  | { status: "idle" }
  | { errors: Partial<Record<RegistrationField, string>>; status: "invalid"; values: RegistrationValues }
  | { status: "limited"; values: RegistrationValues }
  | { status: "unavailable"; values: RegistrationValues }
  | { email: string; status: "submitted" };

/**
 * Every well-formed submission answers after at least this long, whether the
 * email was new (a transaction, a password hash and a message) or already
 * registered (a lookup and possibly a message).
 */
const REGISTRATION_MINIMUM_MS = 1_800;

function valuesFrom(formData: FormData): RegistrationValues {
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.slice(0, 254) : undefined;
  };
  // Passwords are never echoed back.
  return {
    email: read("email"),
    ownerName: read("ownerName"),
    storeName: read("storeName"),
    whatsapp: read("whatsapp"),
  };
}

/**
 * The link asks for the password chosen here before it verifies (T-198,
 * `src/app/verifikasi-email/actions.ts`): whoever submitted this form chose the
 * password, and the inbox may belong to someone else.
 */
async function sendVerification(email: string, requestHeaders: Headers) {
  // Anonymous branch only: a session cookie from another account would be refused.
  const anonymous = new Headers(requestHeaders);
  anonymous.delete("cookie");
  await auth.api.sendVerificationEmail({
    body: { email },
    headers: anonymous,
  });
}

/**
 * The address already has an account. Nothing is created. A verified owner is
 * told the address is registered. An unverified account gets a set-password
 * link, never a plain verification link (H1): its password may be someone
 * else's, and verifying it would let that person sign in with this address.
 */
async function notifyExistingAccount(email: string, requestHeaders: Headers) {
  const [existing] = await db
    .select({ emailVerified: users.emailVerified, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!existing || existing.status !== "ACTIVE") return;
  if (existing.emailVerified) {
    await sendAccountExistsMail(email);
  } else {
    await requestSetPasswordLink(email, requestHeaders);
  }
}

/**
 * PR-59 / D-8: `/daftar`. Creates a store awaiting approval through the
 * registration function, then sends the verification link. The response for a
 * valid submission is identical — same state, same minimum duration — whether
 * or not the email already had an account.
 */
export async function registerStore(
  _previous: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const requestHeaders = await headers();
  const values = valuesFrom(formData);
  if (!requestHostAllowsScope(requestHeaders, "tenant")) {
    return { status: "unavailable", values };
  }

  const validation = validateRegistration(formData);
  if (!validation.ok) {
    return { errors: validation.errors, status: "invalid", values };
  }
  const { input } = validation;

  return withMinimumDuration<RegistrationActionState>(REGISTRATION_MINIMUM_MS, async () => {
    // Both limits count every attempt. Only the client limit is visible (M2): a
    // visible per-email limit would let anyone lock an address out of sign-up
    // and recovery, so past it the answer is unchanged and nothing is done.
    const clientAllowed = await consumePublicAuthRateLimit("register-client", clientIdentifier(requestHeaders));
    const emailAllowed = await consumePublicAuthRateLimit("register-email", input.email);
    if (!clientAllowed) return { status: "limited", values };
    if (!emailAllowed) return { email: input.email, status: "submitted" };

    const context = await auth.$context;
    const passwordHash = await context.password.hash(input.password);
    const result = await registerSelfServiceTenant(db, {
      email: input.email,
      ownerName: input.ownerName,
      passwordHash,
      storeName: input.storeName,
      whatsapp: input.whatsapp,
    });

    try {
      if (result.created) {
        await sendVerification(input.email, requestHeaders);
      } else {
        await notifyExistingAccount(input.email, requestHeaders);
      }
    } catch {
      // The account state is already committed and the answer must not change
      // with delivery; the owner can ask for a new link from the login page.
      console.error("[daftar] registration mail was not delivered");
    }
    return { email: input.email, status: "submitted" };
  });
}
