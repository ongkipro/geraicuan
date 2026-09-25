import { readFileSync } from "node:fs";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ principal: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
}));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: fixture.principal,
}));

import { lookupShipmentTracking } from "@/app/app/cek-resi/actions";
import { parseTrackingLookupKey } from "@/app/app/cek-resi/lookup-key";
import {
  enforceTrackingLookupRateLimit,
  TrackingLookupRateLimitedError,
} from "@/app/app/cek-resi/lookup-rate-limit";
import { dbPool } from "@/db/client";
import * as schema from "@/db/schema";
import { lookupShipmentByTrackingKey } from "@/db/shipment-tracking-lookup-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError } from "@/lib/cms-auth";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required for integration tests.");
}
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
let statementCount = 0;
let lastStatements: string[] = [];
const appDb = drizzle({
  client: appPool,
  schema,
  logger: { logQuery: (query) => { statementCount += 1; lastStatements.push(query); } },
});

const tenantA = "00000000-0000-0000-0000-000000005101";
const tenantB = "00000000-0000-0000-0000-000000005102";
const outletA = "00000000-0000-0000-0000-000000005111";
const outletB = "00000000-0000-0000-0000-000000005112";
const adminUserA = "tracking-admin-a";
const adminUserB = "tracking-admin-b";
const AWB_A = "JP0000000000000A";
const AWB_B = "JP0000000000000B";
const AWB_NOBODY = "JP0000000000000Z";

let referenceA = "";
let referenceB = "";
let numberA = 0;
let numberB = 0;

let sequence = 0;
async function seedShipment(
  tenantId: string,
  outletId: string,
  options: { cnoteNo?: string; status?: string } = {},
) {
  sequence += 1;
  const suffix = String(sequence).padStart(12, "0");
  const ids = {
    shipmentId: `00000000-0000-0000-0051-${suffix}`,
    snapshotId: `00000000-0000-0000-0052-${suffix}`,
    serviceId: `00000000-0000-0000-0053-${suffix}`,
    batchId: `00000000-0000-0000-0054-${suffix}`,
    orderId: `00000000-0000-0000-0055-${suffix}`,
    pullId: `00000000-0000-0000-0056-${suffix}`,
  };
  const { rows } = await adminPool.query<{ public_reference: string; tenant_number: number }>(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, $4) RETURNING public_reference, tenant_number",
    [ids.shipmentId, tenantId, outletId, options.status ?? "IN_TRANSIT"],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (shipment_id, tenant_id, destination_area_id, destination_area_label, package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod)
     VALUES ($1, $2, 'fixture-area', 'KEBAYORAN BARU, JAKARTA SELATAN', 'Sanitized parcel', 1000, 1, 100000, true)`,
    [ids.shipmentId, tenantId],
  );
  if (!options.cnoteNo) return { ...ids, ...rows[0] };

  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id, destination_area_label, weight_grams, is_cod_requested, credential_source)
     VALUES ($1, $2, $3, $4, 'fixture-origin', 'fixture-area', 'KEBAYORAN BARU, JAKARTA SELATAN', 1000, true, 'platform_default')`,
    [ids.snapshotId, tenantId, ids.shipmentId, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible)
     VALUES ($1, $2, $3, 'JNE REG', 'IDR', 10000, 'price', 'fixture', true)`,
    [ids.serviceId, tenantId, ids.snapshotId],
  );
  await adminPool.query(
    `INSERT INTO provider_batches (id, tenant_id, outlet_id, pickup_address_id, courier, credential_source, provider_account_key, idempotency_key, status, submission_attempted_at, completed_at)
     VALUES ($1, $2, $3, 'fixture-pickup', 'JNE', 'platform_default', $4, $5, 'COMPLETED', now(), now())`,
    [ids.batchId, tenantId, outletId, "a".repeat(64), suffix.padStart(64, "0")],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id, position, provider_service, destination_area_id, destination_area_label, currency, shipping_amount_idr, is_cod, status, cnote_no, resolved_at)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG', 'fixture-area', 'KEBAYORAN BARU, JAKARTA SELATAN', 'IDR', 10000, true, 'ISSUED', $7, now())`,
    [ids.orderId, tenantId, ids.batchId, ids.shipmentId, ids.snapshotId, ids.serviceId, options.cnoteNo],
  );
  await adminPool.query(
    `INSERT INTO provider_settlement_pulls (id, tenant_id, outlet_id, actor_user_id, credential_source, provider_account_key, period_start, period_end, matched_item_count, matched_status_count)
     VALUES ($1, $2, $3, $4, 'platform_default', $5, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', 1, 1)`,
    [ids.pullId, tenantId, outletId, tenantId === tenantA ? adminUserA : adminUserB, "a".repeat(64)],
  );
  await adminPool.query(
    `INSERT INTO provider_order_status_observations (tenant_id, pull_id, shipment_id, outlet_id, cnote_no, provider_status, observed_at)
     VALUES ($1, $2, $3, $4, $5, 'ON PROCESS', '2026-09-10T02:00:00Z')`,
    [tenantId, ids.pullId, ids.shipmentId, outletId, options.cnoteNo],
  );
  return { ...ids, ...rows[0] };
}

const asTenant = <T>(
  tenantId: string,
  userId: string,
  work: Parameters<typeof withTenantContext<T>>[3],
) => withTenantContext(appDb, userId, tenantId, work);

function form(trackingKey: string) {
  const data = new FormData();
  data.set("trackingKey", trackingKey);
  return data;
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await adminPool.query(
    `TRUNCATE shipment_rate_limits, provider_order_status_observations, provider_settlement_items, provider_settlement_pulls,
      ledger_entries, reconciliation_runs, provider_unpaid_recoveries, provider_order_snapshots, provider_batches,
      shipment_cod_totals, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties,
      shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE`,
  );
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, 'Admin A', 'tracking-a@example.test'), ($2, 'Admin B', 'tracking-b@example.test')",
    [adminUserA, adminUserB],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'Tenant A', 'ACTIVE'), ($2, 'Tenant B', 'ACTIVE')",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($3, $4, 'TENANT_ADMIN')",
    [tenantA, adminUserA, tenantB, adminUserB],
  );
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
     VALUES ($1, $2, 'Outlet A', 'fixture-pickup', 'fixture-origin'), ($3, $4, 'Outlet B', 'fixture-pickup', 'fixture-origin')`,
    [outletA, tenantA, outletB, tenantB],
  );

  const shipmentA = await seedShipment(tenantA, outletA, { cnoteNo: AWB_A });
  referenceA = shipmentA.public_reference;
  numberA = shipmentA.tenant_number;
  // A later pull supersedes the first observation for the same shipment.
  await adminPool.query(
    `INSERT INTO provider_settlement_pulls (id, tenant_id, outlet_id, actor_user_id, credential_source, provider_account_key, period_start, period_end, matched_item_count, matched_status_count)
     VALUES ('00000000-0000-0000-0057-000000000001', $1, $2, $3, 'platform_default', $4, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', 1, 1)`,
    [tenantA, outletA, adminUserA, "a".repeat(64)],
  );
  await adminPool.query(
    `INSERT INTO provider_order_status_observations (tenant_id, pull_id, shipment_id, outlet_id, cnote_no, provider_status, observed_at)
     VALUES ($1, '00000000-0000-0000-0057-000000000001', $2, $3, $4, 'DELIVERED', '2026-09-12T04:30:00Z')`,
    [tenantA, shipmentA.shipmentId, outletA, AWB_A],
  );

  // Tenant B runs ahead, so its shipment numbers do not exist inside tenant A.
  for (let index = 0; index < 4; index += 1) await seedShipment(tenantB, outletB);
  const shipmentB = await seedShipment(tenantB, outletB, { cnoteNo: AWB_B });
  referenceB = shipmentB.public_reference;
  numberB = shipmentB.tenant_number;
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
  await dbPool.end();
});

describe("tracking lookup key parsing (PR-51)", () => {
  it.each([
    ["10013", { awb: "10013", prefix: null, tenantNumber: 10013 }],
    ["GC-10013", { awb: "GC-10013", prefix: "GC", tenantNumber: 10013 }],
    ["  gc-10013 ", { awb: "GC-10013", prefix: "GC", tenantNumber: 10013 }],
    ["JP0000000000000A", { awb: "JP0000000000000A", prefix: null, tenantNumber: null }],
    ["0100000012345678", { awb: "0100000012345678", prefix: null, tenantNumber: null }],
  ])("accepts %s", (input, expected) => {
    expect(parseTrackingLookupKey(input)).toEqual(expected);
  });

  it.each([
    ["", "empty"],
    ["   ", "blank"],
    ["123", "too short"],
    ["GC-10013; DROP TABLE shipments", "punctuation"],
    ["kiriman saya", "prose"],
    ["A".repeat(41), "over the length cap"],
  ])("rejects %s (%s)", (input) => {
    expect(parseTrackingLookupKey(input)).toBeNull();
  });
});

describe("tracking lookup rate limit (PR-51)", () => {
  it("allows a burst then refuses, and reopens after the window", () => {
    const start = Date.parse("2026-09-16T01:00:00Z");
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect(() => enforceTrackingLookupRateLimit("limit-tenant", "limit-user", start + attempt))
        .not.toThrow();
    }
    expect(() => enforceTrackingLookupRateLimit("limit-tenant", "limit-user", start + 30))
      .toThrow(TrackingLookupRateLimitedError);
    // A different actor in the same tenant keeps its own budget.
    expect(() => enforceTrackingLookupRateLimit("limit-tenant", "other-user", start + 31))
      .not.toThrow();
    expect(() => enforceTrackingLookupRateLimit("limit-tenant", "limit-user", start + 5 * 60_000))
      .not.toThrow();
  });
});

describe("tenant-scoped tracking lookup repository (PR-51)", () => {
  it("resolves the caller's own shipment by number, prefixed number and AWB", async () => {
    for (const key of [String(numberA), referenceA, AWB_A, AWB_A.toLowerCase()]) {
      const parsed = parseTrackingLookupKey(key);
      expect(parsed, key).not.toBeNull();
      const result = await asTenant(tenantA, adminUserA, (tx, context) =>
        lookupShipmentByTrackingKey(tx, context, parsed!));
      expect(result, key).toMatchObject({
        awb: AWB_A,
        courier: "JNE",
        destinationAreaLabel: "KEBAYORAN BARU, JAKARTA SELATAN",
        paymentMethod: "COD",
        providerService: "JNE REG",
        publicReference: referenceA,
        status: "IN_TRANSIT",
      });
    }
  });

  it("returns the latest provider status observation, never an earlier pull", async () => {
    const result = await asTenant(tenantA, adminUserA, (tx, context) =>
      lookupShipmentByTrackingKey(tx, context, parseTrackingLookupKey(AWB_A)!));

    expect(result?.observation?.providerStatus).toBe("DELIVERED");
    expect(result?.observation?.observedAt.toISOString()).toBe("2026-09-12T04:30:00.000Z");
  });

  it("gives a foreign key and an unknown key the identical absent result", async () => {
    // Tenant B really owns these, and its own admin can read them.
    expect(await asTenant(tenantB, adminUserB, (tx, context) =>
      lookupShipmentByTrackingKey(tx, context, parseTrackingLookupKey(AWB_B)!)))
      .toMatchObject({ awb: AWB_B, publicReference: referenceB });
    expect(numberB).not.toBe(numberA);

    const foreignAwb = await asTenant(tenantA, adminUserA, (tx, context) =>
      lookupShipmentByTrackingKey(tx, context, parseTrackingLookupKey(AWB_B)!));
    const unknownAwb = await asTenant(tenantA, adminUserA, (tx, context) =>
      lookupShipmentByTrackingKey(tx, context, parseTrackingLookupKey(AWB_NOBODY)!));
    const foreignNumber = await asTenant(tenantA, adminUserA, (tx, context) =>
      lookupShipmentByTrackingKey(tx, context, parseTrackingLookupKey(referenceB)!));
    const foreignPrefix = await asTenant(tenantA, adminUserA, (tx, context) =>
      lookupShipmentByTrackingKey(tx, context, parseTrackingLookupKey(`ZZ-${numberA}`)!));

    expect([foreignAwb, unknownAwb, foreignNumber, foreignPrefix]).toEqual([null, null, null, null]);
  });

  it("does the same amount of database work for a foreign key as for an unknown key", async () => {
    const measure = async (key: string) => {
      statementCount = 0;
      await asTenant(tenantA, adminUserA, (tx, context) =>
        lookupShipmentByTrackingKey(tx, context, parseTrackingLookupKey(key)!));
      return statementCount;
    };

    const foreign = await measure(AWB_B);
    const unknown = await measure(AWB_NOBODY);

    expect(foreign).toBe(unknown);
    // One tenant-scoped statement decides both; nothing runs a second, wider query.
    expect(foreign).toBeLessThan(await measure(AWB_A));
  });
});

describe("tracking lookup action boundary (PR-51)", () => {
  it("returns one indistinguishable outcome for a foreign and an unknown key, with no provider call", async () => {
    fixture.principal.mockResolvedValue({
      role: "TENANT_ADMIN", scope: "tenant", tenantId: tenantA, userId: adminUserA,
    });
    const network = vi.spyOn(globalThis, "fetch");

    const foreign = await lookupShipmentTracking({ kind: "idle" }, form(AWB_B));
    const unknown = await lookupShipmentTracking({ kind: "idle" }, form(AWB_NOBODY));

    expect(foreign).toEqual({ kind: "missing", query: AWB_B });
    expect(unknown).toEqual({ kind: "missing", query: AWB_NOBODY });
    // Only the operator's own input differs; nothing else about the two outcomes does.
    expect({ ...foreign, query: "" }).toEqual({ ...unknown, query: "" });
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
  });

  it("answers the caller's own key with the shipment and rejects malformed input", async () => {
    fixture.principal.mockResolvedValue({
      role: "OPERATOR", scope: "tenant", tenantId: tenantA, userId: adminUserA,
    });

    const found = await lookupShipmentTracking({ kind: "idle" }, form(referenceA));
    expect(found).toMatchObject({
      kind: "found",
      result: {
        awb: AWB_A,
        paymentMethod: "COD",
        observation: { observedAtIso: "2026-09-12T04:30:00.000Z", providerStatus: "DELIVERED" },
        publicReference: referenceA,
        status: "IN_TRANSIT",
      },
    });
    expect(await lookupShipmentTracking({ kind: "idle" }, form("kiriman saya")))
      .toEqual({ kind: "invalid", query: "kiriman saya" });
  });

  it("sends an anonymous caller to the tenant login instead of answering", async () => {
    fixture.principal.mockRejectedValueOnce(new CmsAuthorizationDeniedError("anonymous"));

    await expect(lookupShipmentTracking({ kind: "idle" }, form(referenceA)))
      .rejects.toThrow("REDIRECT:/login/tenant");
  });
});

describe("tracking lookup has no provider integration (PR-51)", () => {
  const repositorySource = readFileSync("src/db/shipment-tracking-lookup-repository.ts", "utf8");
  const actionSource = readFileSync("src/app/app/cek-resi/actions.ts", "utf8");

  it("reads stored observations only and never scopes the tenant in JavaScript", () => {
    expect(`${repositorySource}${actionSource}`).not.toMatch(/mengantar|fetch\(/i);
    expect(repositorySource).toContain("eq(shipments.tenantId, context.tenantId)");
    expect(repositorySource).toContain("eq(providerOrderStatusObservations.tenantId, context.tenantId)");
    // A JavaScript tenant comparison would mean the row was read first: a different plan, a
    // different timing, and a foreign key no longer indistinguishable from an unknown one.
    expect(repositorySource).not.toMatch(/row\.tenantId|\.tenantId\s*[=!]==/);
  });
  // Review B7: every behavioural cross-tenant assertion here also passes with the
  // application predicate deleted, because RLS hides the foreign row underneath.
  // AGENTS.md forbids RLS being the only control, so bind the predicate itself: the
  // statement the lookup sends must filter by tenant, whatever the source text says.
  it("sends a tenant predicate to the database rather than relying on row-level security", async () => {
    lastStatements = [];
    await asTenant(tenantA, adminUserA, (tx, context) =>
      lookupShipmentByTrackingKey(tx, context, parseTrackingLookupKey(AWB_A)!));
    const lookupStatements = lastStatements.filter((statement) => /from\s+"?(shipments|provider_order_status_observations)"?/i.test(statement));
    expect(lookupStatements.length, "the lookup issues its shipment and observation queries").toBeGreaterThanOrEqual(2);
    for (const statement of lookupStatements) {
      // A join correlating two tenant_id columns is not a filter; the lookup's own
      // table must be bound to the caller's tenant parameter.
      expect(statement, statement).toMatch(/"(?:shipments|provider_order_status_observations)"\."tenant_id"\s*=\s*\$\d/i);
    }
  });

});
