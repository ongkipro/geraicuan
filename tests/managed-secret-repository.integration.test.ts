import { createHash, randomBytes } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";

import { db } from "@/db/client";
import {
  authorizeManagedMengantarCredentialMutation,
  loadManagedMengantarApiKey,
  ManagedMengantarSecretDeniedError,
  ManagedMengantarSecretInvalidError,
  ManagedMengantarSecretRateLimitedError,
  ManagedMengantarSecretUnavailableError,
  replaceManagedMengantarApiKey,
  restorePlatformDefaultMengantarConnection,
} from "@/db/managed-secret-repository";
import { mengantarSecretReference } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import {
  assertPlatformDefaultMengantarCredentialsComplete,
  MengantarConfigurationError,
} from "@/lib/mengantar-credentials";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const databaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!databaseUrl || !appDatabaseUrl) {
  throw new Error("Managed secret integration tests require isolated database URLs.");
}
if (
  new URL(databaseUrl).pathname !== "/geraicuan_test"
  || new URL(appDatabaseUrl).pathname !== "/geraicuan_test"
) {
  throw new Error("Managed secret integration tests require geraicuan_test.");
}

const adminPool = new Pool({ connectionString: databaseUrl });
const tenantA = "5a000000-0000-4000-8000-000000000001";
const tenantB = "5a000000-0000-4000-8000-000000000002";
const outletA = "5a000000-0000-4000-8000-000000000011";
const outletB = "5a000000-0000-4000-8000-000000000012";
const adminA = "managed-secret-admin-a";
const adminB = "managed-secret-admin-b";
const operatorA = "managed-secret-operator-a";
const runtimeEncryptionKey = Buffer.alloc(32, 91).toString("base64");
const fixtureTenantIds = [tenantA, tenantB];
const fixtureUserIds = [adminA, adminB, operatorA];

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function generatedApiKey() {
  return randomBytes(32).toString("base64url");
}

async function removeFixtureRows() {
  await adminPool.query(
    "DELETE FROM mengantar_credential_rate_limits WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM mengantar_connections WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM managed_secret_payloads WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM outlets WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [fixtureTenantIds]);
  await adminPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [fixtureUserIds]);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await removeFixtureRows();
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'Managed Admin A', 'managed-admin-a@example.test'),
      ($2, 'Managed Operator A', 'managed-operator-a@example.test'),
      ($3, 'Managed Admin B', 'managed-admin-b@example.test')`,
    fixtureUserIds,
  );
  await adminPool.query(
    `INSERT INTO tenants (id, name, status) VALUES
      ($1, 'Managed Tenant A', 'ACTIVE'),
      ($2, 'Managed Tenant B', 'ACTIVE')`,
    fixtureTenantIds,
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'TENANT_ADMIN'),
      ($1, $3, 'OPERATOR'),
      ($4, $5, 'TENANT_ADMIN')`,
    [tenantA, adminA, operatorA, tenantB, adminB],
  );
  await adminPool.query(
    `INSERT INTO outlets (
      id, tenant_id, name, default_pickup_address_id, default_origin_area_id
    ) VALUES
      ($1, $2, 'Managed Outlet A', 'pickup-a', 'origin-a'),
      ($3, $4, 'Managed Outlet B', 'pickup-b', 'origin-b')`,
    [outletA, tenantA, outletB, tenantB],
  );
});

beforeEach(async () => {
  process.env.MENGANTAR_CREDENTIAL_ENCRYPTION_KEY = runtimeEncryptionKey;
  process.env.MENGANTAR_API_KEY = generatedApiKey();
  process.env.MENGANTAR_BASE_URL = "https://platform.example.test";
  process.env.MENGANTAR_ORIGIN_AREA_ID = "platform-origin";
  process.env.MENGANTAR_PICKUP_ADDRESS_ID = "platform-pickup";
  await adminPool.query(
    "DELETE FROM mengantar_credential_rate_limits WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM mengantar_connections WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM managed_secret_payloads WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
});

afterAll(async () => {
  await removeFixtureRows();
  await adminPool.end();
});

describe("managed Mengantar secret repository", () => {
  it("creates and replaces an authenticated ciphertext with redacted connection and audit state", async () => {
    const firstApiKey = generatedApiKey();
    const secondApiKey = generatedApiKey();
    const reference = mengantarSecretReference(tenantA, outletA);

    await withTenantContext(db, adminA, tenantA, (tx, context) =>
      replaceManagedMengantarApiKey(tx, context, outletA, () => firstApiKey));
    const firstEnvelope = await adminPool.query<{
      authentication_tag: string;
      ciphertext: string;
      nonce: string;
    }>(
      `SELECT authentication_tag, ciphertext, nonce
       FROM managed_secret_payloads
       WHERE tenant_id = $1 AND outlet_id = $2`,
      [tenantA, outletA],
    );

    await withTenantContext(db, adminA, tenantA, (tx, context) =>
      replaceManagedMengantarApiKey(tx, context, outletA, () => secondApiKey));
    const loaded = await withTenantContext(db, operatorA, tenantA, (tx, context) =>
      loadManagedMengantarApiKey(tx, context, outletA, reference));
    const stored = await adminPool.query<{
      action: string;
      authentication_tag: string;
      ciphertext: string;
      metadata: Record<string, unknown>;
      nonce: string;
      plaintext_absent: boolean;
      secret_reference: string;
    }>(
      `SELECT p.authentication_tag,
              p.ciphertext,
              p.nonce,
              c.secret_reference,
              a.action,
              a.metadata,
              position($3 in p.ciphertext) = 0 AS plaintext_absent
       FROM managed_secret_payloads p
       JOIN mengantar_connections c
         ON c.tenant_id = p.tenant_id AND c.outlet_id = p.outlet_id
       JOIN audit_events a
         ON a.tenant_id = p.tenant_id AND a.target_id = p.outlet_id::text
       WHERE p.tenant_id = $1 AND p.outlet_id = $2
       ORDER BY a.created_at DESC
       LIMIT 1`,
      [tenantA, outletA, secondApiKey],
    );

    expect(digest(loaded)).toBe(digest(secondApiKey));
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      action: "MENGANTAR_CREDENTIAL_REPLACED",
      metadata: {
        connectionSource: "private",
        credentialChange: "replaced",
      },
      plaintext_absent: true,
      secret_reference: reference,
    });
    expect(stored.rows[0].ciphertext).not.toBe(firstEnvelope.rows[0].ciphertext);
    expect(stored.rows[0].nonce).not.toBe(firstEnvelope.rows[0].nonce);
    expect(stored.rows[0].authentication_tag).not.toBe(
      firstEnvelope.rows[0].authentication_tag,
    );
    expect(Object.keys(stored.rows[0].metadata).sort()).toEqual([
      "connectionSource",
      "credentialChange",
    ]);
  });

  it("retains the previous working secret when replacement encryption fails", async () => {
    const workingApiKey = generatedApiKey();
    const replacementApiKey = generatedApiKey();
    const reference = mengantarSecretReference(tenantA, outletA);
    await withTenantContext(db, adminA, tenantA, (tx, context) =>
      replaceManagedMengantarApiKey(tx, context, outletA, () => workingApiKey));
    const before = await adminPool.query<{ ciphertext: string }>(
      "SELECT ciphertext FROM managed_secret_payloads WHERE tenant_id = $1 AND outlet_id = $2",
      [tenantA, outletA],
    );

    delete process.env.MENGANTAR_CREDENTIAL_ENCRYPTION_KEY;
    await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
      replaceManagedMengantarApiKey(tx, context, outletA, () => replacementApiKey)))
      .rejects.toBeInstanceOf(ManagedMengantarSecretUnavailableError);
    process.env.MENGANTAR_CREDENTIAL_ENCRYPTION_KEY = runtimeEncryptionKey;

    const loaded = await withTenantContext(db, operatorA, tenantA, (tx, context) =>
      loadManagedMengantarApiKey(tx, context, outletA, reference));
    const after = await adminPool.query<{ ciphertext: string }>(
      "SELECT ciphertext FROM managed_secret_payloads WHERE tenant_id = $1 AND outlet_id = $2",
      [tenantA, outletA],
    );
    expect(digest(loaded)).toBe(digest(workingApiKey));
    expect(after.rows).toEqual(before.rows);
  });

  it("denies Operator and cross-tenant mutation before invoking the secret reader", async () => {
    const operatorRead = vi.fn(() => generatedApiKey());
    await expect(withTenantContext(db, operatorA, tenantA, (tx, context) =>
      replaceManagedMengantarApiKey(tx, context, outletA, operatorRead)))
      .rejects.toBeInstanceOf(ManagedMengantarSecretDeniedError);
    expect(operatorRead).not.toHaveBeenCalled();

    const crossTenantRead = vi.fn(() => generatedApiKey());
    await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
      replaceManagedMengantarApiKey(tx, context, outletB, crossTenantRead)))
      .rejects.toBeInstanceOf(ManagedMengantarSecretDeniedError);
    expect(crossTenantRead).not.toHaveBeenCalled();
  });

  it("rejects ciphertext tampering and scope replay", async () => {
    const referenceA = mengantarSecretReference(tenantA, outletA);
    await withTenantContext(db, adminA, tenantA, (tx, context) =>
      replaceManagedMengantarApiKey(tx, context, outletA, generatedApiKey));
    await adminPool.query(
      `UPDATE managed_secret_payloads
       SET authentication_tag = CASE
         WHEN left(authentication_tag, 1) = 'A'
           THEN 'B' || substring(authentication_tag FROM 2)
         ELSE 'A' || substring(authentication_tag FROM 2)
       END
       WHERE tenant_id = $1 AND outlet_id = $2`,
      [tenantA, outletA],
    );
    await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
      loadManagedMengantarApiKey(tx, context, outletA, referenceA)))
      .rejects.toBeInstanceOf(ManagedMengantarSecretUnavailableError);

    await adminPool.query(
      "DELETE FROM mengantar_connections WHERE tenant_id = $1 AND outlet_id = $2",
      [tenantA, outletA],
    );
    const envelope = await adminPool.query<{
      authentication_tag: string;
      ciphertext: string;
      key_version: number;
      nonce: string;
    }>(
      `SELECT authentication_tag, ciphertext, key_version, nonce
       FROM managed_secret_payloads WHERE tenant_id = $1 AND outlet_id = $2`,
      [tenantA, outletA],
    );
    const referenceB = mengantarSecretReference(tenantB, outletB);
    await adminPool.query(
      `INSERT INTO managed_secret_payloads (
        reference, tenant_id, outlet_id, purpose, ciphertext, nonce,
        authentication_tag, key_version
      ) VALUES ($1, $2, $3, 'MENGANTAR_API_KEY', $4, $5, $6, $7)`,
      [
        referenceB,
        tenantB,
        outletB,
        envelope.rows[0].ciphertext,
        envelope.rows[0].nonce,
        envelope.rows[0].authentication_tag,
        envelope.rows[0].key_version,
      ],
    );
    await expect(withTenantContext(db, adminB, tenantB, (tx, context) =>
      loadManagedMengantarApiKey(tx, context, outletB, referenceB)))
      .rejects.toBeInstanceOf(ManagedMengantarSecretUnavailableError);
  });

  it("keeps private state until a complete platform default is proven", async () => {
    await withTenantContext(db, adminA, tenantA, (tx, context) =>
      replaceManagedMengantarApiKey(tx, context, outletA, generatedApiKey));
    delete process.env.MENGANTAR_API_KEY;

    await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
      restorePlatformDefaultMengantarConnection(
        tx,
        context,
        outletA,
        assertPlatformDefaultMengantarCredentialsComplete,
      )))
      .rejects.toBeInstanceOf(MengantarConfigurationError);
    const retained = await adminPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM mengantar_connections WHERE tenant_id = $1 AND outlet_id = $2",
      [tenantA, outletA],
    );
    expect(retained.rows[0].count).toBe("1");

    process.env.MENGANTAR_API_KEY = generatedApiKey();
    process.env.MENGANTAR_BASE_URL = "https://identity@platform.example.test";
    await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
      restorePlatformDefaultMengantarConnection(
        tx,
        context,
        outletA,
        assertPlatformDefaultMengantarCredentialsComplete,
      )))
      .rejects.toBeInstanceOf(MengantarConfigurationError);
    const retainedAfterUserinfo = await adminPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM mengantar_connections WHERE tenant_id = $1 AND outlet_id = $2",
      [tenantA, outletA],
    );
    expect(retainedAfterUserinfo.rows[0].count).toBe("1");

    process.env.MENGANTAR_BASE_URL = "https://platform.example.test";
    await withTenantContext(db, adminA, tenantA, (tx, context) =>
      restorePlatformDefaultMengantarConnection(
        tx,
        context,
        outletA,
        assertPlatformDefaultMengantarCredentialsComplete,
      ));
    const removed = await adminPool.query<{
      audit_count: string;
      connection_count: string;
      payload_count: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM mengantar_connections WHERE tenant_id = $1 AND outlet_id = $2) AS connection_count,
        (SELECT count(*)::text FROM managed_secret_payloads WHERE tenant_id = $1 AND outlet_id = $2) AS payload_count,
        (SELECT count(*)::text FROM audit_events
          WHERE tenant_id = $1 AND target_id = $2::text
            AND action = 'MENGANTAR_PLATFORM_DEFAULT_RESTORED'
            AND metadata = '{"connectionSource":"platform_default","credentialChange":"removed"}'::jsonb) AS audit_count`,
      [tenantA, outletA],
    );
    expect(removed.rows).toEqual([{
      audit_count: "1",
      connection_count: "0",
      payload_count: "0",
    }]);
  });

  it("rate-limits repeated credential changes per tenant, actor, and outlet", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await withTenantContext(db, adminA, tenantA, (tx, context) =>
        authorizeManagedMengantarCredentialMutation(tx, context, outletA));
      await withTenantContext(db, adminA, tenantA, (tx, context) =>
        replaceManagedMengantarApiKey(tx, context, outletA, generatedApiKey));
    }
    await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
      authorizeManagedMengantarCredentialMutation(tx, context, outletA)))
      .rejects.toBeInstanceOf(ManagedMengantarSecretRateLimitedError);
  });

  it.each([
    ["blank", "   "],
    ["oversized", "x".repeat(513)],
  ])("durably rate-limits repeated %s API-key failures", async (_label, invalidApiKey) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await withTenantContext(db, adminA, tenantA, (tx, context) =>
        authorizeManagedMengantarCredentialMutation(tx, context, outletA));
      await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
        replaceManagedMengantarApiKey(tx, context, outletA, () => invalidApiKey)))
        .rejects.toBeInstanceOf(ManagedMengantarSecretInvalidError);
    }

    await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
      authorizeManagedMengantarCredentialMutation(tx, context, outletA)))
      .rejects.toBeInstanceOf(ManagedMengantarSecretRateLimitedError);
  });

  it.each(["missing", "malformed"] as const)(
    "durably rate-limits repeated %s runtime-key failures",
    async (runtimeKeyState) => {
      if (runtimeKeyState === "missing") {
        delete process.env.MENGANTAR_CREDENTIAL_ENCRYPTION_KEY;
      } else {
        process.env.MENGANTAR_CREDENTIAL_ENCRYPTION_KEY = "malformed";
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await withTenantContext(db, adminA, tenantA, (tx, context) =>
          authorizeManagedMengantarCredentialMutation(tx, context, outletA));
        await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
          replaceManagedMengantarApiKey(tx, context, outletA, generatedApiKey)))
          .rejects.toBeInstanceOf(ManagedMengantarSecretUnavailableError);
      }

      await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
        authorizeManagedMengantarCredentialMutation(tx, context, outletA)))
        .rejects.toBeInstanceOf(ManagedMengantarSecretRateLimitedError);
    },
  );

  it("durably rate-limits repeated incomplete-platform fallback failures", async () => {
    await withTenantContext(db, adminA, tenantA, (tx, context) =>
      replaceManagedMengantarApiKey(tx, context, outletA, generatedApiKey));
    delete process.env.MENGANTAR_API_KEY;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await withTenantContext(db, adminA, tenantA, (tx, context) =>
        authorizeManagedMengantarCredentialMutation(tx, context, outletA));
      await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
        restorePlatformDefaultMengantarConnection(
          tx,
          context,
          outletA,
          assertPlatformDefaultMengantarCredentialsComplete,
        )))
        .rejects.toBeInstanceOf(MengantarConfigurationError);
    }

    await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
      authorizeManagedMengantarCredentialMutation(tx, context, outletA)))
      .rejects.toBeInstanceOf(ManagedMengantarSecretRateLimitedError);
    const retained = await adminPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM mengantar_connections WHERE tenant_id = $1 AND outlet_id = $2",
      [tenantA, outletA],
    );
    expect(retained.rows[0].count).toBe("1");
  });
});
