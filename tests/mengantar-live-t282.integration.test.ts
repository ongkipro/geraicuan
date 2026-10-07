import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { replaceManagedMengantarApiKey } from "@/db/managed-secret-repository";
import { deriveProviderAccountKey, type OrderConfirmation } from "@/db/order-batch-repository";
import { ShipmentReconciliationUnavailableError } from "@/db/shipment-reconciliation-repository";
import { withTenantContext } from "@/db/tenant-context";
import * as schema from "@/db/schema";
import {
  createLiveMengantarReconciliationLookup,
  RECONCILIATION_MAX_PAGES,
  RECONCILIATION_PAGE_SIZE,
} from "@/lib/mengantar-live-reconciliation";
import {
  resolveLiveMengantarOrderTransport,
  resolveLiveMengantarPayUnpaidTransport,
} from "@/lib/mengantar-live-transport";
import { MengantarDemoTenantError } from "@/lib/mengantar-demo-tenant";
import { orchestrateFixtureBackedMengantarOrders } from "@/lib/mengantar-order";
import { MengantarPayUnpaidRefusedError } from "@/lib/mengantar-unpaid-recovery";
import {
  reconcileFixtureBackedShipment,
  ShipmentReconciliationUndeterminedError,
} from "@/lib/shipment-reconciliation";
import {
  recoverFixtureBackedShipmentPayment,
  ShipmentUnpaidRecoveryReconciliationRequiredError,
} from "@/lib/shipment-unpaid-recovery";
import { cancelShipmentAtMengantar } from "@/lib/shipment-cancellation";
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

const tenantA = "00000000-0000-0000-0000-000000282001";
const outletA = "00000000-0000-0000-0000-000000282011";
// Review F1: a match is applied only on a gerai's own (private) account, so matching cases use it.
const outletP = "00000000-0000-0000-0000-000000282012";
const PRIVATE_KEY = "SYNTHETIC-T282-PRIVATE-KEY";
const adminA = "t282-admin-a";
// Synthetic platform-default account; fetch is stubbed, nothing leaves the process.
const KEY = "SYNTHETIC-T282-KEY";
const AREA_LABEL = "KELAPA GADING BARAT, KELAPA GADING, JAKARTA UTARA, DKI JAKARTA, 14240";
const RECIPIENT_NAME = "Synthetic Recipient T282";
const RECIPIENT_PHONE = "081200000282";
const ORDER_OBJECT_ID = "0000000000000000000002a1";
const BATCH_CODE = "260904105T3QKW";
const BATCH_OBJECT_ID = "0000000000000000000002b1";
const accountKey = deriveProviderAccountKey("platform_default");

type Call = { body: unknown; method: string; path: string; query: Record<string, string> };
const calls: Call[] = [];
let answers: Array<() => Response> = [];
let router: ((call: Call) => Response | Promise<Response>) | null = null;

function ids(sequence: number) {
  const suffix = String(sequence).padStart(12, "0");
  return {
    shipmentId: `00000000-0000-0000-2821-${suffix}`,
    estimateSnapshotId: `00000000-0000-0000-2822-${suffix}`,
    estimateServiceId: `00000000-0000-0000-2823-${suffix}`,
  };
}

async function seedEstimatedShipment(sequence: number, isCod = false, outletId = outletA): Promise<OrderConfirmation> {
  const value = ids(sequence);
  const credentialSource = outletId === outletP ? "private" : "platform_default";
  const origin = outletId === outletP ? "origin-p" : "origin-a";
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, 'ESTIMATED')",
    [value.shipmentId, tenantA, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod,
      destination_area_verified_at
    ) VALUES ($1, $2, 'area-t282', $3, 'Sanitized fixture parcel', 1000, 1, 100000, $4, now())`,
    [value.shipmentId, tenantA, AREA_LABEL, isCod],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
      VALUES
      ($1, $2, 'SENDER', 'Synthetic Sender', '0000000000', 'Synthetic origin', NULL, NULL),
      ($1, $2, 'RECIPIENT', $3, $4, 'Synthetic destination', 'area-t282', $5)`,
    [tenantA, value.shipmentId, RECIPIENT_NAME, RECIPIENT_PHONE, AREA_LABEL],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
      destination_area_label, weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, $5, 'area-t282', $6, 1000, $7, $8)`,
    [value.estimateSnapshotId, tenantA, value.shipmentId, outletId, origin, AREA_LABEL, isCod, credentialSource],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
      shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'JNE', 'IDR', 8000, 'price', 'sanitized estimate', true)`,
    [value.estimateServiceId, tenantA, value.estimateSnapshotId],
  );
  if (isCod) {
    await adminPool.query(
      `INSERT INTO shipment_cod_totals (
        tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
        goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
        provider_cod_amount_idr
      ) VALUES ($1, $2, $3, $4, 'IDR', 100000, 8000, 3240, 356, 111596)`,
      [tenantA, value.shipmentId, value.estimateSnapshotId, value.estimateServiceId],
    );
  }
  return value;
}

const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status });
const lost = () => () => { throw new TypeError("socket hang up"); };

function order(confirmation: OrderConfirmation) {
  return orchestrateFixtureBackedMengantarOrders({
    confirmations: [confirmation],
    db: appDb,
    lockPool: appPool,
    principalId: adminA,
    resolveTransport: resolveLiveMengantarOrderTransport,
    tenantId: tenantA,
  });
}

/** A live order whose answer was lost: SUBMISSION_UNKNOWN, attempted `ageMinutes` ago. */
async function seedUnknown(sequence: number, ageMinutes: number, isCod = false, outletId = outletP) {
  const confirmation = await seedEstimatedShipment(sequence, isCod, outletId);
  answers.push(lost());
  expect((await order(confirmation)).batches[0]).toMatchObject({ status: "SUBMISSION_UNKNOWN" });
  const attemptedAt = new Date(Date.now() - ageMinutes * 60_000);
  await adminPool.query(
    `UPDATE provider_batches SET submission_attempted_at = $1
     WHERE id = (SELECT batch_id FROM provider_order_snapshots WHERE shipment_id = $2)`,
    [attemptedAt, confirmation.shipmentId],
  );
  calls.length = 0;
  return { attemptedAt, shipmentId: confirmation.shipmentId };
}

/** A live order accepted unpaid (wallet too low): AWAITING_UPSTREAM_PAYMENT with its batch `_id`. */
async function seedAwaitingPayment(sequence: number) {
  const confirmation = await seedEstimatedShipment(sequence);
  answers.push(json(200, {
    success: true,
    data: [{ _id: ORDER_OBJECT_ID, ORDER_ID: "ORDER-T282", batch: BATCH_CODE, batch_id: BATCH_OBJECT_ID, isPaid: false, cnote_no: null }],
    batch: BATCH_CODE,
    batch_id: BATCH_OBJECT_ID,
  }));
  expect((await order(confirmation)).batches[0]).toMatchObject({ status: "COMPLETED" });
  calls.length = 0;
  return confirmation.shipmentId;
}

function stored(attemptedAt: Date, overrides: Record<string, unknown> = {}) {
  return {
    _id: ORDER_OBJECT_ID,
    ORDER_ID: "ORDER-T282",
    batch: BATCH_CODE,
    COD_AMOUNT: 0,
    GOODS_AMOUNT: "100000",
    RECEIVER_CITY: "JAKARTA UTARA",
    RECEIVER_DISTRICT: "KELAPA GADING",
    RECEIVER_NAME: ` ${RECIPIENT_NAME.toLowerCase()} `,
    RECEIVER_PHONE: "+62 812-0000-0282",
    RECEIVER_REGION: "DKI JAKARTA",
    RECEIVER_SUBDISTRICT: "KELAPA GADING BARAT",
    WEIGHT: 1,
    cnote_no: "SANITIZED-CNOTE-T282",
    createdAt: new Date(attemptedAt.getTime() + 30_000).toISOString(),
    isDeleted: false,
    isPaid: true,
    status: "active",
    ...overrides,
  };
}

// Review F3: a listing is complete only when its `total` equals the rows read.
const orders = (data: unknown[], total: number | null = data.length) =>
  json(200, total === null ? { success: true, data } : { success: true, data, total });
const batches = json(200, { success: true, total: 1, data: [{ _id: BATCH_OBJECT_ID, id: BATCH_CODE, orderData: [{ orderId: "ORDER-T282", cnote_no: null, status: "active" }] }] });

function reconcile(shipmentId: string) {
  return reconcileFixtureBackedShipment({
    db: appDb,
    principalId: adminA,
    resolveAuthoritativeResult: createLiveMengantarReconciliationLookup({ db: appDb, principalId: adminA, tenantId: tenantA }),
    shipmentId,
    tenantId: tenantA,
  });
}

function recover(shipmentId: string) {
  return recoverFixtureBackedShipmentPayment({
    db: appDb,
    lockPool: appPool,
    principalId: adminA,
    resolveTransport: resolveLiveMengantarPayUnpaidTransport,
    shipmentId,
    tenantId: tenantA,
  });
}

async function shipmentState(shipmentId: string) {
  const [row] = await adminDb
    .select({
      cnoteNo: schema.providerOrderSnapshots.cnoteNo,
      orderStatus: schema.providerOrderSnapshots.status,
      providerBatchId: schema.providerOrderSnapshots.providerBatchId,
      providerOrderId: schema.providerOrderSnapshots.providerOrderId,
      shipmentStatus: schema.shipments.status,
    })
    .from(schema.providerOrderSnapshots)
    .innerJoin(schema.shipments, eq(schema.shipments.id, schema.providerOrderSnapshots.shipmentId))
    .where(eq(schema.providerOrderSnapshots.shipmentId, shipmentId));
  return row;
}

async function recoveryState() {
  const result = await adminPool.query<{ status: string; attempted_at: Date | null; safe_response_code: string | null }>(
    "SELECT status, attempted_at, safe_response_code FROM provider_unpaid_recoveries",
  );
  return result.rows;
}

const consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  calls.length = 0;
  answers = [];
  router = null;
  vi.stubEnv("MENGANTAR_LIVE_ORDERS_ENABLED", "1");
  vi.stubEnv("MENGANTAR_CREDENTIAL_ENCRYPTION_KEY", Buffer.alloc(32, 82).toString("base64"));
  vi.stubEnv("MENGANTAR_API_KEY", KEY);
  vi.stubEnv("MENGANTAR_BASE_URL", "https://api.mengantar.test/");
  vi.stubEnv("MENGANTAR_PICKUP_ADDRESS_ID", "pickup-a");
  vi.stubEnv("MENGANTAR_ORIGIN_AREA_ID", "origin-a");
  vi.stubGlobal("fetch", async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      method: init.method ?? "GET",
      path: url.pathname.replace(`/api/public/${KEY}`, "").replace(`/api/public/${PRIVATE_KEY}`, ""),
      query: Object.fromEntries(url.searchParams),
    });
    if (router) return router(calls.at(-1)!);
    const next = answers.shift();
    if (!next) throw new Error("unexpected request");
    return next();
  });
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    consoleSpies.push(vi.spyOn(console, method));
  }
  await adminPool.query(
    "TRUNCATE mengantar_credential_rate_limits, managed_secret_payloads, mengantar_connections, audit_events, shipment_rate_limits, rate_limits, ledger_entries, provider_unpaid_recoveries, provider_order_snapshots, provider_batches, shipment_cod_totals, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties, shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE",
  );
  await adminPool.query("INSERT INTO users (id, name, email) VALUES ($1, 'T282 Admin', 't282-admin@example.test')", [adminA]);
  await adminPool.query(
    "INSERT INTO tenants (id, name, status, mengantar_credential_policy) VALUES ($1, 'T282 Tenant', 'ACTIVE', 'PLATFORM_DEFAULT_ALLOWED')",
    [tenantA],
  );
  await adminPool.query("INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN')", [tenantA, adminA]);
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
     VALUES ($1, $2, 'T282 Outlet', 'pickup-a', 'origin-a'), ($3, $2, 'T282 Private Outlet', 'pickup-p', 'origin-p')`,
    [outletA, tenantA, outletP],
  );
  await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
    replaceManagedMengantarApiKey(tx, context, outletP, () => PRIVATE_KEY));
}, 30_000);

afterEach(() => {
  // No recipient data or credential in anything the code logged.
  const logged = JSON.stringify(consoleSpies.flatMap((spy) => spy.mock.calls));
  for (const secret of [KEY, PRIVATE_KEY, RECIPIENT_PHONE, "0812-0000-0282", RECIPIENT_NAME, RECIPIENT_NAME.toLowerCase()]) {
    expect(logged).not.toContain(secret);
  }
  for (const spy of consoleSpies.splice(0)) spy.mockRestore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await Promise.all([adminPool.end(), appPool.end()]);
});

describe("T-282 live pay-unpaid", () => {
  it("pays through POST /order/pay-unpaid with the stored batch _id and issues the resi", async () => {
    const shipmentId = await seedAwaitingPayment(1);
    answers.push(json(200, { success: true, data: 1, cnote_no: ["SANITIZED-CNOTE-PAID"] }));
    const result = await recover(shipmentId);
    expect(calls).toEqual([{ body: { batch_id: BATCH_OBJECT_ID, courier: "JNE" }, method: "POST", path: "/order/pay-unpaid", query: {} }]);
    expect(result.shipments).toEqual([expect.objectContaining({ awb: "SANITIZED-CNOTE-PAID", shipmentId })]);
    expect(await shipmentState(shipmentId)).toMatchObject({ cnoteNo: "SANITIZED-CNOTE-PAID", shipmentStatus: "ISSUED" });
    expect(await recoveryState()).toEqual([expect.objectContaining({ status: "COMPLETED" })]);
  });

  it("returns a refused payment to PAYMENT_QUEUED with Mengantar's message, drops a key-quoting one, and pays on the next try", async () => {
    const shipmentId = await seedAwaitingPayment(2);
    answers.push(json(400, { success: false, message: "Saldo tidak mencukupi" }));
    const refused = await recover(shipmentId).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(MengantarPayUnpaidRefusedError);
    expect(refused).toMatchObject({ providerMessage: "Saldo tidak mencukupi", safeCode: "PAY_UNPAID_REFUSED_400" });
    expect(await recoveryState()).toEqual([{ attempted_at: null, safe_response_code: null, status: "PAYMENT_QUEUED" }]);
    expect(await shipmentState(shipmentId)).toMatchObject({ cnoteNo: null, shipmentStatus: "AWAITING_UPSTREAM_PAYMENT" });

    answers.push(json(403, { success: false, message: `forbidden for ${KEY}` }));
    const redacted = await recover(shipmentId).catch((error: unknown) => error);
    expect(redacted).toMatchObject({ providerMessage: null, safeCode: "PAY_UNPAID_REFUSED_403" });
    expect(JSON.stringify(redacted)).not.toContain(KEY);

    answers.push(json(200, { success: true, data: 1, cnote_no: ["SANITIZED-CNOTE-RETRY"] }));
    await expect(recover(shipmentId)).resolves.toMatchObject({ duplicate: false });
    expect(calls.map((call) => call.path)).toEqual(["/order/pay-unpaid", "/order/pay-unpaid", "/order/pay-unpaid"]);
    expect(await recoveryState()).toEqual([expect.objectContaining({ status: "COMPLETED" })]);
  });

  it("keeps a lost answer or a 5xx PAYMENT_UNKNOWN and never sends again before reconciliation", async () => {
    const shipmentId = await seedAwaitingPayment(3);
    answers.push(lost());
    await expect(recover(shipmentId)).rejects.toBeInstanceOf(ShipmentUnpaidRecoveryReconciliationRequiredError);
    expect(await recoveryState()).toEqual([expect.objectContaining({ safe_response_code: "PAY_UNPAID_TRANSPORT_FAILED", status: "PAYMENT_UNKNOWN" })]);
    await expect(recover(shipmentId)).rejects.toBeInstanceOf(ShipmentUnpaidRecoveryReconciliationRequiredError);
    expect(calls).toHaveLength(1);

    await adminPool.query("TRUNCATE provider_unpaid_recoveries");
    answers.push(json(502, { success: false, message: "Bad gateway" }));
    await expect(recover(shipmentId)).rejects.toBeInstanceOf(ShipmentUnpaidRecoveryReconciliationRequiredError);
    expect(await recoveryState()).toEqual([expect.objectContaining({ safe_response_code: "PAY_UNPAID_HTTP_STATUS", status: "PAYMENT_UNKNOWN" })]);
  });

  it("sends nothing when the claim was swept while waiting for the account lock", async () => {
    const shipmentId = await seedAwaitingPayment(4);
    const holder = await appPool.connect();
    await holder.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [accountKey]);
    const running = recover(shipmentId).catch((error: unknown) => error);
    for (let tries = 0; tries < 100 && (await recoveryState())[0]?.status !== "PAYING"; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect((await recoveryState())[0]?.status).toBe("PAYING");
    await adminPool.query(
      "UPDATE provider_unpaid_recoveries SET status = 'PAYMENT_UNKNOWN', safe_response_code = 'PAY_UNPAID_INTERRUPTED', completed_at = now()",
    );
    await holder.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [accountKey]);
    holder.release();
    expect(await running).toBeInstanceOf(ShipmentUnpaidRecoveryReconciliationRequiredError);
    expect(calls).toHaveLength(0);
  });
});

describe("T-282 live reconciliation of SUBMISSION_UNKNOWN (D-43)", () => {
  it("issues on exactly one match on the gerai's own account, fills the batch _id from GET /batch and returns no recipient data", async () => {
    const { attemptedAt, shipmentId } = await seedUnknown(10, 5);
    answers.push(orders([stored(attemptedAt), stored(attemptedAt, { _id: "0000000000000000000002a9", RECEIVER_PHONE: "081299999999" })]), batches);
    const result = await reconcile(shipmentId);
    expect(result).toEqual({ awb: "SANITIZED-CNOTE-T282", shipmentId, status: "ISSUED" });
    expect(calls.map((call) => [call.method, call.path])).toEqual([["GET", "/order"], ["GET", "/batch"]]);
    expect(calls[0]!.query).toEqual({
      courier: "JNE",
      dateRange: JSON.stringify({
        startDate: new Date(attemptedAt.getTime() - 10 * 60_000).toISOString(),
        endDate: new Date(attemptedAt.getTime() + 60 * 60_000).toISOString(),
      }),
      page: "1",
      size: String(RECONCILIATION_PAGE_SIZE),
    });
    expect(await shipmentState(shipmentId)).toEqual({
      cnoteNo: "SANITIZED-CNOTE-T282",
      orderStatus: "ISSUED",
      providerBatchId: BATCH_OBJECT_ID,
      providerOrderId: ORDER_OBJECT_ID,
      shipmentStatus: "ISSUED",
    });
    const serialized = JSON.stringify(result);
    for (const pii of [RECIPIENT_NAME, RECIPIENT_PHONE, "0812-0000-0282", "KELAPA"]) expect(serialized).not.toContain(pii);
  });

  it("never applies a match on the shared platform-default account (review F1)", async () => {
    const { attemptedAt, shipmentId } = await seedUnknown(40, 45, false, outletA);
    answers.push(orders([stored(attemptedAt)]), batches);
    await expect(reconcile(shipmentId)).rejects.toBeInstanceOf(ShipmentReconciliationUndeterminedError);
    expect(calls.map((call) => call.path)).toEqual(["/order"]);
    expect(await shipmentState(shipmentId)).toMatchObject({ orderStatus: "SUBMISSION_UNKNOWN", providerOrderId: null });
  });

  it("books one stored order to only one of two look-alike shipments reconciled at once (review F2)", async () => {
    const first = await seedUnknown(41, 5);
    const second = await seedUnknown(42, 5);
    // Both lookups read the listing and the known ids before either applies: the /batch answers
    // are held until both have asked, so only the apply-time guard can keep the order single.
    const held: Array<() => void> = [];
    router = (call) => {
      if (call.path === "/order") return orders([stored(first.attemptedAt)])();
      return new Promise<Response>((resolve) => {
        held.push(() => resolve(batches()));
        if (held.length === 2) for (const release of held) release();
      });
    };
    const settled = await Promise.allSettled([reconcile(first.shipmentId), reconcile(second.shipmentId)]);
    expect(settled.filter((outcome) => outcome.status === "fulfilled")).toEqual([
      { status: "fulfilled", value: expect.objectContaining({ status: "ISSUED" }) },
    ]);
    const rejected = settled.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ShipmentReconciliationUnavailableError);
    const states = [await shipmentState(first.shipmentId), await shipmentState(second.shipmentId)];
    expect(states.filter((state) => state?.providerOrderId === ORDER_OBJECT_ID)).toHaveLength(1);
    expect(states.map((state) => state?.shipmentStatus).sort()).toEqual(["ISSUED", "SUBMISSION_UNKNOWN"]);

    // T-292: the database itself refuses a second snapshot carrying the same order id in the gerai.
    const loser = states[0]?.providerOrderId === ORDER_OBJECT_ID ? second : first;
    await expect(adminPool.query(
      "UPDATE provider_order_snapshots SET provider_order_id = $1 WHERE shipment_id = $2",
      [ORDER_OBJECT_ID, loser.shipmentId],
    )).rejects.toMatchObject({ code: "23505", constraint: "provider_order_snapshots_tenant_provider_order_key" });
  });

  it("lands an unpaid match in AWAITING_UPSTREAM_PAYMENT with the batch _id, so pay-unpaid can then run (T-227 #3)", async () => {
    const { attemptedAt, shipmentId } = await seedUnknown(11, 5);
    answers.push(orders([stored(attemptedAt, { cnote_no: null, isPaid: false })]), batches);
    await expect(reconcile(shipmentId)).resolves.toEqual({ awb: null, shipmentId, status: "AWAITING_UPSTREAM_PAYMENT" });
    expect(await shipmentState(shipmentId)).toMatchObject({ providerBatchId: BATCH_OBJECT_ID, providerOrderId: ORDER_OBJECT_ID, shipmentStatus: "AWAITING_UPSTREAM_PAYMENT" });

    answers.push(json(200, { success: true, data: 1, cnote_no: ["SANITIZED-CNOTE-RECONCILED"] }));
    await expect(recover(shipmentId)).resolves.toMatchObject({ shipments: [expect.objectContaining({ awb: "SANITIZED-CNOTE-RECONCILED" })] });
    expect(calls.at(-1)).toMatchObject({ body: { batch_id: BATCH_OBJECT_ID, courier: "JNE" }, path: "/order/pay-unpaid" });
  });

  it("leaves an unpaid match unknown when its batch _id cannot be proven", async () => {
    const { attemptedAt, shipmentId } = await seedUnknown(12, 45);
    answers.push(orders([stored(attemptedAt, { cnote_no: null, isPaid: false })]), orders([]));
    await expect(reconcile(shipmentId)).rejects.toBeInstanceOf(ShipmentReconciliationUndeterminedError);
    expect(await shipmentState(shipmentId)).toMatchObject({ orderStatus: "SUBMISSION_UNKNOWN", providerBatchId: null });
  });

  it("takes no batch _id from a batch whose answer has no orderData", async () => {
    const { attemptedAt, shipmentId } = await seedUnknown(43, 5);
    answers.push(orders([stored(attemptedAt)]), json(200, { success: true, total: 1, data: [{ _id: BATCH_OBJECT_ID, id: BATCH_CODE }] }));
    await expect(reconcile(shipmentId)).resolves.toMatchObject({ status: "ISSUED" });
    expect(await shipmentState(shipmentId)).toMatchObject({ providerBatchId: null, providerOrderId: ORDER_OBJECT_ID });
  });

  it("matches a stored bare national number such as 812… to the recipient's 0812… (review F4)", async () => {
    const { attemptedAt, shipmentId } = await seedUnknown(44, 5);
    answers.push(orders([stored(attemptedAt, { RECEIVER_PHONE: "81200000282" })]), batches);
    await expect(reconcile(shipmentId)).resolves.toMatchObject({ status: "ISSUED" });
  });

  it("changes nothing when two stored orders match", async () => {
    const { attemptedAt, shipmentId } = await seedUnknown(13, 45);
    answers.push(orders([stored(attemptedAt), stored(attemptedAt, { _id: "0000000000000000000002a2", cnote_no: "SANITIZED-CNOTE-OTHER" })]));
    await expect(reconcile(shipmentId)).rejects.toBeInstanceOf(ShipmentReconciliationUndeterminedError);
    expect(await shipmentState(shipmentId)).toMatchObject({ orderStatus: "SUBMISSION_UNKNOWN", shipmentStatus: "SUBMISSION_UNKNOWN" });
  });

  it("never marks FAILED on zero matches, young or old (review F5, D-43 amended)", async () => {
    for (const [sequence, age] of [[14, 20], [15, 31], [45, 600]] as const) {
      const unknown = await seedUnknown(sequence, age);
      answers.push(orders([]));
      await expect(reconcile(unknown.shipmentId)).rejects.toBeInstanceOf(ShipmentReconciliationUndeterminedError);
      expect(await shipmentState(unknown.shipmentId)).toMatchObject({ orderStatus: "SUBMISSION_UNKNOWN", shipmentStatus: "SUBMISSION_UNKNOWN" });
    }
  });

  it("does not match a different phone or a different amount, and changes nothing", async () => {
    const phone = await seedUnknown(16, 45);
    answers.push(orders([stored(phone.attemptedAt, { RECEIVER_PHONE: "081299999999" })]));
    await expect(reconcile(phone.shipmentId)).rejects.toBeInstanceOf(ShipmentReconciliationUndeterminedError);
    expect(await shipmentState(phone.shipmentId)).toMatchObject({ shipmentStatus: "SUBMISSION_UNKNOWN" });

    const amount = await seedUnknown(17, 45);
    answers.push(orders([stored(amount.attemptedAt, { GOODS_AMOUNT: "100001" })]));
    await expect(reconcile(amount.shipmentId)).rejects.toBeInstanceOf(ShipmentReconciliationUndeterminedError);
    expect(await shipmentState(amount.shipmentId)).toMatchObject({ shipmentStatus: "SUBMISSION_UNKNOWN" });
  });

  it.each([
    ["name", 30, { RECEIVER_NAME: "Other Recipient" }],
    ["area", 31, { RECEIVER_SUBDISTRICT: "KELAPA GADING TIMUR" }],
    ["weight", 32, { WEIGHT: 2 }],
    ["time window", 33, { createdAt: "2000-01-01T00:00:00.000Z" }],
    ["deletion", 34, { isDeleted: true }],
  ] as const)("does not match a stored order that differs in %s, and changes nothing", async (_field, sequence, overrides) => {
    const { attemptedAt, shipmentId } = await seedUnknown(sequence, 45);
    answers.push(orders([stored(attemptedAt, overrides)]));
    await expect(reconcile(shipmentId)).rejects.toBeInstanceOf(ShipmentReconciliationUndeterminedError);
    expect(calls).toHaveLength(1);
    expect(await shipmentState(shipmentId)).toMatchObject({ shipmentStatus: "SUBMISSION_UNKNOWN" });
  });

  it("matches a COD order on COD_AMOUNT, not on the goods value", async () => {
    const cod = await seedUnknown(18, 45, true);
    answers.push(orders([stored(cod.attemptedAt, { COD_AMOUNT: 100000, GOODS_AMOUNT: "100000" })]));
    await expect(reconcile(cod.shipmentId)).rejects.toBeInstanceOf(ShipmentReconciliationUndeterminedError);

    answers.push(orders([stored(cod.attemptedAt, { COD_AMOUNT: 111596, GOODS_AMOUNT: "0" })]), batches);
    await expect(reconcile(cod.shipmentId)).resolves.toMatchObject({ status: "ISSUED" });
  });

  it("never matches an order another shipment of the gerai already owns", async () => {
    const first = await seedUnknown(19, 45);
    answers.push(orders([stored(first.attemptedAt)]), batches);
    await expect(reconcile(first.shipmentId)).resolves.toMatchObject({ status: "ISSUED" });

    const second = await seedUnknown(20, 45);
    answers.push(orders([stored(second.attemptedAt)]));
    await expect(reconcile(second.shipmentId)).rejects.toBeInstanceOf(ShipmentReconciliationUndeterminedError);
    expect(await shipmentState(second.shipmentId)).toMatchObject({ providerOrderId: null, shipmentStatus: "SUBMISSION_UNKNOWN" });
  });

  it("decides nothing when a short page reports a larger total, or when the answer has no total (review F3)", async () => {
    const short = await seedUnknown(46, 5);
    answers.push(orders([stored(short.attemptedAt)], 5), orders([], 5));
    await expect(reconcile(short.shipmentId)).rejects.toBeInstanceOf(ShipmentReconciliationUndeterminedError);
    expect(calls.map((call) => call.query.page)).toEqual(["1", "2"]);
    expect(await shipmentState(short.shipmentId)).toMatchObject({ shipmentStatus: "SUBMISSION_UNKNOWN" });

    calls.length = 0;
    const untotalled = await seedUnknown(47, 5);
    answers.push(orders([stored(untotalled.attemptedAt)], null), orders([], null));
    await expect(reconcile(untotalled.shipmentId)).rejects.toBeInstanceOf(ShipmentReconciliationUndeterminedError);
    expect(await shipmentState(untotalled.shipmentId)).toMatchObject({ shipmentStatus: "SUBMISSION_UNKNOWN" });
  });

  it("stops at the page bound and then decides nothing", async () => {
    const { attemptedAt, shipmentId } = await seedUnknown(21, 45);
    const total = (RECONCILIATION_MAX_PAGES + 1) * RECONCILIATION_PAGE_SIZE;
    for (let page = 0; page < RECONCILIATION_MAX_PAGES + 1; page += 1) {
      answers.push(orders(Array.from({ length: RECONCILIATION_PAGE_SIZE }, (_, index) =>
        stored(attemptedAt, { _id: `0000000000000000${String(page * 100 + index).padStart(8, "0")}`, RECEIVER_PHONE: "081299999999" })), total));
    }
    await expect(reconcile(shipmentId)).rejects.toBeInstanceOf(ShipmentReconciliationUndeterminedError);
    expect(calls).toHaveLength(RECONCILIATION_MAX_PAGES);
    expect(calls.map((call) => call.query.page)).toEqual(Array.from({ length: RECONCILIATION_MAX_PAGES }, (_, index) => String(index + 1)));
    expect(await shipmentState(shipmentId)).toMatchObject({ shipmentStatus: "SUBMISSION_UNKNOWN" });
  });

  it("changes nothing when the read fails", async () => {
    const { shipmentId } = await seedUnknown(22, 45);
    answers.push(json(502, { success: false, message: `upstream ${PRIVATE_KEY}` }));
    const error = await reconcile(shipmentId).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ShipmentReconciliationUndeterminedError);
    expect(JSON.stringify(error) + String(error)).not.toContain(PRIVATE_KEY);
    expect(await shipmentState(shipmentId)).toMatchObject({ shipmentStatus: "SUBMISSION_UNKNOWN" });
  });
});

describe("T-293 demo gerai: no order-side Mengantar call even with the live switch on", () => {
  const markDemo = () => adminPool.query("UPDATE tenants SET is_demo = true WHERE id = $1", [tenantA]);
  const batchCount = async (shipmentId: string) => (await adminPool.query(
    "SELECT count(*)::int AS n FROM provider_order_snapshots WHERE shipment_id = $1", [shipmentId])).rows[0].n;

  it("refuses issuing before anything is claimed", async () => {
    const confirmation = await seedEstimatedShipment(60);
    await markDemo();
    await expect(order(confirmation)).rejects.toBeInstanceOf(MengantarDemoTenantError);
    expect(calls).toEqual([]);
    expect(await batchCount(confirmation.shipmentId)).toBe(0);
  });

  it("refuses pay-unpaid, cancel and reconciliation without a request or a state change", async () => {
    const awaiting = await seedAwaitingPayment(61);
    const unknown = await seedUnknown(62, 5);
    await markDemo();

    await expect(recover(awaiting)).rejects.toBeInstanceOf(MengantarDemoTenantError);
    await expect(cancelShipmentAtMengantar({ db: appDb, lockPool: appPool, principalId: adminA, shipmentId: awaiting, tenantId: tenantA }))
      .rejects.toBeInstanceOf(MengantarDemoTenantError);
    await expect(reconcile(unknown.shipmentId)).rejects.toBeInstanceOf(MengantarDemoTenantError);

    expect(calls).toEqual([]);
    expect(await recoveryState()).toEqual([]);
    expect(await shipmentState(awaiting)).toMatchObject({ shipmentStatus: "AWAITING_UPSTREAM_PAYMENT" });
    expect(await shipmentState(unknown.shipmentId)).toMatchObject({ orderStatus: "SUBMISSION_UNKNOWN", shipmentStatus: "SUBMISSION_UNKNOWN" });
  });
});
