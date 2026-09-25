import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { verifyPassword } from "better-auth/crypto";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../scripts/bootstrap-super-admin.mjs";

/**
 * T-194: `scripts/bootstrap-super-admin.mjs` on a disposable database migrated to
 * head. The created account must sign in through the real Better Auth
 * configuration (`src/lib/auth.ts`, production host routing) as a Super Admin.
 */
const databaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!databaseUrl || !appDatabaseUrl || new URL(databaseUrl).hostname !== "127.0.0.1") {
  throw new Error("Bootstrap tests require the local test database server.");
}

const TENANT_ORIGIN = "https://app.geraicuan.test";
const PLATFORM_ORIGIN = "https://bos.geraicuan.test";
const SCRIPT = join(process.cwd(), "scripts/bootstrap-super-admin.mjs");
const password = "bootstrap-local-only-9f2c";
const email = "first.admin@example.test";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const databaseName = `geraicuan_bootstrap_${randomBytes(4).toString("hex")}`;
const withDatabase = (url: string, name: string) => {
  const target = new URL(url);
  target.pathname = `/${name}`;
  return target.toString();
};
const bootstrapUrl = withDatabase(databaseUrl, databaseName);
const runtimeUrl = withDatabase(appDatabaseUrl, databaseName);
const scratch = mkdtempSync(join(tmpdir(), "bootstrap-super-admin-"));
let admin: Pool;

function run(args: string[], options: { env?: Record<string, string>; input?: string } = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: bootstrapUrl, BOOTSTRAP_PASSWORD_FILE: "", ...options.env },
    input: options.input ?? "",
    timeout: 60_000,
  });
  return { output: `${result.stdout}${result.stderr}`, status: result.status, stdout: result.stdout };
}

async function superAdminCount() {
  const result = await admin.query("SELECT count(*)::int AS count FROM platform_roles WHERE role = 'SUPER_ADMIN'");
  return result.rows[0].count as number;
}

beforeAll(async () => {
  const server = new Client({ connectionString: withDatabase(databaseUrl, "postgres") });
  await server.connect();
  await server.query(`CREATE DATABASE ${databaseName}`);
  await server.end();

  const migration = spawnSync(join(process.cwd(), "node_modules/.bin/drizzle-kit"), ["migrate"], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: bootstrapUrl },
    timeout: 170_000,
  });
  if (migration.status !== 0) throw new Error(`Migration failed:\n${migration.stderr.slice(-2000)}`);

  admin = new Pool({ connectionString: bootstrapUrl });
  await ensureIntegrationRuntimeRole(admin, appDatabaseUrl);
  await admin.query(
    "INSERT INTO users (id, name, email, email_verified, status) VALUES ('taken-user', 'Taken User', 'taken@example.test', false, 'ACTIVE')",
  );
}, 180_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  rmSync(scratch, { force: true, recursive: true });
  const { dbPool } = await import("@/db/client");
  await dbPool.end();
  await admin?.end();
  const server = new Client({ connectionString: withDatabase(databaseUrl, "postgres") });
  await server.connect();
  await server.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await server.end();
});

describe("bootstrap-super-admin refusals", () => {
  it("uses the same password limits as sign-up and password reset", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/public-auth.ts"), "utf8");
    expect(Number(/PASSWORD_MIN_LENGTH = (\d+)/.exec(source)?.[1])).toBe(PASSWORD_MIN_LENGTH);
    expect(Number(/PASSWORD_MAX_LENGTH = (\d+)/.exec(source)?.[1])).toBe(PASSWORD_MAX_LENGTH);
  });

  it("never accepts a password argument, a short password, or an existing email", async () => {
    const argument = run(["--email", email, "--name", "First Admin", "--password", password]);
    expect(argument.status).toBe(1);
    expect(argument.output).toContain("Unknown argument --password");
    expect(argument.output).not.toContain(password);

    const short = run(["--email", email, "--name", "First Admin"], { input: "short7\n" });
    expect(short.status).toBe(1);
    expect(short.output).toContain(`The password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`);

    const taken = run(["--email", " Taken@Example.test ", "--name", "Someone"], { input: password });
    expect(taken.status).toBe(1);
    expect(taken.output).toContain("That email already belongs to an account.");
    const user = await admin.query("SELECT email_verified FROM users WHERE id = 'taken-user'");
    expect(user.rows[0].email_verified).toBe(false);
    expect(await superAdminCount()).toBe(0);
  });

  it("refuses a role that does not bypass row-level security (the runtime role)", async () => {
    const runtime = run(["--email", email, "--name", "First Admin"], {
      env: { DATABASE_URL: runtimeUrl },
      input: password,
    });
    expect(runtime.status).toBe(1);
    expect(runtime.output).toContain("DATABASE_URL must use the database superuser");
    expect(runtime.output).not.toContain(runtimeUrl);
    expect(await superAdminCount()).toBe(0);
  });
});

describe("bootstrap-super-admin creates one Super Admin who can sign in", () => {
  let userId: string;

  beforeAll(() => {
    const created = run(["--", "--email", ` ${email.toUpperCase()} `, "--name", " First Admin "], {
      input: `${password}\n`,
    });
    expect(created.output).not.toContain(password);
    expect(created.output).not.toContain(bootstrapUrl);
    expect(created.status).toBe(0);
    const match = /^Created Super Admin user ([0-9a-f]{32}) <([^>]+)>\.\n$/.exec(created.stdout);
    expect(match?.[2]).toBe(email);
    userId = match![1];
  }, 60_000);

  it("writes a verified ACTIVE user, a credential account and exactly one SUPER_ADMIN role", async () => {
    const user = await admin.query("SELECT name, email, email_verified, status FROM users WHERE id = $1", [userId]);
    expect(user.rows).toEqual([{ email, email_verified: true, name: "First Admin", status: "ACTIVE" }]);
    const account = await admin.query(
      "SELECT account_id, provider_id, issuer, password FROM accounts WHERE user_id = $1",
      [userId],
    );
    expect(account.rows).toHaveLength(1);
    expect(account.rows[0]).toMatchObject({ account_id: userId, issuer: "local:credential", provider_id: "credential" });
    expect(await verifyPassword({ hash: account.rows[0].password, password })).toBe(true);
    const roles = await admin.query("SELECT user_id, role FROM platform_roles");
    expect(roles.rows).toEqual([{ role: "SUPER_ADMIN", user_id: userId }]);
  });

  it("refuses a second run, even with a new email, and changes nothing", async () => {
    const file = join(scratch, "password");
    writeFileSync(file, `${password}\n`, { mode: 0o600 });
    const second = run(["--email", "second.admin@example.test", "--name", "Second Admin"], {
      env: { BOOTSTRAP_PASSWORD_FILE: file },
    });
    expect(second.status).toBe(1);
    expect(second.output).toContain("A Super Admin already exists.");
    expect(await superAdminCount()).toBe(1);
    const users = await admin.query("SELECT count(*)::int AS count FROM users");
    expect(users.rows[0].count).toBe(2);
    const hash = await admin.query("SELECT password FROM accounts WHERE user_id = $1", [userId]);
    expect(second.output).not.toContain(hash.rows[0].password);
  });

  it("signs in through Better Auth on the platform host, and only there", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_DATABASE_URL", runtimeUrl);
    vi.stubEnv("DATABASE_URL", bootstrapUrl);
    vi.stubEnv("BETTER_AUTH_URL", TENANT_ORIGIN);
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", `${TENANT_ORIGIN},${PLATFORM_ORIGIN}`);
    vi.stubEnv("BETTER_AUTH_TRUSTED_PROXY_CIDRS", "10.0.0.0/8");
    vi.stubEnv("GERAICUAN_TENANT_ORIGIN", TENANT_ORIGIN);
    vi.stubEnv("GERAICUAN_PLATFORM_ORIGIN", PLATFORM_ORIGIN);
    vi.stubEnv("GERAICUAN_PUBLIC_ORIGIN", "https://geraicuan.test");
    const { auth } = await import("@/lib/auth");
    const { resolveCmsPrincipal } = await import("@/lib/cms-principal");

    const signIn = (origin: string, scope: string, secret: string) =>
      auth.handler(
        new Request(`${origin}/api/auth/sign-in/email`, {
          body: JSON.stringify({ email, password: secret }),
          headers: {
            "content-type": "application/json",
            host: new URL(origin).host,
            origin,
            "x-geraicuan-login-scope": scope,
          },
          method: "POST",
        }),
      );

    const platform = await signIn(PLATFORM_ORIGIN, "platform", password);
    expect(platform.status).toBe(200);
    expect(platform.headers.get("set-cookie") ?? "").toContain("__Secure-better-auth.session_token=");
    const body = await platform.json();
    expect(body.user).toMatchObject({ email, emailVerified: true, id: userId });

    expect((await signIn(PLATFORM_ORIGIN, "platform", `${password}x`)).status).toBe(401);
    expect((await signIn(TENANT_ORIGIN, "tenant", password)).status).toBe(401);
    expect(await resolveCmsPrincipal(userId)).toEqual({ scope: "platform", userId });
  });
});
