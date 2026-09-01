import { createHash, randomBytes } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { db } from "@/db/client";
import { replaceManagedMengantarApiKey } from "@/db/managed-secret-repository";
import { withTenantContext } from "@/db/tenant-context";
import {
  configureMengantarConnection,
  MengantarConfigurationDeniedError,
} from "@/lib/mengantar-configuration";
import {
  MengantarConfigurationError,
  resolveMengantarCredentials,
} from "@/lib/mengantar-credentials";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const databaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Credential resolver integration tests require geraicuan_test.");
}

const adminPool = new Pool({ connectionString: databaseUrl });
const tenantA = "10000000-0000-0000-0000-000000000001";
const tenantB = "10000000-0000-0000-0000-000000000002";
const outletA = "10000000-0000-0000-0000-000000000011";
const outletB = "10000000-0000-0000-0000-000000000012";
const runtimeEncryptionKey = Buffer.alloc(32, 73).toString("base64");

function apiKeyDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function cleanFixtures() {
  await adminPool.query(
    "TRUNCATE mengantar_credential_rate_limits, managed_secret_payloads, mengantar_connections, audit_events, shipments, outlets, memberships, tenants, users CASCADE",
  );
}

beforeAll(async () => {
  process.env.MENGANTAR_CREDENTIAL_ENCRYPTION_KEY = runtimeEncryptionKey;
  process.env.MENGANTAR_API_KEY = randomBytes(24).toString("base64url");
  process.env.MENGANTAR_BASE_URL = "https://platform.example.test";
  process.env.MENGANTAR_ORIGIN_AREA_ID = "platform-origin";
  process.env.MENGANTAR_PICKUP_ADDRESS_ID = "platform-pickup";
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await cleanFixtures();
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9), ($10, $11, $12)",
    [
      "admin-a", "Admin A", "admin-a@example.test",
      "operator-a", "Operator A", "operator-a@example.test",
      "admin-b", "Admin B", "admin-b@example.test",
      "operator-b", "Operator B", "operator-b@example.test",
    ],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, $2, 'ACTIVE'), ($3, $4, 'ACTIVE')",
    [tenantA, "Tenant A", tenantB, "Tenant B"],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR'), ($4, $5, 'TENANT_ADMIN'), ($4, $6, 'OPERATOR')",
    [tenantA, "admin-a", "operator-a", tenantB, "admin-b", "operator-b"],
  );
  await adminPool.query(
    `INSERT INTO outlets (
      id, tenant_id, name, default_pickup_address_id, default_origin_area_id
    ) VALUES
      ($1, $2, 'Outlet A', 'private-pickup', 'private-origin'),
      ($3, $4, 'Outlet B', 'other-pickup', 'other-origin')`,
    [outletA, tenantA, outletB, tenantB],
  );
});

beforeEach(async () => {
  process.env.MENGANTAR_CREDENTIAL_ENCRYPTION_KEY = runtimeEncryptionKey;
  process.env.MENGANTAR_API_KEY = randomBytes(24).toString("base64url");
  process.env.MENGANTAR_BASE_URL = "https://platform.example.test";
  process.env.MENGANTAR_ORIGIN_AREA_ID = "platform-origin";
  process.env.MENGANTAR_PICKUP_ADDRESS_ID = "platform-pickup";
  await adminPool.query(
    "TRUNCATE mengantar_credential_rate_limits, managed_secret_payloads, mengantar_connections, audit_events CASCADE",
  );
});

afterAll(async () => {
  await cleanFixtures();
  await adminPool.end();
});

describe("Mengantar credential resolution", () => {
  it("uses the encrypted private key with platform-controlled base URL and outlet locations", async () => {
    const privateApiKey = randomBytes(24).toString("base64url");
    await withTenantContext(db, "admin-a", tenantA, (tx, context) =>
      replaceManagedMengantarApiKey(tx, context, outletA, () => privateApiKey));

    const resolved = await withTenantContext(db, "operator-a", tenantA, (tx, context) =>
      resolveMengantarCredentials(tx, context, outletA));

    expect(resolved).toMatchObject({
      credentials: {
        baseUrl: "https://platform.example.test",
        originAreaId: "private-origin",
        pickupAddressId: "private-pickup",
      },
      source: "private",
    });
    expect(apiKeyDigest(resolved.credentials.apiKey)).toBe(apiKeyDigest(privateApiKey));
    expect(resolved.credentials.apiKey).not.toBe(process.env.MENGANTAR_API_KEY);
  });

  it("uses only the complete platform default when no private connection exists", async () => {
    const resolved = await withTenantContext(db, "admin-b", tenantB, (tx, context) =>
      resolveMengantarCredentials(tx, context, outletB));

    expect(resolved.source).toBe("platform_default");
    expect(resolved.credentials).toMatchObject({
      baseUrl: "https://platform.example.test",
      originAreaId: "platform-origin",
      pickupAddressId: "platform-pickup",
    });
  });

  it("rejects platform base URLs containing userinfo", async () => {
    process.env.MENGANTAR_BASE_URL = "https://identity@platform.example.test";

    await expect(withTenantContext(db, "admin-b", tenantB, (tx, context) =>
      resolveMengantarCredentials(tx, context, outletB)))
      .rejects.toBeInstanceOf(MengantarConfigurationError);
  });

  it("fails closed when the runtime encryption key is missing or malformed", async () => {
    const privateApiKey = randomBytes(24).toString("base64url");
    await withTenantContext(db, "admin-a", tenantA, (tx, context) =>
      replaceManagedMengantarApiKey(tx, context, outletA, () => privateApiKey));

    for (const unavailableKey of [undefined, "not-a-base64-32-byte-key"]) {
      if (unavailableKey === undefined) {
        delete process.env.MENGANTAR_CREDENTIAL_ENCRYPTION_KEY;
      } else {
        process.env.MENGANTAR_CREDENTIAL_ENCRYPTION_KEY = unavailableKey;
      }
      await expect(withTenantContext(db, "admin-a", tenantA, (tx, context) =>
        resolveMengantarCredentials(tx, context, outletA)))
        .rejects.toBeInstanceOf(MengantarConfigurationError);
    }
  });

  it("denies an operator and cross-tenant outlet configuration", async () => {
    await expect(configureMengantarConnection("operator-a", tenantA, {
      outletId: outletA,
      pickupAddressId: "pickup",
      originAreaId: "origin",
    })).rejects.toBeInstanceOf(MengantarConfigurationDeniedError);
    await expect(configureMengantarConnection("admin-a", tenantA, {
      outletId: outletB,
      pickupAddressId: "pickup",
      originAreaId: "origin",
    })).rejects.toBeInstanceOf(MengantarConfigurationDeniedError);
  });
});
