import { betterAuth, type BetterAuthOptions } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

/**
 * PR-58 / D-7 against the real `src/lib/auth.ts`, loaded with a production
 * environment: host-only session cookies, sessions bound to their host, and
 * generated links that never follow an untrusted Host or X-Forwarded-Host.
 */
const databaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!databaseUrl || !appDatabaseUrl || new URL(databaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Host auth boundary tests require geraicuan_test.");
}

const TENANT_ORIGIN = "https://app.geraicuan.test";
const PLATFORM_ORIGIN = "https://bos.geraicuan.test";
const TENANT_HOST = new URL(TENANT_ORIGIN).host;
const PLATFORM_HOST = new URL(PLATFORM_ORIGIN).host;

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const admin = new Pool({ connectionString: databaseUrl });
const password = "local-host-boundary-only";
const users = {
  platform: { email: "host-platform@example.test", id: "host-platform" },
  tenant: { email: "host-tenant@example.test", id: "host-tenant" },
} as const;
let tenantId: string;

type AuthModule = typeof import("@/lib/auth");
let authModule: AuthModule;

async function cleanup() {
  const ids = [users.tenant.id, users.platform.id];
  await admin.query("DELETE FROM sessions WHERE user_id = ANY($1)", [ids]);
  await admin.query("DELETE FROM verifications WHERE value = ANY($1)", [ids]);
  await admin.query("DELETE FROM accounts WHERE user_id = ANY($1)", [ids]);
  await admin.query("DELETE FROM platform_roles WHERE user_id = ANY($1)", [ids]);
  await admin.query("DELETE FROM memberships WHERE user_id = ANY($1)", [ids]);
  await admin.query("DELETE FROM tenants WHERE name = 'Host Boundary Tenant'");
  await admin.query("DELETE FROM users WHERE id = ANY($1)", [ids]);
}

beforeAll(async () => {
  await cleanup();
  await ensureIntegrationRuntimeRole(admin, appDatabaseUrl);
  const passwordHash = await hashPassword(password);
  for (const user of Object.values(users)) {
    await admin.query(
      // Verified: an unverified account cannot sign in at all (D-10).
      "INSERT INTO users (id, name, email, email_verified, status) VALUES ($1, $1, $2, true, 'ACTIVE')",
      [user.id, user.email],
    );
    await admin.query(
      `INSERT INTO accounts (id, account_id, provider_id, issuer, user_id, password)
       VALUES ($1, $2, 'credential', 'local:credential', $2, $3)`,
      [`account-${user.id}`, user.id, passwordHash],
    );
  }
  const tenant = await admin.query(
    "INSERT INTO tenants (name, status) VALUES ('Host Boundary Tenant', 'ACTIVE') RETURNING id",
  );
  tenantId = tenant.rows[0].id;
  await admin.query(
    "INSERT INTO memberships (tenant_id, user_id, role, status) VALUES ($1, $2, 'TENANT_ADMIN', 'ACTIVE')",
    [tenantId, users.tenant.id],
  );
  await admin.query("INSERT INTO platform_roles (user_id) VALUES ($1)", [users.platform.id]);

  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BETTER_AUTH_URL", TENANT_ORIGIN);
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", `${TENANT_ORIGIN},${PLATFORM_ORIGIN}`);
  vi.stubEnv("BETTER_AUTH_TRUSTED_PROXY_CIDRS", "10.0.0.0/8");
  vi.stubEnv("GERAICUAN_TENANT_ORIGIN", TENANT_ORIGIN);
  vi.stubEnv("GERAICUAN_PLATFORM_ORIGIN", PLATFORM_ORIGIN);
  vi.stubEnv("GERAICUAN_PUBLIC_ORIGIN", "https://geraicuan.test");
  authModule = await import("@/lib/auth");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await cleanup();
  await admin.end();
});

beforeEach(async () => {
  await admin.query("DELETE FROM rate_limits");
  await admin.query("DELETE FROM sessions WHERE user_id = ANY($1)", [
    [users.tenant.id, users.platform.id],
  ]);
});

function post(origin: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  const url = new URL(origin);
  return new Request(`${origin}/api/auth${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      host: url.host,
      origin,
      ...headers,
    },
    method: "POST",
  });
}

async function signIn(origin: string, user: keyof typeof users, scope: "platform" | "tenant") {
  return authModule.auth.handler(
    post(origin, "/sign-in/email", { email: users[user].email, password }, {
      "x-geraicuan-login-scope": scope,
    }),
  );
}

function sessionCookie(response: Response) {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(/(__Secure-better-auth\.session_token=[^;]+)/);
  if (!match) throw new Error("No session cookie was set.");
  return match[1];
}

describe("host-only session cookies (D-7)", () => {
  it("sets the session cookie without a Domain attribute, so it never reaches the other host", async () => {
    const response = await signIn(TENANT_ORIGIN, "tenant", "tenant");

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__Secure-better-auth.session_token=");
    // Host-only: a cookie without Domain is returned only to the exact host
    // that set it (RFC 6265 §5.3 step 6), never to a sibling subdomain.
    expect(setCookie).not.toMatch(/;\s*domain=/i);
    expect(setCookie).toMatch(/;\s*Secure/i);
    expect(setCookie).toMatch(/;\s*HttpOnly/i);
    const advanced: BetterAuthOptions["advanced"] = authModule.auth.options.advanced;
    expect(advanced?.crossSubDomainCookies).toBeUndefined();
    expect(advanced?.defaultCookieAttributes?.domain).toBeUndefined();
  });
});

describe("sessions are bound to their host", () => {
  it.each([
    ["a tenant sign-in on the platform host", PLATFORM_ORIGIN, "tenant", "tenant"],
    ["a Super Admin sign-in on the tenant host", TENANT_ORIGIN, "platform", "platform"],
  ] as const)("refuses %s before any session exists", async (_label, origin, user, scope) => {
    const response = await signIn(origin, user, scope);

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    const sessions = await admin.query(
      "SELECT count(*)::int AS count FROM sessions WHERE user_id = $1",
      [users[user].id],
    );
    expect(sessions.rows[0].count).toBe(0);
  });

  it("denies a tenant session presented on the platform host", async () => {
    const cookie = sessionCookie(await signIn(TENANT_ORIGIN, "tenant", "tenant"));
    const { requireCmsScope, CmsAuthorizationDeniedError } = await import("@/lib/cms-auth");

    requestHeaders = new Headers({ cookie, host: TENANT_HOST });
    await expect(requireCmsScope("tenant")).resolves.toMatchObject({ scope: "tenant", tenantId });

    requestHeaders = new Headers({ cookie, host: PLATFORM_HOST });
    await expect(requireCmsScope("tenant")).rejects.toMatchObject({ reason: "forbidden" });
    // A forwarded header claiming the tenant host changes nothing.
    requestHeaders = new Headers({ cookie, host: PLATFORM_HOST, "x-forwarded-host": TENANT_HOST });
    await expect(requireCmsScope("tenant")).rejects.toBeInstanceOf(CmsAuthorizationDeniedError);
    await expect(requireCmsScope("tenant")).rejects.toMatchObject({ reason: "forbidden" });
  });

  it("denies a Super Admin session presented on the tenant host", async () => {
    const cookie = sessionCookie(await signIn(PLATFORM_ORIGIN, "platform", "platform"));
    const { resolvePlatformAccess } = await import("@/app/platform/platform-access");
    const { requireCmsScope } = await import("@/lib/cms-auth");

    requestHeaders = new Headers({ cookie, host: PLATFORM_HOST });
    await expect(resolvePlatformAccess()).resolves.toMatchObject({ status: "authorized" });
    await expect(requireCmsScope("platform")).resolves.toMatchObject({ scope: "platform" });

    requestHeaders = new Headers({ cookie, host: TENANT_HOST });
    await expect(resolvePlatformAccess()).resolves.toMatchObject({ status: "forbidden" });
    await expect(requireCmsScope("platform")).rejects.toMatchObject({ reason: "forbidden" });
  });
});

describe("generated links resolve to the request's own trusted host", () => {
  // The application's real auth options, with only a capture hook for the
  // reset link added: base URL, trusted origins and proxy trust are unchanged.
  function probe(captured: string[]) {
    const options = authModule.auth.options;
    return betterAuth({
      ...options,
      emailAndPassword: {
        ...options.emailAndPassword,
        sendResetPassword: async ({ url }) => {
          captured.push(url);
        },
      },
    });
  }

  // T-181 closed the public `/request-password-reset` endpoint (it answers 404);
  // the server path at `/lupa-password` calls it through `auth.api` with the
  // request's own headers, so that is the call these cases exercise.
  it.each([
    ["the tenant host", TENANT_HOST, {}, TENANT_ORIGIN],
    ["the platform host", PLATFORM_HOST, {}, PLATFORM_ORIGIN],
    [
      "the tenant host with a forged X-Forwarded-Host and proto",
      TENANT_HOST,
      { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" },
      TENANT_ORIGIN,
    ],
    [
      "the tenant host with a forwarded header naming the platform host",
      TENANT_HOST,
      { "x-forwarded-host": PLATFORM_HOST },
      TENANT_ORIGIN,
    ],
  ])("builds the reset link on %s", async (_label, host, headers, expected) => {
    const captured: string[] = [];
    await probe(captured).api.requestPasswordReset({
      body: { email: users.tenant.email },
      headers: new Headers({ host, ...headers }),
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].startsWith(`${expected}/api/auth/reset-password/`)).toBe(true);
  });

  it.each([
    ["an untrusted Host", { host: "evil.example" }],
    ["an untrusted Host with a trusted X-Forwarded-Host", { host: "evil.example", "x-forwarded-host": TENANT_HOST }],
  ])("generates no link for %s", async (_label, headers) => {
    const captured: string[] = [];
    const outcome = await probe(captured)
      .api.requestPasswordReset({ body: { email: users.tenant.email }, headers: new Headers(headers) })
      .then(() => "resolved", () => "refused");

    expect(captured).toEqual([]);
    expect(outcome).toBe("refused");
  });

  it("answers 404 on the public reset-request endpoint", async () => {
    const response = await authModule.auth.handler(
      post(TENANT_ORIGIN, "/request-password-reset", { email: users.tenant.email }),
    );
    expect(response.status).toBe(404);
  });
});
