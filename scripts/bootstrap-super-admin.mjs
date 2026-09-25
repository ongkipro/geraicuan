// T-194: creates the first production Super Admin — the only account that can
// approve a self-registered store on the platform host. One-off operator job.
//
//   DATABASE_URL=<superuser url> pnpm ops:bootstrap-super-admin -- --email <email> --name "<name>"
//
// The password comes from BOOTSTRAP_PASSWORD_FILE when set, otherwise from stdin
// (typed twice without echo on a terminal; the whole of piped stdin otherwise).
// It is never accepted as an argument, and neither it, its hash nor the
// connection string is ever printed.
//
// Refuses when any SUPER_ADMIN already exists or the email is taken; it never
// updates an existing user. Needs a role that bypasses row-level security (the
// database superuser): `platform_roles` forces RLS and has no INSERT policy, so
// even the table owner (the migration role) cannot insert there, and could not
// see an existing Super Admin to refuse on.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { hashPassword } from "better-auth/crypto";
import pg from "pg";

// Same limits as the app's sign-up and password reset (`src/lib/public-auth.ts`);
// tests/bootstrap-super-admin.integration.test.ts keeps them equal.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class Refusal extends Error {}

export function parseArguments(argv) {
  const values = {};
  const args = argv.filter((arg) => arg !== "--");
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag !== "--email" && flag !== "--name") {
      throw new Refusal(
        `Unknown argument ${flag.startsWith("--") ? flag.split("=")[0] : "(value)"}. Only --email and --name are accepted; the password is read from stdin or BOOTSTRAP_PASSWORD_FILE.`,
      );
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Refusal(`${flag} needs a value.`);
    values[flag.slice(2)] = value;
    index += 1;
  }
  // Same normalization and bounds as `normalizeEmailInput` and the registration function.
  const email = (values.email ?? "").trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new Refusal("--email must be a valid email address.");
  }
  const name = (values.name ?? "").trim();
  if (name.length < 2 || name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw new Refusal("--name must be 2 to 120 characters without control or format characters.");
  }
  return { email, name };
}

export function checkPassword(password) {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Refusal(
      `The password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
    );
  }
  return password;
}

/** One trailing line break is the file's or the pipe's, not the password's. */
const stripLineBreak = (text) => text.replace(/\r?\n$/, "");

async function readHidden(prompt) {
  const { stdin, stderr } = process;
  stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  try {
    return await new Promise((resolve, reject) => {
      let value = "";
      const onData = (chunk) => {
        for (const character of chunk) {
          if (character === "\r" || character === "\n") {
            stdin.off("data", onData);
            stderr.write("\n");
            resolve(value);
            return;
          }
          if (character === "" || character === "") {
            stdin.off("data", onData);
            stderr.write("\n");
            reject(new Refusal("Cancelled."));
            return;
          }
          if (character === "" || character === "\b") value = value.slice(0, -1);
          else value += character;
        }
      };
      stdin.on("data", onData);
    });
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
  }
}

async function readPassword() {
  const file = process.env.BOOTSTRAP_PASSWORD_FILE;
  if (file) return stripLineBreak(readFileSync(file, "utf8"));
  if (process.stdin.isTTY) {
    const first = await readHidden("Super Admin password: ");
    const second = await readHidden("Repeat the password: ");
    if (first !== second) throw new Refusal("The passwords do not match.");
    return first;
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return stripLineBreak(Buffer.concat(chunks).toString("utf8"));
}

/**
 * Creates the user, its credential account and its SUPER_ADMIN role in one
 * transaction. `passwordHash` is Better Auth's own `hashPassword` output, the
 * format its email sign-in verifies.
 */
export async function bootstrapSuperAdmin({ databaseUrl, email, name, password }) {
  checkPassword(password);
  const passwordHash = await hashPassword(password);
  const client = new pg.Client({
    application_name: "geraicuan-bootstrap-super-admin",
    connectionString: databaseUrl,
  });
  await client.connect();
  try {
    const role = await client.query(
      "SELECT rolsuper OR rolbypassrls AS bypasses FROM pg_roles WHERE rolname = current_user",
    );
    if (role.rows[0]?.bypasses !== true) {
      throw new Refusal(
        "DATABASE_URL must use the database superuser (or a BYPASSRLS role): platform_roles forces row-level security, so another role can neither see existing Super Admins nor add one.",
      );
    }

    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL lock_timeout = '10s'");
      // Two concurrent runs must not both see "no Super Admin yet".
      await client.query("LOCK TABLE platform_roles IN EXCLUSIVE MODE");
      const existing = await client.query(
        "SELECT 1 FROM platform_roles WHERE role = 'SUPER_ADMIN' LIMIT 1",
      );
      if (existing.rowCount > 0) {
        throw new Refusal(
          "A Super Admin already exists. This script only creates the first one and changes no existing account.",
        );
      }
      const taken = await client.query("SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1", [email]);
      if (taken.rowCount > 0) {
        throw new Refusal("That email already belongs to an account. Nothing was changed.");
      }

      const userId = randomUUID().replaceAll("-", "");
      // Verified at creation: the operator chose this address. The
      // users_email_verified_guard trigger (0052) fires on UPDATE only.
      await client.query(
        "INSERT INTO users (id, name, email, email_verified, status) VALUES ($1, $2, $3, true, 'ACTIVE')",
        [userId, name, email],
      );
      // Same shape `register_tenant_self_service` writes for a credential account.
      await client.query(
        `INSERT INTO accounts (id, account_id, provider_id, issuer, user_id, password)
         VALUES ($1, $2, 'credential', 'local:credential', $2, $3)`,
        [randomUUID().replaceAll("-", ""), userId, passwordHash],
      );
      await client.query("INSERT INTO platform_roles (user_id, role) VALUES ($1, 'SUPER_ADMIN')", [userId]);
      await client.query("COMMIT");
      return { email, userId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function main() {
  let secrets = [];
  try {
    const { email, name } = parseArguments(process.argv.slice(2));
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Refusal("DATABASE_URL is required.");
    secrets = [databaseUrl];
    const password = checkPassword(await readPassword());
    secrets.push(password);
    const created = await bootstrapSuperAdmin({ databaseUrl, email, name, password });
    console.log(`Created Super Admin user ${created.userId} <${created.email}>.`);
  } catch (error) {
    let message = error instanceof Error ? error.message : "unknown error";
    // A driver message should never carry either, but never print them if it does.
    for (const secret of secrets) message = message.replaceAll(secret, "[redacted]");
    console.error(`${error instanceof Refusal ? "Refused" : "Failed"}: ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
