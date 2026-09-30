// T-267 "Tandai sudah diserahkan": the handover record (DATA-24, migration 0070), its Server
// Actions and every read that uses it, for real against the isolated test database (runtime
// role, RLS on). Only the session lookup is replaced. Fixtures live in their own tenants and are
// removed by tenant; no Mengantar call is made anywhere.
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required for integration tests.");
}
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}

const session = vi.hoisted(() => ({ principal: { role: "OPERATOR", scope: "tenant", tenantId: "", tenantStatus: "ACTIVE", userId: "" } }));
vi.mock("@/app/app/pengiriman/_list/tenant-page", () => ({ requireTenantPrincipal: async () => session.principal }));
vi.mock("@/db/client", async () => {
  const { drizzle: connect } = await import("drizzle-orm/node-postgres");
  const { Pool: PgPool } = await import("pg");
  const dbSchema = await import("@/db/schema");
  return { db: connect({ client: new PgPool({ allowExitOnIdle: true, connectionString: process.env.APP_DATABASE_URL }), schema: dbSchema }) };
});
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { markShipmentsHandedOverAction, selectReadyForHandover, undoShipmentHandoverAction } = await import("@/app/app/label/handover-actions");
const { loadLabelIndexPage } = await import("@/db/label-print-repository");
const { countHandedOverToday, loadShipmentHandover } = await import("@/db/shipment-handover-repository");
const { loadShipmentQueuePage } = await import("@/db/shipment-queue-repository");
const { loadTenantDashboardShipments } = await import("@/db/tenant-dashboard-repository");
const { withTenantContext } = await import("@/db/tenant-context");

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });

const tenants = {
  a: { admin: "t267-admin-a", id: "00000000-0000-0267-0000-0000000000a1", operator: "t267-operator-a", outlet: "00000000-0000-0267-0001-0000000000a1" },
  b: { admin: "t267-admin-b", id: "00000000-0000-0267-0000-0000000000b1", operator: "t267-operator-b", outlet: "00000000-0000-0267-0001-0000000000b1" },
};
type TenantKey = keyof typeof tenants;
let sequence = 0;

type Seeded = { awb: string; number: number; publicReference: string; shipmentId: string; snapshotId: string };

async function seedShipment(
  key: TenantKey,
  options: { printed?: boolean; status?: "ISSUED" | "AWAITING_UPSTREAM_PAYMENT"; handoverType?: "PICKUP" | "DROP_OFF" } = {},
): Promise<Seeded> {
  const tenant = tenants[key];
  const status = options.status ?? "ISSUED";
  sequence += 1;
  const suffix = `${key}${sequence.toString(16).padStart(11, "0")}`;
  const ids = {
    batchId: `00000000-0000-0267-0013-${suffix}`,
    estimateServiceId: `00000000-0000-0267-0012-${suffix}`,
    estimateSnapshotId: `00000000-0000-0267-0011-${suffix}`,
    providerOrderSnapshotId: `00000000-0000-0267-0014-${suffix}`,
    shipmentId: `00000000-0000-0267-0010-${suffix}`,
  };
  const awb = `JNE267${key.toUpperCase()}${String(sequence).padStart(5, "0")}`;
  const { rows } = await adminPool.query<{ public_reference: string; tenant_number: number }>(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, $4) RETURNING tenant_number, public_reference",
    [ids.shipmentId, tenant.id, tenant.outlet, status],
  );
  const handoverType = options.handoverType ?? "DROP_OFF";
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label, package_content,
      package_weight_grams, package_quantity, declared_value_idr, is_cod, cod_shipping_only, pickup_address_id, origin_area_id,
      handover_type, pickup_date, pickup_slot
    ) VALUES ($1, $2, 'fixture-destination', 'Menteng, Menteng, Jakarta Pusat, DKI Jakarta, 10310',
      'Kain', 1000, 1, 100000, false, false, 'pickup-267', 'origin-fixture', $3, $4, $5)`,
    [ids.shipmentId, tenant.id, handoverType, handoverType === "PICKUP" ? "2026-09-30" : null, handoverType === "PICKUP" ? "10:00" : null],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
     VALUES ($1, $2, 'RECIPIENT', 'Penerima Sintetis', '081299990267', 'Jl. Sintetis 1', 'fixture-destination',
       'Menteng, Menteng, Jakarta Pusat, DKI Jakarta, 10310')`,
    [tenant.id, ids.shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id, destination_area_label,
      weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'origin-fixture', 'fixture-destination', 'Menteng, Jakarta Pusat', 1000, false, 'platform_default')`,
    [ids.estimateSnapshotId, tenant.id, ids.shipmentId, tenant.outlet],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'REG', 'IDR', 8000, 'price', '1-2 hari', true)`,
    [ids.estimateServiceId, tenant.id, ids.estimateSnapshotId],
  );
  await adminPool.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier, credential_source, provider_account_key,
      idempotency_key, status, submission_attempted_at, completed_at
    ) VALUES ($1, $2, $3, 'pickup-267', 'JNE', 'platform_default', $4, $5, 'COMPLETED', now(), now())`,
    [ids.batchId, tenant.id, tenant.outlet, "c".repeat(64), `267${key}${sequence}`.padStart(64, "0")],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id, position, provider_service,
      destination_area_id, destination_area_label, currency, shipping_amount_idr, provider_charged_shipping_idr,
      insurance_amount_idr, is_cod, provider_cod_amount_idr, status, provider_order_id, is_paid, cnote_no,
      safe_response_code, resolved_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'REG', 'fixture-destination', 'Menteng, Jakarta Pusat', 'IDR',
      8000, 7000, 0, false, NULL, $7, $8, $9, $10, 'FIXTURE_ACCEPTED', now() - ($11 || ' seconds')::interval)`,
    [
      ids.providerOrderSnapshotId, tenant.id, ids.batchId, ids.shipmentId, ids.estimateSnapshotId, ids.estimateServiceId,
      status, `t267-order-${key}-${sequence}`, status === "ISSUED", status === "ISSUED" ? awb : null, String(1000 - sequence),
    ],
  );
  if (options.printed) {
    await adminPool.query(
      `INSERT INTO print_events (tenant_id, shipment_id, provider_order_snapshot_id, sequence, outcome, awb_snapshot, actor_user_id, actor_role)
       VALUES ($1, $2, $3, 1, 'PRINTED', $4, $5, 'OPERATOR')`,
      [tenant.id, ids.shipmentId, ids.providerOrderSnapshotId, awb, tenant.operator],
    );
  }
  return { awb, number: rows[0].tenant_number, publicReference: rows[0].public_reference, shipmentId: ids.shipmentId, snapshotId: ids.providerOrderSnapshotId };
}

async function clean() {
  for (const tenant of Object.values(tenants)) {
    for (const table of [
      "shipment_handover_events", "shipment_invoices", "print_events", "provider_order_snapshots", "provider_batches",
      "shipment_cod_totals", "shipment_estimate_services", "shipment_estimate_snapshots", "shipment_parties",
      "shipment_drafts", "shipments", "outlet_pickup_points", "outlets", "memberships",
    ]) {
      await adminPool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenant.id]);
    }
    await adminPool.query("DELETE FROM tenant_shipment_counters WHERE tenant_id = $1", [tenant.id]);
    await adminPool.query("DELETE FROM audit_events WHERE tenant_id = $1", [tenant.id]);
    await adminPool.query("DELETE FROM tenants WHERE id = $1", [tenant.id]);
    await adminPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [[tenant.admin, tenant.operator]]);
  }
}

function as(key: TenantKey, role: "OPERATOR" | "TENANT_ADMIN" = "OPERATOR", tenantKey: TenantKey = key) {
  const tenant = tenants[key];
  session.principal = { ...session.principal, role, tenantId: tenants[tenantKey].id, userId: role === "OPERATOR" ? tenant.operator : tenant.admin };
}

function read<T>(key: TenantKey, work: Parameters<typeof withTenantContext<T>>[3], role: "OPERATOR" | "TENANT_ADMIN" = "OPERATOR") {
  const tenant = tenants[key];
  return withTenantContext(appDb, role === "OPERATOR" ? tenant.operator : tenant.admin, tenant.id, work);
}

async function events(shipmentId: string) {
  return (await adminPool.query<{ actor_role: string; actor_user_id: string; created_at: Date; id: string; kind: string; method: string | null; note: string | null; sequence: number; tenant_id: string }>(
    "SELECT * FROM shipment_handover_events WHERE shipment_id = $1 ORDER BY sequence",
    [shipmentId],
  )).rows;
}

async function handoverAudit(tenantId: string) {
  return (await adminPool.query<{ action: string; actor_id: string; metadata: Record<string, unknown>; target_id: string; target_type: string; tenant_id: string | null }>(
    "SELECT action, actor_id, metadata, target_id, target_type, tenant_id FROM audit_events WHERE action LIKE 'SHIPMENT_HANDOVER_%' AND (tenant_id = $1 OR tenant_id IS NULL) ORDER BY created_at, id",
    [tenantId],
  )).rows;
}

/** A runtime-role transaction in a gerai member's context; the statement's SQLSTATE or "accepted". */
async function asRuntime(userId: string, tenantId: string, statement: string, values: unknown[] = []) {
  const client = await appPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)", [userId, tenantId]);
    const result = await client.query(statement, values);
    return { code: "accepted", rows: result.rows as Record<string, unknown>[] };
  } catch (error) {
    return { code: (error as { code?: string }).code ?? "error", rows: [] };
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await clean();
  sequence = 0;
  for (const [key, tenant] of Object.entries(tenants)) {
    await adminPool.query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6)", [
      tenant.operator, `Operator ${key.toUpperCase()}`, `${tenant.operator}@example.test`,
      tenant.admin, `Pemilik ${key.toUpperCase()}`, `${tenant.admin}@example.test`,
    ]);
    await adminPool.query("INSERT INTO tenants (id, name, status, contact_whatsapp) VALUES ($1, $2, 'ACTIVE', '081234567890')", [tenant.id, `Gerai T267 ${key}`]);
    await adminPool.query("INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OPERATOR'), ($1, $3, 'TENANT_ADMIN')", [tenant.id, tenant.operator, tenant.admin]);
    await adminPool.query(
      `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_pickup_address_label, default_origin_area_id, default_origin_area_label)
       VALUES ($1, $2, $3, 'pickup-267', 'Gudang, Menteng', 'origin-fixture', 'Menteng, Jakarta Pusat')`,
      [tenant.outlet, tenant.id, `Outlet ${key}`],
    );
  }
});

afterAll(async () => {
  await clean();
  await adminPool.end();
  await appPool.end();
});

describe("migration 0070: table, grants and row-level security", () => {
  it("forces RLS, grants the runtime role SELECT and INSERT only, and keeps the table append-only", async () => {
    const { rows: [table] } = await adminPool.query<{ forced: boolean; rls: boolean }>(
      "SELECT relrowsecurity AS rls, relforcerowsecurity AS forced FROM pg_class WHERE relname = 'shipment_handover_events'");
    expect(table).toEqual({ forced: true, rls: true });
    const { rows: grants } = await adminPool.query<{ privilege_type: string }>(
      `SELECT DISTINCT privilege_type FROM information_schema.column_privileges
        WHERE table_name = 'shipment_handover_events' AND grantee = 'geraicuan_app' ORDER BY privilege_type`);
    expect(grants.map((row) => row.privilege_type)).toEqual(["INSERT", "SELECT"]);

    const parcel = await seedShipment("a", { printed: true });
    as("a");
    expect(await markShipmentsHandedOverAction({ method: "PICKUP", numbers: [parcel.number] })).toMatchObject({ marked: 1, ok: true });
    const a = tenants.a;
    expect((await asRuntime(a.operator, a.id, "UPDATE shipment_handover_events SET note = 'x'")).code).toBe("42501");
    expect((await asRuntime(a.admin, a.id, "DELETE FROM shipment_handover_events")).code).toBe("42501");
    expect(await events(parcel.shipmentId)).toHaveLength(1);
  });

  it("refuses cross-tenant reads and writes, a forged actor, a skipped sequence and a repeated kind", async () => {
    const parcel = await seedShipment("a", { printed: true });
    as("a");
    await markShipmentsHandedOverAction({ method: "DROP_OFF", numbers: [parcel.number] });
    const { a, b } = tenants;

    // Tenant B's context sees none of A's events and cannot write one for A's shipment.
    expect((await asRuntime(b.operator, b.id, "SELECT count(*)::int AS n FROM shipment_handover_events")).rows[0]).toEqual({ n: 0 });
    const insert = `INSERT INTO shipment_handover_events (tenant_id, shipment_id, sequence, kind, method, actor_user_id, actor_role)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`;
    // (Sequence 1: B sees none of A's events, so only the policy stands between them.)
    expect((await asRuntime(b.operator, b.id, insert, [a.id, parcel.shipmentId, 1, "HANDED_OVER", "PICKUP", b.operator, "OPERATOR"])).code).toBe("42501");
    expect((await asRuntime(b.operator, b.id, insert, [b.id, parcel.shipmentId, 1, "HANDED_OVER", "PICKUP", b.operator, "OPERATOR"])).code).not.toBe("accepted");
    // B's user in A's context: not a member, reads nothing, writes nothing.
    expect((await asRuntime(b.operator, a.id, "SELECT count(*)::int AS n FROM shipment_handover_events")).rows[0]).toEqual({ n: 0 });
    expect((await asRuntime(b.operator, a.id, insert, [a.id, parcel.shipmentId, 1, "HANDED_OVER", "PICKUP", b.operator, "OPERATOR"])).code).toBe("42501");
    // A's own member: another user as actor, a wrong role, a skipped sequence, a second HANDED_OVER.
    expect((await asRuntime(a.operator, a.id, insert, [a.id, parcel.shipmentId, 2, "UNDONE", null, a.admin, "TENANT_ADMIN"])).code).toBe("42501");
    expect((await asRuntime(a.operator, a.id, insert, [a.id, parcel.shipmentId, 2, "UNDONE", null, a.operator, "TENANT_ADMIN"])).code).toBe("42501");
    expect((await asRuntime(a.operator, a.id, insert, [a.id, parcel.shipmentId, 3, "UNDONE", null, a.operator, "OPERATOR"])).code).toBe("23514");
    expect((await asRuntime(a.operator, a.id, insert, [a.id, parcel.shipmentId, 2, "HANDED_OVER", "PICKUP", a.operator, "OPERATOR"])).code).toBe("23514");
    // The valid next event is accepted (then rolled back).
    expect((await asRuntime(a.operator, a.id, insert, [a.id, parcel.shipmentId, 2, "UNDONE", null, a.operator, "OPERATOR"])).code).toBe("accepted");
    // The order trigger and the shape CHECK hold for every role, the owner included.
    const fresh = await seedShipment("a", { printed: true });
    const owner = async (shipmentId: string, sequence: number, kind: string, method: string | null, note: string | null) => {
      try {
        await adminPool.query(`INSERT INTO shipment_handover_events (tenant_id, shipment_id, sequence, kind, method, note, actor_user_id, actor_role)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPERATOR')`, [a.id, shipmentId, sequence, kind, method, note, a.operator]);
        return "accepted";
      } catch (error) {
        const { code, constraint, message } = error as { code: string; constraint?: string; message: string };
        return `${code} ${constraint ?? message}`;
      }
    };
    expect(await owner(fresh.shipmentId, 1, "HANDED_OVER", "PICKUP", "x".repeat(161))).toBe("23514 shipment_handover_events_shape_valid");
    expect(await owner(fresh.shipmentId, 1, "HANDED_OVER", "PICKUP", " Kurir")).toBe("23514 shipment_handover_events_shape_valid");
    expect(await owner(parcel.shipmentId, 2, "UNDONE", null, "Kurir")).toBe("23514 shipment_handover_events_shape_valid");
    expect(await owner(parcel.shipmentId, 3, "UNDONE", null, null)).toBe("23514 Handover event sequence is out of order.");
    expect(await owner(parcel.shipmentId, 2, "HANDED_OVER", "PICKUP", null)).toBe("23514 Handover event kind does not follow the current state.");
    expect(await owner(fresh.shipmentId, 1, "UNDONE", null, null)).toBe("23514 Handover event kind does not follow the current state.");
    expect(await events(fresh.shipmentId)).toEqual([]);
  });

  it("refuses a HANDED_OVER for an unprinted resi at the database, even past the application", async () => {
    const unprinted = await seedShipment("a");
    const { a } = tenants;
    const result = await asRuntime(a.operator, a.id, `INSERT INTO shipment_handover_events (tenant_id, shipment_id, sequence, kind, method, actor_user_id, actor_role)
      VALUES ($1, $2, 1, 'HANDED_OVER', 'PICKUP', $3, 'OPERATOR')`, [a.id, unprinted.shipmentId, a.operator]);
    expect(result.code).toBe("42501");
  });

  it("lets only the recording member append the audit row of a real event, once per event", async () => {
    const parcel = await seedShipment("a", { printed: true });
    as("a");
    await markShipmentsHandedOverAction({ method: "PICKUP", numbers: [parcel.number] });
    const [event] = await events(parcel.shipmentId);
    const { a, b } = tenants;
    const audit = `INSERT INTO audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, metadata)
      VALUES ($1, 'TENANT_MEMBER', $2, $3, 'SHIPMENT', $4, 'SUCCESS', $5)`;
    // Forged: an event id that does not exist, another tenant, the wrong kind, a second row for the event.
    expect((await asRuntime(a.operator, a.id, audit, [a.operator, a.id, "SHIPMENT_HANDOVER_RECORDED", parcel.shipmentId, { eventId: "00000000-0000-4000-8000-000000000000" }])).code).toBe("42501");
    expect((await asRuntime(b.operator, b.id, audit, [b.operator, b.id, "SHIPMENT_HANDOVER_RECORDED", parcel.shipmentId, { eventId: event.id }])).code).toBe("42501");
    expect((await asRuntime(a.operator, a.id, audit, [a.operator, a.id, "SHIPMENT_HANDOVER_UNDONE", parcel.shipmentId, { eventId: event.id }])).code).toBe("42501");
    expect((await asRuntime(a.operator, a.id, audit, [a.operator, a.id, "SHIPMENT_HANDOVER_RECORDED", parcel.shipmentId, { eventId: event.id }])).code).toBe("23505");
  });

  it("T-268 (L1, 0072): the definer lookup answers only for the context tenant and only the runtime role may call it", async () => {
    const parcel = await seedShipment("a", { printed: true });
    as("a");
    await markShipmentsHandedOverAction({ method: "PICKUP", numbers: [parcel.number] });
    const [event] = await events(parcel.shipmentId);
    const { a, b } = tenants;
    const lookup = "SELECT public.shipment_handover_audit_event_matches($1, $2, $3, $4, 'HANDED_OVER') AS found";
    const args = [event.id, a.id, parcel.shipmentId, a.operator];
    // The owner bypasses RLS, so only the function's own tenant predicate keeps B from learning
    // that A's event exists.
    expect((await asRuntime(a.operator, a.id, lookup, args)).rows[0]).toEqual({ found: true });
    expect((await asRuntime(b.operator, b.id, lookup, args)).rows[0]).toEqual({ found: false });
    const { rows: grantees } = await adminPool.query<{ grantee: string }>(
      `SELECT CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee
         FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE p.oid = 'public.shipment_handover_audit_event_matches(text, uuid, text, text, text)'::regprocedure
          AND acl.privilege_type = 'EXECUTE' AND acl.grantee <> p.proowner ORDER BY 1`);
    expect(grantees.map((row) => row.grantee)).toEqual(["geraicuan_app"]);
  });
});

describe("markShipmentsHandedOverAction: eligibility, idempotency, concurrency", () => {
  it("marks printed ISSUED parcels and refuses the rest with one reason each", async () => {
    const ready = await seedShipment("a", { printed: true });
    const unprinted = await seedShipment("a");
    const unpaid = await seedShipment("a", { status: "AWAITING_UPSTREAM_PAYMENT" });
    const cancelled = await seedShipment("a", { printed: true });
    const pickedUp = await seedShipment("a", { printed: true });
    const foreign = await seedShipment("b", { printed: true });
    await adminPool.query("UPDATE shipments SET status = 'CANCELLED' WHERE id = $1", [cancelled.shipmentId]);
    await adminPool.query("UPDATE shipments SET status = 'IN_TRANSIT' WHERE id = $1", [pickedUp.shipmentId]);

    as("a");
    const result = await markShipmentsHandedOverAction({
      method: "DROP_OFF",
      note: "  Kurir   Budi\n(JNE)  ",
      // Numbers are per gerai: B's shipments are never reachable from A's session (A's own
      // numbers are the only ones looked up), so an unknown number is simply not found.
      numbers: [ready.number, unprinted.number, unpaid.number, cancelled.number, pickedUp.number, 99_999],
    });
    expect(result).toEqual({
      already: 0,
      marked: 1,
      ok: true,
      refused: [
        `${unprinted.publicReference}: Label belum pernah dicetak`,
        `${unpaid.publicReference}: Resi belum terbit`,
        `${cancelled.publicReference}: Dibatalkan Mengantar`,
        `${pickedUp.publicReference}: Sudah discan kurir di Mengantar`,
        "Nomor 99999: Kiriman tidak ditemukan",
      ],
    });
    const [event] = await events(ready.shipmentId);
    expect(event).toMatchObject({ actor_role: "OPERATOR", actor_user_id: tenants.a.operator, kind: "HANDED_OVER", method: "DROP_OFF", note: "Kurir Budi (JNE)", sequence: 1, tenant_id: tenants.a.id });
    for (const parcel of [unprinted, unpaid, cancelled, pickedUp, foreign]) expect(await events(parcel.shipmentId)).toEqual([]);
    // No shipment status changes on a handover: Mengantar's pickup scan is the only way out.
    expect((await adminPool.query("SELECT status FROM shipments WHERE id = $1", [ready.shipmentId])).rows[0].status).toBe("ISSUED");
  });

  it("is idempotent: a repeat records nothing twice and reports the parcel as already handed over", async () => {
    const parcel = await seedShipment("a", { printed: true });
    as("a", "TENANT_ADMIN");
    expect(await markShipmentsHandedOverAction({ method: "PICKUP", numbers: [parcel.number, parcel.number] })).toMatchObject({ already: 0, marked: 1 });
    expect(await markShipmentsHandedOverAction({ method: "DROP_OFF", numbers: [parcel.number] })).toEqual({ already: 1, marked: 0, ok: true, refused: [] });
    expect(await events(parcel.shipmentId)).toHaveLength(1);
    expect(await handoverAudit(tenants.a.id)).toHaveLength(1);
  });

  it("records one event when two marks of the same parcel run at once", async () => {
    const parcel = await seedShipment("a", { printed: true });
    const other = await seedShipment("a", { printed: true });
    as("a");
    const [first, second] = await Promise.all([
      markShipmentsHandedOverAction({ method: "PICKUP", numbers: [parcel.number, other.number] }),
      markShipmentsHandedOverAction({ method: "PICKUP", numbers: [other.number, parcel.number] }),
    ]);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.marked + second.marked).toBe(2);
    expect(first.already + second.already).toBe(2);
    expect(await events(parcel.shipmentId)).toHaveLength(1);
    expect(await events(other.shipmentId)).toHaveLength(1);
    expect(await handoverAudit(tenants.a.id)).toHaveLength(2);
  });

  it("validates input before any write: method, note length, batch size", async () => {
    const parcel = await seedShipment("a", { printed: true });
    as("a");
    expect(await markShipmentsHandedOverAction({ method: "COURIER", numbers: [parcel.number] })).toEqual({ error: "Pilih cara penyerahan.", ok: false });
    expect(await markShipmentsHandedOverAction({ method: "PICKUP", note: "x".repeat(161), numbers: [parcel.number] })).toEqual({ error: "Catatan paling banyak 160 karakter.", ok: false });
    expect(await markShipmentsHandedOverAction({ method: "PICKUP", numbers: Array.from({ length: 51 }, (_, index) => 10_000 + index) })).toMatchObject({ ok: false });
    expect(await markShipmentsHandedOverAction({ method: "PICKUP", numbers: "10000" })).toMatchObject({ ok: false });
    expect(await events(parcel.shipmentId)).toEqual([]);
  });

  it("refuses a session whose tenant is not the user's gerai", async () => {
    const parcel = await seedShipment("a", { printed: true });
    as("b", "OPERATOR", "a");
    await expect(markShipmentsHandedOverAction({ method: "PICKUP", numbers: [parcel.number] })).rejects.toThrow(/not authorized/i);
    expect(await events(parcel.shipmentId)).toEqual([]);
  });

  it("writes one audit row per mark and undo, with the gerai, the shipment and the event (T-259)", async () => {
    const parcel = await seedShipment("a", { printed: true });
    as("a");
    await markShipmentsHandedOverAction({ method: "PICKUP", note: "Kurir Andi", numbers: [parcel.number] });
    as("a", "TENANT_ADMIN");
    expect(await undoShipmentHandoverAction(parcel.shipmentId)).toMatchObject({ ok: true });
    const [marked, undone] = await events(parcel.shipmentId);
    const audit = await handoverAudit(tenants.a.id);
    expect(audit).toEqual([
      { action: "SHIPMENT_HANDOVER_RECORDED", actor_id: tenants.a.operator, metadata: { eventId: marked.id, hasNote: true, method: "PICKUP", sequence: 1 }, target_id: parcel.shipmentId, target_type: "SHIPMENT", tenant_id: tenants.a.id },
      { action: "SHIPMENT_HANDOVER_UNDONE", actor_id: tenants.a.admin, metadata: { eventId: undone.id, sequence: 2 }, target_id: parcel.shipmentId, target_type: "SHIPMENT", tenant_id: tenants.a.id },
    ]);
    // The note stays in the handover record, never in the audit trail.
    expect(JSON.stringify(audit)).not.toContain("Andi");
  });
});

describe("undoShipmentHandoverAction", () => {
  it("both roles may undo while Mengantar has not scanned; the parcel returns to Siap diserahkan", async () => {
    const parcel = await seedShipment("a", { printed: true });
    as("a");
    await markShipmentsHandedOverAction({ method: "PICKUP", numbers: [parcel.number] });
    expect(await undoShipmentHandoverAction(parcel.shipmentId)).toEqual({ message: "Penandaan dibatalkan. Paket kembali ke Siap diserahkan.", ok: true });
    expect(await undoShipmentHandoverAction(parcel.shipmentId)).toEqual({ message: "Paket ini tidak sedang ditandai diserahkan.", ok: true });
    as("a", "TENANT_ADMIN");
    await markShipmentsHandedOverAction({ method: "DROP_OFF", numbers: [parcel.number] });
    expect(await undoShipmentHandoverAction(parcel.shipmentId)).toMatchObject({ ok: true });
    expect((await events(parcel.shipmentId)).map((event) => `${event.sequence}:${event.kind}`)).toEqual(["1:HANDED_OVER", "2:UNDONE", "3:HANDED_OVER", "4:UNDONE"]);
    expect(await read("a", (tx, context) => loadShipmentHandover(tx, context, parcel.shipmentId))).toBeNull();
    const page = await read("a", (tx, context) => loadLabelIndexPage(tx, context, { printState: "sudah", status: "issued" }));
    expect(page.rows.map((row) => row.shipmentId)).toEqual([parcel.shipmentId]);
  });

  it("is refused once Mengantar reports the pickup scan or cancels the order, and records nothing", async () => {
    const scanned = await seedShipment("a", { printed: true });
    const cancelled = await seedShipment("a", { printed: true });
    as("a");
    await markShipmentsHandedOverAction({ method: "PICKUP", numbers: [scanned.number, cancelled.number] });
    await adminPool.query("UPDATE shipments SET status = 'IN_TRANSIT' WHERE id = $1", [scanned.shipmentId]);
    await adminPool.query("UPDATE shipments SET status = 'CANCELLED' WHERE id = $1", [cancelled.shipmentId]);
    expect(await undoShipmentHandoverAction(scanned.shipmentId)).toEqual({ error: "Tidak dapat dibatalkan: Mengantar sudah mencatat scan kurir.", ok: false });
    expect(await undoShipmentHandoverAction(cancelled.shipmentId)).toEqual({ error: "Tidak dapat dibatalkan: pesanan dibatalkan Mengantar.", ok: false });
    expect(await events(scanned.shipmentId)).toHaveLength(1);
    expect(await events(cancelled.shipmentId)).toHaveLength(1);
    // The record stays readable on the detail after the scan.
    expect(await read("a", (tx, context) => loadShipmentHandover(tx, context, scanned.shipmentId))).toMatchObject({ actorName: "Operator A", method: "PICKUP" });
  });

  it("T-268 (L2): a shipment that left ISSUED otherwise is refused with its own message, not \"not found\"", async () => {
    const parcel = await seedShipment("a", { printed: true });
    as("a");
    await markShipmentsHandedOverAction({ method: "PICKUP", numbers: [parcel.number] });
    await adminPool.query("UPDATE shipments SET status = 'FAILED' WHERE id = $1", [parcel.shipmentId]);
    const result = await undoShipmentHandoverAction(parcel.shipmentId);
    expect(result).toEqual({ error: "Tidak dapat dibatalkan: status kiriman sudah berubah. Muat ulang halaman untuk melihat status terbarunya.", ok: false });
    expect(await events(parcel.shipmentId)).toHaveLength(1);
  });

  it("cannot reach another gerai's shipment", async () => {
    const parcel = await seedShipment("a", { printed: true });
    as("a");
    await markShipmentsHandedOverAction({ method: "PICKUP", numbers: [parcel.number] });
    as("b");
    expect(await undoShipmentHandoverAction(parcel.shipmentId)).toEqual({ error: "Kiriman tidak ditemukan.", ok: false });
    expect(await events(parcel.shipmentId)).toHaveLength(1);
  });
});

describe("Cetak resi counts and lists (LBL-PRINTED, LBL-HANDED-OVER, LBL-HANDED-OVER-TODAY)", () => {
  it("splits printed parcels into Siap diserahkan and Diserahkan; belum + sudah + diserahkan = semua", async () => {
    await seedShipment("a");
    const ready = await seedShipment("a", { printed: true, handoverType: "PICKUP" });
    const handed = await seedShipment("a", { printed: true });
    const scanned = await seedShipment("a", { printed: true });
    as("a");
    await markShipmentsHandedOverAction({ method: "DROP_OFF", numbers: [handed.number, scanned.number] });
    await adminPool.query("UPDATE shipments SET status = 'IN_TRANSIT' WHERE id = $1", [scanned.shipmentId]);

    const all = await read("a", (tx, context) => loadLabelIndexPage(tx, context, { printState: "semua", status: "issued" }));
    expect(all.summary).toEqual({ "LBL-ALL": 3, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 1, "LBL-PRINTED": 1, "LBL-UNPRINTED": 1 });
    expect(all.summary["LBL-UNPRINTED"] + all.summary["LBL-PRINTED"] + all.summary["LBL-HANDED-OVER"]).toBe(all.summary["LBL-ALL"]);
    const sudah = await read("a", (tx, context) => loadLabelIndexPage(tx, context, { printState: "sudah", status: "issued" }));
    expect(sudah.rows.map((row) => [row.shipmentId, row.handoverType, row.handedOverAt])).toEqual([[ready.shipmentId, "PICKUP", null]]);
    const diserahkan = await read("a", (tx, context) => loadLabelIndexPage(tx, context, { printState: "diserahkan", status: "issued" }));
    expect(diserahkan.rows.map((row) => row.shipmentId)).toEqual([handed.shipmentId]);
    expect(diserahkan.rows[0].handedOverAt).toBeInstanceOf(Date);
    // Handed over today counts the scanned parcel too: the handover happened today.
    expect(await read("a", countHandedOverToday)).toBe(2);
    expect(await read("b", countHandedOverToday)).toBe(0);
  });

  it("'Pilih semua siap diserahkan' returns the caller's ready parcels with their planned handover", async () => {
    const pickup = await seedShipment("a", { printed: true, handoverType: "PICKUP" });
    const drop = await seedShipment("a", { printed: true, handoverType: "DROP_OFF" });
    await seedShipment("a");
    await seedShipment("b", { printed: true });
    as("a");
    expect(await selectReadyForHandover({ cetak: "belum" })).toEqual({
      numbers: [drop.number, pickup.number],
      total: 2,
      types: { [drop.number]: "DROP_OFF", [pickup.number]: "PICKUP" },
    });
  });

  it("a handover recorded yesterday (WIB) is not 'today'", async () => {
    const parcel = await seedShipment("a", { printed: true });
    as("a");
    await markShipmentsHandedOverAction({ method: "PICKUP", numbers: [parcel.number] });
    await adminPool.query("UPDATE shipment_handover_events SET created_at = now() - interval '2 days' WHERE shipment_id = $1", [parcel.shipmentId]);
    expect(await read("a", countHandedOverToday)).toBe(0);
  });
});

describe("Perlu perhatian: handed over 24 hours ago, no pickup scan (QUE-HANDOVER-OVERDUE)", () => {
  it("joins the queue's Perlu perhatian and Dasbor's exceptions at 24 h, not before, and leaves at the scan", async () => {
    const overdue = await seedShipment("a", { printed: true });
    const recent = await seedShipment("a", { printed: true });
    const scanned = await seedShipment("a", { printed: true });
    as("a");
    await markShipmentsHandedOverAction({ method: "PICKUP", numbers: [overdue.number, recent.number, scanned.number] });
    await adminPool.query("UPDATE shipment_handover_events SET created_at = now() - interval '24 hours 1 minute' WHERE shipment_id = ANY($1::uuid[])", [[overdue.shipmentId, scanned.shipmentId]]);
    await adminPool.query("UPDATE shipment_handover_events SET created_at = now() - interval '23 hours 59 minutes' WHERE shipment_id = $1", [recent.shipmentId]);
    await adminPool.query("UPDATE shipments SET status = 'IN_TRANSIT' WHERE id = $1", [scanned.shipmentId]);

    const queue = await read("a", (tx, context) => loadShipmentQueuePage(tx, context, { page: 1, pageSize: 20, status: "NEEDS_ATTENTION" }));
    expect(queue.rows.map((row) => [row.shipmentId, row.handoverOverdue])).toEqual([[overdue.shipmentId, true]]);
    expect(queue.summary["QUE-ATTENTION"]).toBe(1);
    expect(queue.totalCount).toBe(1);
    const all = await read("a", (tx, context) => loadShipmentQueuePage(tx, context, { page: 1, pageSize: 20, status: "ALL" }));
    expect(all.rows.filter((row) => row.handoverOverdue).map((row) => row.shipmentId)).toEqual([overdue.shipmentId]);
    // Inside both Resi terbit (status ISSUED) and Perlu perhatian; the page draws it once.
    expect(all.handoverOverdueCount).toBe(1);
    expect(all.summary["QUE-AWAITING-PICKUP"]).toBe(2);

    const actionable = await read("a", (tx, context) => loadTenantDashboardShipments(tx, context, { limit: 6, mode: "actionable" }));
    expect(actionable.map((row) => [row.shipmentId, row.handoverOverdue])).toEqual([[overdue.shipmentId, true]]);

    // Undo takes it out again.
    await undoShipmentHandoverAction(overdue.shipmentId);
    const after = await read("a", (tx, context) => loadShipmentQueuePage(tx, context, { page: 1, pageSize: 20, status: "NEEDS_ATTENTION" }));
    expect(after.summary["QUE-ATTENTION"]).toBe(0);
  });

  it("T-268 (L4, PR-52): count and rows use one clock, the transaction's, across the 24 h boundary", async () => {
    const parcel = await seedShipment("a", { printed: true });
    as("a");
    await markShipmentsHandedOverAction({ method: "PICKUP", numbers: [parcel.number] });
    // Crosses 24 h two seconds from now: before the page's transaction begins it is not overdue;
    // during the three-second read below, a per-statement clock would pass the boundary.
    await adminPool.query("UPDATE shipment_handover_events SET created_at = clock_timestamp() - interval '24 hours' + interval '2 seconds' WHERE shipment_id = $1", [parcel.shipmentId]);
    const page = await read("a", async (tx, context) => {
      await tx.execute(sql`SELECT pg_sleep(3)`);
      return loadShipmentQueuePage(tx, context, { page: 1, pageSize: 20, status: "ALL" });
    });
    const flagged = page.rows.filter((row) => row.handoverOverdue).length;
    expect(page.handoverOverdueCount).toBe(flagged);
    expect([page.handoverOverdueCount, flagged]).toEqual([0, 0]);
  }, 20_000);
});
