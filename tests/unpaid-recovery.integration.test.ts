import { readFile } from "node:fs/promises";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { OrderConfirmation } from "@/db/order-batch-repository";
import { UnpaidRecoveryUnavailableError } from "@/db/unpaid-recovery-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import {
  orchestrateFixtureBackedMengantarOrders,
  type MengantarOrderTransportBinding,
  type MengantarOrderTransportLookup,
} from "@/lib/mengantar-order";
import {
  orchestrateFixtureBackedMengantarUnpaidRecovery,
  type MengantarPayUnpaidRequest,
  type MengantarPayUnpaidTransport,
  type MengantarPayUnpaidTransportBinding,
  type MengantarPayUnpaidTransportLookup,
} from "@/lib/mengantar-unpaid-recovery";
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
const adminDb = drizzle({ client: adminPool, schema });
const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-0000-0000-000000000801";
const tenantB = "00000000-0000-0000-0000-000000000802";
const outletA = "00000000-0000-0000-0000-000000000811";
const outletB = "00000000-0000-0000-0000-000000000812";
const adminA = "recovery-admin-a";
const operatorA = "recovery-operator-a";
const adminB = "recovery-admin-b";

const providerAccountIdentity = "platform_default";

type OrderFixture = {
  unpaid: { response: unknown };
  ambiguous: { response: unknown };
};

type RecoveryFixture = {
  issued: { response: unknown };
  ambiguous: { response: unknown };
  wrongBatch: { response: unknown };
};

let orderFixture: OrderFixture;
let recoveryFixture: RecoveryFixture;

function ids(sequence: number) {
  const suffix = String(sequence).padStart(12, "0");
  return {
    shipmentId: `00000000-0000-0000-0004-${suffix}`,
    estimateSnapshotId: `00000000-0000-0000-0005-${suffix}`,
    estimateServiceId: `00000000-0000-0000-0006-${suffix}`,
  };
}

async function seedEstimatedShipment(
  sequence: number,
  tenantId: string,
  outletId: string,
) {
  const value = ids(sequence);
  const origin = outletId === outletA ? "recovery-origin-a" : "recovery-origin-b";
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, 'ESTIMATED')",
    [value.shipmentId, tenantId, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod,
      destination_area_verified_at
    ) VALUES ($1, $2, 'recovery-destination', 'Recovery destination',
      'Sanitized recovery parcel', 1000, 1, 100000, false, now())`,
    [value.shipmentId, tenantId],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
      VALUES
      ($1, $2, 'SENDER', 'Synthetic Sender', '0000000000', 'Synthetic origin', NULL, NULL),
      ($1, $2, 'RECIPIENT', 'Synthetic Recipient', '0000000000', 'Synthetic destination', 'recovery-destination', 'Recovery destination')`,
    [tenantId, value.shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
      destination_area_label, weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, $5, 'recovery-destination', 'Recovery destination', 1000, false, 'platform_default')`,
    [value.estimateSnapshotId, tenantId, value.shipmentId, outletId, origin],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
      shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'JNE', 'IDR', 8000, 'price', 'sanitized estimate', true)`,
    [value.estimateServiceId, tenantId, value.estimateSnapshotId],
  );
  return value;
}

function orderBinding(
  scope: Parameters<MengantarOrderTransportLookup>[0],
): MengantarOrderTransportBinding {
  return {
    tenantId: scope.tenantId,
    outletId: scope.outletId,
    pickupAddressId: scope.pickupAddressId,
    credentialSource: scope.credentialSource,
    accountIdentity: providerAccountIdentity,
    transport: {
      async submit() {
        return orderFixture.unpaid.response;
      },
    },
  };
}

async function createAwaitingBatch(
  sequence: number,
  principalId: string,
  tenantId: string,
  outletId: string,
) {
  const confirmation: OrderConfirmation = await seedEstimatedShipment(
    sequence,
    tenantId,
    outletId,
  );
  const result = await orchestrateFixtureBackedMengantarOrders({
    db: appDb,
    lockPool: appPool,
    principalId,
    tenantId,
    confirmations: [confirmation],
    resolveTransport: async (scope) => orderBinding(scope),
  });
  const batchId = result.batches[0]?.id;
  if (!batchId || result.batches[0]?.status !== "COMPLETED") {
    throw new Error("Unpaid T7 fixture did not persist a completed provider batch.");
  }
  return { batchId, confirmation };
}

function recoveryBinding(
  scope: Parameters<MengantarPayUnpaidTransportLookup>[0],
  transport: MengantarPayUnpaidTransport,
): MengantarPayUnpaidTransportBinding {
  return {
    tenantId: scope.tenantId,
    outletId: scope.outletId,
    pickupAddressId: scope.pickupAddressId,
    credentialSource: scope.credentialSource,
    accountIdentity: providerAccountIdentity,
    transport,
  };
}

function recoveryInput(
  batchId: string,
  principalId: string,
  tenantId: string,
  transport: MengantarPayUnpaidTransport,
) {
  return {
    db: appDb,
    lockPool: appPool,
    principalId,
    tenantId,
    batchId,
    resolveTransport: async (scope: Parameters<MengantarPayUnpaidTransportLookup>[0]) =>
      recoveryBinding(scope, transport),
  };
}

beforeAll(async () => {
  orderFixture = JSON.parse(
    await readFile(new URL("./fixtures/mengantar-order.sanitized.json", import.meta.url), "utf8"),
  ) as OrderFixture;
  recoveryFixture = JSON.parse(
    await readFile(
      new URL("./fixtures/mengantar-pay-unpaid.sanitized.json", import.meta.url),
      "utf8",
    ),
  ) as RecoveryFixture;
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await adminPool.query(
    "TRUNCATE shipment_rate_limits, rate_limits, provider_unpaid_recoveries, provider_order_snapshots, provider_batches, shipment_cod_totals, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties, shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE",
  );
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'Recovery Admin A', 'recovery-admin-a@example.test'),
      ($2, 'Recovery Operator A', 'recovery-operator-a@example.test'),
      ($3, 'Recovery Admin B', 'recovery-admin-b@example.test')`,
    [adminA, operatorA, adminB],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'Recovery Tenant A', 'ACTIVE'), ($2, 'Recovery Tenant B', 'ACTIVE')",
    [tenantA, tenantB],
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
      ($1, $2, 'Recovery Outlet A', 'recovery-pickup-a', 'recovery-origin-a'),
      ($3, $4, 'Recovery Outlet B', 'recovery-pickup-b', 'recovery-origin-b')`,
    [outletA, tenantA, outletB, tenantB],
  );
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("fixture-backed Mengantar unpaid recovery", () => {
  it("allows a Tenant Admin to persist one authoritative cnote and never pays twice", async () => {
    const { batchId, confirmation } = await createAwaitingBatch(
      1,
      adminA,
      tenantA,
      outletA,
    );
    const requests: MengantarPayUnpaidRequest[] = [];
    const transport: MengantarPayUnpaidTransport = {
      async payUnpaid(request) {
        requests.push({ ...request });
        return recoveryFixture.issued.response;
      },
    };

    const first = await orchestrateFixtureBackedMengantarUnpaidRecovery(
      recoveryInput(batchId, adminA, tenantA, transport),
    );
    expect(first.recoveries).toMatchObject([
      {
        shipmentId: confirmation.shipmentId,
        created: true,
        submitted: true,
        status: "COMPLETED",
      },
    ]);
    // T-223 (DATA-13): pay-unpaid takes the stored Mengantar `batch`, never the order id.
    expect(requests).toEqual([
      { batch_id: "SANITIZED-BATCH-UNPAID", courier: "JNE" },
    ]);

    const [snapshot] = await adminDb
      .select({
        status: schema.providerOrderSnapshots.status,
        isPaid: schema.providerOrderSnapshots.isPaid,
        cnoteNo: schema.providerOrderSnapshots.cnoteNo,
        safeResponseCode: schema.providerOrderSnapshots.safeResponseCode,
      })
      .from(schema.providerOrderSnapshots);
    expect(snapshot).toEqual({
      status: "ISSUED",
      isPaid: true,
      cnoteNo: "SANITIZED-CNOTE-RECOVERED-0001",
      safeResponseCode: "PAY_UNPAID_ACCEPTED",
    });

    const [shipment] = await adminDb
      .select({ status: schema.shipments.status })
      .from(schema.shipments);
    expect(shipment?.status).toBe("ISSUED");

    const [recovery] = await adminDb
      .select({
        status: schema.providerUnpaidRecoveries.status,
        requestedByUserId: schema.providerUnpaidRecoveries.requestedByUserId,
        safeResponseCode: schema.providerUnpaidRecoveries.safeResponseCode,
      })
      .from(schema.providerUnpaidRecoveries);
    expect(recovery).toEqual({
      status: "COMPLETED",
      requestedByUserId: adminA,
      safeResponseCode: "PAY_UNPAID_ACCEPTED",
    });

    const duplicate = await orchestrateFixtureBackedMengantarUnpaidRecovery(
      recoveryInput(batchId, adminA, tenantA, transport),
    );
    expect(duplicate.recoveries).toMatchObject([
      { created: false, submitted: false, status: "COMPLETED" },
    ]);
    expect(requests).toHaveLength(1);

    const tenantBVisible = await withTenantContext(
      appDb,
      adminB,
      tenantB,
      (tx) => tx.select().from(schema.providerUnpaidRecoveries),
    );
    expect(tenantBVisible).toEqual([]);
    const operatorVisible = await withTenantContext(
      appDb,
      operatorA,
      tenantA,
      (tx) => tx.select().from(schema.providerUnpaidRecoveries),
    );
    expect(operatorVisible).toEqual([]);
  });

  it("admits only one concurrent payment claim for an unpaid order", async () => {
    const { batchId } = await createAwaitingBatch(8, adminA, tenantA, outletA);
    let payCalls = 0;
    let releasePayment!: () => void;
    let observePayment!: () => void;
    const paymentObserved = new Promise<void>((resolve) => {
      observePayment = resolve;
    });
    const paymentGate = new Promise<void>((resolve) => {
      releasePayment = resolve;
    });
    const transport: MengantarPayUnpaidTransport = {
      async payUnpaid() {
        payCalls += 1;
        observePayment();
        await paymentGate;
        return recoveryFixture.issued.response;
      },
    };

    const attempts = [
      orchestrateFixtureBackedMengantarUnpaidRecovery(
        recoveryInput(batchId, adminA, tenantA, transport),
      ),
      orchestrateFixtureBackedMengantarUnpaidRecovery(
        recoveryInput(batchId, adminA, tenantA, transport),
      ),
    ];
    await paymentObserved;
    releasePayment();
    const outcomes = await Promise.all(attempts);

    expect(payCalls).toBe(1);
    expect(
      outcomes
        .flatMap((outcome) => outcome.recoveries)
        .filter((recovery) => recovery.submitted),
    ).toHaveLength(1);
    const [persisted] = await adminDb
      .select({
        status: schema.providerUnpaidRecoveries.status,
      })
      .from(schema.providerUnpaidRecoveries);
    expect(persisted?.status).toBe("COMPLETED");
  });

  it("T-223: stores the provider batch apart from the order id at acceptance", async () => {
    await createAwaitingBatch(20, adminA, tenantA, outletA);
    const [snapshot] = await adminDb
      .select({
        providerOrderId: schema.providerOrderSnapshots.providerOrderId,
        providerBatchId: schema.providerOrderSnapshots.providerBatchId,
      })
      .from(schema.providerOrderSnapshots);
    expect(snapshot).toEqual({
      providerOrderId: "SANITIZED-ORDER-UNPAID",
      providerBatchId: "SANITIZED-BATCH-UNPAID",
    });
  });

  it("T-223: refuses a legacy row without a stored batch before claiming or paying", async () => {
    const { batchId } = await createAwaitingBatch(21, adminA, tenantA, outletA);
    await adminPool.query("UPDATE provider_order_snapshots SET provider_batch_id = NULL");
    let payCalls = 0;
    const transport: MengantarPayUnpaidTransport = {
      async payUnpaid() {
        payCalls += 1;
        return recoveryFixture.issued.response;
      },
    };

    await expect(orchestrateFixtureBackedMengantarUnpaidRecovery(
      recoveryInput(batchId, adminA, tenantA, transport),
    )).rejects.toMatchObject({ safeCode: "PAY_UNPAID_BATCH_ID_MISSING" });
    await expect(orchestrateFixtureBackedMengantarUnpaidRecovery(
      recoveryInput(batchId, adminA, tenantA, transport),
    )).rejects.toBeInstanceOf(UnpaidRecoveryUnavailableError);
    expect(payCalls).toBe(0);
    const recoveries = await adminDb
      .select({ status: schema.providerUnpaidRecoveries.status })
      .from(schema.providerUnpaidRecoveries);
    // Nothing was sent, so the recovery stays queued rather than unknown.
    expect(recoveries).toEqual([{ status: "PAYMENT_QUEUED" }]);
    const [snapshot] = await adminDb
      .select({ status: schema.providerOrderSnapshots.status })
      .from(schema.providerOrderSnapshots);
    expect(snapshot?.status).toBe("AWAITING_UPSTREAM_PAYMENT");
  });

  it("recovers only the known unpaid order from a partially unknown batch", async () => {
    const confirmations = await Promise.all([
      seedEstimatedShipment(6, tenantA, outletA),
      seedEstimatedShipment(7, tenantA, outletA),
    ]);
    let submissions = 0;
    const submitted = await orchestrateFixtureBackedMengantarOrders({
      db: appDb,
      lockPool: appPool,
      principalId: adminA,
      tenantId: tenantA,
      confirmations,
      resolveTransport: async (scope) => ({
        ...orderBinding(scope),
        transport: {
          async submit() {
            submissions += 1;
            return submissions === 1
              ? orderFixture.unpaid.response
              : orderFixture.ambiguous.response;
          },
        },
      }),
    });
    const batchId = submitted.batches[0]?.id;
    expect(submitted.batches).toMatchObject([
      { status: "SUBMISSION_UNKNOWN", submitted: true },
    ]);
    if (!batchId) throw new Error("Expected a persisted partial provider batch.");

    let payCalls = 0;
    const transport: MengantarPayUnpaidTransport = {
      async payUnpaid() {
        payCalls += 1;
        return recoveryFixture.issued.response;
      },
    };
    const recovered = await orchestrateFixtureBackedMengantarUnpaidRecovery(
      recoveryInput(batchId, adminA, tenantA, transport),
    );
    expect(recovered.recoveries).toMatchObject([
      {
        shipmentId: confirmations[0]!.shipmentId,
        submitted: true,
        status: "COMPLETED",
      },
    ]);
    expect(payCalls).toBe(1);

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
        cnoteNo: "SANITIZED-CNOTE-RECOVERED-0001",
      },
      {
        shipmentId: confirmations[1]!.shipmentId,
        status: "SUBMISSION_UNKNOWN",
        cnoteNo: null,
      },
    ]);
  });

  it("denies an Operator before transport resolution or persistence", async () => {
    const { batchId } = await createAwaitingBatch(2, adminA, tenantA, outletA);
    let resolverCalls = 0;
    let payCalls = 0;
    const transport: MengantarPayUnpaidTransport = {
      async payUnpaid() {
        payCalls += 1;
        return recoveryFixture.issued.response;
      },
    };

    await expect(orchestrateFixtureBackedMengantarUnpaidRecovery({
      ...recoveryInput(batchId, operatorA, tenantA, transport),
      resolveTransport: async (scope) => {
        resolverCalls += 1;
        return recoveryBinding(scope, transport);
      },
    })).rejects.toThrow("Unpaid recovery is not authorized.");
    expect(resolverCalls).toBe(0);
    expect(payCalls).toBe(0);
    expect(await adminDb.select().from(schema.providerUnpaidRecoveries)).toEqual([]);
  });

  it("denies a cross-tenant batch before transport resolution or payment", async () => {
    const { batchId } = await createAwaitingBatch(3, adminB, tenantB, outletB);
    let resolverCalls = 0;
    let payCalls = 0;
    const transport: MengantarPayUnpaidTransport = {
      async payUnpaid() {
        payCalls += 1;
        return recoveryFixture.issued.response;
      },
    };

    await expect(orchestrateFixtureBackedMengantarUnpaidRecovery({
      ...recoveryInput(batchId, adminA, tenantA, transport),
      resolveTransport: async (scope) => {
        resolverCalls += 1;
        return recoveryBinding(scope, transport);
      },
    })).rejects.toThrow("Unpaid recovery is unavailable.");
    expect(resolverCalls).toBe(0);
    expect(payCalls).toBe(0);
    expect(await adminDb.select().from(schema.providerUnpaidRecoveries)).toEqual([]);
  });

  it("keeps an ambiguous cnote list unresolved and does not retry payment", async () => {
    const { batchId } = await createAwaitingBatch(4, adminA, tenantA, outletA);
    let payCalls = 0;
    const transport: MengantarPayUnpaidTransport = {
      async payUnpaid() {
        payCalls += 1;
        return recoveryFixture.ambiguous.response;
      },
    };

    const first = await orchestrateFixtureBackedMengantarUnpaidRecovery(
      recoveryInput(batchId, adminA, tenantA, transport),
    );
    expect(first.recoveries).toMatchObject([
      { submitted: true, status: "PAYMENT_UNKNOWN" },
    ]);

    const [snapshot] = await adminDb
      .select({
        status: schema.providerOrderSnapshots.status,
        isPaid: schema.providerOrderSnapshots.isPaid,
        cnoteNo: schema.providerOrderSnapshots.cnoteNo,
      })
      .from(schema.providerOrderSnapshots);
    expect(snapshot).toEqual({
      status: "AWAITING_UPSTREAM_PAYMENT",
      isPaid: false,
      cnoteNo: null,
    });
    const [shipment] = await adminDb
      .select({ status: schema.shipments.status })
      .from(schema.shipments);
    expect(shipment?.status).toBe("AWAITING_UPSTREAM_PAYMENT");
    const [recovery] = await adminDb
      .select({
        status: schema.providerUnpaidRecoveries.status,
        safeResponseCode: schema.providerUnpaidRecoveries.safeResponseCode,
      })
      .from(schema.providerUnpaidRecoveries);
    expect(recovery).toEqual({
      status: "PAYMENT_UNKNOWN",
      safeResponseCode: "PAY_UNPAID_ORDER_CORRELATION_UNKNOWN",
    });

    const duplicate = await orchestrateFixtureBackedMengantarUnpaidRecovery(
      recoveryInput(batchId, adminA, tenantA, transport),
    );
    expect(duplicate.recoveries).toMatchObject([
      { created: false, submitted: false, status: "PAYMENT_UNKNOWN" },
    ]);
    expect(payCalls).toBe(1);
  });

  it("fails closed when the provider response identifies another batch", async () => {
    const { batchId } = await createAwaitingBatch(5, adminA, tenantA, outletA);
    let payCalls = 0;
    const transport: MengantarPayUnpaidTransport = {
      async payUnpaid() {
        payCalls += 1;
        return recoveryFixture.wrongBatch.response;
      },
    };

    await orchestrateFixtureBackedMengantarUnpaidRecovery(
      recoveryInput(batchId, adminA, tenantA, transport),
    );
    const [snapshot] = await adminDb
      .select({
        status: schema.providerOrderSnapshots.status,
        cnoteNo: schema.providerOrderSnapshots.cnoteNo,
      })
      .from(schema.providerOrderSnapshots);
    expect(snapshot).toEqual({
      status: "AWAITING_UPSTREAM_PAYMENT",
      cnoteNo: null,
    });
    const [recovery] = await adminDb
      .select({
        status: schema.providerUnpaidRecoveries.status,
        safeResponseCode: schema.providerUnpaidRecoveries.safeResponseCode,
      })
      .from(schema.providerUnpaidRecoveries);
    expect(recovery).toEqual({
      status: "PAYMENT_UNKNOWN",
      safeResponseCode: "PAY_UNPAID_BATCH_CORRELATION_UNKNOWN",
    });
    expect(payCalls).toBe(1);
  });

  it.each([
    "https://provider.invalid/cnote",
    "CNOTE-OK\nINJECTED",
  ])("rejects an unsafe provider cnote without persisting it: %s", async (unsafeCnote) => {
    const { batchId } = await createAwaitingBatch(9, adminA, tenantA, outletA);
    const issued = recoveryFixture.issued.response as {
      success: true;
      data: { batch_id: string; courier: string; cnote_no: string[] };
    };
    const response = {
      success: true,
      data: { ...issued.data, cnote_no: [unsafeCnote] },
    };
    const result = await orchestrateFixtureBackedMengantarUnpaidRecovery(
      recoveryInput(batchId, adminA, tenantA, {
        async payUnpaid() {
          return response;
        },
      }),
    );

    expect(result.recoveries).toMatchObject([
      { submitted: true, status: "PAYMENT_UNKNOWN" },
    ]);
    const [snapshot] = await adminDb
      .select({ cnoteNo: schema.providerOrderSnapshots.cnoteNo })
      .from(schema.providerOrderSnapshots);
    expect(snapshot?.cnoteNo).toBeNull();
    const [recovery] = await adminDb
      .select({
        status: schema.providerUnpaidRecoveries.status,
        safeResponseCode: schema.providerUnpaidRecoveries.safeResponseCode,
      })
      .from(schema.providerUnpaidRecoveries);
    expect(recovery).toEqual({
      status: "PAYMENT_UNKNOWN",
      safeResponseCode: "PAY_UNPAID_RESPONSE_IDENTIFIER_UNSAFE",
    });
  });

  it("keeps the pay-unpaid fixture free of credentials, URLs, and personal data", async () => {
    const raw = await readFile(
      new URL("./fixtures/mengantar-pay-unpaid.sanitized.json", import.meta.url),
      "utf8",
    );
    expect(raw).not.toMatch(/https?:|api[_-]?key|secret|phone|address|sender|receiver|recipient/i);
    expect(raw).not.toMatch(/\b(?:\+?62|08)\d{7,}\b/);
  });
});
