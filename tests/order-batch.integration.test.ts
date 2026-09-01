import { readFile } from "node:fs/promises";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  claimProviderBatch,
  completeProviderBatch,
  completeProviderOrder,
  deriveProviderAccountKey,
  markStaleProviderBatchUnknown,
  prepareProviderBatches,
  type OrderConfirmation,
} from "@/db/order-batch-repository";
import * as schema from "@/db/schema";
import { checkShipmentStaleOperation } from "@/db/shipment-stale-operation-repository";
import { withTenantContext } from "@/db/tenant-context";
import {
  orchestrateFixtureBackedMengantarOrders,
  type MengantarOrderRequest,
  type MengantarOrderTransport,
  type MengantarOrderTransportBinding,
  type MengantarOrderTransportLookup,
} from "@/lib/mengantar-order";
import {
  EstimateRateLimitedError,
  enforceEstimateRateLimit,
} from "@/lib/estimate-rate-limit";
import { OrderRateLimitedError } from "@/lib/order-rate-limit";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";
import type { ShipmentLifecycleEvent } from "@/lib/shipment-telemetry";

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
const adminDb = drizzle({ client: adminPool, schema });
const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-0000-0000-000000000701";
const tenantB = "00000000-0000-0000-0000-000000000702";
const outletA = "00000000-0000-0000-0000-000000000711";
const outletA2 = "00000000-0000-0000-0000-000000000712";
const outletB = "00000000-0000-0000-0000-000000000713";
const platformAccountIdentity = "platform_default";
const privateAccountIdentity = `managed://mengantar/${tenantA}/${outletA2}`;
const platformAccountKey = deriveProviderAccountKey(platformAccountIdentity);
const privateAccountKey = deriveProviderAccountKey(privateAccountIdentity);

type OrderFixture = {
  paid: { response: { success: true; data: unknown[] } };
  unpaid: { response: unknown };
  ambiguous: { response: unknown };
};

let fixture: OrderFixture;

function ids(sequence: number) {
  const suffix = String(sequence).padStart(12, "0");
  return {
    shipmentId: `00000000-0000-0000-0001-${suffix}`,
    estimateSnapshotId: `00000000-0000-0000-0002-${suffix}`,
    estimateServiceId: `00000000-0000-0000-0003-${suffix}`,
  };
}

async function seedEstimatedShipment(
  sequence: number,
  tenantId: string,
  outletId: string,
  providerService: string,
  isCod = false,
  credentialSource: "private" | "platform_default" = "platform_default",
) {
  const value = ids(sequence);
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, 'ESTIMATED')",
    [value.shipmentId, tenantId, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod
    ) VALUES ($1, $2, 'fixture-destination', 'Fixture destination',
      'Sanitized fixture parcel', 1000, 1, 100000, $3)`,
    [value.shipmentId, tenantId, isCod],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address)
      VALUES
      ($1, $2, 'SENDER', 'Synthetic Sender', '0000000000', 'Synthetic origin'),
      ($1, $2, 'RECIPIENT', 'Synthetic Recipient', '0000000000', 'Synthetic destination')`,
    [tenantId, value.shipmentId],
  );
  const origin = outletId === outletA ? "origin-a" : outletId === outletA2 ? "origin-a2" : "origin-b";
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
      weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, $5, 'fixture-destination', 1000, $6, $7)`,
    [value.estimateSnapshotId, tenantId, value.shipmentId, outletId, origin, isCod, credentialSource],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
      shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, $4, 'IDR', 8000, 'price', 'sanitized estimate', true)`,
    [value.estimateServiceId, tenantId, value.estimateSnapshotId, providerService],
  );
  if (isCod) {
    await adminPool.query(
      `INSERT INTO shipment_cod_totals (
        tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
        goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
        provider_cod_amount_idr
      ) VALUES ($1, $2, $3, $4, 'IDR', 100000, 8000, 3240, 356, 111596)`,
      [tenantId, value.shipmentId, value.estimateSnapshotId, value.estimateServiceId],
    );
  }
  return value;
}

function transportBinding(
  scope: Parameters<MengantarOrderTransportLookup>[0],
  transport: MengantarOrderTransport,
  accountIdentity = platformAccountIdentity,
): MengantarOrderTransportBinding {
  return {
    tenantId: scope.tenantId,
    outletId: scope.outletId,
    pickupAddressId: scope.pickupAddressId,
    credentialSource: scope.credentialSource,
    accountIdentity,
    transport,
  };
}

function scopedInput(
  confirmations: readonly OrderConfirmation[],
  resolveTransport: MengantarOrderTransportLookup,
) {
  return {
    db: appDb,
    lockPool: appPool,
    principalId: "order-user-a",
    tenantId: tenantA,
    confirmations,
    resolveTransport,
  };
}

function input(confirmations: readonly OrderConfirmation[], transport: MengantarOrderTransport) {
  return scopedInput(
    confirmations,
    async (scope) => transportBinding(scope, transport),
  );
}

beforeAll(async () => {
  fixture = JSON.parse(
    await readFile(new URL("./fixtures/mengantar-order.sanitized.json", import.meta.url), "utf8"),
  ) as OrderFixture;
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await adminPool.query(
    "TRUNCATE shipment_rate_limits, rate_limits, provider_order_snapshots, provider_batches, shipment_cod_totals, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties, shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE",
  );
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ('order-user-a', 'Order User A', 'order-a@example.test'), ('order-user-b', 'Order User B', 'order-b@example.test')",
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'Order Tenant A', 'ACTIVE'), ($2, 'Order Tenant B', 'ACTIVE')",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, 'order-user-a', 'OPERATOR'), ($2, 'order-user-b', 'OPERATOR')",
    [tenantA, tenantB],
  );
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
      VALUES
      ($1, $2, 'Outlet A', 'pickup-a', 'origin-a'),
      ($3, $2, 'Outlet A2', 'pickup-a2', 'origin-a2'),
      ($4, $5, 'Outlet B', 'pickup-b', 'origin-b')`,
    [outletA, tenantA, outletA2, outletB, tenantB],
  );
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("fixture-backed Mengantar order orchestration", () => {
  it("resumes a persisted unattempted queue exactly once", async () => {
    const confirmation = await seedEstimatedShipment(90, tenantA, outletA, "JNE");
    await withTenantContext(appDb, "order-user-a", tenantA, (tx, context) =>
      prepareProviderBatches(
        tx,
        context,
        [confirmation],
        async () => platformAccountKey,
      ),
    );

    let calls = 0;
    const result = await orchestrateFixtureBackedMengantarOrders(
      input([confirmation], {
        async submit() {
          calls += 1;
          return { success: true, data: fixture.paid.response.data.slice(0, 1) };
        },
      }),
    );
    const duplicate = await orchestrateFixtureBackedMengantarOrders(
      input([confirmation], {
        async submit() {
          calls += 1;
          return { success: true, data: fixture.paid.response.data.slice(0, 1) };
        },
      }),
    );

    expect(result.batches).toEqual([
      expect.objectContaining({ created: false, submitted: true, status: "COMPLETED" }),
    ]);
    expect(duplicate.batches).toEqual([
      expect.objectContaining({ created: false, submitted: false, status: "COMPLETED" }),
    ]);
    expect(calls).toBe(1);
  });

  it("moves a stale crash-after-claim batch to unknown without another provider call", async () => {
    const confirmation = await seedEstimatedShipment(91, tenantA, outletA, "JNE");
    const [prepared] = await withTenantContext(
      appDb,
      "order-user-a",
      tenantA,
      (tx, context) => prepareProviderBatches(
        tx,
        context,
        [confirmation],
        async () => platformAccountKey,
      ),
    );
    if (!prepared) throw new Error("Expected a prepared provider batch.");
    expect(await withTenantContext(
      appDb,
      "order-user-a",
      tenantA,
      (tx, context) => claimProviderBatch(tx, context, prepared.id),
    )).toBe(true);
    await adminPool.query(
      "UPDATE provider_batches SET submission_attempted_at = now() - interval '10 minutes' WHERE id = $1",
      [prepared.id],
    );

    const result = await withTenantContext(
      appDb,
      "order-user-a",
      tenantA,
      (tx, context) => checkShipmentStaleOperation(
        tx,
        context,
        confirmation.shipmentId,
      ),
    );

    expect(result).toBe("UPDATED");
    const state = await adminPool.query<{
      batch_status: string;
      order_status: string;
      shipment_status: string;
      safe_error_code: string | null;
    }>(`
      SELECT batch.status AS batch_status,
        provider_order.status AS order_status,
        shipment.status AS shipment_status,
        batch.safe_error_code
      FROM provider_batches AS batch
      JOIN provider_order_snapshots AS provider_order ON provider_order.batch_id = batch.id
      JOIN shipments AS shipment ON shipment.id = provider_order.shipment_id
      WHERE batch.id = $1
    `, [prepared.id]);
    expect(state.rows[0]).toEqual({
      batch_status: "SUBMISSION_UNKNOWN",
      order_status: "SUBMISSION_UNKNOWN",
      shipment_status: "SUBMISSION_UNKNOWN",
      safe_error_code: "ORDER_SUBMISSION_INTERRUPTED",
    });
  });

  it("serializes stale recovery behind active order completion without splitting state", async () => {
    const confirmation = await seedEstimatedShipment(92, tenantA, outletA, "JNE");
    const [prepared] = await withTenantContext(
      appDb,
      "order-user-a",
      tenantA,
      (tx, context) => prepareProviderBatches(
        tx,
        context,
        [confirmation],
        async () => platformAccountKey,
      ),
    );
    if (!prepared) throw new Error("Expected a prepared provider batch.");
    expect(await withTenantContext(
      appDb,
      "order-user-a",
      tenantA,
      (tx, context) => claimProviderBatch(tx, context, prepared.id),
    )).toBe(true);
    await adminPool.query(
      "UPDATE provider_batches SET submission_attempted_at = now() - interval '10 minutes' WHERE id = $1",
      [prepared.id],
    );

    const blocker = await adminPool.connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM provider_batches WHERE id = $1 FOR UPDATE", [prepared.id]);
    try {
      const completion = withTenantContext(
        appDb,
        "order-user-a",
        tenantA,
        (tx, context) => completeProviderOrder(tx, context, prepared.id, {
          shipmentId: confirmation.shipmentId,
          providerOrderId: "SANITIZED-ORDER-RACE",
          isPaid: true,
          cnoteNo: "SANITIZED-AWB-RACE",
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
      const staleRecovery = withTenantContext(
        appDb,
        "order-user-a",
        tenantA,
        (tx, context) => markStaleProviderBatchUnknown(
          tx,
          context,
          prepared.id,
          "ORDER_SUBMISSION_INTERRUPTED",
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
      await blocker.query("COMMIT");

      await expect(completion).resolves.toBeUndefined();
      await expect(staleRecovery).resolves.toBe(false);
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
    }
    await withTenantContext(
      appDb,
      "order-user-a",
      tenantA,
      (tx, context) => completeProviderBatch(tx, context, prepared.id),
    );

    const state = await adminPool.query<{
      batch_status: string;
      order_status: string;
      shipment_status: string;
    }>(`
      SELECT batch.status AS batch_status,
        provider_order.status AS order_status,
        shipment.status AS shipment_status
      FROM provider_batches AS batch
      JOIN provider_order_snapshots AS provider_order ON provider_order.batch_id = batch.id
      JOIN shipments AS shipment ON shipment.id = provider_order.shipment_id
      WHERE batch.id = $1
    `, [prepared.id]);
    expect(state.rows[0]).toEqual({
      batch_status: "COMPLETED",
      order_status: "ISSUED",
      shipment_status: "ISSUED",
    });
  });

  it("finalizes a stale batch when the last provider member committed before process death", async () => {
    const confirmation = await seedEstimatedShipment(93, tenantA, outletA, "JNE");
    const [prepared] = await withTenantContext(
      appDb,
      "order-user-a",
      tenantA,
      (tx, context) => prepareProviderBatches(
        tx,
        context,
        [confirmation],
        async () => platformAccountKey,
      ),
    );
    if (!prepared) throw new Error("Expected a prepared provider batch.");
    await withTenantContext(appDb, "order-user-a", tenantA, async (tx, context) => {
      expect(await claimProviderBatch(tx, context, prepared.id)).toBe(true);
      await completeProviderOrder(tx, context, prepared.id, {
        shipmentId: confirmation.shipmentId,
        providerOrderId: "SANITIZED-ORDER-FINALIZE",
        isPaid: true,
        cnoteNo: "SANITIZED-AWB-FINALIZE",
      });
    });
    await adminPool.query(
      "UPDATE provider_batches SET submission_attempted_at = now() - interval '10 minutes' WHERE id = $1",
      [prepared.id],
    );

    await expect(withTenantContext(
      appDb,
      "order-user-a",
      tenantA,
      (tx, context) => markStaleProviderBatchUnknown(
        tx,
        context,
        prepared.id,
        "ORDER_SUBMISSION_INTERRUPTED",
      ),
    )).resolves.toBe(true);

    const state = await adminPool.query<{
      batch_status: string;
      order_status: string;
      shipment_status: string;
      safe_error_code: string | null;
    }>(`
      SELECT batch.status AS batch_status,
        provider_order.status AS order_status,
        shipment.status AS shipment_status,
        batch.safe_error_code
      FROM provider_batches AS batch
      JOIN provider_order_snapshots AS provider_order ON provider_order.batch_id = batch.id
      JOIN shipments AS shipment ON shipment.id = provider_order.shipment_id
      WHERE batch.id = $1
    `, [prepared.id]);
    expect(state.rows[0]).toEqual({
      batch_status: "COMPLETED",
      order_status: "ISSUED",
      shipment_status: "ISSUED",
      safe_error_code: null,
    });
  });

  it("resolves transport per immutable outlet/source/account binding and keeps confirmations idempotent", async () => {
    const confirmations = await Promise.all([
      seedEstimatedShipment(1, tenantA, outletA, "JT"),
      seedEstimatedShipment(2, tenantA, outletA, "JNE"),
      seedEstimatedShipment(3, tenantA, outletA, "SAP"),
      seedEstimatedShipment(4, tenantA, outletA2, "JT", false, "private"),
    ]);
    const payloads: MengantarOrderRequest[][] = [];
    const resolvedScopes: Array<{ outletId: string; credentialSource: string }> = [];
    const platformTransport: MengantarOrderTransport = {
      async submit(payload) {
        payloads.push([...payload]);
        return { success: true, data: fixture.paid.response.data.slice(0, 1) };
      },
    };
    const privateTransport: MengantarOrderTransport = {
      async submit(payload) {
        payloads.push([...payload]);
        return { success: true, data: fixture.paid.response.data.slice(1, 2) };
      },
    };
    const resolveTransport: MengantarOrderTransportLookup = async (scope) => {
      resolvedScopes.push({
        outletId: scope.outletId,
        credentialSource: scope.credentialSource,
      });
      if (scope.outletId === outletA && scope.credentialSource === "platform_default") {
        return transportBinding(scope, platformTransport);
      }
      if (scope.outletId === outletA2 && scope.credentialSource === "private") {
        return transportBinding(scope, privateTransport, privateAccountIdentity);
      }
      throw new Error("Unexpected sanitized batch scope.");
    };

    const first = await orchestrateFixtureBackedMengantarOrders(
      scopedInput(confirmations, resolveTransport),
    );
    expect(first.batches).toHaveLength(4);
    expect(first.batches.every((batch) => batch.status === "COMPLETED")).toBe(true);
    expect(payloads.map((payload) => payload.length)).toEqual([1, 1, 1, 1]);
    expect(resolvedScopes.filter((scope) => scope.outletId === outletA)).toHaveLength(3);
    expect(resolvedScopes.filter((scope) => scope.outletId === outletA2)).toEqual([
      { outletId: outletA2, credentialSource: "private" },
    ]);

    const bindings = await adminDb
      .select({
        outletId: schema.providerBatches.outletId,
        credentialSource: schema.providerBatches.credentialSource,
        providerAccountKey: schema.providerBatches.providerAccountKey,
      })
      .from(schema.providerBatches);
    expect(bindings.filter((binding) => binding.outletId === outletA)).toEqual([
      { outletId: outletA, credentialSource: "platform_default", providerAccountKey: platformAccountKey },
      { outletId: outletA, credentialSource: "platform_default", providerAccountKey: platformAccountKey },
      { outletId: outletA, credentialSource: "platform_default", providerAccountKey: platformAccountKey },
    ]);
    expect(bindings.filter((binding) => binding.outletId === outletA2)).toEqual([
      { outletId: outletA2, credentialSource: "private", providerAccountKey: privateAccountKey },
    ]);

    const orders = await adminDb
      .select({ status: schema.providerOrderSnapshots.status, cnoteNo: schema.providerOrderSnapshots.cnoteNo })
      .from(schema.providerOrderSnapshots);
    expect(orders).toHaveLength(4);
    expect(orders.every((order) => order.status === "ISSUED" && Boolean(order.cnoteNo))).toBe(true);

    const duplicate = await orchestrateFixtureBackedMengantarOrders(
      scopedInput(confirmations, resolveTransport),
    );
    expect(duplicate.batches.every((batch) => !batch.created && !batch.submitted)).toBe(true);
    expect(payloads).toHaveLength(4);
    expect(resolvedScopes).toHaveLength(4);
    expect(await adminDb.select().from(schema.providerBatches)).toHaveLength(4);
  });
  it("submits same-group dynamic orders sequentially under one account lock and maps each AWB", async () => {
    const confirmations = await Promise.all([
      seedEstimatedShipment(5, tenantA, outletA, "Ninja"),
      seedEstimatedShipment(6, tenantA, outletA, "Ninja"),
    ]);
    const payloads: MengantarOrderRequest[][] = [];
    const accountLockHeld: boolean[] = [];
    let active = 0;
    let maxActive = 0;
    let releaseFirst!: () => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const transport: MengantarOrderTransport = {
      async submit(payload) {
        const callIndex = payloads.length;
        payloads.push([...payload]);
        active += 1;
        maxActive = Math.max(maxActive, active);

        const probe = await adminPool.connect();
        try {
          const lockResult = await probe.query<{ acquired: boolean }>(
            "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
            [platformAccountKey],
          );
          const acquired = lockResult.rows[0]?.acquired === true;
          accountLockHeld.push(!acquired);
          if (acquired) {
            await probe.query(
              "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
              [platformAccountKey],
            );
          }
        } finally {
          probe.release();
        }

        if (callIndex === 0) {
          signalStarted();
          await gate;
        }
        active -= 1;
        return {
          success: true,
          data: fixture.paid.response.data.slice(callIndex, callIndex + 1),
        };
      },
    };

    const execution = orchestrateFixtureBackedMengantarOrders(input(confirmations, transport));
    await started;
    expect(payloads).toHaveLength(1);
    releaseFirst();
    const first = await execution;

    expect(first.batches).toEqual([
      expect.objectContaining({ created: true, submitted: true, status: "COMPLETED" }),
    ]);
    expect(payloads.map((payload) => payload.length)).toEqual([1, 1]);
    expect(maxActive).toBe(1);
    expect(accountLockHeld).toEqual([true, true]);
    expect(await adminDb.select({ id: schema.providerBatches.id }).from(schema.providerBatches))
      .toHaveLength(1);

    const snapshots = await adminDb
      .select({
        shipmentId: schema.providerOrderSnapshots.shipmentId,
        status: schema.providerOrderSnapshots.status,
        cnoteNo: schema.providerOrderSnapshots.cnoteNo,
      })
      .from(schema.providerOrderSnapshots)
      .orderBy(schema.providerOrderSnapshots.position);
    expect(snapshots).toEqual([
      {
        shipmentId: confirmations[0]!.shipmentId,
        status: "ISSUED",
        cnoteNo: "SANITIZED-CNOTE-0001",
      },
      {
        shipmentId: confirmations[1]!.shipmentId,
        status: "ISSUED",
        cnoteNo: "SANITIZED-CNOTE-0002",
      },
    ]);

    const duplicate = await orchestrateFixtureBackedMengantarOrders(
      input(confirmations, transport),
    );
    expect(duplicate.batches).toEqual([
      expect.objectContaining({ created: false, submitted: false, status: "COMPLETED" }),
    ]);
    expect(payloads).toHaveLength(2);
  });

  it("retains resolved order snapshots when a later single response is unknown", async () => {
    const confirmations = await Promise.all([
      seedEstimatedShipment(7, tenantA, outletA, "JNE"),
      seedEstimatedShipment(8, tenantA, outletA, "JNE"),
    ]);
    const payloadSizes: number[] = [];
    let calls = 0;
    const transport: MengantarOrderTransport = {
      async submit(payload) {
        payloadSizes.push(payload.length);
        calls += 1;
        return calls === 1
          ? { success: true, data: fixture.paid.response.data.slice(0, 1) }
          : fixture.ambiguous.response;
      },
    };

    const first = await orchestrateFixtureBackedMengantarOrders(
      input(confirmations, transport),
    );
    expect(first.batches).toEqual([
      expect.objectContaining({ submitted: true, status: "SUBMISSION_UNKNOWN" }),
    ]);
    expect(payloadSizes).toEqual([1, 1]);

    const snapshots = await adminDb
      .select({
        shipmentId: schema.providerOrderSnapshots.shipmentId,
        status: schema.providerOrderSnapshots.status,
        providerOrderId: schema.providerOrderSnapshots.providerOrderId,
        cnoteNo: schema.providerOrderSnapshots.cnoteNo,
      })
      .from(schema.providerOrderSnapshots)
      .orderBy(schema.providerOrderSnapshots.position);
    expect(snapshots).toEqual([
      {
        shipmentId: confirmations[0]!.shipmentId,
        status: "ISSUED",
        providerOrderId: "SANITIZED-ORDER-0001",
        cnoteNo: "SANITIZED-CNOTE-0001",
      },
      {
        shipmentId: confirmations[1]!.shipmentId,
        status: "SUBMISSION_UNKNOWN",
        providerOrderId: null,
        cnoteNo: null,
      },
    ]);

    const duplicate = await orchestrateFixtureBackedMengantarOrders(
      input(confirmations, transport),
    );
    expect(duplicate.batches[0]).toEqual(
      expect.objectContaining({ submitted: false, status: "SUBMISSION_UNKNOWN" }),
    );
    expect(calls).toBe(2);
  });


  it("serializes dynamic courier submissions with a PostgreSQL account lock", async () => {
    const firstConfirmation = await seedEstimatedShipment(10, tenantA, outletA, "Ninja");
    const secondConfirmation = await seedEstimatedShipment(11, tenantA, outletA2, "Ninja");
    let active = 0;
    let maxActive = 0;
    let releaseFirst!: () => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let calls = 0;
    const transport: MengantarOrderTransport = {
      async submit() {
        calls += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (calls === 1) {
          signalStarted();
          await gate;
        }
        active -= 1;
        return { success: true, data: fixture.paid.response.data.slice(0, 1) };
      },
    };

    const first = orchestrateFixtureBackedMengantarOrders(input([firstConfirmation], transport));
    await started;
    const second = orchestrateFixtureBackedMengantarOrders(input([secondConfirmation], transport));
    releaseFirst();
    await Promise.all([first, second]);

    expect(calls).toBe(2);
    expect(maxActive).toBe(1);
  });

  it("fails conflicting provider order identities closed", async () => {
    const confirmation = await seedEstimatedShipment(19, tenantA, outletA, "JNE");
    const result = await orchestrateFixtureBackedMengantarOrders(input([confirmation], {
      async submit() {
        return {
          success: true,
          data: [{
            id: "SANITIZED-ALTERNATE-ORDER",
            order_id: "SANITIZED-PROVIDER-ORDER",
            isPaid: true,
            cnote_no: "SANITIZED-CNOTE-AMBIGUOUS",
          }],
        };
      },
    }));

    expect(result.batches[0]?.status).toBe("SUBMISSION_UNKNOWN");
    const [snapshot] = await adminDb
      .select({
        status: schema.providerOrderSnapshots.status,
        providerOrderId: schema.providerOrderSnapshots.providerOrderId,
        cnoteNo: schema.providerOrderSnapshots.cnoteNo,
      })
      .from(schema.providerOrderSnapshots);
    expect(snapshot).toEqual({
      status: "SUBMISSION_UNKNOWN",
      providerOrderId: null,
      cnoteNo: null,
    });
  });

  it("rejects oversized or control-bearing provider identifiers without persisting raw values", async () => {
    const cases = [
      {
        sequence: 91,
        data: {
          order_id: "A".repeat(161),
          isPaid: true,
          cnote_no: "SANITIZED-CNOTE-SAFE",
        },
      },
      {
        sequence: 92,
        data: {
          order_id: "SANITIZED-ORDER-SAFE",
          isPaid: true,
          cnote_no: "SANITIZED-CNOTE\nCANARY",
        },
      },
      {
        sequence: 93,
        data: {
          order_id: "https://credential-bearing.example.test/order",
          isPaid: true,
          cnote_no: "SANITIZED-CNOTE-SAFE",
        },
      },
    ];

    for (const candidate of cases) {
      const confirmation = await seedEstimatedShipment(
        candidate.sequence,
        tenantA,
        outletA,
        "JNE",
      );
      const result = await orchestrateFixtureBackedMengantarOrders(
        input([confirmation], {
          async submit() {
            return { success: true, data: [candidate.data] };
          },
        }),
      );
      expect(result.batches[0]?.status).toBe("SUBMISSION_UNKNOWN");
    }

    const snapshots = await adminDb
      .select({
        cnoteNo: schema.providerOrderSnapshots.cnoteNo,
        providerOrderId: schema.providerOrderSnapshots.providerOrderId,
        status: schema.providerOrderSnapshots.status,
      })
      .from(schema.providerOrderSnapshots);
    expect(snapshots).toHaveLength(3);
    expect(snapshots).toEqual(
      expect.arrayContaining(
        cases.map(() => ({
          cnoteNo: null,
          providerOrderId: null,
          status: "SUBMISSION_UNKNOWN",
        })),
      ),
    );
  });

  it("marks ambiguous submissions unknown and never retries them", async () => {
    const confirmation = await seedEstimatedShipment(20, tenantA, outletA, "JNE");
    let calls = 0;
    const transport: MengantarOrderTransport = {
      async submit() {
        calls += 1;
        return fixture.ambiguous.response;
      },
    };

    const first = await orchestrateFixtureBackedMengantarOrders(input([confirmation], transport));
    expect(first.batches[0]?.status).toBe("SUBMISSION_UNKNOWN");
    const duplicate = await orchestrateFixtureBackedMengantarOrders(input([confirmation], transport));
    expect(duplicate.batches[0]?.submitted).toBe(false);
    expect(calls).toBe(1);

    const [persisted] = await adminDb
      .select({ status: schema.providerOrderSnapshots.status, cnoteNo: schema.providerOrderSnapshots.cnoteNo })
      .from(schema.providerOrderSnapshots);
    expect(persisted).toEqual({ status: "SUBMISSION_UNKNOWN", cnoteNo: null });
  });

  it("models a non-COD unpaid order without cnote_no as awaiting upstream payment", async () => {
    const confirmation = await seedEstimatedShipment(30, tenantA, outletA, "JNE");
    await orchestrateFixtureBackedMengantarOrders(input([confirmation], {
      async submit() { return fixture.unpaid.response; },
    }));
    const [persisted] = await adminDb
      .select({ status: schema.providerOrderSnapshots.status, cnoteNo: schema.providerOrderSnapshots.cnoteNo })
      .from(schema.providerOrderSnapshots);
    expect(persisted).toEqual({ status: "AWAITING_UPSTREAM_PAYMENT", cnoteNo: null });
  });

  it("denies mismatched outlet, credential source, or account identity before submission", async () => {
    const confirmation = await seedEstimatedShipment(
      35,
      tenantA,
      outletA2,
      "JNE",
      false,
      "private",
    );
    let calls = 0;
    const transport: MengantarOrderTransport = {
      async submit() {
        calls += 1;
        return fixture.paid.response;
      },
    };

    await expect(orchestrateFixtureBackedMengantarOrders(scopedInput(
      [confirmation],
      async (scope) => ({
        ...transportBinding(scope, transport, privateAccountIdentity),
        outletId: outletA,
      }),
    ))).rejects.toThrow("Mengantar order transport is unavailable.");
    await expect(orchestrateFixtureBackedMengantarOrders(scopedInput(
      [confirmation],
      async (scope) => ({
        ...transportBinding(scope, transport, privateAccountIdentity),
        credentialSource: "platform_default",
      }),
    ))).rejects.toThrow("Mengantar order transport is unavailable.");
    await expect(orchestrateFixtureBackedMengantarOrders(scopedInput(
      [confirmation],
      async (scope) => transportBinding(scope, transport, "platform_default"),
    ))).rejects.toThrow("Mengantar order transport is unavailable.");

    expect(calls).toBe(0);
    expect(await adminDb.select().from(schema.providerBatches)).toHaveLength(0);
    expect(await adminDb.select().from(schema.providerOrderSnapshots)).toHaveLength(0);
  });

  it("denies cross-tenant confirmation before invoking transport", async () => {
    const foreign = await seedEstimatedShipment(40, tenantB, outletB, "JNE");
    let calls = 0;
    await expect(orchestrateFixtureBackedMengantarOrders(input([foreign], {
      async submit() { calls += 1; return fixture.paid.response; },
    }))).rejects.toThrow("Provider order confirmation is unavailable.");
    expect(calls).toBe(0);
    expect(await adminDb.select().from(schema.providerBatches)).toHaveLength(0);
  });

  it("emits redacted lifecycle events and rate limits estimate/order retries per tenant actor", async () => {
    const confirmation = await seedEstimatedShipment(41, tenantA, outletA, "JNE");
    const nameCanary = "RECIPIENT-PII-CANARY";
    const phoneCanary = "081299998888";
    const addressCanary = "PRIVATE-ADDRESS-CANARY";
    const providerIdentityCanary = "sk_test_CREDENTIAL_CANARY";
    const awbCanary = "AWB-PRIVATE-CANARY";
    await adminPool.query(
      "UPDATE shipment_parties SET name = $1, phone = $2, address = $3 WHERE shipment_id = $4",
      [nameCanary, phoneCanary, addressCanary, confirmation.shipmentId],
    );

    const events: ShipmentLifecycleEvent[] = [];
    let submissions = 0;
    const transport: MengantarOrderTransport = {
      async submit(payload) {
        submissions += 1;
        expect(JSON.stringify(payload)).toContain(phoneCanary);
        return {
          success: true,
          data: [{
            id: providerIdentityCanary,
            order_id: providerIdentityCanary,
            isPaid: true,
            cnote_no: awbCanary,
          }],
        };
      },
    };
    const tenantAInput = {
      ...input([confirmation], transport),
      telemetrySink(event: ShipmentLifecycleEvent) {
        events.push(event);
      },
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await orchestrateFixtureBackedMengantarOrders(tenantAInput);
    }
    let orderRejection: unknown;
    try {
      await orchestrateFixtureBackedMengantarOrders(tenantAInput);
    } catch (error) {
      orderRejection = error;
    }
    expect(orderRejection).toBeInstanceOf(OrderRateLimitedError);
    expect(String(orderRejection)).toBe(
      "Error: Order submission rate limit exceeded.",
    );
    expect(submissions).toBe(1);

    const tenantBConfirmation = await seedEstimatedShipment(42, tenantB, outletB, "JNE");
    let tenantBSubmissions = 0;
    const tenantBResult = await orchestrateFixtureBackedMengantarOrders({
      db: appDb,
      lockPool: appPool,
      principalId: "order-user-b",
      tenantId: tenantB,
      confirmations: [tenantBConfirmation],
      resolveTransport: async (scope) => transportBinding(scope, {
        async submit() {
          tenantBSubmissions += 1;
          return { success: true, data: fixture.paid.response.data.slice(0, 1) };
        },
      }),
      telemetrySink(event) {
        events.push(event);
      },
    });
    expect(tenantBResult.batches).toMatchObject([{ status: "COMPLETED" }]);
    expect(tenantBSubmissions).toBe(1);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await withTenantContext(appDb, "order-user-a", tenantA, (tx, context) =>
        enforceEstimateRateLimit(tx, context),
      );
    }
    let estimateRejection: unknown;
    try {
      await withTenantContext(appDb, "order-user-a", tenantA, (tx, context) =>
        enforceEstimateRateLimit(tx, context),
      );
    } catch (error) {
      estimateRejection = error;
    }
    expect(estimateRejection).toBeInstanceOf(EstimateRateLimitedError);
    expect(String(estimateRejection)).toBe("Error: Estimate rate limit exceeded.");
    await withTenantContext(appDb, "order-user-b", tenantB, (tx, context) =>
      enforceEstimateRateLimit(tx, context),
    );

    const limits = await adminPool.query<{
      actorId: string;
      count: number;
      operation: string;
      tenantId: string;
    }>(
      `SELECT
         actor_id AS "actorId",
         count,
         operation,
         tenant_id AS "tenantId"
       FROM shipment_rate_limits
       WHERE operation IN ('estimate', 'order-submit')`,
    );
    expect(limits.rows).toHaveLength(4);
    expect(limits.rows).toEqual(expect.arrayContaining([
      { actorId: "order-user-a", count: 5, operation: "estimate", tenantId: tenantA },
      { actorId: "order-user-b", count: 1, operation: "estimate", tenantId: tenantB },
      { actorId: "order-user-a", count: 5, operation: "order-submit", tenantId: tenantA },
      { actorId: "order-user-b", count: 1, operation: "order-submit", tenantId: tenantB },
    ]));

    const tenantAEvents = events.filter((event) => event.tenantId === tenantA);
    expect(tenantAEvents.map((event) => event.outcome)).toEqual([
      "success",
      "idempotent",
      "idempotent",
      "idempotent",
      "idempotent",
      "rate_limited",
    ]);
    expect(events.filter((event) => event.tenantId === tenantB)).toMatchObject([
      {
        event: "shipment.provider.lifecycle",
        operation: "order",
        outcome: "success",
        actorId: "order-user-b",
        safeProviderStatus: "COMPLETED",
      },
    ]);
    expect(tenantAEvents[0]).toMatchObject({
      event: "shipment.provider.lifecycle",
      severity: "INFO",
      operation: "order",
      outcome: "success",
      tenantId: tenantA,
      actorId: "order-user-a",
      outletId: outletA,
      credentialSource: "platform_default",
      courier: "JNE",
      safeProviderStatus: "COMPLETED",
      retryResult: "accepted",
      queueResult: "queued",
    });
    expect(Object.keys(tenantAEvents[0]!).sort()).toEqual([
      "actorId",
      "correlationId",
      "courier",
      "credentialSource",
      "event",
      "latencyMs",
      "occurredAt",
      "operation",
      "outcome",
      "outletId",
      "queueResult",
      "retryResult",
      "safeProviderStatus",
      "severity",
      "tenantId",
    ]);
    for (const event of events) {
      expect(event.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(event.latencyMs).toBeGreaterThanOrEqual(0);
    }
    const serializedEvents = JSON.stringify(events);
    for (const prohibited of [
      nameCanary,
      phoneCanary,
      addressCanary,
      providerIdentityCanary,
      awbCanary,
    ]) {
      expect(serializedEvents).not.toContain(prohibited);
      expect(String(orderRejection)).not.toContain(prohibited);
      expect(String(estimateRejection)).not.toContain(prohibited);
    }
  });

  it("keeps the checked-in provider fixture free of credentials, URLs, and personal data", async () => {
    const raw = await readFile(
      new URL("./fixtures/mengantar-order.sanitized.json", import.meta.url),
      "utf8",
    );
    expect(raw).not.toMatch(/https?:|api[_-]?key|secret|phone|address|sender|receiver|recipient/i);
    expect(raw).not.toMatch(/\b(?:\+?62|08)\d{7,}\b/);
  });
});
