import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  addOutletPickupPoint,
  listOutletPickupPoints,
  PickupPointDefaultRequiredError,
  PickupPointDeniedError,
  PickupPointUnavailableError,
  removeOutletPickupPoint,
  resolveShipmentPickupPoint,
  setDefaultOutletPickupPoint,
  PickupPointInUseError,
} from "@/db/outlet-pickup-point-repository";
import { listOutletReadiness } from "@/db/outlet-readiness-repository";
import { createShipmentDraft } from "@/db/shipment-draft-repository";
import { withTenantContext } from "@/db/tenant-context";
import * as schema from "@/db/schema";
import { validateShipmentDraft } from "@/lib/shipment-draft";
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
let capturedStatements: string[] = [];
const appDb = drizzle({
  client: appPool,
  schema,
  logger: { logQuery: (query) => { capturedStatements.push(query); } },
});

const tenantA = "00000000-0000-0000-0000-000000000401";
const tenantB = "00000000-0000-0000-0000-000000000402";
const outletA = "00000000-0000-0000-0000-000000000411";
const outletB = "00000000-0000-0000-0000-000000000412";

function point(index: number) {
  return {
    outletId: outletA,
    originAreaId: `origin-${index}`,
    originAreaLabel: `Kecamatan ${index}, Kota Bandung, Jawa Barat`,
    pickupAddressId: `pickup-${index}`,
    pickupAddressLabel: `Gudang ${index}, Jalan Contoh ${index}`,
  };
}

function asAdmin<T>(
  tenantId: string,
  userId: string,
  run: Parameters<typeof withTenantContext<T>>[3],
) {
  return withTenantContext(appDb, userId, tenantId, run);
}

beforeEach(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await adminPool.query(
    "TRUNCATE shipment_parties, shipment_drafts, shipments, outlet_pickup_points, audit_events, outlets, memberships, tenants, users CASCADE",
  );
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6)",
    ["pickup-a", "Pickup A", "pickup-a@example.test", "pickup-b", "Pickup B", "pickup-b@example.test"],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, $2, 'ACTIVE'), ($3, $4, 'ACTIVE')",
    [tenantA, "Tenant A", tenantB, "Tenant B"],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($3, $4, 'TENANT_ADMIN')",
    [tenantA, "pickup-a", tenantB, "pickup-b"],
  );
  await adminPool.query(
    "INSERT INTO outlets (id, tenant_id, name) VALUES ($1, $2, $3), ($4, $5, $6)",
    [outletA, tenantA, "Outlet A", outletB, tenantB, "Outlet B"],
  );
});

afterAll(async () => {
  await adminPool.query(
    "TRUNCATE shipment_parties, shipment_drafts, shipments, outlet_pickup_points, audit_events, outlets, memberships, tenants, users CASCADE",
  );
  await Promise.all([adminPool.end(), appPool.end()]);
});

describe("T-157 outlet pickup points", () => {
  it("makes the first pickup point the default and mirrors it onto the outlet", async () => {
    await asAdmin(tenantA, "pickup-a", async (tx, context) => {
      await addOutletPickupPoint(tx, context, point(1));
    });

    const { points, readiness } = await asAdmin(tenantA, "pickup-a", async (tx, context) => ({
      points: await listOutletPickupPoints(tx, context, outletA),
      readiness: await listOutletReadiness(tx, context),
    }));

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ isDefault: true, pickupAddressId: "pickup-1" });
    // The outlet's denormalized pair is what estimates and orders still read.
    expect(readiness[0]).toMatchObject({
      defaultPickupAddressId: "pickup-1",
      defaultPickupAddressLabel: "Gudang 1, Jalan Contoh 1",
      defaultOriginAreaId: "origin-1",
      defaultOriginAreaLabel: "Kecamatan 1, Kota Bandung, Jawa Barat",
      readinessStatus: "ready",
    });
  });

  it("keeps exactly one default when another point is promoted", async () => {
    await asAdmin(tenantA, "pickup-a", async (tx, context) => {
      await addOutletPickupPoint(tx, context, point(1));
      await addOutletPickupPoint(tx, context, point(2));
      await setDefaultOutletPickupPoint(tx, context, outletA, "pickup-2");
    });

    const { points, readiness } = await asAdmin(tenantA, "pickup-a", async (tx, context) => ({
      points: await listOutletPickupPoints(tx, context, outletA),
      readiness: await listOutletReadiness(tx, context),
    }));

    expect(points.filter(({ isDefault }) => isDefault).map(({ pickupAddressId }) => pickupAddressId))
      .toEqual(["pickup-2"]);
    expect(readiness[0]).toMatchObject({
      defaultPickupAddressId: "pickup-2",
      defaultOriginAreaId: "origin-2",
    });
  });

  it("refuses to promote or remove a pickup address the outlet does not own", async () => {
    await asAdmin(tenantA, "pickup-a", async (tx, context) => {
      await addOutletPickupPoint(tx, context, point(1));
    });

    await expect(asAdmin(tenantA, "pickup-a", (tx, context) =>
      setDefaultOutletPickupPoint(tx, context, outletA, "pickup-not-mine")))
      .rejects.toBeInstanceOf(PickupPointUnavailableError);
    await expect(asAdmin(tenantA, "pickup-a", (tx, context) =>
      removeOutletPickupPoint(tx, context, outletA, "pickup-not-mine")))
      .rejects.toBeInstanceOf(PickupPointUnavailableError);
  });

  it("refuses to remove the default while other points remain, and clears the mirror with the last one", async () => {
    await asAdmin(tenantA, "pickup-a", async (tx, context) => {
      await addOutletPickupPoint(tx, context, point(1));
      await addOutletPickupPoint(tx, context, point(2));
    });

    await expect(asAdmin(tenantA, "pickup-a", (tx, context) =>
      removeOutletPickupPoint(tx, context, outletA, "pickup-1")))
      .rejects.toBeInstanceOf(PickupPointDefaultRequiredError);

    await asAdmin(tenantA, "pickup-a", async (tx, context) => {
      await removeOutletPickupPoint(tx, context, outletA, "pickup-2");
      await removeOutletPickupPoint(tx, context, outletA, "pickup-1");
    });

    const readiness = await asAdmin(tenantA, "pickup-a", (tx, context) =>
      listOutletReadiness(tx, context));
    expect(readiness[0]).toMatchObject({
      defaultPickupAddressId: null,
      defaultOriginAreaId: null,
      readinessStatus: "needs_attention",
    });
  });

  it("resolves the outlet default for an unspecified choice and refuses a foreign one", async () => {
    await asAdmin(tenantA, "pickup-a", async (tx, context) => {
      await addOutletPickupPoint(tx, context, point(1));
      await addOutletPickupPoint(tx, context, point(2));
    });

    const resolved = await asAdmin(tenantA, "pickup-a", async (tx, context) => ({
      fallback: await resolveShipmentPickupPoint(tx, context, outletA, null),
      chosen: await resolveShipmentPickupPoint(tx, context, outletA, "pickup-2"),
    }));

    expect(resolved.fallback).toEqual({ pickupAddressId: "pickup-1", originAreaId: "origin-1" });
    expect(resolved.chosen).toEqual({ pickupAddressId: "pickup-2", originAreaId: "origin-2" });
    await expect(asAdmin(tenantA, "pickup-a", (tx, context) =>
      resolveShipmentPickupPoint(tx, context, outletA, "pickup-forged")))
      .rejects.toBeInstanceOf(PickupPointUnavailableError);
  });

  it("denies a non-admin member every mutation", async () => {
    await adminPool.query(
      "UPDATE memberships SET role = 'OPERATOR' WHERE tenant_id = $1 AND user_id = $2",
      [tenantA, "pickup-a"],
    );

    await expect(asAdmin(tenantA, "pickup-a", (tx, context) =>
      addOutletPickupPoint(tx, context, point(1))))
      .rejects.toBeInstanceOf(PickupPointDeniedError);
    await expect(asAdmin(tenantA, "pickup-a", (tx, context) =>
      setDefaultOutletPickupPoint(tx, context, outletA, "pickup-1")))
      .rejects.toBeInstanceOf(PickupPointDeniedError);
  });

  it("isolates pickup points between tenants in SQL and under RLS", async () => {
    await asAdmin(tenantA, "pickup-a", async (tx, context) => {
      await addOutletPickupPoint(tx, context, point(1));
    });

    // Without a tenant context the row is invisible: FORCE RLS, not only a WHERE.
    await expect(appPool.query("SELECT id FROM outlet_pickup_points"))
      .resolves.toMatchObject({ rows: [] });

    const foreign = await asAdmin(tenantB, "pickup-b", async (tx, context) => ({
      listed: await listOutletPickupPoints(tx, context),
      rlsVisible: await tx.select({ id: schema.outletPickupPoints.id })
        .from(schema.outletPickupPoints),
    }));
    expect(foreign.listed).toEqual([]);
    expect(foreign.rlsVisible).toEqual([]);

    // Tenant B may not reach into tenant A's outlet either.
    await expect(asAdmin(tenantB, "pickup-b", (tx, context) =>
      addOutletPickupPoint(tx, context, point(9))))
      .rejects.toBeInstanceOf(PickupPointDeniedError);
    await expect(asAdmin(tenantB, "pickup-b", (tx, context) =>
      setDefaultOutletPickupPoint(tx, context, outletA, "pickup-1")))
      .rejects.toBeInstanceOf(PickupPointDeniedError);
  });

  it("refuses a second default row at the database level", async () => {
    await asAdmin(tenantA, "pickup-a", async (tx, context) => {
      await addOutletPickupPoint(tx, context, point(1));
      await addOutletPickupPoint(tx, context, point(2));
    });

    // The repository always clears before promoting; the index is the backstop
    // if a future caller forgets.
    await expect(adminPool.query(
      "UPDATE outlet_pickup_points SET is_default = true WHERE tenant_id = $1 AND outlet_id = $2",
      [tenantA, outletA],
    )).rejects.toThrow(/outlet_pickup_points_one_default_per_outlet/);
  });

  it("filters pickup points by tenant in SQL rather than relying on row-level security", async () => {
    await asAdmin(tenantA, "pickup-a", async (tx, context) => {
      await addOutletPickupPoint(tx, context, point(1));
    });

    capturedStatements = [];
    await asAdmin(tenantA, "pickup-a", async (tx, context) => {
      await listOutletPickupPoints(tx, context);
      await listOutletPickupPoints(tx, context, outletA);
      await resolveShipmentPickupPoint(tx, context, outletA, null);
    });

    // RLS masks a deleted predicate: the result of a cross-tenant read looks
    // identical either way, so the statement itself is what must be bound.
    const reads = capturedStatements.filter((statement) =>
      /\bfrom\s+"?outlet_pickup_points"?/i.test(statement));
    expect(reads.length, "every pickup read issues a select").toBeGreaterThanOrEqual(3);
    for (const statement of reads) {
      expect(statement, statement).toMatch(/"outlet_pickup_points"\."tenant_id"\s*=\s*\$\d/i);
    }
  });

  it("grants the app role no way to move a pickup point to another outlet", async () => {
    const grants = await adminPool.query(
      `SELECT column_name FROM information_schema.column_privileges
       WHERE table_name = 'outlet_pickup_points' AND grantee = 'geraicuan_app'
         AND privilege_type = 'UPDATE' ORDER BY column_name`,
    );
    expect(grants.rows.map(({ column_name }) => column_name)).toEqual([
      "is_default",
      "origin_area_id",
      "origin_area_label",
      "pickup_address_label",
      "updated_at",
    ]);
  });
});

function draftSubmission(values: Record<string, string> = {}) {
  const formData = new FormData();
  const defaults: Record<string, string> = {
    declaredValue: "150.000",
    destinationAreaId: "3171010",
    destinationAreaLabel: "Gambir, Jakarta Pusat",
    outletId: outletA,
    packageContent: "Pakaian",
    packageQuantity: "1",
    packageWeightGrams: "500",
    paymentType: "NON_COD",
    recipientAddress: "Jl. Medan Merdeka Barat 1",
    recipientName: "Penerima",
    recipientPhone: "+62 812-3456-7890",
    senderAddress: "Jl. Asia Afrika 8",
    senderName: "Pengirim",
    senderPhone: "0812 1234 5678",
    ...values,
  };
  for (const [key, value] of Object.entries(defaults)) formData.set(key, value);
  return formData;
}

function draftInput(values: Record<string, string> = {}) {
  const validation = validateShipmentDraft(draftSubmission(values));
  if (!validation.ok) throw new Error(`invalid fixture: ${JSON.stringify(validation.errors)}`);
  return validation.input;
}

describe("T-157 shipment creation carries the chosen pickup point", () => {
  beforeEach(async () => {
    await asAdmin(tenantA, "pickup-a", async (tx, context) => {
      await addOutletPickupPoint(tx, context, point(1));
      await addOutletPickupPoint(tx, context, point(2));
    });
  });

  async function storedPickup(shipmentId: string) {
    const { rows } = await adminPool.query(
      "SELECT pickup_address_id, origin_area_id FROM shipment_drafts WHERE shipment_id = $1",
      [shipmentId],
    );
    return rows[0];
  }

  it("stores the outlet default when the draft names no pickup point", async () => {
    const shipmentId = await asAdmin(tenantA, "pickup-a", (tx, context) =>
      createShipmentDraft(tx, context, draftInput()));

    expect(await storedPickup(shipmentId)).toEqual({
      pickup_address_id: "pickup-1",
      origin_area_id: "origin-1",
    });
  });

  it("stores the chosen pickup point, not the outlet default", async () => {
    const shipmentId = await asAdmin(tenantA, "pickup-a", (tx, context) =>
      createShipmentDraft(tx, context, draftInput({ pickupAddressId: "pickup-2" })));

    expect(await storedPickup(shipmentId)).toEqual({
      pickup_address_id: "pickup-2",
      origin_area_id: "origin-2",
    });
  });

  /**
   * T-157 review: the order payload reads the draft's pickup address at
   * submission, so deleting the point underneath an unissued shipment would
   * send Mengantar an address it no longer has — and falling back to the outlet
   * default would ship from somewhere the operator never chose.
   */
  it("refuses to remove a pickup point an unissued shipment still holds", async () => {
    await asAdmin(tenantA, "pickup-a", async (tx, context) => {
      await addOutletPickupPoint(tx, context, point(1));
      await addOutletPickupPoint(tx, context, point(2));
      await createShipmentDraft(tx, context, draftInput({ pickupAddressId: "pickup-2" }));
    });

    await expect(asAdmin(tenantA, "pickup-a", (tx, context) =>
      removeOutletPickupPoint(tx, context, outletA, "pickup-2")))
      .rejects.toBeInstanceOf(PickupPointInUseError);

    const { rows } = await adminPool.query(
      "SELECT count(*)::int AS count FROM outlet_pickup_points WHERE pickup_address_id = $1",
      ["pickup-2"],
    );
    expect(rows[0].count).toBe(1);
  });

  it("refuses a pickup address the outlet does not own and writes no shipment", async () => {
    await expect(asAdmin(tenantA, "pickup-a", (tx, context) =>
      createShipmentDraft(tx, context, draftInput({ pickupAddressId: "pickup-forged" }))))
      .rejects.toBeInstanceOf(PickupPointUnavailableError);

    const { rows } = await adminPool.query("SELECT count(*)::int AS count FROM shipments");
    expect(rows[0].count).toBe(0);
  });

  it("treats a replay that changes the pickup point as a conflict, not the same submission", async () => {
    const submissionId = "00000000-0000-0000-0000-0000000004a1";
    await asAdmin(tenantA, "pickup-a", (tx, context) =>
      createShipmentDraft(tx, context, draftInput({ pickupAddressId: "pickup-1" }), submissionId));

    const sameAgain = await asAdmin(tenantA, "pickup-a", (tx, context) =>
      createShipmentDraft(tx, context, draftInput({ pickupAddressId: "pickup-1" }), submissionId));
    expect(sameAgain).toBe(submissionId);

    await expect(asAdmin(tenantA, "pickup-a", (tx, context) =>
      createShipmentDraft(tx, context, draftInput({ pickupAddressId: "pickup-2" }), submissionId)))
      .rejects.toThrow();
  });
});
