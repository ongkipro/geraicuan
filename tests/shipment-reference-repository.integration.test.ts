import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createShipmentDraft } from "@/db/shipment-draft-repository";
import { loadShipmentQueuePage } from "@/db/shipment-queue-repository";
import { withTenantContext } from "@/db/tenant-context";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
if (!adminUrl || !appUrl || new URL(adminUrl).hostname !== "127.0.0.1" || new URL(adminUrl).pathname !== "/geraicuan_test") throw new Error("Isolated local test database required.");
const admin = new Pool({ connectionString: adminUrl });
const app = new Pool({ connectionString: appUrl });
const db = drizzle({ client: app, schema });
const tenants = [randomUUID(), randomUUID()];
const outlets = [randomUUID(), randomUUID()];
const users = [`reference-${randomUUID()}`, `reference-${randomUUID()}`];
const numbers: number[] = [];

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(admin, appUrl);
  for (let i = 0; i < 2; i++) {
    const result = await admin.query("INSERT INTO users(id,name,email) VALUES ($1,'Reference fixture',$2) RETURNING public_number", [users[i], `${users[i]}@example.test`]);
    numbers.push(result.rows[0].public_number);
    await admin.query("INSERT INTO tenants(id,name,status) VALUES ($1,'Reference fixture','ACTIVE')", [tenants[i]]);
    await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'TENANT_ADMIN')", [tenants[i], users[i]]);
    await admin.query("INSERT INTO outlets(id,tenant_id,name,default_pickup_address_id,default_origin_area_id) VALUES ($1,$2,'Reference fixture','fixture-pickup','fixture-origin')", [outlets[i], tenants[i]]);
  }
});
afterAll(async () => {
  await admin.query("DELETE FROM shipment_parties WHERE tenant_id=ANY($1::uuid[])", [tenants]);
  await admin.query("DELETE FROM shipment_drafts WHERE tenant_id=ANY($1::uuid[])", [tenants]);
  await admin.query("DELETE FROM shipments WHERE tenant_id=ANY($1::uuid[])", [tenants]);
  await admin.query("DELETE FROM outlets WHERE tenant_id=ANY($1::uuid[])", [tenants]);
  await admin.query("DELETE FROM memberships WHERE tenant_id=ANY($1::uuid[])", [tenants]);
  await admin.query("DELETE FROM tenants WHERE id=ANY($1::uuid[])", [tenants]);
  await admin.query("DELETE FROM shipment_reference_counters WHERE reference_user_number=ANY($1::integer[])", [numbers]);
  await admin.query("DELETE FROM users WHERE id=ANY($1::text[])", [users]);
  await app.end(); await admin.end();
});
const inTenant = <T,>(index: number, work: Parameters<typeof withTenantContext<T>>[3]) => withTenantContext(db, users[index], tenants[index], work);
const insert = (index: number, date: string, extra: Partial<typeof schema.shipments.$inferInsert> = {}) => inTenant(index, async tx => {
  const [row] = await tx.insert(schema.shipments).values({ tenantId: tenants[index], outletId: outlets[index], createdAt: new Date(date), ...extra }).returning();
  return row;
});

describe("persisted shipment references", () => {
  it("allocates unique per-user daily numbers under real concurrent transactions", async () => {
    const rows = await Promise.all(Array.from({ length: 12 }, () => insert(0, "2041-01-10T01:00:00Z")));
    expect(new Set(rows.map(row => row.publicReference)).size).toBe(12);
    expect(rows.map(row => row.dailySequence).sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(rows.every(row => row.createdByUserId === users[0] && row.publicReference.startsWith(`${numbers[0]}-410110-`))).toBe(true);
    const other = await insert(1, "2041-01-10T01:00:00Z");
    expect(other.publicReference).toBe(`${numbers[1]}-410110-001`);
  });

  it("uses WIB day boundaries and separates matching day-of-month across months", async () => {
    const before = await insert(0, "2041-02-28T16:59:59Z");
    const after = await insert(0, "2041-02-28T17:00:00Z");
    const nextMonth = await insert(0, "2041-03-31T17:00:00Z");
    expect([before.publicReference, after.publicReference, nextMonth.publicReference]).toEqual([
      `${numbers[0]}-410228-001`, `${numbers[0]}-410301-001`, `${numbers[0]}-410401-001`,
    ]);
  });

  it("expands daily serials past 999 without truncation", async () => {
    await admin.query("INSERT INTO shipment_reference_counters VALUES ($1,'2041-04-02',999)", [numbers[0]]);
    expect((await insert(0, "2041-04-02T01:00:00Z")).publicReference).toBe(`${numbers[0]}-410402-1000`);
  });

  it("rejects creator forgery, cross-tenant inserts, and unscoped runtime writes", async () => {
    await expect(insert(0, "2041-04-03T01:00:00Z", { createdByUserId: users[1] })).rejects.toThrow();
    await expect(insert(0, "2041-04-03T01:00:00Z", { tenantId: tenants[1], outletId: outlets[1] })).rejects.toThrow();
    await expect(app.query("INSERT INTO shipments(tenant_id,outlet_id) VALUES ($1,$2)", [tenants[0], outlets[0]])).rejects.toMatchObject({ code: "42501" });
    const row = await insert(0, "2041-04-03T01:00:00Z", { publicReference: "forged", referenceUserNumber: 99999, dailySequence: 42 });
    expect(row.publicReference).toBe(`${numbers[0]}-410403-001`);
    const foreignRows = await inTenant(1, tx => tx.select().from(schema.shipments).where(eq(schema.shipments.id, row.id)));
    expect(foreignRows).toEqual([]);
  });

  it("prevents runtime counter access and mutation of persisted identity", async () => {
    const row = await insert(0, "2041-05-01T01:00:00Z");
    await expect(app.query("SELECT * FROM shipment_reference_counters")).rejects.toMatchObject({ code: "42501" });
    await expect(inTenant(0, tx => tx.update(schema.shipments).set({ publicReference: "other" }).where(eq(schema.shipments.id, row.id)))).rejects.toThrow();
    await expect(admin.query("UPDATE shipments SET daily_sequence=daily_sequence+1 WHERE id=$1", [row.id])).rejects.toMatchObject({ code: "42501" });
    await expect(admin.query("UPDATE users SET public_number=DEFAULT WHERE id=$1", [users[0]])).rejects.toMatchObject({ code: "42501" });
    await expect(app.query("SELECT public.allocate_shipment_reference()" )).rejects.toMatchObject({ code: "42501" });
  });

  it("leaves unowned owner fixtures honestly unattributed and rejects century reuse", async () => {
    const result = await admin.query("INSERT INTO shipments(tenant_id,outlet_id,created_at) VALUES ($1,$2,'2041-06-01T01:00:00Z') RETURNING public_reference,created_by_user_id", [tenants[0], outlets[0]]);
    expect(result.rows[0].created_by_user_id).toBeNull();
    expect(result.rows[0].public_reference).toMatch(/^00000-410601-\d{3,}$/);
    await insert(0, "2041-06-02T01:00:00Z");
    await expect(insert(0, "2141-06-02T01:00:00Z")).rejects.toThrow();
    const count = await inTenant(0, tx => tx.select({ count: sql<number>`count(*)::int` }).from(schema.shipments).where(and(eq(schema.shipments.referenceUserNumber, numbers[0]), eq(schema.shipments.referenceDate, "2141-06-02"))));
    expect(count[0].count).toBe(0);
  });

  it("keeps the same reference on production draft replay and projects it in the queue", async () => {
    const id = randomUUID();
    const input = {
      cogsAmountIdr: null, declaredValueIdr: 10000, destinationAreaId: "fixture-area", destinationAreaLabel: "Fixture area", isCod: false, outletId: outlets[0],
      packageContent: "Fixture package", packageHeightCm: null, packageLengthCm: null, packageQuantity: 1, packageWeightGrams: 1000, packageWidthCm: null,
      recipientAddress: "Fixture address", recipientName: "Fixture recipient", recipientPhone: "080000000144", senderAddress: "Fixture origin", senderName: "Fixture sender", senderPhone: "080000000145",
    };
    await inTenant(0, (tx, context) => createShipmentDraft(tx, context, input, id));
    const first = await inTenant(0, tx => tx.select().from(schema.shipments).where(eq(schema.shipments.id, id)));
    await inTenant(0, (tx, context) => createShipmentDraft(tx, context, input, id));
    const page = await inTenant(0, (tx, context) => loadShipmentQueuePage(tx, context, { page: 1, pageSize: 100, status: "ALL" }));
    expect(page.rows.find(row => row.shipmentId === id)?.publicReference).toBe(first[0].publicReference);
    expect(first[0].createdByUserId).toBe(users[0]);
  });
});
