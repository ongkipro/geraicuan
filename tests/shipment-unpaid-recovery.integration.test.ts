import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deriveProviderAccountKey } from "@/db/order-batch-repository";
import * as schema from "@/db/schema";
import { checkShipmentStaleOperation } from "@/db/shipment-stale-operation-repository";
import {
  loadShipmentDetail,
  loadShipmentQueuePage,
} from "@/db/shipment-queue-repository";
import { withTenantContext } from "@/db/tenant-context";
import {
  UnpaidRecoveryDeniedError,
  UnpaidRecoveryUnavailableError,
} from "@/db/unpaid-recovery-repository";
import type {
  MengantarPayUnpaidTransportBinding,
  MengantarPayUnpaidTransportLookup,
} from "@/lib/mengantar-unpaid-recovery";
import { resolveSanctionedUnpaidRecoveryFixtureTransport } from "@/lib/sanctioned-unpaid-recovery-fixture";
import {
  recoverFixtureBackedShipmentPayment,
  ShipmentUnpaidRecoveryReconciliationRequiredError,
} from "@/lib/shipment-unpaid-recovery";
import { shipmentLifecycleActions } from "@/lib/shipment-queue";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
}
if (
  new URL(adminDatabaseUrl).pathname !== "/geraicuan_test"
  || new URL(appDatabaseUrl).pathname !== "/geraicuan_test"
) {
  throw new Error("T23 requires the isolated geraicuan_test database.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const adminDb = drizzle({ client: adminPool, schema });
const appDb = drizzle({ client: appPool, schema });

const tenantA = randomUUID();
const tenantB = randomUUID();
const outletA = randomUUID();
const shipmentId = randomUUID();
const estimateSnapshotId = randomUUID();
const estimateServiceId = randomUUID();
const providerBatchId = randomUUID();
const providerOrderSnapshotId = randomUUID();
const adminA = `t23-admin-a-${randomUUID()}`;
const operatorA = `t23-operator-a-${randomUUID()}`;
const adminB = `t23-admin-b-${randomUUID()}`;
const tenantIds = [tenantA, tenantB];
const userIds = [adminA, operatorA, adminB];
const previousFixtureFlag =
  process.env.GERAICUAN_ENABLE_SANCTIONED_UNPAID_RECOVERY_FIXTURE;

async function cleanup() {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      "DELETE FROM ledger_entries WHERE tenant_id = ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM shipment_rate_limits WHERE tenant_id = ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM provider_unpaid_recoveries WHERE tenant_id = ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM provider_order_snapshots WHERE tenant_id = ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM provider_batches WHERE tenant_id = ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM shipment_estimate_services WHERE tenant_id = ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM shipment_estimate_snapshots WHERE tenant_id = ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM shipment_parties WHERE tenant_id = ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM shipment_drafts WHERE tenant_id = ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM shipments WHERE tenant_id = ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM outlets WHERE tenant_id = ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [tenantIds]);
    await client.query("DELETE FROM users WHERE id = ANY($1::text[])", [userIds]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  await cleanup();
  process.env.GERAICUAN_ENABLE_SANCTIONED_UNPAID_RECOVERY_FIXTURE = "1";

  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'T23 Admin A', $2),
      ($3, 'T23 Operator A', $4),
      ($5, 'T23 Admin B', $6)`,
    [
      adminA,
      `${adminA}@example.test`,
      operatorA,
      `${operatorA}@example.test`,
      adminB,
      `${adminB}@example.test`,
    ],
  );
  await adminPool.query(
    `INSERT INTO tenants (id, name, status) VALUES
      ($1, 'T23 Tenant A', 'ACTIVE'),
      ($2, 'T23 Tenant B', 'ACTIVE')`,
    tenantIds,
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
    ) VALUES ($1, $2, 'T23 Outlet A', 'fixture-pickup-a', 'fixture-origin-a')`,
    [outletA, tenantA],
  );
  await adminPool.query(
    `INSERT INTO shipments (id, tenant_id, outlet_id, status)
     VALUES ($1, $2, $3, 'AWAITING_UPSTREAM_PAYMENT')`,
    [shipmentId, tenantA, outletA],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity,
      declared_value_idr, is_cod
    ) VALUES ($1, $2, 'fixture-destination', 'Tujuan sintetis',
      'Paket sintetis T23', 1000, 1, 100000, false)`,
    [shipmentId, tenantA],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (
      tenant_id, shipment_id, role, name, phone, address
    ) VALUES
      ($1, $2, 'SENDER', 'Pengirim Sintetis', '0000000000', 'Alamat sintetis asal'),
      ($1, $2, 'RECIPIENT', 'Penerima Sintetis', '0000000000', 'Alamat sintetis tujuan')`,
    [tenantA, shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id,
      destination_area_id, weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'fixture-origin-a', 'fixture-destination',
      1000, false, 'platform_default')`,
    [estimateSnapshotId, tenantA, shipmentId, outletA],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency,
      shipping_amount_idr, insurance_amount_idr, shipping_source_field,
      insurance_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'JNE', 'IDR', 8000, 500, 'price',
      'insurance_fee', 'fixture', true)`,
    [estimateServiceId, tenantA, estimateSnapshotId],
  );
  await adminPool.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier,
      credential_source, provider_account_key, idempotency_key, status,
      submission_attempted_at, completed_at
    ) VALUES ($1, $2, $3, 'fixture-pickup-a', 'JNE', 'platform_default',
      $4, $5, 'COMPLETED', now(), now())`,
    [
      providerBatchId,
      tenantA,
      outletA,
      deriveProviderAccountKey("platform_default"),
      "b".repeat(64),
    ],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id,
      estimate_service_id, position, provider_service, currency,
      shipping_amount_idr, insurance_amount_idr, is_cod, status,
      provider_order_id, is_paid, safe_response_code, resolved_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE', 'IDR', 8000, 500,
      false, 'AWAITING_UPSTREAM_PAYMENT', 'SANITIZED-ORDER-UNPAID', false,
      'ORDER_AWAITING_PAYMENT', now())`,
    [
      providerOrderSnapshotId,
      tenantA,
      providerBatchId,
      shipmentId,
      estimateSnapshotId,
      estimateServiceId,
    ],
  );
});

afterAll(async () => {
  try {
    await cleanup();
  } finally {
    if (previousFixtureFlag === undefined) {
      delete process.env.GERAICUAN_ENABLE_SANCTIONED_UNPAID_RECOVERY_FIXTURE;
    } else {
      process.env.GERAICUAN_ENABLE_SANCTIONED_UNPAID_RECOVERY_FIXTURE =
        previousFixtureFlag;
    }
    await Promise.all([adminPool.end(), appPool.end()]);
  }
});

describe("T23 Tenant Admin unpaid recovery", () => {
  it("fails a stale crash-after-claim recovery closed without paying twice", async () => {
    const recoveryId = randomUUID();
    await adminPool.query(
      `INSERT INTO provider_unpaid_recoveries (
        id, tenant_id, batch_id, provider_order_snapshot_id,
        requested_by_user_id, status, attempted_at
      ) VALUES ($1, $2, $3, $4, $5, 'PAYING', now() - interval '10 minutes')`,
      [recoveryId, tenantA, providerBatchId, providerOrderSnapshotId, adminA],
    );
    let resolverCalls = 0;
    let payCalls = 0;

    await expect(withTenantContext(
      appDb,
      adminA,
      tenantA,
      (tx, context) => checkShipmentStaleOperation(tx, context, shipmentId),
    )).resolves.toBe("UPDATED");
    await expect(recoverFixtureBackedShipmentPayment({
      db: appDb,
      lockPool: appPool,
      principalId: adminA,
      tenantId: tenantA,
      shipmentId,
      resolveTransport: async (...args) => {
        resolverCalls += 1;
        const binding = await resolveSanctionedUnpaidRecoveryFixtureTransport(...args);
        return {
          ...binding,
          transport: {
            async payUnpaid(request) {
              payCalls += 1;
              return binding.transport.payUnpaid(request);
            },
          },
        };
      },
    })).rejects.toBeInstanceOf(
      ShipmentUnpaidRecoveryReconciliationRequiredError,
    );
    expect({ payCalls, resolverCalls }).toEqual({ payCalls: 0, resolverCalls: 0 });
    const [recovery] = await adminDb
      .select({
        safeResponseCode: schema.providerUnpaidRecoveries.safeResponseCode,
        status: schema.providerUnpaidRecoveries.status,
      })
      .from(schema.providerUnpaidRecoveries)
      .where(eq(schema.providerUnpaidRecoveries.id, recoveryId));
    expect(recovery).toEqual({
      safeResponseCode: "PAY_UNPAID_INTERRUPTED",
      status: "PAYMENT_UNKNOWN",
    });

    await adminPool.query(
      "DELETE FROM provider_unpaid_recoveries WHERE id = $1",
      [recoveryId],
    );
  });

  it("discovers, guards, recovers, and idempotently exposes sanitized AWBs and labels", async () => {
    const discovered = await withTenantContext(
      appDb,
      adminA,
      tenantA,
      async (tx, context) => ({
        detail: await loadShipmentDetail(tx, context, shipmentId),
        queue: await loadShipmentQueuePage(tx, context, {
          page: 1,
          pageSize: 20,
          status: "AWAITING_UPSTREAM_PAYMENT",
        }),
      }),
    );
    expect(discovered.queue.rows).toEqual([
      expect.objectContaining({
        awb: null,
        shipmentId,
        status: "AWAITING_UPSTREAM_PAYMENT",
      }),
    ]);
    expect(discovered.detail).toMatchObject({
      shipmentId,
      status: "AWAITING_UPSTREAM_PAYMENT",
      provider: {
        awb: null,
        isPaid: false,
        orderStatus: "AWAITING_UPSTREAM_PAYMENT",
      },
    });
    expect(
      shipmentLifecycleActions(
        "AWAITING_UPSTREAM_PAYMENT",
        "TENANT_ADMIN",
        shipmentId,
      ),
    ).toEqual([
      expect.objectContaining({
        href: "#pemulihan-pembayaran",
        id: "recover-unpaid",
        kind: "link",
      }),
    ]);
    expect(
      shipmentLifecycleActions(
        "AWAITING_UPSTREAM_PAYMENT",
        "OPERATOR",
        shipmentId,
      ),
    ).toEqual([]);

    let resolverCalls = 0;
    let payCalls = 0;
    const countingResolver: MengantarPayUnpaidTransportLookup = async (...args) => {
      resolverCalls += 1;
      const binding = await resolveSanctionedUnpaidRecoveryFixtureTransport(...args);
      const counted: MengantarPayUnpaidTransportBinding = {
        ...binding,
        transport: {
          async payUnpaid(request) {
            payCalls += 1;
            return binding.transport.payUnpaid(request);
          },
        },
      };
      return counted;
    };
    const recoverAs = (principalId: string, tenantId: string) =>
      recoverFixtureBackedShipmentPayment({
        db: appDb,
        lockPool: appPool,
        principalId,
        tenantId,
        shipmentId,
        resolveTransport: countingResolver,
      });

    await expect(recoverAs(operatorA, tenantA)).rejects.toBeInstanceOf(
      UnpaidRecoveryDeniedError,
    );
    await expect(recoverAs(adminB, tenantB)).rejects.toBeInstanceOf(
      UnpaidRecoveryUnavailableError,
    );
    expect({ payCalls, resolverCalls }).toEqual({ payCalls: 0, resolverCalls: 0 });
    expect(
      await adminDb
        .select()
        .from(schema.providerUnpaidRecoveries)
        .where(eq(schema.providerUnpaidRecoveries.batchId, providerBatchId)),
    ).toEqual([]);

    const first = await recoverAs(adminA, tenantA);
    expect(first).toEqual({
      duplicate: false,
      shipments: [
        {
          awb: "SANITIZED-CNOTE-RECOVERED-0001",
          labelHref: `/app/label/${shipmentId}`,
          shipmentId,
        },
      ],
    });
    expect({ payCalls, resolverCalls }).toEqual({ payCalls: 1, resolverCalls: 1 });

    const duplicate = await recoverAs(adminA, tenantA);
    expect(duplicate).toEqual({ ...first, duplicate: true });
    expect({ payCalls, resolverCalls }).toEqual({ payCalls: 1, resolverCalls: 1 });

    const [persisted] = await adminDb
      .select({
        awb: schema.providerOrderSnapshots.cnoteNo,
        isPaid: schema.providerOrderSnapshots.isPaid,
        orderStatus: schema.providerOrderSnapshots.status,
        shipmentStatus: schema.shipments.status,
      })
      .from(schema.providerOrderSnapshots)
      .innerJoin(
        schema.shipments,
        and(
          eq(schema.shipments.id, schema.providerOrderSnapshots.shipmentId),
          eq(schema.shipments.tenantId, schema.providerOrderSnapshots.tenantId),
        ),
      )
      .where(eq(schema.providerOrderSnapshots.id, providerOrderSnapshotId));
    expect(persisted).toEqual({
      awb: "SANITIZED-CNOTE-RECOVERED-0001",
      isPaid: true,
      orderStatus: "ISSUED",
      shipmentStatus: "ISSUED",
    });
    const recoveries = await adminDb
      .select({
        requestedByUserId: schema.providerUnpaidRecoveries.requestedByUserId,
        status: schema.providerUnpaidRecoveries.status,
      })
      .from(schema.providerUnpaidRecoveries)
      .where(eq(schema.providerUnpaidRecoveries.batchId, providerBatchId));
    expect(recoveries).toEqual([
      { requestedByUserId: adminA, status: "COMPLETED" },
    ]);

    const fixtureRaw = await readFile(
      new URL("./fixtures/mengantar-pay-unpaid.sanitized.json", import.meta.url),
      "utf8",
    );
    expect(fixtureRaw).not.toMatch(
      /https?:|api[_-]?key|secret|phone|address|sender|receiver|recipient/i,
    );
    expect(fixtureRaw).not.toMatch(/\b(?:\+?62|08)\d{7,}\b/);
    expect(JSON.stringify(first)).not.toMatch(
      /SANITIZED-ORDER-UNPAID|fixture-pickup|Pengirim|Penerima|https?:/i,
    );
  });
});
