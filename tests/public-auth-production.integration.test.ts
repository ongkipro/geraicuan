import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

/**
 * T-181 (PR-59, PR-62, D-7, D-10) under a production environment: mail goes to
 * Resend (stubbed `fetch` — nothing leaves this process), recovery links are
 * built on the request's own trusted host whatever `X-Forwarded-Host` says, and
 * no token or link reaches a log line.
 */
const databaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!databaseUrl || !appDatabaseUrl || new URL(databaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Production public-auth tests require geraicuan_test.");
}

const TENANT_ORIGIN = "https://app.geraicuan.test";
const PLATFORM_ORIGIN = "https://bos.geraicuan.test";
const TENANT_HOST = new URL(TENANT_ORIGIN).host;
const PLATFORM_HOST = new URL(PLATFORM_ORIGIN).host;
const DOMAIN = "t181-production.example.test";
const tenantId = "18110000-0000-4000-8000-000000000001";
const userId = "t181-production-admin";
const password = "t181-production-password";

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => requestHeaders,
}));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
}));

// Better Auth decides at its own load whether it runs under test, and then
// answers 127.0.0.1 for a request without a usable forwarded address. A
// production process has no such fallback; this restores that answer.
vi.mock("better-auth/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("better-auth/api")>();
  return {
    ...actual,
    getIP: (...args: Parameters<typeof actual.getIP>) => {
      const ip = actual.getIP(...args);
      return ip === "127.0.0.1" ? null : ip;
    },
  };
});

const admin = new Pool({ connectionString: databaseUrl });
const deliveries: Array<{ html: string; subject: string; text: string; to: string[] }> = [];
let resendStatus = 200;
const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) !== "https://api.resend.com/emails") throw new Error(`Unexpected fetch ${String(input)}`);
  expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_test_stub_key_not_real");
  deliveries.push(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify({ id: "stub" }), { status: resendStatus });
});

const logged: string[] = [];

async function cleanup() {
  const tenants = await admin.query<{ id: string }>(
    "SELECT DISTINCT m.tenant_id AS id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.email LIKE $1",
    [`%@${DOMAIN}`],
  );
  const ids = [...tenants.rows.map((row) => row.id), tenantId];
  await admin.query("DELETE FROM audit_events WHERE tenant_id = ANY($1)", [ids]);
  await admin.query("DELETE FROM accounts WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)", [`%@${DOMAIN}`]);
  await admin.query("DELETE FROM outlets WHERE tenant_id = ANY($1)", [ids]);
  await admin.query("DELETE FROM memberships WHERE tenant_id = ANY($1)", [ids]);
  await admin.query("DELETE FROM tenants WHERE id = ANY($1)", [ids]);
  await admin.query("DELETE FROM users WHERE email LIKE $1", [`%@${DOMAIN}`]);
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(admin, appDatabaseUrl);
  await cleanup();
  await admin.query(
    "INSERT INTO users (id, name, email, email_verified) VALUES ($1, 'Pemilik Produksi', $2, true)",
    [userId, `owner@${DOMAIN}`],
  );
  await admin.query(
    "INSERT INTO accounts (id, account_id, provider_id, issuer, user_id, password) VALUES ($1, $2, 'credential', 'local:credential', $2, $3)",
    [`account-${userId}`, userId, await hashPassword(password)],
  );
  await admin.query("INSERT INTO tenants (id, name, status) VALUES ($1, 'T181 Production Store', 'ACTIVE')", [tenantId]);
  await admin.query("INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN')", [tenantId, userId]);

  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BETTER_AUTH_URL", TENANT_ORIGIN);
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", `${TENANT_ORIGIN},${PLATFORM_ORIGIN}`);
  vi.stubEnv("BETTER_AUTH_TRUSTED_PROXY_CIDRS", "10.0.0.0/8");
  vi.stubEnv("GERAICUAN_TENANT_ORIGIN", TENANT_ORIGIN);
  vi.stubEnv("GERAICUAN_PLATFORM_ORIGIN", PLATFORM_ORIGIN);
  vi.stubEnv("GERAICUAN_PUBLIC_ORIGIN", "https://geraicuan.test");
  vi.stubEnv("RESEND_API_KEY", "re_test_stub_key_not_real");
  vi.stubEnv("RESEND_FROM_EMAIL", "GeraiCUAN <no-reply@geraicuan.test>");
  vi.stubGlobal("fetch", fetchStub);
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack}` : typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
    });
  }
});

beforeEach(async () => {
  await admin.query("DELETE FROM public_auth_rate_limits");
  deliveries.length = 0;
  resendStatus = 200;
});

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await cleanup();
  await admin.end();
});

function linksIn(text: string) {
  return [...text.matchAll(/https?:\/\/[^\s"<>]+/g)].map((match) => match[0]);
}

describe("recovery links on the trusted host (D-7)", () => {
  it("builds the reset link on the tenant host despite a forged X-Forwarded-Host and proto", async () => {
    const { requestPasswordReset } = await import("@/app/lupa-password/actions");
    requestHeaders = new Headers({
      host: TENANT_HOST,
      "x-forwarded-for": "203.0.113.5, 10.0.0.2",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
    });
    expect(await requestPasswordReset({ status: "idle" }, form({ email: `owner@${DOMAIN}` }))).toEqual({ status: "sent" });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].to).toEqual([`owner@${DOMAIN}`]);
    const links = linksIn(deliveries[0].text).filter((link) => link.includes("reset-password"));
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => link.startsWith(`${TENANT_ORIGIN}/api/auth/reset-password/`))).toBe(true);
    expect(deliveries[0].text).not.toContain("evil.example");
  });

  it("sends nothing for a request that arrives on the platform host, with the same answer", async () => {
    const { requestPasswordReset } = await import("@/app/lupa-password/actions");
    requestHeaders = new Headers({ host: PLATFORM_HOST, "x-forwarded-for": "203.0.113.6, 10.0.0.2" });
    expect(await requestPasswordReset({ status: "idle" }, form({ email: `owner@${DOMAIN}` }))).toEqual({ status: "sent" });
    expect(deliveries).toEqual([]);
  });
});

describe("the shared rate-limit bucket without a trusted client IP (T-198)", () => {
  it("keeps limiting and warns once, naming the proxy setting and no address", async () => {
    const { clientIdentifier } = await import("@/lib/public-auth");
    logged.length = 0;
    // No forwarded header, and one Better Auth cannot read.
    expect(clientIdentifier(new Headers({ host: TENANT_HOST }))).toBe("no-trusted-ip");
    expect(clientIdentifier(new Headers({ host: TENANT_HOST, "x-forwarded-for": "203.0.113.9, unknown" }))).toBe("no-trusted-ip");
    expect(clientIdentifier(new Headers({ host: TENANT_HOST, "x-forwarded-for": "203.0.113.9, 10.0.0.2" }))).toBe("203.0.113.9");
    const warnings = logged.filter((line) => line.includes("No trusted client IP resolved"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("BETTER_AUTH_TRUSTED_PROXY_CIDRS");
    expect(warnings[0]).not.toMatch(/203\.0\.113|unknown/);
  });
});

describe("the sign-up verification link in production (T-198)", () => {
  it("opens the password confirmation page on the tenant host, and Better Auth's GET endpoint is closed", async () => {
    const { registerStore } = await import("@/app/daftar/actions");
    const { auth } = await import("@/lib/auth");
    requestHeaders = new Headers({ host: TENANT_HOST, "x-forwarded-for": "203.0.113.8, 10.0.0.2", "x-forwarded-host": "evil.example" });
    expect(await registerStore({ status: "idle" }, form({
      email: `link@${DOMAIN}`, ownerName: "Pemilik Tautan", password, passwordConfirmation: password,
      storeName: "Toko Tautan", terms: "setuju", whatsapp: "081234567890",
    }))).toMatchObject({ status: "submitted" });
    const link = linksIn(deliveries[0]?.text ?? "").find((candidate) => candidate.includes("token="));
    expect(link).toMatch(new RegExp(`^${TENANT_ORIGIN}/verifikasi-email/konfirmasi\\?token=[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$`));
    const token = new URL(link!).searchParams.get("token")!;
    const opened = await auth.handler(new Request(`${TENANT_ORIGIN}/api/auth/verify-email?token=${token}`, { headers: { host: TENANT_HOST } }));
    expect(opened.status).toBe(404);
    expect((await admin.query("SELECT email_verified FROM users WHERE email = $1", [`link@${DOMAIN}`])).rows[0].email_verified).toBe(false);
  }, 15_000);
});

describe("no token in production logs (D-10)", () => {
  it("logs no link, token or recipient across sign-up, verification, recovery and a failed delivery", async () => {
    const { registerStore } = await import("@/app/daftar/actions");
    const { resendVerificationEmail } = await import("@/app/verifikasi-email/actions");
    const { requestPasswordReset } = await import("@/app/lupa-password/actions");
    logged.length = 0;
    requestHeaders = new Headers({ host: TENANT_HOST, "x-forwarded-for": "203.0.113.7, 10.0.0.2" });

    const registration = {
      email: `new@${DOMAIN}`,
      ownerName: "Pemilik Baru",
      password,
      passwordConfirmation: password,
      storeName: "Toko Produksi",
      terms: "setuju",
      whatsapp: "081234567890",
    };
    expect(await registerStore({ status: "idle" }, form(registration))).toMatchObject({ status: "submitted" });
    expect(await registerStore({ status: "idle" }, form({ ...registration, email: `owner@${DOMAIN}` }))).toMatchObject({ status: "submitted" });
    expect(await resendVerificationEmail({ status: "idle" }, form({ email: `new@${DOMAIN}` }))).toEqual({ status: "sent" });
    expect(await requestPasswordReset({ status: "idle" }, form({ email: `owner@${DOMAIN}` }))).toEqual({ status: "sent" });
    resendStatus = 500;
    expect(await requestPasswordReset({ status: "idle" }, form({ email: `owner@${DOMAIN}` }))).toEqual({ status: "sent" });

    // Every kind that carries a secret was really produced and delivered...
    const sentLinks = deliveries.flatMap((delivery) => linksIn(delivery.text));
    const secrets = sentLinks
      .filter((link) => /verifikasi-email\/konfirmasi\?token=|reset-password\//.test(link))
      .flatMap((link) => {
        const url = new URL(link);
        return [link, url.searchParams.get("token") ?? url.pathname.split("/").at(-1) ?? ""];
      })
      .filter((value) => value.length >= 16);
    expect(deliveries.map((delivery) => delivery.subject)).toEqual([
      "Verifikasi email GeraiCUAN Anda",
      "Email Anda sudah terdaftar di GeraiCUAN",
      // H1: the resend for an unverified account is a set-password link.
      "Buat kata sandi untuk memverifikasi email GeraiCUAN",
      "Atur ulang kata sandi GeraiCUAN",
      "Atur ulang kata sandi GeraiCUAN",
    ]);
    expect(secrets.length).toBeGreaterThanOrEqual(8);

    // ...and none of it, nor any recipient, is in a log line.
    const logText = logged.join("\n");
    expect(logText).toContain("[mail] reset-password delivery failed: HTTP 500");
    for (const secret of secrets) expect(logText).not.toContain(secret);
    expect(logText).not.toMatch(/token=|reset-password\/[A-Za-z0-9]/);
    expect(logText).not.toContain(DOMAIN);
  }, 30_000);
});
