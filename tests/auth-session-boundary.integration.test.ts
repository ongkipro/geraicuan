import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { auth } from "@/lib/auth";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const databaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!databaseUrl || !appDatabaseUrl || new URL(databaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Auth session boundary tests require geraicuan_test.");
}

const admin = new Pool({ connectionString: databaseUrl });
const password = "local-auth-boundary-only";

async function signIn(email: string, scope?: "platform" | "tenant") {
  return auth.handler(
    new Request("http://127.0.0.1:3110/api/auth/sign-in/email", {
      body: JSON.stringify({ email, password }),
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:3110",
        ...(scope ? { "x-geraicuan-login-scope": scope } : {}),
      },
      method: "POST",
    }),
  );
}

beforeAll(async () => {
  await admin.query(
    "TRUNCATE rate_limits, sessions, accounts, platform_roles, memberships, tenants, users CASCADE",
  );
  await ensureIntegrationRuntimeRole(admin, appDatabaseUrl);
  const passwordHash = await hashPassword(password);
  await admin.query(
    // Verified: an unverified account cannot sign in at all (D-10), which would
    // mask the scope and status refusals these tests are about.
    `INSERT INTO users (id, name, email, email_verified, status) VALUES
      ('auth-tenant', 'Auth Tenant', 'auth-tenant@example.test', true, 'ACTIVE'),
      ('auth-platform', 'Auth Platform', 'auth-platform@example.test', true, 'ACTIVE'),
      ('auth-suspended', 'Auth Suspended', 'auth-suspended@example.test', true, 'SUSPENDED')`,
  );
  for (const userId of ["auth-tenant", "auth-platform", "auth-suspended"]) {
    await admin.query(
      `INSERT INTO accounts (id, account_id, provider_id, issuer, user_id, password)
       VALUES ($1, $2, 'credential', 'local:credential', $2, $3)`,
      [`account-${userId}`, userId, passwordHash],
    );
  }
  const tenant = await admin.query(
    "INSERT INTO tenants (name, status) VALUES ('Auth Tenant', 'ACTIVE') RETURNING id",
  );
  await admin.query(
    `INSERT INTO memberships (tenant_id, user_id, role, status) VALUES
      ($1, 'auth-tenant', 'TENANT_ADMIN', 'ACTIVE'),
      ($1, 'auth-suspended', 'OPERATOR', 'ACTIVE')`,
    [tenant.rows[0].id],
  );
  await admin.query(
    "INSERT INTO platform_roles (user_id) VALUES ('auth-platform')",
  );
});

afterAll(async () => {
  await admin.query(
    "TRUNCATE rate_limits, sessions, accounts, platform_roles, memberships, tenants, users CASCADE",
  );
  await admin.end();
});

beforeEach(async () => {
  await admin.query("DELETE FROM rate_limits");
});

describe("role-specific login session boundary", () => {
  it("creates a session only when the active principal matches the login entry", async () => {
    const response = await signIn("auth-tenant@example.test", "tenant");

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session_token");
    const count = await admin.query(
      "SELECT count(*)::int AS count FROM sessions WHERE user_id = 'auth-tenant'",
    );
    expect(count.rows[0].count).toBe(1);
  });

  it.each([
    ["wrong scope", "auth-platform@example.test", "tenant" as const],
    ["suspended user", "auth-suspended@example.test", "tenant" as const],
  ])("rejects %s before a session row or cookie exists", async (_label, email, scope) => {
    const response = await signIn(email, scope);

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toMatchObject({
      code: "INVALID_EMAIL_OR_PASSWORD",
    });
    const count = await admin.query(
      "SELECT count(*)::int AS count FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = $1)",
      [email],
    );
    expect(count.rows[0].count).toBe(0);
  });

  it("rejects direct sign-in requests without a bounded login scope", async () => {
    const response = await signIn("auth-platform@example.test");

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toMatchObject({
      code: "INVALID_EMAIL_OR_PASSWORD",
    });
  });

  it("returns the same public error for unknown and wrong-scope credentials", async () => {
    const unknown = await signIn("unknown@example.test", "tenant");
    const wrongScope = await signIn("auth-platform@example.test", "tenant");

    expect(wrongScope.status).toBe(unknown.status);
    expect(await wrongScope.json()).toEqual(await unknown.json());
  });
});
