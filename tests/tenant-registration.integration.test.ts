import { hashPassword, signJWT } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

/**
 * T-181 / T-182 (PR-59, PR-61, D-1 amended, D-8, D-9, D-10): store sign-up
 * through the registration function, email verification before sign-in,
 * identical answers, database rate limits, the closed Better Auth endpoints and
 * the audited Super Admin review.
 */
const databaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!databaseUrl || !appDatabaseUrl || new URL(databaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Registration tests require geraicuan_test.");
}

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => requestHeaders,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const admin = new Pool({ connectionString: databaseUrl });
const runtime = new Pool({ connectionString: appDatabaseUrl });
const runtimeDb = drizzle({ client: runtime, schema });
const origin = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3110";
const host = new URL(origin).host;
const EMAIL_DOMAIN = "t181-registration.example.test";
const existingTenantId = "18100000-0000-4000-8000-000000000001";
const superAdminId = "t181-super-admin";
const password = "t181-password-only";

type Mail = typeof import("@/lib/mail");
let mail: Mail;

function email(local: string) {
  return `${local}@${EMAIL_DOMAIN}`;
}

// T-198: a rejected, never-verified owner's address is released to a reserved
// one (0053); only these suites create such rows on the test database.
const OWN_USERS = "(email LIKE $1 OR email LIKE 'released+%@registration.invalid')";

async function cleanup() {
  const tenants = await admin.query<{ id: string }>(
    `SELECT DISTINCT m.tenant_id AS id FROM memberships m JOIN users u ON u.id = m.user_id WHERE ${OWN_USERS.replaceAll("email", "u.email")}`,
    [`%@${EMAIL_DOMAIN}`],
  );
  const tenantIds = [...tenants.rows.map((row) => row.id), existingTenantId];
  await admin.query("DELETE FROM audit_events WHERE tenant_id = ANY($1) OR target_id = ANY($2::text[])", [tenantIds, tenantIds]);
  await admin.query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE ${OWN_USERS})`, [`%@${EMAIL_DOMAIN}`]);
  await admin.query(`DELETE FROM accounts WHERE user_id IN (SELECT id FROM users WHERE ${OWN_USERS})`, [`%@${EMAIL_DOMAIN}`]);
  await admin.query("DELETE FROM outlets WHERE tenant_id = ANY($1)", [tenantIds]);
  await admin.query("DELETE FROM memberships WHERE tenant_id = ANY($1)", [tenantIds]);
  await admin.query(`DELETE FROM platform_roles WHERE user_id = $2 OR user_id IN (SELECT id FROM users WHERE ${OWN_USERS})`, [`%@${EMAIL_DOMAIN}`, superAdminId]);
  await admin.query("DELETE FROM tenants WHERE id = ANY($1)", [tenantIds]);
  await admin.query(`DELETE FROM users WHERE ${OWN_USERS}`, [`%@${EMAIL_DOMAIN}`]);
  await admin.query("DELETE FROM verifications WHERE identifier LIKE 'reset-password:%'");
}

function registrationForm(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const values: Record<string, string> = {
    email: email("owner"),
    ownerName: "Ibu Sari",
    password,
    passwordConfirmation: password,
    storeName: "Toko Sari Makmur",
    terms: "setuju",
    whatsapp: "+62 812-3456-7890",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function register(overrides: Record<string, string> = {}, forwardedFor = "203.0.113.10") {
  const { registerStore } = await import("@/app/daftar/actions");
  requestHeaders = new Headers({ host, "x-forwarded-for": forwardedFor });
  const started = Date.now();
  const state = await registerStore({ status: "idle" }, registrationForm(overrides));
  return { elapsed: Date.now() - started, state };
}

async function rowsFor(address: string) {
  const result = await admin.query(`
    SELECT u.id AS user_id, u.email_verified, u.status AS user_status,
      a.provider_id, a.issuer, a.account_id = u.id AS account_matches,
      t.id AS tenant_id, t.status AS tenant_status, t.mengantar_credential_policy, t.contact_whatsapp, t.name AS tenant_name,
      m.role, m.status AS membership_status,
      (SELECT count(*)::int FROM outlets o WHERE o.tenant_id = t.id) AS outlets,
      (SELECT count(*)::int FROM platform_roles p WHERE p.user_id = u.id) AS platform_roles,
      (SELECT count(*)::int FROM audit_events e WHERE e.tenant_id = t.id AND e.action = 'TENANT_SELF_REGISTERED' AND e.actor_id = u.id AND e.to_status = 'PROVISIONING') AS audits
    FROM users u
    LEFT JOIN accounts a ON a.user_id = u.id
    LEFT JOIN memberships m ON m.user_id = u.id
    LEFT JOIN tenants t ON t.id = m.tenant_id
    WHERE u.email = $1`, [address]);
  return result.rows;
}

/** Submits the verification page (T-198) for the token in `link`. */
async function confirmLink(link: string, secret: string, forwardedFor = "203.0.113.90") {
  const { confirmEmailVerification } = await import("@/app/verifikasi-email/actions");
  requestHeaders = new Headers({ host, "x-forwarded-for": forwardedFor });
  const data = new FormData();
  data.set("token", new URL(link).searchParams.get("token") ?? "");
  data.set("password", secret);
  return confirmEmailVerification({ status: "idle" }, data);
}

function lastLink(address: string, kind: string) {
  const link = mail.recordedMail().filter((message) => message.to === address && message.kind === kind).at(-1)?.link;
  if (!link) throw new Error(`No ${kind} link was recorded for ${address}.`);
  return link;
}

async function signIn(address: string, secret = password) {
  const { auth } = await import("@/lib/auth");
  return auth.handler(new Request(`${origin}/api/auth/sign-in/email`, {
    body: JSON.stringify({ email: address, password: secret }),
    headers: { "content-type": "application/json", host, origin, "x-geraicuan-login-scope": "tenant" },
    method: "POST",
  }));
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(admin, appDatabaseUrl);
  await cleanup();
  mail = await import("@/lib/mail");
  await admin.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'T181 Existing Store', 'ACTIVE')",
    [existingTenantId],
  );
  await admin.query(
    `INSERT INTO users (id, name, email, email_verified) VALUES
      ('t181-existing-admin', 'Existing Admin', $1, true),
      ($2, 'Super Admin', $3, true)`,
    [email("existing"), superAdminId, email("super")],
  );
  await admin.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, 't181-existing-admin', 'TENANT_ADMIN')",
    [existingTenantId],
  );
  await admin.query("INSERT INTO platform_roles (user_id) VALUES ($1)", [superAdminId]);
});

beforeEach(async () => {
  await admin.query("DELETE FROM public_auth_rate_limits");
  await admin.query("DELETE FROM rate_limits");
  mail.clearRecordedMail();
});

afterAll(async () => {
  await cleanup();
  await runtime.end();
  await admin.end();
});

describe("the registration function (0051)", () => {
  it("creates the user, credential account, PROVISIONING tenant, admin membership, outlet and audit event together", async () => {
    const { registerSelfServiceTenant } = await import("@/db/tenant-registration-repository");
    const result = await registerSelfServiceTenant(runtimeDb, {
      email: email("atomic"),
      ownerName: "Pak Budi",
      passwordHash: await hashPassword(password),
      storeName: "Toko Budi",
      whatsapp: "081234567890",
    });
    expect(result.created).toBe(true);
    expect(await rowsFor(email("atomic"))).toEqual([expect.objectContaining({
      account_matches: true,
      audits: 1,
      contact_whatsapp: "081234567890",
      email_verified: false,
      issuer: "local:credential",
      membership_status: "ACTIVE",
      mengantar_credential_policy: "PRIVATE_ONLY",
      outlets: 1,
      platform_roles: 0,
      provider_id: "credential",
      role: "TENANT_ADMIN",
      tenant_name: "Toko Budi",
      tenant_status: "PROVISIONING",
      user_status: "ACTIVE",
    })]);
  });

  it("creates none of the rows when any step fails", async () => {
    const { registerSelfServiceTenant } = await import("@/db/tenant-registration-repository");
    try {
      await admin.query(`CREATE OR REPLACE FUNCTION public.t181_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.action = 'TENANT_SELF_REGISTERED' THEN RAISE EXCEPTION 't181 forced failure'; END IF; RETURN NEW; END $$`);
      await admin.query("CREATE TRIGGER t181_fail_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION public.t181_fail_audit()");
      await expect(registerSelfServiceTenant(runtimeDb, {
        email: email("rollback"),
        ownerName: "Pak Gagal",
        passwordHash: await hashPassword(password),
        storeName: "Toko Gagal",
        whatsapp: "081234567891",
      })).rejects.toThrow();
    } finally {
      await admin.query("DROP TRIGGER IF EXISTS t181_fail_audit ON audit_events");
      await admin.query("DROP FUNCTION IF EXISTS public.t181_fail_audit()");
    }
    expect(await rowsFor(email("rollback"))).toEqual([]);
    const tenants = await admin.query("SELECT count(*)::int AS n FROM tenants WHERE name = 'Toko Gagal'");
    expect(tenants.rows[0].n).toBe(0);
  });

  it("cannot create an ACTIVE tenant, join an existing tenant or grant a platform role", async () => {
    // No parameter names a status, tenant, role or verification flag.
    const signature = await admin.query<{ args: string }>(
      "SELECT pg_get_function_arguments('register_tenant_self_service(text,text,text,text,text)'::regprocedure) AS args",
    );
    expect(signature.rows[0].args).toBe("p_email text, p_owner_name text, p_password_hash text, p_store_name text, p_whatsapp text");

    // An existing member's email creates nothing and joins nothing.
    const { registerSelfServiceTenant } = await import("@/db/tenant-registration-repository");
    const before = await admin.query("SELECT count(*)::int AS n FROM memberships WHERE tenant_id = $1", [existingTenantId]);
    await expect(registerSelfServiceTenant(runtimeDb, {
      email: email("existing").toUpperCase(),
      ownerName: "Penyusup",
      passwordHash: await hashPassword("another-password"),
      storeName: "Toko Penyusup",
      whatsapp: "081234567892",
    })).resolves.toEqual({ created: false });
    const after = await admin.query("SELECT count(*)::int AS n FROM memberships WHERE tenant_id = $1", [existingTenantId]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
    expect((await admin.query("SELECT count(*)::int AS n FROM tenants WHERE name = 'Toko Penyusup'")).rows[0].n).toBe(0);

    // The runtime role cannot write those rows itself, nor the audit action.
    const client = await runtime.connect();
    const refused = async (statement: string, params: unknown[] = []) => {
      await client.query("BEGIN");
      try {
        await client.query(statement, params);
        return "accepted";
      } catch (error) {
        return (error as Error).message;
      } finally {
        await client.query("ROLLBACK");
      }
    };
    try {
      expect(await refused("INSERT INTO tenants (name, status, mengantar_credential_policy) VALUES ('Toko Aktif', 'ACTIVE', 'PRIVATE_ONLY')"))
        .toMatch(/row-level security/);
      expect(await refused("INSERT INTO tenants (name, status, mengantar_credential_policy) VALUES ('Toko Pending', 'PROVISIONING', 'PRIVATE_ONLY')"))
        .toMatch(/row-level security/);
      // Even with every setting the policies read forged to match the row.
      expect(await refused(
        "WITH forged AS (SELECT set_config('app.user_id', $2, true), set_config('app.tenant_id', $1, true)) INSERT INTO memberships (tenant_id, user_id, role) SELECT $1::uuid, $2, 'TENANT_ADMIN' FROM forged",
        [existingTenantId, superAdminId],
      )).toMatch(/row-level security/);
      expect(await refused("INSERT INTO users (id, name, email) VALUES ('x', 'x', 'x@example.test')")).toMatch(/permission denied/);
      expect(await refused("INSERT INTO platform_roles (user_id) VALUES ($1)", ["t181-existing-admin"])).toMatch(/permission denied/);
      expect(await refused(
        "INSERT INTO audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome) VALUES (NULL, 'TENANT_MEMBER', $1, 'TENANT_SELF_REGISTERED', 'TENANT', $2, 'SUCCESS')",
        [existingTenantId, existingTenantId],
      )).toMatch(/row-level security/);
      expect(await refused("UPDATE users SET email_verified = true, name = 'x' WHERE id = 't181-existing-admin'")).toMatch(/permission denied/);
    } finally {
      client.release();
    }

    const privileges = await admin.query<{ public_execute: boolean; app_execute: boolean }>(`
      SELECT has_function_privilege('public', 'register_tenant_self_service(text,text,text,text,text)', 'EXECUTE') AS public_execute,
        has_function_privilege('geraicuan_app', 'register_tenant_self_service(text,text,text,text,text)', 'EXECUTE') AS app_execute`);
    expect(privileges.rows[0]).toEqual({ app_execute: true, public_execute: false });
  });

  it("refuses malformed input inside the function as well", async () => {
    const client = await runtime.connect();
    try {
      for (const args of [
        ["not-an-email", "Pemilik", "x".repeat(40), "Toko", "081234567890"],
        [email("bad-wa"), "Pemilik", "x".repeat(40), "Toko", "12345"],
        [email("bad-hash"), "Pemilik", "", "Toko", "081234567890"],
        [email("bad-name"), "P", "x".repeat(40), "Toko", "081234567890"],
      ]) {
        await expect(client.query("SELECT register_tenant_self_service($1, $2, $3, $4, $5)", args))
          .rejects.toMatchObject({ code: "22023" });
      }
    } finally {
      client.release();
    }
  });
});

describe("/daftar server path (PR-59)", () => {
  it("validates every field on the server with Indonesian messages", async () => {
    const { state } = await register({
      email: "bukan email",
      ownerName: "",
      password: "pendek",
      passwordConfirmation: "lain",
      storeName: "",
      terms: "",
      whatsapp: "12",
    });
    expect(state).toMatchObject({
      errors: {
        email: "Isi alamat email yang benar, misalnya nama@toko.com.",
        ownerName: "Isi nama pemilik, 2 sampai 120 karakter.",
        password: "Kata sandi minimal 8 karakter.",
        passwordConfirmation: "Konfirmasi kata sandi belum sama.",
        storeName: "Isi nama toko, 2 sampai 120 karakter.",
        terms: "Centang persetujuan syarat penggunaan untuk melanjutkan.",
        whatsapp: "Isi nomor WhatsApp Indonesia yang benar, misalnya 0812 3456 7890.",
      },
      status: "invalid",
    });
    expect(JSON.stringify(state)).not.toContain("pendek");
  });

  it("refuses a digit in the owner name and a letter in the WhatsApp number, but keeps digits in a store name (T-196)", async () => {
    const address = email("classes");
    const { state } = await register({ email: address, ownerName: "Andi 2", storeName: "Grosir Aksesoris HP 99", whatsapp: "0812 3456 78O0" });
    expect(state).toEqual({
      errors: {
        ownerName: "Nama pemilik hanya boleh berisi huruf, spasi, titik, koma, apostrof, dan tanda hubung.",
        whatsapp: "Nomor WhatsApp hanya boleh berisi angka, boleh diawali +.",
      },
      status: "invalid",
      values: expect.objectContaining({ ownerName: "Andi 2", storeName: "Grosir Aksesoris HP 99" }),
    });
    expect(await rowsFor(address)).toEqual([]);
  });

  it("registers a store awaiting approval with the WhatsApp number normalised, and sends a verification link", async () => {
    const { state } = await register({ email: email("fresh") });
    expect(state).toEqual({ email: email("fresh"), status: "submitted" });
    expect(await rowsFor(email("fresh"))).toEqual([expect.objectContaining({
      contact_whatsapp: "081234567890",
      email_verified: false,
      mengantar_credential_policy: "PRIVATE_ONLY",
      tenant_status: "PROVISIONING",
    })]);
    const sent = mail.recordedMail().filter((message) => message.to === email("fresh"));
    expect(sent.map((message) => message.kind)).toEqual(["verify-email"]);
    // T-198: the verification page, never Better Auth's click-to-verify endpoint.
    expect(sent[0].link).toMatch(new RegExp(`^${origin}/verifikasi-email/konfirmasi\\?token=`));
  });

  it("answers a registered and an unregistered email identically", async () => {
    const fresh = await register({ email: email("identical-new") });
    const existing = await register({ email: email("existing") });

    expect({ ...existing.state, email: "" }).toEqual({ ...fresh.state, email: "" });
    expect(existing.state).toEqual({ email: email("existing"), status: "submitted" });
    // Both answer after the same floor, so the extra work of a new account is not visible.
    expect(fresh.elapsed).toBeGreaterThanOrEqual(1_750);
    expect(existing.elapsed).toBeGreaterThanOrEqual(1_750);
    expect(Math.abs(fresh.elapsed - existing.elapsed)).toBeLessThan(600);
    // Nothing was created for the existing address; its owner is told instead.
    expect((await rowsFor(email("existing")))).toHaveLength(1);
    expect(mail.recordedMail().filter((message) => message.to === email("existing")).map((m) => m.kind))
      .toEqual(["account-exists"]);
  }, 15_000);

  it("answers the same after the per-email limit and sends nothing more, so a third party cannot lock the address out", async () => {
    const address = email("limited");
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect((await register({ email: address }, `198.51.100.${attempt}`)).state.status).toBe("submitted");
    }
    const sentBefore = mail.recordedMail().filter((message) => message.to === address).length;
    expect(sentBefore).toBe(3);
    expect((await register({ email: address }, "198.51.100.99")).state).toEqual({ email: address, status: "submitted" });
    expect(mail.recordedMail().filter((message) => message.to === address)).toHaveLength(sentBefore);
    expect(await rowsFor(address)).toHaveLength(1);
  }, 30_000);

  it("refuses the attempt after the per-client limit", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect((await register({ email: email(`client-${attempt}`) }, "192.0.2.77")).state.status).toBe("submitted");
    }
    expect((await register({ email: email("client-6") }, "192.0.2.77")).state.status).toBe("limited");
    expect(await rowsFor(email("client-6"))).toEqual([]);
  }, 30_000);
});

describe("email verification before sign-in (D-10)", () => {
  it("refuses sign-in until the email is verified, then allows the store awaiting approval", async () => {
    await register({ email: email("verify") });
    const refused = await signIn(email("verify"));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(refused.headers.get("set-cookie")).toBeNull();
    const sessions = await admin.query("SELECT count(*)::int AS n FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1", [email("verify")]);
    expect(sessions.rows[0].n).toBe(0);

    // T-198: the owner confirms with the password chosen at sign-up.
    expect(await confirmLink(lastLink(email("verify"), "verify-email"), password)).toEqual({ status: "done" });
    expect((await rowsFor(email("verify")))[0].email_verified).toBe(true);

    const accepted = await signIn(email("verify"));
    expect(accepted.status).toBe(200);
  });

  it("keeps Better Auth's own sign-up, recovery and verification endpoints closed", { timeout: 15_000 }, async () => {
    const { auth } = await import("@/lib/auth");
    for (const [path, body] of [
      ["/sign-up/email", { email: email("direct"), name: "Direct", password }],
      ["/request-password-reset", { email: email("existing"), redirectTo: "/atur-ulang-password" }],
      ["/send-verification-email", { email: email("existing") }],
      ["/reset-password", { newPassword: "new-password-1", token: "x".repeat(24) }],
    ] as const) {
      const response = await auth.handler(new Request(`${origin}/api/auth${path}`, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", host, origin },
        method: "POST",
      }));
      expect(response.status, path).toBe(404);
    }
    expect(await rowsFor(email("direct"))).toEqual([]);
    // T-198: the GET verification endpoint is closed too, even with a genuine token.
    await register({ email: email("closed-get") }, "203.0.113.11");
    const token = new URL(lastLink(email("closed-get"), "verify-email")).searchParams.get("token");
    const opened = await auth.handler(new Request(`${origin}/api/auth/verify-email?token=${token}&callbackURL=%2Flogin%2Ftenant`, {
      headers: { host },
      redirect: "manual",
    }));
    expect(opened.status).toBe(404);
    expect((await rowsFor(email("closed-get")))[0].email_verified).toBe(false);
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true);
  });
});

describe("the verification resend and password recovery paths", () => {
  it("answers a resend request for an unverified account with a set-password link, and the same answer for any address", async () => {
    const { resendVerificationEmail } = await import("@/app/verifikasi-email/actions");
    await register({ email: email("resend") });
    mail.clearRecordedMail();
    requestHeaders = new Headers({ host, "x-forwarded-for": "203.0.113.20" });
    const answers = [];
    for (const address of [email("resend"), email("existing"), email("nobody")]) {
      const data = new FormData();
      data.set("email", address);
      answers.push(await resendVerificationEmail({ status: "idle" }, data));
    }
    expect(answers).toEqual([{ status: "sent" }, { status: "sent" }, { status: "sent" }]);
    // H1: never a plain verification link for an account that already exists.
    expect(mail.recordedMail().map((message) => [message.to, message.kind])).toEqual([[email("resend"), "reset-password"]]);
  }, 15_000);

  it("sends a reset link only to a tenant account, answers identically, and sets a new password", async () => {
    const { requestPasswordReset } = await import("@/app/lupa-password/actions");
    const { resetPassword } = await import("@/app/atur-ulang-password/actions");
    await admin.query("INSERT INTO accounts (id, account_id, provider_id, issuer, user_id, password) VALUES ('t181-existing-account', 't181-existing-admin', 'credential', 'local:credential', 't181-existing-admin', $1) ON CONFLICT DO NOTHING", [await hashPassword(password)]);
    await admin.query("INSERT INTO accounts (id, account_id, provider_id, issuer, user_id, password) VALUES ('t181-super-account', $1, 'credential', 'local:credential', $1, $2) ON CONFLICT DO NOTHING", [superAdminId, await hashPassword(password)]);
    requestHeaders = new Headers({ host, "x-forwarded-for": "203.0.113.30" });
    const answers = [];
    for (const address of [email("existing"), email("super"), email("nobody")]) {
      const data = new FormData();
      data.set("email", address);
      answers.push(await requestPasswordReset({ status: "idle" }, data));
    }
    expect(answers).toEqual([{ status: "sent" }, { status: "sent" }, { status: "sent" }]);
    // A Super Admin gets no public recovery link (PR-62).
    expect(mail.recordedMail().map((message) => [message.to, message.kind])).toEqual([[email("existing"), "reset-password"]]);

    const link = mail.recordedMail()[0].link!;
    const { auth } = await import("@/lib/auth");
    const callback = await auth.handler(new Request(link, { headers: { host }, redirect: "manual" }));
    const location = callback.headers.get("location") ?? "";
    expect(location).toMatch(/\/atur-ulang-password\?token=/);
    const token = new URL(location, origin).searchParams.get("token")!;

    const reset = new FormData();
    reset.set("token", token);
    reset.set("password", "t181-new-password");
    reset.set("passwordConfirmation", "t181-new-password");
    expect(await resetPassword({ status: "idle" }, reset)).toEqual({ status: "done" });
    // Single use.
    expect(await resetPassword({ status: "idle" }, reset)).toEqual({ status: "expired" });
  }, 20_000);
});

describe("Super Admin review (PR-61)", () => {
  async function pendingTenant(local: string, verified: boolean) {
    await register({ email: email(local), storeName: `Toko ${local}` }, `203.0.113.${40 + local.length}`);
    if (verified) await admin.query("UPDATE users SET email_verified = true WHERE email = $1", [email(local)]);
    return (await rowsFor(email(local)))[0].tenant_id as string;
  }

  async function sessionHeaders(userId: string) {
    const { auth } = await import("@/lib/auth");
    const accountId = `t181-review-account-${userId}`;
    await admin.query("DELETE FROM accounts WHERE user_id = $1", [userId]);
    await admin.query(
      "INSERT INTO accounts (id, account_id, provider_id, issuer, user_id, password) VALUES ($1, $2, 'credential', 'local:credential', $2, $3)",
      [accountId, userId, await hashPassword(password)],
    );
    const address = (await admin.query("SELECT email FROM users WHERE id = $1", [userId])).rows[0].email;
    const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, {
      body: JSON.stringify({ email: address, password }),
      headers: {
        "content-type": "application/json",
        host,
        origin,
        "x-geraicuan-login-scope": userId === superAdminId ? "platform" : "tenant",
      },
      method: "POST",
    }));
    const cookie = (response.headers.get("set-cookie") ?? "").match(/(better-auth\.session_token=[^;]+)/)?.[1];
    if (!cookie) throw new Error(`No session for ${userId}`);
    return new Headers({ cookie, host });
  }

  function reviewForm(tenantId: string, decision: string, reason = "") {
    const data = new FormData();
    data.set("tenantId", tenantId);
    data.set("decision", decision);
    data.set("reason", reason);
    return data;
  }

  it("requires a Super Admin server-side", async () => {
    const { reviewRegistration } = await import("@/app/platform/pendaftaran/actions");
    const { reviewTenantRegistration, RegistrationReviewDeniedError } = await import("@/db/tenant-registration-repository");
    const tenantId = await pendingTenant("denied", true);

    requestHeaders = await sessionHeaders("t181-existing-admin");
    expect(await reviewRegistration({}, reviewForm(tenantId, "APPROVE"))).toMatchObject({ outcome: "denied" });
    await expect(reviewTenantRegistration(runtimeDb, "t181-existing-admin", { decision: "APPROVE", tenantId }))
      .rejects.toBeInstanceOf(RegistrationReviewDeniedError);

    // The database function refuses too, even when the runtime role forges the platform setting.
    const client = await runtime.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.user_id', 't181-existing-admin', true), set_config('app.platform_admin', 'true', true)");
      await expect(client.query("SELECT * FROM review_tenant_registration($1, 'APPROVE', NULL, gen_random_uuid())", [tenantId]))
        .rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    expect((await admin.query("SELECT status FROM tenants WHERE id = $1", [tenantId])).rows[0].status).toBe("PROVISIONING");
  });

  it("approves a verified store with an audit event and an email, and touches no other tenant", async () => {
    const { reviewRegistration } = await import("@/app/platform/pendaftaran/actions");
    const tenantId = await pendingTenant("approve", true);
    const otherId = await pendingTenant("bystander", true);
    mail.clearRecordedMail();

    requestHeaders = await sessionHeaders(superAdminId);
    expect(await reviewRegistration({}, reviewForm(tenantId, "APPROVE"))).toMatchObject({ outcome: "approved" });

    const statuses = await admin.query("SELECT id, status FROM tenants WHERE id = ANY($1)", [[tenantId, otherId, existingTenantId]]);
    expect(Object.fromEntries(statuses.rows.map((row) => [row.id, row.status]))).toEqual({
      [existingTenantId]: "ACTIVE",
      [otherId]: "PROVISIONING",
      [tenantId]: "ACTIVE",
    });
    const audit = await admin.query(
      "SELECT actor_id, actor_role, from_status, to_status, outcome FROM audit_events WHERE tenant_id = $1 AND action = 'TENANT_REGISTRATION_APPROVED'",
      [tenantId],
    );
    expect(audit.rows).toEqual([{ actor_id: superAdminId, actor_role: "SUPER_ADMIN", from_status: "PROVISIONING", outcome: "SUCCESS", to_status: "ACTIVE" }]);
    expect(mail.recordedMail().map((message) => [message.to, message.kind])).toEqual([[email("approve"), "registration-approved"]]);

    // A second decision on the same store, or on an already-active tenant, is refused.
    expect(await reviewRegistration({}, reviewForm(tenantId, "REJECT", "Dokumen tidak lengkap"))).toMatchObject({ outcome: "conflict" });
    expect(await reviewRegistration({}, reviewForm(existingTenantId, "APPROVE"))).toMatchObject({ outcome: "conflict" });
  });

  it("refuses to approve an unverified store and rejects with a required reason", async () => {
    const { reviewRegistration } = await import("@/app/platform/pendaftaran/actions");
    const tenantId = await pendingTenant("reject", false);
    mail.clearRecordedMail();
    requestHeaders = await sessionHeaders(superAdminId);

    expect(await reviewRegistration({}, reviewForm(tenantId, "APPROVE"))).toMatchObject({ outcome: "conflict" });
    expect(await reviewRegistration({}, reviewForm(tenantId, "REJECT", ""))).toMatchObject({
      errors: { reason: expect.stringContaining("alasan") },
      outcome: "invalid",
    });
    // T-196: a hidden format character is refused in the reason sent to the owner.
    expect(await reviewRegistration({}, reviewForm(tenantId, "REJECT", "Dokumen\u200B tidak lengkap"))).toMatchObject({
      errors: { reason: expect.stringContaining("karakter kontrol") },
      outcome: "invalid",
    });
    expect(await reviewRegistration({}, reviewForm(tenantId, "REJECT", "Nomor WhatsApp tidak dapat dihubungi"))).toMatchObject({ outcome: "rejected" });

    expect((await admin.query("SELECT status FROM tenants WHERE id = $1", [tenantId])).rows[0].status).toBe("ARCHIVED");
    const audit = await admin.query(
      "SELECT from_status, to_status, metadata ->> 'reason' AS reason FROM audit_events WHERE tenant_id = $1 AND action = 'TENANT_REGISTRATION_REJECTED'",
      [tenantId],
    );
    expect(audit.rows).toEqual([{ from_status: "PROVISIONING", reason: "Nomor WhatsApp tidak dapat dihubungi", to_status: "ARCHIVED" }]);
    const rejection = mail.recordedMail().find((message) => message.kind === "registration-rejected");
    expect(rejection?.to).toBe(email("reject"));
    expect(rejection?.text).toContain("Nomor WhatsApp tidak dapat dihubungi");
    // T-198: the address was never proven, so the mail repeats no name typed at sign-up.
    for (const typed of ["Toko reject", "Ibu Sari"]) {
      expect(rejection?.text).not.toContain(typed);
      expect(rejection?.html).not.toContain(typed);
      expect(rejection?.subject).not.toContain(typed);
    }
  });

  it("T-198 finding 3: rejecting a never-verified registration releases the address; the real owner registers it afresh", async () => {
    const { reviewRegistration } = await import("@/app/platform/pendaftaran/actions");
    const owner = email("t198-rejected-owner");
    const attackerPassword = "t198-squatter-password";
    const ownerPassword = "t198-real-owner-password";

    // The attacker registers the owner's address and never verifies it.
    await register({ email: owner, ownerName: "Penyusup", password: attackerPassword, passwordConfirmation: attackerPassword, storeName: "Toko Penyusup" }, "203.0.113.140");
    const [squatted] = await rowsFor(owner);
    expect(squatted).toMatchObject({ email_verified: false, tenant_status: "PROVISIONING" });

    // The Super Admin rejects it; the mail still reaches the address that registered.
    mail.clearRecordedMail();
    requestHeaders = await sessionHeaders(superAdminId);
    expect(await reviewRegistration({}, reviewForm(squatted.tenant_id, "REJECT", "Data usaha tidak valid"))).toMatchObject({ outcome: "rejected" });
    expect(mail.recordedMail().map((message) => [message.to, message.kind])).toEqual([[owner, "registration-rejected"]]);

    const released = await admin.query(
      `SELECT u.email, u.status, t.status AS tenant_status, m.tenant_id,
         (SELECT e.metadata ->> 'ownerEmailReleased' FROM audit_events e WHERE e.tenant_id = t.id AND e.action = 'TENANT_REGISTRATION_REJECTED') AS audited
       FROM users u JOIN memberships m ON m.user_id = u.id JOIN tenants t ON t.id = m.tenant_id WHERE u.id = $1`,
      [squatted.user_id],
    );
    expect(released.rows).toEqual([{
      audited: "true",
      email: `released+${squatted.user_id}@registration.invalid`,
      status: "SUSPENDED",
      tenant_id: squatted.tenant_id,
      tenant_status: "ARCHIVED",
    }]);

    // The real owner registers the address with their own password.
    mail.clearRecordedMail();
    expect((await register({ email: owner, password: ownerPassword, passwordConfirmation: ownerPassword }, "203.0.113.141")).state)
      .toEqual({ email: owner, status: "submitted" });
    const [fresh] = await rowsFor(owner);
    expect(fresh).toMatchObject({ email_verified: false, role: "TENANT_ADMIN", tenant_status: "PROVISIONING", user_status: "ACTIVE" });
    expect(fresh.user_id).not.toBe(squatted.user_id);
    expect(fresh.tenant_id).not.toBe(squatted.tenant_id);
    // Nothing old is reachable from the new account.
    expect((await admin.query("SELECT count(*)::int AS n FROM memberships WHERE user_id = $1", [fresh.user_id])).rows[0].n).toBe(1);
    expect((await admin.query("SELECT count(*)::int AS n FROM memberships WHERE tenant_id = $1 AND user_id = $2", [squatted.tenant_id, fresh.user_id])).rows[0].n).toBe(0);

    expect(await confirmLink(lastLink(owner, "verify-email"), attackerPassword, "203.0.113.142")).toEqual({ status: "mismatch" });
    expect(await confirmLink(lastLink(owner, "verify-email"), ownerPassword, "203.0.113.142")).toEqual({ status: "done" });
    expect((await signIn(owner, attackerPassword)).status).toBe(401);
    expect((await signIn(owner, ownerPassword)).status).toBe(200);
  }, 30_000);

  it("T-198 finding 3: rejecting a verified owner keeps the account and its address", async () => {
    const { reviewRegistration } = await import("@/app/platform/pendaftaran/actions");
    const tenantId = await pendingTenant("t198-verified-reject", true);
    const [before] = await rowsFor(email("t198-verified-reject"));
    requestHeaders = await sessionHeaders(superAdminId);
    expect(await reviewRegistration({}, reviewForm(tenantId, "REJECT", "Data usaha tidak valid"))).toMatchObject({ outcome: "rejected" });
    expect(await rowsFor(email("t198-verified-reject"))).toEqual([expect.objectContaining({
      tenant_status: "ARCHIVED",
      user_id: before.user_id,
      user_status: "ACTIVE",
    })]);
    const audit = await admin.query(
      "SELECT metadata ->> 'ownerEmailReleased' AS released FROM audit_events WHERE tenant_id = $1 AND action = 'TENANT_REGISTRATION_REJECTED'",
      [tenantId],
    );
    expect(audit.rows).toEqual([{ released: "false" }]);
  }, 20_000);

  it("works when both functions are owned by a non-superuser, non-BYPASSRLS role", async () => {
    const { registerSelfServiceTenant, reviewTenantRegistration } = await import("@/db/tenant-registration-repository");
    const functions = [
      "register_tenant_self_service(text,text,text,text,text)",
      "review_tenant_registration(uuid,text,text,uuid)",
    ];
    const owners = await admin.query<{ owner: string; proc: string }>(
      "SELECT p.oid::regprocedure::text AS proc, pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid = ANY($1::regprocedure[])",
      [functions],
    );
    const client = await admin.connect();
    try {
      await client.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='geraicuan_owner_probe') THEN CREATE ROLE geraicuan_owner_probe NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$");
      await client.query("GRANT SELECT, INSERT ON users, accounts, memberships, outlets, audit_events TO geraicuan_owner_probe");
      // T-198 (0053): the review locks the owner row and may release its address.
      await client.query("GRANT UPDATE ON users TO geraicuan_owner_probe");
      await client.query("GRANT SELECT, INSERT, UPDATE ON tenants TO geraicuan_owner_probe");
      await client.query("GRANT SELECT ON platform_roles TO geraicuan_owner_probe");
      await client.query("GRANT EXECUTE ON FUNCTION public.tenant_member_governance_authorized(uuid) TO geraicuan_owner_probe");
      await client.query("GRANT EXECUTE ON FUNCTION public.tenant_member_invitation_allowed(uuid, text) TO geraicuan_owner_probe");
      for (const fn of functions) await client.query(`ALTER FUNCTION ${fn} OWNER TO geraicuan_owner_probe`);

      const registered = await registerSelfServiceTenant(runtimeDb, {
        email: email("probe"),
        ownerName: "Pemilik Probe",
        passwordHash: await hashPassword(password),
        storeName: "Toko Probe",
        whatsapp: "081234567899",
      });
      expect(registered.created).toBe(true);
      expect(await rowsFor(email("probe"))).toEqual([expect.objectContaining({ audits: 1, outlets: 1, tenant_status: "PROVISIONING" })]);
      await admin.query("UPDATE users SET email_verified = true WHERE email = $1", [email("probe")]);
      const tenantId = (await rowsFor(email("probe")))[0].tenant_id;
      await expect(reviewTenantRegistration(runtimeDb, superAdminId, { decision: "APPROVE", tenantId }))
        .resolves.toMatchObject({ status: "ACTIVE" });

      // T-198: a rejection that releases a never-verified address works for such an owner too.
      await registerSelfServiceTenant(runtimeDb, {
        email: email("probe-rejected"),
        ownerName: "Pemilik Ditolak",
        passwordHash: await hashPassword(password),
        storeName: "Toko Ditolak",
        whatsapp: "081234567898",
      });
      const rejected = (await rowsFor(email("probe-rejected")))[0];
      await expect(reviewTenantRegistration(runtimeDb, superAdminId, { decision: "REJECT", reason: "Data tidak valid", tenantId: rejected.tenant_id }))
        .resolves.toMatchObject({ ownerEmail: email("probe-rejected"), status: "ARCHIVED" });
      expect(await rowsFor(email("probe-rejected"))).toEqual([]);
      expect((await admin.query("SELECT email, status FROM users WHERE id = $1", [rejected.user_id])).rows[0])
        .toEqual({ email: `released+${rejected.user_id}@registration.invalid`, status: "SUSPENDED" });

      // ...but never for an owner who holds a platform role, which such an owner
      // can see only through the 0053 review read policy.
      await registerSelfServiceTenant(runtimeDb, {
        email: email("probe-platform-role"),
        ownerName: "Pemilik Peran",
        passwordHash: await hashPassword(password),
        storeName: "Toko Peran",
        whatsapp: "081234567897",
      });
      const withRole = (await rowsFor(email("probe-platform-role")))[0];
      await admin.query("INSERT INTO platform_roles (user_id) VALUES ($1)", [withRole.user_id]);
      await expect(reviewTenantRegistration(runtimeDb, superAdminId, { decision: "REJECT", reason: "Data tidak valid", tenantId: withRole.tenant_id }))
        .resolves.toMatchObject({ status: "ARCHIVED" });
      expect(await rowsFor(email("probe-platform-role"))).toEqual([expect.objectContaining({ tenant_status: "ARCHIVED", user_status: "ACTIVE" })]);
    } finally {
      for (const { owner, proc } of owners.rows) await client.query(`ALTER FUNCTION ${proc} OWNER TO "${owner}"`);
      await client.query("REVOKE ALL ON users, accounts, memberships, outlets, audit_events, tenants, platform_roles FROM geraicuan_owner_probe");
      await client.query("REVOKE ALL ON FUNCTION public.tenant_member_governance_authorized(uuid) FROM geraicuan_owner_probe");
      await client.query("REVOKE ALL ON FUNCTION public.tenant_member_invitation_allowed(uuid, text) FROM geraicuan_owner_probe");
      client.release();
    }
  });
});

describe("security review follow-up (H1, M2, L1, L2, L3, L5)", () => {
  function emailForm(address: string) {
    const data = new FormData();
    data.set("email", address);
    return data;
  }

  it("H1: no link from resend or re-registration verifies an account whose password the inbox owner did not set", async () => {
    const { resendVerificationEmail } = await import("@/app/verifikasi-email/actions");
    const { resetPassword } = await import("@/app/atur-ulang-password/actions");
    const { auth } = await import("@/lib/auth");
    const victim = email("victim");
    const attackerPassword = "t181-attacker-password";
    const ownerPassword = "t181-owner-password";

    // The attacker registers the victim's address with a password of their own.
    await register({ email: victim, password: attackerPassword, passwordConfirmation: attackerPassword }, "203.0.113.61");
    expect((await signIn(victim, attackerPassword)).status).toBe(403);
    mail.clearRecordedMail();

    // The attacker asks for a new verification mail; later the real owner registers the same address.
    requestHeaders = new Headers({ host, "x-forwarded-for": "203.0.113.62" });
    expect(await resendVerificationEmail({ status: "idle" }, emailForm(victim))).toEqual({ status: "sent" });
    expect((await register({ email: victim, password: ownerPassword, passwordConfirmation: ownerPassword }, "203.0.113.63")).state)
      .toEqual({ email: victim, status: "submitted" });

    // The inbox owner opens every link they received.
    const links = mail.recordedMail().filter((message) => message.to === victim).map((message) => message.link);
    expect(links).toHaveLength(2);
    const locations: string[] = [];
    for (const link of links) {
      const response = await auth.handler(new Request(link!, { headers: { host }, redirect: "manual" }));
      locations.push(response.headers.get("location") ?? "");
    }
    expect((await rowsFor(victim))[0].email_verified).toBe(false);
    expect((await signIn(victim, attackerPassword)).status).not.toBe(200);

    // Choosing a password through the link proves the inbox, replaces the attacker's password and verifies.
    const token = new URL(locations[1], origin).searchParams.get("token");
    expect(token).toBeTruthy();
    const reset = new FormData();
    reset.set("token", token!);
    reset.set("password", ownerPassword);
    reset.set("passwordConfirmation", ownerPassword);
    requestHeaders = new Headers({ host, "x-forwarded-for": "203.0.113.64" });
    expect(await resetPassword({ status: "idle" }, reset)).toEqual({ status: "done" });
    expect((await rowsFor(victim))[0].email_verified).toBe(true);
    const attacker = await signIn(victim, attackerPassword);
    expect(attacker.status).toBe(401);
    expect(attacker.headers.get("set-cookie")).toBeNull();
    expect((await signIn(victim, ownerPassword)).status).toBe(200);
  }, 30_000);

  it("M2: the per-email limit on recovery and resend answers sent and sends nothing; the per-client limit still answers limited", async () => {
    const { requestPasswordReset } = await import("@/app/lupa-password/actions");
    const { resendVerificationEmail } = await import("@/app/verifikasi-email/actions");
    await register({ email: email("m2-unverified") }, "203.0.113.70");
    mail.clearRecordedMail();

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      requestHeaders = new Headers({ host, "x-forwarded-for": `198.18.0.${attempt}` });
      expect(await requestPasswordReset({ status: "idle" }, emailForm(email("existing")))).toEqual({ status: "sent" });
      requestHeaders = new Headers({ host, "x-forwarded-for": `198.18.1.${attempt}` });
      expect(await resendVerificationEmail({ status: "idle" }, emailForm(email("m2-unverified")))).toEqual({ status: "sent" });
    }
    const sent = mail.recordedMail().map((message) => message.to);
    expect(sent.filter((to) => to === email("existing"))).toHaveLength(3);
    expect(sent.filter((to) => to === email("m2-unverified"))).toHaveLength(3);

    requestHeaders = new Headers({ host, "x-forwarded-for": "198.18.2.1" });
    const answers = [];
    for (let attempt = 1; attempt <= 11; attempt += 1) {
      answers.push((await requestPasswordReset({ status: "idle" }, emailForm(email(`m2-client-${attempt}`)))).status);
    }
    expect(answers.slice(0, 10)).toEqual(Array(10).fill("sent"));
    expect(answers[10]).toBe("limited");
  }, 60_000);

  it("L1: the runtime role may only set email_verified from false to true", async () => {
    await register({ email: email("l1-unverified") }, "203.0.113.71");
    const client = await runtime.connect();
    const attempt = async (statement: string, params: unknown[]) => {
      await client.query("BEGIN");
      try {
        const result = await client.query(statement, params);
        return result.rowCount;
      } catch (error) {
        return (error as { code?: string }).code;
      } finally {
        await client.query("ROLLBACK");
      }
    };
    try {
      expect(await attempt("UPDATE users SET email_verified = false WHERE id = 't181-existing-admin'", [])).toBe("42501");
      expect(await attempt("UPDATE users SET email_verified = true, updated_at = now() WHERE email = $1", [email("l1-unverified")])).toBe(1);
    } finally {
      client.release();
    }
    expect((await admin.query("SELECT email_verified FROM users WHERE id = 't181-existing-admin'")).rows[0].email_verified).toBe(true);
  });

  it("L2: the verification mail reaches neither an unverified Super Admin nor the owner of a rejected store", async () => {
    const { auth } = await import("@/lib/auth");
    await admin.query(
      "INSERT INTO users (id, name, email, email_verified) VALUES ('t181-unverified-super', 'Unverified Super', $1, false)",
      [email("unverified-super")],
    );
    await admin.query("INSERT INTO platform_roles (user_id) VALUES ('t181-unverified-super')");
    await register({ email: email("l2-rejected") }, "203.0.113.72");
    await register({ email: email("l2-pending") }, "203.0.113.73");
    await admin.query("UPDATE tenants SET status = 'ARCHIVED' WHERE id = $1", [(await rowsFor(email("l2-rejected")))[0].tenant_id]);
    mail.clearRecordedMail();

    for (const address of [email("unverified-super"), email("l2-rejected"), email("l2-pending")]) {
      await auth.api.sendVerificationEmail({ body: { email: address }, headers: new Headers({ host }) });
    }
    expect(mail.recordedMail().map((message) => message.to)).toEqual([email("l2-pending")]);
  }, 15_000);

  it("L3: the approval queue is empty for a non-Super-Admin even with the platform-admin setting forged", async () => {
    await register({ email: email("l3-pending") }, "203.0.113.74");
    const client = await runtime.connect();
    const queued = async (userId: string) => {
      await client.query("BEGIN");
      try {
        await client.query("SELECT set_config('app.platform_admin', 'true', true), set_config('app.user_id', $1, true)", [userId]);
        return (await client.query("SELECT count(*)::int AS n FROM platform_registration_queue")).rows[0].n as number;
      } finally {
        await client.query("ROLLBACK");
      }
    };
    try {
      expect(await queued("t181-existing-admin")).toBe(0);
      expect(await queued("")).toBe(0);
      expect(await queued(superAdminId)).toBeGreaterThan(0);
    } finally {
      client.release();
    }
  }, 15_000);

  it("L5: format characters are refused in names, and no account mail repeats the name typed at sign-up", async () => {
    const { state } = await register({ email: email("l5-format"), ownerName: "Ibu​Sari", storeName: "Toko ‮kamruM" });
    expect(state).toMatchObject({
      errors: { ownerName: expect.any(String), storeName: expect.any(String) },
      status: "invalid",
    });
    const client = await runtime.connect();
    try {
      for (const [owner, store] of [["Ibu​Sari", "Toko Sari"], ["Ibu Sari", "Toko ⁦Sari"], ["Ibu﻿Sari", "Toko Sari"]]) {
        await expect(client.query("SELECT register_tenant_self_service($1, $2, $3, $4, '081234567890')", [email("l5-db"), owner, "x".repeat(40), store]))
          .rejects.toMatchObject({ code: "22023" });
      }
    } finally {
      client.release();
    }
    expect(await rowsFor(email("l5-db"))).toEqual([]);

    // T-196 refuses digits in an owner name, so the lure is one a person name can still carry.
    const lure = "Hubungi Admin Penipu Lewat Telegram";
    await register({ email: email("l5-mail"), ownerName: lure }, "203.0.113.75");
    requestHeaders = new Headers({ host, "x-forwarded-for": "203.0.113.76" });
    const { resendVerificationEmail } = await import("@/app/verifikasi-email/actions");
    await resendVerificationEmail({ status: "idle" }, emailForm(email("l5-mail")));
    const messages = mail.recordedMail().filter((message) => message.to === email("l5-mail"));
    expect(messages.map((message) => message.kind)).toEqual(["verify-email", "reset-password"]);
    for (const message of messages) {
      expect(message.text).not.toContain(lure);
      expect(message.html).not.toContain(lure);
    }
  }, 20_000);
});

describe("T-198 security review follow-up", () => {
  it("finding 2: an inbox click alone never verifies the attacker's password; the victim recovers through a password they set", async () => {
    const { requestPasswordReset } = await import("@/app/lupa-password/actions");
    const { resetPassword } = await import("@/app/atur-ulang-password/actions");
    const { auth } = await import("@/lib/auth");
    const victim = email("t198-victim");
    const attackerPassword = "t198-attacker-password";
    const victimPassword = "t198-victim-password";

    // 1. The attacker registers the victim's address with a password of their own.
    await register({ email: victim, password: attackerPassword, passwordConfirmation: attackerPassword }, "203.0.113.101");
    const link = lastLink(victim, "verify-email");
    expect(link).toMatch(new RegExp(`^${origin}/verifikasi-email/konfirmasi\\?token=`));

    // 2. The victim clicks the genuine link. Opening it is a page render; the old
    // click-to-verify endpoint answers 404 for the same token.
    const token = new URL(link).searchParams.get("token")!;
    const clicked = await auth.handler(new Request(`${origin}/api/auth/verify-email?token=${token}`, { headers: { host }, redirect: "manual" }));
    expect(clicked.status).toBe(404);
    expect((await rowsFor(victim))[0].email_verified).toBe(false);

    // 3. The victim does not know the attacker's password: whatever they type is refused.
    expect(await confirmLink(link, victimPassword, "203.0.113.102")).toEqual({ status: "mismatch" });
    expect(await confirmLink(link, "", "203.0.113.102")).toMatchObject({ status: "invalid" });
    expect((await rowsFor(victim))[0].email_verified).toBe(false);
    expect((await signIn(victim, attackerPassword)).status).toBe(403);

    // 4. The attacker knows the password but has no genuine link: a token signed
    // with another key is refused before the password is looked at.
    const forged = `${origin}/verifikasi-email/konfirmasi?token=${await signJWT({ email: victim }, "t198-not-the-auth-secret-0123456789abcdef", 3_600)}`;
    expect(await confirmLink(forged, attackerPassword, "203.0.113.103")).toEqual({ status: "expired" });
    const tampered = `${origin}/verifikasi-email/konfirmasi?token=${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`;
    expect(await confirmLink(tampered, attackerPassword, "203.0.113.103")).toEqual({ status: "expired" });
    expect((await rowsFor(victim))[0].email_verified).toBe(false);

    // 5. The victim takes "Lupa kata sandi": the set-password link proves the
    // inbox and replaces the attacker's password.
    mail.clearRecordedMail();
    requestHeaders = new Headers({ host, "x-forwarded-for": "203.0.113.104" });
    const recovery = new FormData();
    recovery.set("email", victim);
    expect(await requestPasswordReset({ status: "idle" }, recovery)).toEqual({ status: "sent" });
    const callback = await auth.handler(new Request(lastLink(victim, "reset-password"), { headers: { host }, redirect: "manual" }));
    const resetToken = new URL(callback.headers.get("location") ?? "", origin).searchParams.get("token")!;
    const reset = new FormData();
    reset.set("token", resetToken);
    reset.set("password", victimPassword);
    reset.set("passwordConfirmation", victimPassword);
    expect(await resetPassword({ status: "idle" }, reset)).toEqual({ status: "done" });

    expect((await rowsFor(victim))[0].email_verified).toBe(true);
    expect((await signIn(victim, attackerPassword)).status).toBe(401);
    expect((await signIn(victim, victimPassword)).status).toBe(200);
    // The original link can no longer be completed with the attacker's password.
    expect(await confirmLink(link, attackerPassword, "203.0.113.105")).toEqual({ status: "mismatch" });
  }, 30_000);

  it("finding 2: the owner who registered verifies with the link and their own sign-up password", async () => {
    const owner = email("t198-owner");
    await register({ email: owner }, "203.0.113.110");
    const link = lastLink(owner, "verify-email");
    expect(await confirmLink(link, "not-the-password", "203.0.113.111")).toEqual({ status: "mismatch" });
    expect((await rowsFor(owner))[0].email_verified).toBe(false);
    expect(await confirmLink(link, password, "203.0.113.111")).toEqual({ status: "done" });
    expect((await rowsFor(owner))[0].email_verified).toBe(true);
    expect((await signIn(owner, password)).status).toBe(200);
    // Opening it again is harmless.
    expect(await confirmLink(link, password, "203.0.113.111")).toEqual({ status: "done" });
  }, 20_000);

  it("finding 2: the confirmation page limits password attempts per address", async () => {
    const owner = email("t198-limited");
    await register({ email: owner }, "203.0.113.120");
    const link = lastLink(owner, "verify-email");
    const answers = [];
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      answers.push((await confirmLink(link, `wrong-${attempt}`, `198.19.0.${attempt}`)).status);
    }
    expect(answers).toEqual(["mismatch", "mismatch", "mismatch", "mismatch", "mismatch", "limited"]);
    expect((await confirmLink(link, password, "198.19.0.9")).status).toBe("limited");
    expect((await rowsFor(owner))[0].email_verified).toBe(false);
  }, 30_000);

  it("finding 4: the server refuses an emoji in the store name, as the form does", async () => {
    const address = email("t198-emoji");
    const { state } = await register({ email: address, storeName: "Toko Jaya \u{1F680}" }, "203.0.113.130");
    expect(state).toMatchObject({
      errors: { storeName: expect.stringMatching(/^Nama toko /) },
      status: "invalid",
    });
    expect(await rowsFor(address)).toEqual([]);
    // Digits and punctuation stay allowed (T-196).
    expect((await register({ email: email("t198-digits"), storeName: "Grosir HP 99 & Co." }, "203.0.113.131")).state)
      .toEqual({ email: email("t198-digits"), status: "submitted" });
  }, 15_000);
});
