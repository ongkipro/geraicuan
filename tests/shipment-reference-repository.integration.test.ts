import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createShipmentDraft } from "@/db/shipment-draft-repository";
import {
  loadPlatformTenantShipmentPrefix,
  loadTenantShipmentPrefix,
  resolveShipmentRouteKey,
  saveTenantShipmentPrefix,
  ShipmentPrefixDeniedError,
  ShipmentPrefixInvalidError,
  ShipmentPrefixLockedError,
  unlockTenantShipmentPrefix,
} from "@/db/shipment-number-repository";
import { loadShipmentQueuePage } from "@/db/shipment-queue-repository";
import { withTenantContext } from "@/db/tenant-context";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
if (!adminUrl || !appUrl || new URL(adminUrl).hostname !== "127.0.0.1" || new URL(adminUrl).pathname !== "/geraicuan_test") throw new Error("Isolated local test database required.");
const admin = new Pool({ connectionString: adminUrl });
const app = new Pool({ connectionString: appUrl });
const db = drizzle({ client: app, schema });
// 0/1 allocate; 2 has history with an unlocked prefix (post-migration); 3 races; 4 runs under a non-superuser owner.
const TENANTS = 5;
const tenants = Array.from({ length: TENANTS }, () => randomUUID());
const outlets = Array.from({ length: TENANTS }, () => randomUUID());
const users = Array.from({ length: TENANTS }, () => `reference-${randomUUID()}`);
const operator = `reference-op-${randomUUID()}`;
const superAdmin = `reference-super-${randomUUID()}`;
const inactiveSuperAdmin = `reference-super-off-${randomUUID()}`;
const PREFIX_FUNCTIONS = [
  "public.allocate_shipment_reference()",
  "public.protect_public_reference_identity()",
  "public.set_tenant_shipment_prefix(text, uuid)",
  "public.unlock_tenant_shipment_prefix(uuid, uuid)",
  "public.tenant_shipment_prefix_state(uuid)",
];

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(admin, appUrl);
  for (let i = 0; i < TENANTS; i++) {
    await admin.query("INSERT INTO users(id,name,email) VALUES ($1,'Reference fixture',$2)", [users[i], `${users[i]}@example.test`]);
    await admin.query("INSERT INTO tenants(id,name,status) VALUES ($1,'Toko Kopi Pagi','ACTIVE')", [tenants[i]]);
    await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'TENANT_ADMIN')", [tenants[i], users[i]]);
    await admin.query("INSERT INTO outlets(id,tenant_id,name,default_pickup_address_id,default_origin_area_id) VALUES ($1,$2,'Reference fixture','fixture-pickup','fixture-origin')", [outlets[i], tenants[i]]);
  }
  await admin.query("INSERT INTO users(id,name,email) VALUES ($1,'Operator',$2), ($3,'Super',$4), ($5,'Super off',$6)", [operator, `${operator}@example.test`, superAdmin, `${superAdmin}@example.test`, inactiveSuperAdmin, `${inactiveSuperAdmin}@example.test`]);
  await admin.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [inactiveSuperAdmin]);
  await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'OPERATOR')", [tenants[2], operator]);
  await admin.query("INSERT INTO platform_roles(user_id) VALUES ($1), ($2)", [superAdmin, inactiveSuperAdmin]);
});
afterAll(async () => {
  await admin.query("DELETE FROM audit_events WHERE tenant_id=ANY($1::uuid[]) OR target_id=ANY($2::text[])", [tenants, tenants]);
  await admin.query("DELETE FROM shipment_parties WHERE tenant_id=ANY($1::uuid[])", [tenants]);
  await admin.query("DELETE FROM shipment_drafts WHERE tenant_id=ANY($1::uuid[])", [tenants]);
  await admin.query("DELETE FROM shipments WHERE tenant_id=ANY($1::uuid[])", [tenants]);
  await admin.query("DELETE FROM outlets WHERE tenant_id=ANY($1::uuid[])", [tenants]);
  await admin.query("DELETE FROM memberships WHERE tenant_id=ANY($1::uuid[])", [tenants]);
  await admin.query("DELETE FROM tenants WHERE id=ANY($1::uuid[])", [tenants]);
  await admin.query("DELETE FROM platform_roles WHERE user_id=ANY($1::text[])", [[superAdmin, inactiveSuperAdmin]]);
  await admin.query("DELETE FROM users WHERE id=ANY($1::text[])", [[...users, operator, superAdmin, inactiveSuperAdmin]]);
  await app.end(); await admin.end();
});
const inTenant = <T,>(index: number, work: Parameters<typeof withTenantContext<T>>[3], user = users[index]) => withTenantContext(db, user, tenants[index], work);
const insert = (index: number, extra: Partial<typeof schema.shipments.$inferInsert> = {}) => inTenant(index, async tx => {
  const [row] = await tx.insert(schema.shipments).values({ tenantId: tenants[index], outletId: outlets[index], ...extra }).returning();
  return row;
});
const counter = async (index: number) => (await admin.query("SELECT last_number, shipment_prefix, shipment_prefix_locked_at FROM tenant_shipment_counters WHERE tenant_id=$1", [tenants[index]])).rows[0];
const references = async (index: number) => (await admin.query<{ public_reference: string }>("SELECT public_reference FROM shipments WHERE tenant_id=$1 ORDER BY tenant_number", [tenants[index]])).rows.map(row => row.public_reference);

describe("per-tenant shipment numbers (PR-44)", () => {
  it("allocates unique per-tenant numbers from 10000 under concurrent transactions and locks GC on the first, audited", async () => {
    expect(await counter(0)).toBeUndefined();
    const rows = await Promise.all(Array.from({ length: 12 }, () => insert(0)));
    expect(rows.map(row => row.tenantNumber).sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => 10000 + i));
    expect(rows.every(row => row.publicReference === `GC-${row.tenantNumber}` && row.createdByUserId === users[0])).toBe(true);
    expect(await counter(0)).toMatchObject({ last_number: 10011, shipment_prefix: "GC", shipment_prefix_locked_at: expect.any(Date) });
    const implicit = await admin.query("SELECT actor_id, tenant_id, metadata FROM audit_events WHERE target_id=$1 AND action='SHIPMENT_PREFIX_LOCKED'", [tenants[0]]);
    expect(implicit.rows).toEqual([{ actor_id: users[0], tenant_id: null, metadata: { implicit: true, prefix: "GC" } }]);
    // Another tenant starts its own sequence; the same displayed number is not a collision.
    expect((await insert(1)).publicReference).toBe("GC-10000");
  });

  it("grows past 99999 without truncation", async () => {
    await admin.query("UPDATE tenant_shipment_counters SET last_number=99999 WHERE tenant_id=$1", [tenants[1]]);
    const row = await insert(1);
    expect([row.tenantNumber, row.publicReference]).toEqual([100000, "GC-100000"]);
  });

  it("rejects creator forgery, cross-tenant and unscoped writes, and ignores forged identity", async () => {
    await expect(insert(0, { createdByUserId: users[1] })).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(insert(0, { tenantId: tenants[1], outletId: outlets[1] })).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(app.query("INSERT INTO shipments(tenant_id,outlet_id) VALUES ($1,$2)", [tenants[0], outlets[0]])).rejects.toMatchObject({ code: "42501" });
    const row = await insert(0, { publicReference: "XX-99999", tenantNumber: 99999 });
    expect(row.publicReference).toBe(`GC-${row.tenantNumber}`);
    expect(row.tenantNumber).not.toBe(99999);
    expect(await inTenant(1, tx => tx.select().from(schema.shipments).where(eq(schema.shipments.id, row.id)))).toEqual([]);
  });

  it("keeps numbering state private, the number immutable, and the reference writable only inside the prefix function", async () => {
    const row = await insert(0);
    await expect(app.query("SELECT * FROM tenant_shipment_counters")).rejects.toMatchObject({ code: "42501" });
    await expect(app.query("SELECT public.allocate_shipment_reference()")).rejects.toMatchObject({ code: "42501" });
    await expect(admin.query("UPDATE shipments SET tenant_number=tenant_number+1000 WHERE id=$1", [row.id])).rejects.toMatchObject({ code: "42501", message: "Shipment number is immutable." });
    // Owner-role update with no rewrite flag: the coalesce'd flag check must refuse it.
    await expect(admin.query("UPDATE shipments SET public_reference='ZZ-'||tenant_number WHERE id=$1", [row.id])).rejects.toMatchObject({ code: "42501", message: "Shipment reference is immutable." });
    // A role that can UPDATE the column and sets the flag, but is not the function owner, is refused by the trigger itself.
    const client = await admin.connect();
    try {
      await client.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='geraicuan_flag_probe') THEN CREATE ROLE geraicuan_flag_probe NOLOGIN NOSUPERUSER BYPASSRLS; END IF; END $$");
      await client.query("GRANT SELECT, UPDATE (public_reference) ON shipments TO geraicuan_flag_probe");
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE geraicuan_flag_probe");
      await client.query("SELECT set_config('app.shipment_prefix_rewrite','on',true)");
      await expect(client.query("UPDATE shipments SET public_reference='ZZ-'||tenant_number WHERE id=$1", [row.id])).rejects.toMatchObject({ code: "42501", message: "Shipment reference is immutable." });
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.query("REVOKE ALL ON shipments FROM geraicuan_flag_probe");
      client.release();
    }
    expect((await admin.query("SELECT public_reference FROM shipments WHERE id=$1", [row.id])).rows[0].public_reference).toBe(`GC-${row.tenantNumber}`);
  });

  it("lets a tenant with history choose its prefix once, rewriting every reference, then locks and audits", async () => {
    const history = [await insert(2), await insert(2)];
    // Post-migration state: numbers exist but the prefix was never locked.
    await admin.query("UPDATE tenant_shipment_counters SET shipment_prefix_locked_at=NULL WHERE tenant_id=$1", [tenants[2]]);
    // Later allocations do not lock it again; only a tenant's first ever allocation does.
    const third = await insert(2);
    expect((await counter(2)).shipment_prefix_locked_at).toBeNull();
    const attemptId = randomUUID();

    await expect(inTenant(2, (tx, context) => saveTenantShipmentPrefix(tx, context, "TKP", randomUUID()), operator)).rejects.toThrow(ShipmentPrefixDeniedError);
    await expect(inTenant(2, tx => tx.execute("SELECT public.set_tenant_shipment_prefix('TKP', gen_random_uuid())"), operator)).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(inTenant(2, (tx, context) => saveTenantShipmentPrefix(tx, context, "tk-p", randomUUID()))).rejects.toThrow(ShipmentPrefixInvalidError);
    // The runtime role cannot forge prefix audit rows directly.
    await expect(inTenant(2, tx => tx.execute(`INSERT INTO audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, metadata) VALUES ('${users[2]}', 'SUPER_ADMIN', '${tenants[2]}', 'SHIPMENT_PREFIX_UNLOCKED', 'TENANT', '${tenants[2]}', 'SUCCESS', '{}')`))).rejects.toMatchObject({ cause: { code: "42501" } });

    await inTenant(2, (tx, context) => saveTenantShipmentPrefix(tx, context, "TKP", attemptId));
    expect(await references(2)).toEqual([...history, third].map(row => `TKP-${row.tenantNumber}`));
    expect((await insert(2)).publicReference).toMatch(/^TKP-\d{5}$/);
    await expect(inTenant(2, (tx, context) => saveTenantShipmentPrefix(tx, context, "ABC", randomUUID()))).rejects.toThrow(ShipmentPrefixLockedError);
    expect(await inTenant(2, (tx, context) => loadTenantShipmentPrefix(tx, context))).toMatchObject({ prefix: "TKP", lockedAt: expect.any(Date), tenantName: "Toko Kopi Pagi" });
    const audit = await admin.query("SELECT actor_id, actor_role, metadata FROM audit_events WHERE tenant_id=$1 AND action='SHIPMENT_PREFIX_LOCKED' AND metadata ? 'attemptId'", [tenants[2]]);
    expect(audit.rows).toEqual([{ actor_id: users[2], actor_role: "TENANT_MEMBER", metadata: { attemptId, previousPrefix: "GC", prefix: "TKP" } }]);
  });

  it("allows only an active Super Admin to unlock, audited; later allocations keep it unlocked until the tenant chooses", async () => {
    await expect(unlockTenantShipmentPrefix(db, users[2], tenants[2], randomUUID())).rejects.toThrow(ShipmentPrefixDeniedError);
    await expect(unlockTenantShipmentPrefix(db, inactiveSuperAdmin, tenants[2], randomUUID())).rejects.toThrow(ShipmentPrefixDeniedError);
    expect(await loadPlatformTenantShipmentPrefix(db, superAdmin, tenants[2])).toMatchObject({ prefix: "TKP", lockedAt: expect.any(Date) });
    await expect(loadPlatformTenantShipmentPrefix(db, users[2], tenants[2])).rejects.toMatchObject({ cause: { code: "42501" } });
    await unlockTenantShipmentPrefix(db, superAdmin, tenants[2], randomUUID());
    await expect(unlockTenantShipmentPrefix(db, superAdmin, tenants[2], randomUUID())).rejects.toThrow(ShipmentPrefixLockedError);
    const unlocked = await admin.query("SELECT actor_role FROM audit_events WHERE tenant_id=$1 AND action='SHIPMENT_PREFIX_UNLOCKED'", [tenants[2]]);
    expect(unlocked.rows).toEqual([{ actor_role: "SUPER_ADMIN" }]);
    await insert(2);
    expect((await counter(2)).shipment_prefix_locked_at).toBeNull();
    await inTenant(2, (tx, context) => saveTenantShipmentPrefix(tx, context, "TKPJ", randomUUID()));
    expect((await references(2)).every(reference => reference.startsWith("TKPJ-"))).toBe(true);
  });

  it("serializes a prefix save racing a tenant's first allocation into one consistent outcome", async () => {
    const results = await Promise.allSettled([
      inTenant(3, (tx, context) => saveTenantShipmentPrefix(tx, context, "RACE", randomUUID())),
      insert(3),
      insert(3),
    ]);
    const saved = results[0].status === "fulfilled";
    expect(results.slice(1).every(result => result.status === "fulfilled")).toBe(true);
    if (!saved) expect((results[0] as PromiseRejectedResult).reason).toBeInstanceOf(ShipmentPrefixLockedError);
    const state = await counter(3);
    expect(state.shipment_prefix_locked_at).not.toBeNull();
    expect(state.shipment_prefix).toBe(saved ? "RACE" : "GC");
    expect(await references(3)).toEqual([`${state.shipment_prefix}-10000`, `${state.shipment_prefix}-10001`]);
  });

  it("works when every numbering function is owned by a non-superuser, non-BYPASSRLS role", async () => {
    const owners = await admin.query<{ proc: string; owner: string }>(
      "SELECT p.oid::regprocedure::text AS proc, pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid = ANY($1::regprocedure[])", [PREFIX_FUNCTIONS]);
    expect(owners.rows).toHaveLength(PREFIX_FUNCTIONS.length);
    const client = await admin.connect();
    try {
      await client.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='geraicuan_owner_probe') THEN CREATE ROLE geraicuan_owner_probe NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$");
      await client.query("GRANT SELECT ON users, memberships, tenants, outlets, platform_roles TO geraicuan_owner_probe");
      await client.query("GRANT SELECT, INSERT, UPDATE ON tenant_shipment_counters TO geraicuan_owner_probe");
      await client.query("GRANT SELECT, UPDATE (public_reference) ON shipments TO geraicuan_owner_probe");
      await client.query("GRANT INSERT ON audit_events TO geraicuan_owner_probe");
      // Existing RLS policies call these helpers; a real migration owner owns them, the probe needs EXECUTE.
      await client.query("GRANT EXECUTE ON FUNCTION public.tenant_member_governance_authorized(uuid) TO geraicuan_owner_probe");
      for (const fn of PREFIX_FUNCTIONS) await client.query(`ALTER FUNCTION ${fn} OWNER TO geraicuan_owner_probe`);

      const first = await insert(4);
      expect(first.publicReference).toBe("GC-10000");
      await admin.query("UPDATE tenant_shipment_counters SET shipment_prefix_locked_at=NULL WHERE tenant_id=$1", [tenants[4]]);
      await inTenant(4, (tx, context) => saveTenantShipmentPrefix(tx, context, "OWN", randomUUID()));
      expect(await references(4)).toEqual(["OWN-10000"]);
      expect(await inTenant(4, (tx, context) => loadTenantShipmentPrefix(tx, context))).toMatchObject({ prefix: "OWN" });
      await unlockTenantShipmentPrefix(db, superAdmin, tenants[4], randomUUID());
      const audit = await admin.query<{ action: string }>("SELECT action FROM audit_events WHERE target_id=$1", [tenants[4]]);
      expect(audit.rows.map(row => row.action).sort()).toEqual(["SHIPMENT_PREFIX_LOCKED", "SHIPMENT_PREFIX_LOCKED", "SHIPMENT_PREFIX_UNLOCKED"]);
    } finally {
      for (const { proc, owner } of owners.rows) await client.query(`ALTER FUNCTION ${proc} OWNER TO "${owner}"`);
      await client.query("REVOKE ALL ON users, memberships, tenants, outlets, platform_roles, tenant_shipment_counters, shipments, audit_events FROM geraicuan_owner_probe");
      await client.query("REVOKE ALL ON FUNCTION public.tenant_member_governance_authorized(uuid) FROM geraicuan_owner_probe");
      client.release();
    }
  });

  it("resolves route keys only inside the current tenant, by application predicate as well as RLS", async () => {
    const row = await insert(0);
    expect(await inTenant(0, (tx, context) => resolveShipmentRouteKey(tx, context, { kind: "number", tenantNumber: row.tenantNumber, canonical: true })))
      .toEqual({ shipmentId: row.id, tenantNumber: row.tenantNumber });
    expect(await inTenant(0, (tx, context) => resolveShipmentRouteKey(tx, context, { kind: "uuid", shipmentId: row.id })))
      .toEqual({ shipmentId: row.id, tenantNumber: row.tenantNumber });
    expect(await inTenant(1, (tx, context) => resolveShipmentRouteKey(tx, context, { kind: "uuid", shipmentId: row.id }))).toBeNull();
    const bypass = drizzle({ client: admin, schema });
    expect(await bypass.transaction(tx => resolveShipmentRouteKey(tx, { role: "TENANT_ADMIN", tenantId: tenants[1], userId: users[1] }, { kind: "uuid", shipmentId: row.id }))).toBeNull();
    // Both tenants have a 10000; each resolves to its own shipment.
    const sameNumber = await inTenant(1, (tx, context) => resolveShipmentRouteKey(tx, context, { kind: "number", tenantNumber: 10000, canonical: true }));
    const tenantOneRow = (await admin.query("SELECT id FROM shipments WHERE tenant_id=$1 AND tenant_number=10000", [tenants[1]])).rows[0].id;
    expect(sameNumber).toEqual({ shipmentId: tenantOneRow, tenantNumber: 10000 });
  });

  it("leaves owner fixtures unattributed and keeps the number on production draft replay", async () => {
    const result = await admin.query("INSERT INTO shipments(tenant_id,outlet_id) VALUES ($1,$2) RETURNING public_reference,created_by_user_id", [tenants[0], outlets[0]]);
    expect(result.rows[0].created_by_user_id).toBeNull();
    expect(result.rows[0].public_reference).toMatch(/^GC-\d{5,}$/);
    const id = randomUUID();
    const input = {
      declaredValueIdr: 10000, destinationAreaId: "fixture-area", destinationAreaLabel: "Fixture area", destinationAreaVerified: true, isCod: false, isHazardous: false, outletId: outlets[0],
      recipientAddressLandmark: null, shippingInstruction: null,
      packageContent: "Fixture package", packageHeightCm: null, packageLengthCm: null, packageQuantity: 1, packageWeightGrams: 1000, packageWidthCm: null, paymentMethod: "NON_COD" as const, pickupAddressId: null,
      recipientAddress: "Fixture address", recipientName: "Fixture recipient", recipientPhone: "080000000144", senderAddress: "Fixture origin", senderName: "Fixture sender", senderPhone: "080000000145",
    };
    await inTenant(0, (tx, context) => createShipmentDraft(tx, context, input, id));
    const first = await inTenant(0, tx => tx.select().from(schema.shipments).where(eq(schema.shipments.id, id)));
    await inTenant(0, (tx, context) => createShipmentDraft(tx, context, input, id));
    const page = await inTenant(0, (tx, context) => loadShipmentQueuePage(tx, context, { page: 1, pageSize: 100, status: "ALL" }));
    expect(page.rows.find(row => row.shipmentId === id)?.publicReference).toBe(first[0].publicReference);
    expect(first[0].publicReference).toBe(`GC-${first[0].tenantNumber}`);
  });
});
