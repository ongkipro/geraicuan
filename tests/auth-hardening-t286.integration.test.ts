import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db/client";
import { changeTenantMemberRole, deactivateTenantMember } from "@/db/member-governance-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { executeTenantLifecycle } from "@/db/tenant-lifecycle";
import { auth } from "@/lib/auth";
import nextConfig from "../next.config";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

/**
 * T-286 (review 2026-10-06): security headers (M1), the Super Admin's per-email sign-in limit,
 * 12-hour platform session and TOTP (M2), session revocation on member and store changes (L1),
 * and the Better Auth endpoints the app never uses (L2).
 */
const databaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!databaseUrl || !appDatabaseUrl || new URL(databaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("T-286 tests require geraicuan_test.");
}

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const ORIGIN = "http://127.0.0.1:3110";
const admin = new Pool({ connectionString: databaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });
const password = "local-t286-only-password";
const run = randomUUID().slice(0, 8);
const tenantA = randomUUID();
const tenantB = randomUUID();
const ids = {
  adminA: `t286-${run}-admin-a`,
  adminA2: `t286-${run}-admin-a2`,
  operatorA: `t286-${run}-operator-a`,
  adminB: `t286-${run}-admin-b`,
  platform: `t286-${run}-platform`,
};
const email = (id: string) => `${id}@example.test`;
const userIds = Object.values(ids);

async function cleanup() {
  await admin.query("DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[]) OR actor_id = ANY($2)", [[tenantA, tenantB], userIds]);
  await admin.query("DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
  await admin.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [[tenantA, tenantB]]);
  await admin.query("DELETE FROM verifications WHERE value = ANY($1)", [userIds]);
  await admin.query("DELETE FROM platform_roles WHERE user_id = ANY($1)", [userIds]);
  await admin.query("DELETE FROM users WHERE id = ANY($1)", [userIds]);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(admin, appDatabaseUrl);
  await cleanup();
  const hash = await hashPassword(password);
  for (const id of userIds) {
    await admin.query("INSERT INTO users (id, name, email, email_verified, status) VALUES ($1, $1, $2, true, 'ACTIVE')", [id, email(id)]);
    await admin.query(
      `INSERT INTO accounts (id, account_id, provider_id, issuer, user_id, password)
       VALUES ($1, $2, 'credential', 'local:credential', $2, $3)`,
      [`account-${id}`, id, hash],
    );
  }
  await admin.query("INSERT INTO tenants (id, name, status) VALUES ($1, 'T286 A', 'ACTIVE'), ($2, 'T286 B', 'ACTIVE')", [tenantA, tenantB]);
  await admin.query(
    `INSERT INTO memberships (tenant_id, user_id, role, status) VALUES
      ($1, $2, 'TENANT_ADMIN', 'ACTIVE'), ($1, $3, 'TENANT_ADMIN', 'ACTIVE'), ($1, $4, 'OPERATOR', 'ACTIVE'),
      ($5, $6, 'TENANT_ADMIN', 'ACTIVE')`,
    [tenantA, ids.adminA, ids.adminA2, ids.operatorA, tenantB, ids.adminB],
  );
  await admin.query("INSERT INTO platform_roles (user_id) VALUES ($1)", [ids.platform]);
});

afterAll(async () => {
  await cleanup();
  await admin.end();
  await appPool.end();
});

beforeEach(async () => {
  await admin.query("DELETE FROM rate_limits");
  await admin.query("DELETE FROM public_auth_rate_limits WHERE key LIKE 'sign-in-email:%'");
});

async function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  // Better Auth's per-IP limits (sign-in 5/min, two-factor 3/10 s) are its own and not what
  // these tests check; the per-email sign-in limit lives in `public_auth_rate_limits`.
  await admin.query("DELETE FROM rate_limits");
  return auth.handler(new Request(`${ORIGIN}/api/auth${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    method: "POST",
  }));
}

/** The `name=value` pairs a response sets and does not expire. */
function cookiesOf(response: Response) {
  return response.headers.getSetCookie()
    .filter((cookie) => !/max-age=0/i.test(cookie))
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function signIn(id: string, scope: "platform" | "tenant", secret = password) {
  return request("/sign-in/email", { email: email(id), password: secret }, { "x-geraicuan-login-scope": scope });
}

async function sessionCount(id: string) {
  const result = await admin.query("SELECT count(*)::int AS count FROM sessions WHERE user_id = $1", [id]);
  return result.rows[0].count as number;
}

/** RFC 4648 base32 (no padding), the encoding of the `secret` in Better Auth's `otpauth://` URI. */
function base32Decode(text: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of text.toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? [];
  return Buffer.from(bytes).toString("utf8");
}

async function platformAccess(cookie: string) {
  requestHeaders = new Headers({ cookie, host: "127.0.0.1:3110" });
  const { resolvePlatformAccess } = await import("@/app/platform/platform-access");
  return resolvePlatformAccess();
}

describe("M1: security headers on every path", () => {
  async function headersFor(nodeEnv: string) {
    vi.stubEnv("NODE_ENV", nodeEnv);
    try {
      const rules = await nextConfig.headers!();
      const all = rules.find((rule) => rule.source === "/:path*");
      return new Map(all?.headers.map((header) => [header.key, header.value]));
    } finally {
      vi.unstubAllEnvs();
    }
  }

  it("sends HSTS, CSP framing/plugin/base/form limits, nosniff, referrer and permissions in production", async () => {
    const headers = await headersFor("production");
    expect(headers.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    const csp = headers.get("Content-Security-Policy") ?? "";
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
      expect(csp).toContain(directive);
    }
    // No script policy: Next.js's inline scripts carry no nonce.
    expect(csp).not.toMatch(/script-src|default-src/);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("never stores an authenticated /app or /platform page (M9: Back after Keluar)", async () => {
    const rules = await nextConfig.headers!();
    for (const source of ["/app/:path*", "/platform/:path*"]) {
      const rule = rules.find((candidate) => candidate.source === source);
      expect(rule?.headers).toContainEqual({ key: "Cache-Control", value: "private, no-store" });
    }
    // The public sales page and login stay cacheable by the normal rules.
    expect(rules.find((rule) => rule.source === "/:path*")?.headers.some((header) => header.key === "Cache-Control")).toBe(false);
  });

  it("does not pin a development server on http to HTTPS", async () => {
    const headers = await headersFor("development");
    expect(headers.has("Strict-Transport-Security")).toBe(false);
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });
});

describe("L2: unused Better Auth endpoints answer 404", () => {
  it.each([
    "/verify-password", "/change-password", "/change-email", "/update-user", "/update-session",
    "/delete-user", "/list-sessions", "/revoke-session", "/revoke-sessions", "/revoke-other-sessions",
    "/list-accounts", "/account-info", "/unlink-account", "/link-social", "/sign-in/social",
    "/get-access-token", "/refresh-token", "/two-factor/disable", "/two-factor/get-totp-uri",
    "/two-factor/send-otp", "/two-factor/verify-otp", "/two-factor/generate-backup-codes",
    "/two-factor/verify-backup-code",
  ])("%s", async (path) => {
    const response = await request(path, {});
    expect(response.status).toBe(404);
  });

  it("still serves what the app uses", async () => {
    expect((await request("/sign-in/email", { email: email(ids.adminA), password: "wrong-password" }, { "x-geraicuan-login-scope": "tenant" })).status).toBe(401);
    expect((await request("/sign-out", {})).status).not.toBe(404);
  });
});

describe("M2: per-email sign-in limit", () => {
  it("refuses the 11th attempt on one address within 15 minutes, even with the right password, and only that address", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await signIn(ids.adminB, "tenant", "wrong-password")).status).toBe(401);
    }
    const limited = await signIn(ids.adminB, "tenant");
    expect(limited.status).toBe(429);
    expect(limited.headers.getSetCookie()).toEqual([]);
    expect(await sessionCount(ids.adminB)).toBe(0);

    const other = await signIn(ids.adminA, "tenant");
    expect(other.status).toBe(200);
    await admin.query("DELETE FROM sessions WHERE user_id = $1", [ids.adminA]);
  });
});

describe("M2: Super Admin TOTP and session lifetime", () => {
  beforeEach(async () => {
    await admin.query("DELETE FROM sessions WHERE user_id = $1", [ids.platform]);
    await admin.query("DELETE FROM two_factors WHERE user_id = ANY($1)", [userIds]);
    await admin.query("UPDATE users SET two_factor_enabled = false WHERE id = ANY($1)", [userIds]);
  });

  async function enroll() {
    const signedIn = await signIn(ids.platform, "platform");
    expect(signedIn.status).toBe(200);
    const cookie = cookiesOf(signedIn);
    const enabled = await request("/two-factor/enable", { password }, { cookie, "x-geraicuan-login-scope": "platform" });
    expect(enabled.status).toBe(200);
    const { totpURI } = (await enabled.json()) as { totpURI: string };
    const secret = base32Decode(new URL(totpURI).searchParams.get("secret")!);
    const code = async () => (await auth.api.generateTOTP({ body: { secret } })).code;
    const verified = await request("/two-factor/verify-totp", { code: await code() }, { cookie, "x-geraicuan-login-scope": "platform" });
    expect(verified.status).toBe(200);
    return { code, cookie: cookiesOf(verified), oldCookie: cookie, secret };
  }

  it("opens nothing on the platform until TOTP is enrolled, then opens it", async () => {
    const cookie = cookiesOf(await signIn(ids.platform, "platform"));
    await expect(platformAccess(cookie)).resolves.toMatchObject({ status: "two-factor-required" });
    const { requireCmsScope } = await import("@/lib/cms-auth");
    await expect(requireCmsScope("platform")).rejects.toMatchObject({ reason: "forbidden" });

    const enrolled = await enroll();
    const user = await admin.query("SELECT two_factor_enabled FROM users WHERE id = $1", [ids.platform]);
    expect(user.rows[0].two_factor_enabled).toBe(true);
    await expect(platformAccess(enrolled.cookie)).resolves.toMatchObject({ status: "authorized" });
    await expect(requireCmsScope("platform")).resolves.toMatchObject({ scope: "platform" });
    // The password-only session was replaced, not upgraded.
    await expect(platformAccess(enrolled.oldCookie)).resolves.toMatchObject({ status: "anonymous" });
    // Review M-1: a second password-only session (someone else who knew the password) opened
    // before the enrollment is gone too, instead of being upgraded by the account's flag.
    await expect(platformAccess(cookie)).resolves.toMatchObject({ status: "anonymous" });
    expect(await sessionCount(ids.platform)).toBe(1);
  });

  it("refuses to finish an enrollment from a session past the 12-hour limit (review L-2)", async () => {
    const signedIn = await signIn(ids.platform, "platform");
    const cookie = cookiesOf(signedIn);
    const headers = { cookie, "x-geraicuan-login-scope": "platform" };
    const enabled = await request("/two-factor/enable", { password }, headers);
    expect(enabled.status).toBe(200);
    const { totpURI } = (await enabled.json()) as { totpURI: string };
    const secret = base32Decode(new URL(totpURI).searchParams.get("secret")!);
    await admin.query("UPDATE sessions SET created_at = now() - interval '13 hours' WHERE user_id = $1", [ids.platform]);
    const verified = await request("/two-factor/verify-totp", { code: (await auth.api.generateTOTP({ body: { secret } })).code }, headers);
    expect(verified.status).not.toBe(200);
    const user = await admin.query("SELECT two_factor_enabled FROM users WHERE id = $1", [ids.platform]);
    expect(user.rows[0].two_factor_enabled).toBe(false);
  });

  it("asks an enrolled Super Admin for a code before any session exists, and refuses a wrong one", async () => {
    const { code } = await enroll();
    await admin.query("DELETE FROM sessions WHERE user_id = $1", [ids.platform]);

    const signedIn = await signIn(ids.platform, "platform");
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toMatchObject({ twoFactorRedirect: true });
    expect(await sessionCount(ids.platform)).toBe(0);
    const challenge = cookiesOf(signedIn);
    expect(challenge).toContain("two_factor");
    expect(challenge).not.toContain("session_token");

    const headers = { cookie: challenge, "x-geraicuan-login-scope": "platform" };
    const wrong = await request("/two-factor/verify-totp", { code: "000000" === (await code()) ? "111111" : "000000" }, headers);
    expect(wrong.status).toBe(401);
    expect(await sessionCount(ids.platform)).toBe(0);
    // A remembered device would skip the factor for 30 days.
    expect((await request("/two-factor/verify-totp", { code: await code(), trustDevice: true }, headers)).status).toBe(403);

    const right = await request("/two-factor/verify-totp", { code: await code() }, headers);
    expect(right.status).toBe(200);
    await expect(platformAccess(cookiesOf(right))).resolves.toMatchObject({ status: "authorized" });
  });

  it("refuses enrollment to a tenant account, without the platform scope, and a second time", async () => {
    const tenantCookie = cookiesOf(await signIn(ids.adminB, "tenant"));
    const tenant = await request("/two-factor/enable", { password }, { cookie: tenantCookie, "x-geraicuan-login-scope": "platform" });
    expect(tenant.status).toBe(403);
    const rows = await admin.query("SELECT count(*)::int AS count FROM two_factors WHERE user_id = $1", [ids.adminB]);
    expect(rows.rows[0].count).toBe(0);
    await admin.query("DELETE FROM sessions WHERE user_id = $1", [ids.adminB]);

    const platformCookie = cookiesOf(await signIn(ids.platform, "platform"));
    expect((await request("/two-factor/enable", { password }, { cookie: platformCookie })).status).toBe(403);

    const { cookie, secret } = await enroll();
    const again = await request("/two-factor/enable", { password }, { cookie, "x-geraicuan-login-scope": "platform" });
    expect(again.status).toBe(403);
    // The verified secret is unchanged.
    const stored = await admin.query("SELECT verified FROM two_factors WHERE user_id = $1", [ids.platform]);
    expect(stored.rows).toEqual([{ verified: true }]);
    expect((await auth.api.generateTOTP({ body: { secret } })).code).toMatch(/^\d{6}$/);
  });

  it("ends a Super Admin session 12 hours after sign-in however recently it was used", async () => {
    const { cookie } = await enroll();
    await expect(platformAccess(cookie)).resolves.toMatchObject({ status: "authorized" });
    await admin.query(
      "UPDATE sessions SET created_at = now() - interval '12 hours 1 minute', updated_at = now() WHERE user_id = $1",
      [ids.platform],
    );
    await expect(platformAccess(cookie)).resolves.toMatchObject({ status: "anonymous" });
    expect(await sessionCount(ids.platform)).toBe(0);
  });

  it("keeps a tenant session past 12 hours", async () => {
    const cookie = cookiesOf(await signIn(ids.adminB, "tenant"));
    await admin.query("UPDATE sessions SET created_at = now() - interval '13 hours' WHERE user_id = $1", [ids.adminB]);
    requestHeaders = new Headers({ cookie, host: "127.0.0.1:3110" });
    const { requireCmsScope } = await import("@/lib/cms-auth");
    await expect(requireCmsScope("tenant")).resolves.toMatchObject({ scope: "tenant", tenantId: tenantB });
    await admin.query("DELETE FROM sessions WHERE user_id = $1", [ids.adminB]);
  });

  it("L8: a login page sends only a valid session of its own surface onward", async () => {
    const { signedInDestination } = await import("@/app/login/_components/signed-in-destination");
    const as = (cookie: string) => { requestHeaders = new Headers({ cookie, host: "127.0.0.1:3110" }); };

    as("");
    await expect(signedInDestination("tenant")).resolves.toBeNull();
    await expect(signedInDestination("platform")).resolves.toBeNull();
    as("better-auth.session_token=forged.value");
    await expect(signedInDestination("tenant")).resolves.toBeNull();

    // Tenant: the role's landing, as after a sign-in; never onward to the platform.
    as(cookiesOf(await signIn(ids.adminB, "tenant")));
    await expect(signedInDestination("tenant")).resolves.toBe("/app");
    await expect(signedInDestination("platform")).resolves.toBeNull();
    as(cookiesOf(await signIn(ids.operatorA, "tenant")));
    await expect(signedInDestination("tenant")).resolves.toBe("/app/label");
    // An expired session keeps the form.
    await admin.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1", [ids.operatorA]);
    await expect(signedInDestination("tenant")).resolves.toBeNull();

    // Platform: a Super Admin without TOTP keeps the form; an enrolled one goes to /platform.
    as(cookiesOf(await signIn(ids.platform, "platform")));
    await expect(signedInDestination("platform")).resolves.toBeNull();
    const { cookie } = await enroll();
    as(cookie);
    await expect(signedInDestination("platform")).resolves.toBe("/platform");
    await expect(signedInDestination("tenant")).resolves.toBeNull();
    await admin.query("DELETE FROM sessions WHERE user_id = ANY($1)", [[ids.adminB, ids.operatorA]]);
  });
});

describe("L1: membership and store changes end sessions in the same transaction", () => {
  async function seedSessions() {
    await admin.query("DELETE FROM sessions WHERE user_id = ANY($1)", [userIds]);
    for (const id of userIds) {
      await admin.query(
        "INSERT INTO sessions (id, user_id, token, expires_at) VALUES ($1, $2, $1, now() + interval '1 day')",
        [`t286-session-${randomUUID()}`, id],
      );
    }
  }

  async function membershipId(userId: string) {
    const result = await admin.query("SELECT id FROM memberships WHERE user_id = $1", [userId]);
    return result.rows[0].id as string;
  }

  beforeEach(async () => {
    await admin.query("UPDATE tenants SET status = 'ACTIVE' WHERE id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await admin.query("UPDATE memberships SET status = 'ACTIVE' WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await admin.query("UPDATE memberships SET role = 'OPERATOR' WHERE user_id = $1", [ids.operatorA]);
    await seedSessions();
  });

  it("a role change signs out that member only", async () => {
    const result = await withTenantContext(db, ids.adminA, tenantA, async (tx, context) =>
      changeTenantMemberRole(tx, context, { attemptId: randomUUID(), membershipId: await membershipId(ids.operatorA), role: "TENANT_ADMIN" }));
    expect(result).toMatchObject({ ok: true });
    expect(await sessionCount(ids.operatorA)).toBe(0);
    for (const id of [ids.adminA, ids.adminA2, ids.adminB, ids.platform]) expect(await sessionCount(id), id).toBe(1);
  });

  it("a deactivation signs out that member only", async () => {
    const result = await withTenantContext(db, ids.adminA, tenantA, async (tx, context) =>
      deactivateTenantMember(tx, context, { attemptId: randomUUID(), membershipId: await membershipId(ids.operatorA) }));
    expect(result).toMatchObject({ ok: true });
    expect(await sessionCount(ids.operatorA)).toBe(0);
    for (const id of [ids.adminA, ids.adminA2, ids.adminB, ids.platform]) expect(await sessionCount(id), id).toBe(1);
  });

  it("a refused change signs out nobody", async () => {
    const result = await withTenantContext(db, ids.operatorA, tenantA, async (tx, context) =>
      deactivateTenantMember(tx, context, { attemptId: randomUUID(), membershipId: await membershipId(ids.adminA2) }));
    expect(result).toMatchObject({ ok: false, reason: "NOT_AUTHORIZED" });
    for (const id of userIds) expect(await sessionCount(id), id).toBe(1);
  });

  it("a suspension signs out every member of that store and nobody else", async () => {
    await executeTenantLifecycle(appDb, { userId: ids.platform }, "suspend", { attemptId: randomUUID(), tenantId: tenantA });
    for (const id of [ids.adminA, ids.adminA2, ids.operatorA]) expect(await sessionCount(id), id).toBe(0);
    expect(await sessionCount(ids.adminB)).toBe(1);
    expect(await sessionCount(ids.platform)).toBe(1);

    // Reactivation does not touch sessions.
    await seedSessions();
    await executeTenantLifecycle(appDb, { userId: ids.platform }, "reactivate", { attemptId: randomUUID(), tenantId: tenantA });
    for (const id of userIds) expect(await sessionCount(id), id).toBe(1);
  });

  it("an archive (T-279) signs out every member of that store, nobody else, and none can come back", async () => {
    await expect(executeTenantLifecycle(appDb, { userId: ids.platform }, "archive", {
      attemptId: randomUUID(), expectedName: "T286 A", tenantId: tenantA,
    })).resolves.toEqual({ id: tenantA, status: "ARCHIVED" });
    for (const id of [ids.adminA, ids.adminA2, ids.operatorA]) expect(await sessionCount(id), id).toBe(0);
    expect(await sessionCount(ids.adminB)).toBe(1);
    expect(await sessionCount(ids.platform)).toBe(1);

    // Refused by every tenant scope like a suspended store: no principal, no tenant context,
    // no new session from the right password.
    const { resolveCmsPrincipal } = await import("@/lib/cms-auth");
    await expect(resolveCmsPrincipal(ids.adminA)).resolves.toBeNull();
    await expect(withTenantContext(db, ids.adminA, tenantA, async () => "opened")).rejects.toThrow();
    const refused = await signIn(ids.operatorA, "tenant");
    expect(refused.status).toBe(401);
    expect(await sessionCount(ids.operatorA)).toBe(0);
    expect((await signIn(ids.adminB, "tenant")).status).toBe(200);
  });

  it("the revocation helper acts only for a Super Admin and only on a suspended store", async () => {
    const call = (actor: string, tenant: string) => appPool.connect().then(async (client) => {
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.user_id', $1, true)", [actor]);
        await client.query("SELECT set_config('app.platform_admin', 'true', true)");
        return await client.query("SELECT public.revoke_suspended_tenant_sessions($1::uuid)", [tenant]);
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });
    await expect(call(ids.adminA, tenantB)).rejects.toMatchObject({ code: "42501" });
    await expect(call(ids.platform, tenantB)).rejects.toMatchObject({ code: "55000" });
    for (const id of userIds) expect(await sessionCount(id), id).toBe(1);
  });
});
