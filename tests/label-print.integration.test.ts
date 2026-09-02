import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  appendPrintAttempt,
  listPrintableShipments,
  listPrintEvents,
  loadPrintableLabel,
  PrintAttemptConflictError,
} from "@/db/label-print-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";
import {
  formatDimensions,
  formatWeight,
  formatWibDateTime,
  recipientDensity,
} from "@/lib/label-format";

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

const tenantA = "00000000-0000-0000-0000-000000000901";
const tenantB = "00000000-0000-0000-0000-000000000902";
const outletA = "00000000-0000-0000-0000-000000000911";
const outletB = "00000000-0000-0000-0000-000000000912";
const userA = "label-user-a";
const userB = "label-user-b";

function fixtureIds(sequence: number) {
  const suffix = sequence.toString(16).padStart(12, "0");
  return {
    shipmentId: `00000000-0000-0000-0010-${suffix}`,
    estimateSnapshotId: `00000000-0000-0000-0011-${suffix}`,
    estimateServiceId: `00000000-0000-0000-0012-${suffix}`,
    batchId: `00000000-0000-0000-0013-${suffix}`,
    providerOrderSnapshotId: `00000000-0000-0000-0014-${suffix}`,
  };
}

function printAttemptId(sequence: number) {
  return `00000000-0000-0000-0020-${sequence.toString(16).padStart(12, "0")}`;
}

type SeedStatus = "ISSUED" | "AWAITING_UPSTREAM_PAYMENT";

async function seedProviderShipment(input: {
  sequence: number;
  tenantId?: string;
  outletId?: string;
  status?: SeedStatus;
  isCod?: boolean;
  awb?: string;
}) {
  const tenantId = input.tenantId ?? tenantA;
  const outletId = input.outletId ?? outletA;
  const status = input.status ?? "ISSUED";
  const isCod = input.isCod ?? false;
  const ids = fixtureIds(input.sequence);
  const awb = status === "ISSUED"
    ? (input.awb ?? `JNE-LABEL-${String(input.sequence).padStart(6, "0")}`)
    : null;
  const idempotencyKey = input.sequence.toString(16).padStart(64, "0");

  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, $4)",
    [ids.shipmentId, tenantId, outletId, status],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity,
      package_length_cm, package_width_cm, package_height_cm,
      declared_value_idr, is_cod
    ) VALUES (
      $1, $2, 'fixture-destination', 'Kec. Menteng, Jakarta Pusat',
      'Produk sintetis untuk pengujian label', 2450, 3, 40, 30, 25,
      100000, $3
    )`,
    [ids.shipmentId, tenantId, isCod],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (
      tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label
    ) VALUES
      ($1, $2, 'SENDER', 'Pengirim Snapshot', '081211110000', 'Alamat pengirim snapshot yang tidak berubah', NULL, NULL),
      ($1, $2, 'RECIPIENT', 'Penerima Snapshot', '081299998765', 'Alamat penerima snapshot yang tidak berubah', 'fixture-destination', 'Kec. Menteng, Jakarta Pusat')`,
    [tenantId, ids.shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id,
      destination_area_id, destination_area_label, weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'fixture-origin', 'fixture-destination', 'Kec. Menteng, Jakarta Pusat', 2450, $5, 'platform_default')`,
    [
      ids.estimateSnapshotId,
      tenantId,
      ids.shipmentId,
      outletId,
      isCod,
    ],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency,
      shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'REG', 'IDR', 8000, 'price', '1-2 hari', true)`,
    [ids.estimateServiceId, tenantId, ids.estimateSnapshotId],
  );
  if (isCod) {
    await adminPool.query(
      `INSERT INTO shipment_cod_totals (
        tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
        goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
        provider_cod_amount_idr
      ) VALUES ($1, $2, $3, $4, 'IDR', 100000, 8000, 3240, 356, 111596)`,
      [
        tenantId,
        ids.shipmentId,
        ids.estimateSnapshotId,
        ids.estimateServiceId,
      ],
    );
  }
  await adminPool.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier,
      credential_source, provider_account_key, idempotency_key, status,
      submission_attempted_at, completed_at
    ) VALUES (
      $1, $2, $3, 'fixture-pickup', 'JNE', 'platform_default',
      $4, $5, 'COMPLETED', now(), now()
    )`,
    [ids.batchId, tenantId, outletId, "a".repeat(64), idempotencyKey],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id,
      estimate_service_id, position, provider_service, destination_area_id, destination_area_label, currency,
      shipping_amount_idr, insurance_amount_idr, is_cod,
      provider_cod_amount_idr, status, provider_order_id, is_paid,
      cnote_no, safe_response_code, resolved_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 0, 'REG', 'fixture-destination', 'Kec. Menteng, Jakarta Pusat', 'IDR', 8000, NULL, $7,
      $8, $9, $10, $11, $12, 'FIXTURE_ACCEPTED', now()
    )`,
    [
      ids.providerOrderSnapshotId,
      tenantId,
      ids.batchId,
      ids.shipmentId,
      ids.estimateSnapshotId,
      ids.estimateServiceId,
      isCod,
      isCod ? 111596 : null,
      status,
      `provider-order-${input.sequence}`,
      status === "ISSUED",
      awb,
    ],
  );

  return { ...ids, awb };
}

async function inTenantA<T>(
  work: Parameters<typeof withTenantContext<T>>[3],
) {
  return withTenantContext(appDb, userA, tenantA, work);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await adminPool.query(
    "TRUNCATE print_events, provider_unpaid_recoveries, provider_order_snapshots, provider_batches, shipment_cod_totals, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties, shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE",
  );
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'Label User A', 'label-a@example.test'),
      ($2, 'Label User B', 'label-b@example.test')`,
    [userA, userB],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'Label Tenant A', 'ACTIVE'), ($2, 'Label Tenant B', 'ACTIVE')",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OPERATOR'), ($3, $4, 'OPERATOR')",
    [tenantA, userA, tenantB, userB],
  );
  await adminPool.query(
    `INSERT INTO outlets (
      id, tenant_id, name, default_pickup_address_id, default_origin_area_id
    ) VALUES
      ($1, $2, 'Outlet Label A', 'pickup-a', 'origin-a'),
      ($3, $4, 'Outlet Label B', 'pickup-b', 'origin-b')`,
    [outletA, tenantA, outletB, tenantB],
  );
});

afterAll(async () => {
  await adminPool.query(
    "TRUNCATE print_events, provider_unpaid_recoveries, provider_order_snapshots, provider_batches, shipment_cod_totals, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties, shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE",
  );
  await Promise.all([adminPool.end(), appPool.end()]);
});

describe("tenant-scoped AWB labels", () => {
  it("loads only provider-issued AWB data and immutable shipment snapshots", async () => {
    const fixture = await seedProviderShipment({ sequence: 1, isCod: true });

    const label = await inTenantA((tx, context) =>
      loadPrintableLabel(tx, context, fixture.shipmentId),
    );

    expect(label).toMatchObject({
      shipmentId: fixture.shipmentId,
      awb: fixture.awb,
      courier: "JNE",
      providerService: "REG",
      isCod: true,
      shippingAmountIdr: 8000,
      insuranceAmountIdr: null,
      providerCodAmountIdr: 111596,
      codBreakdown: {
        goodsValueIdr: 100000,
        shippingAmountIdr: 8000,
        serviceFeeIdr: 3240,
        vatAmountIdr: 356,
      },
      package: {
        content: "Produk sintetis untuk pengujian label",
        weightGrams: 2450,
        quantity: 3,
        lengthCm: 40,
        widthCm: 30,
        heightCm: 25,
        declaredValueIdr: 100000,
      },
      sender: {
        name: "Pengirim Snapshot",
        phone: "081211110000",
        address: "Alamat pengirim snapshot yang tidak berubah",
      },
      recipient: {
        name: "Penerima Snapshot",
        phone: "081299998765",
        address: "Alamat penerima snapshot yang tidak berubah",
      },
      printCount: 0,
      lastPrintedAt: null,
    });
  });

  it("appends ordered print and reprint history while denying update and delete", async () => {
    const fixture = await seedProviderShipment({ sequence: 2 });

    const first = await inTenantA((tx, context) =>
      appendPrintAttempt(tx, context, fixture.shipmentId, printAttemptId(1)),
    );
    const second = await inTenantA((tx, context) =>
      appendPrintAttempt(tx, context, fixture.shipmentId, printAttemptId(2)),
    );
    if (first.outcome !== "PRINTED" || second.outcome !== "PRINTED") {
      throw new Error("Expected printable fixture to record printed events.");
    }
    expect([first.sequence, second.sequence]).toEqual([1, 2]);
    expect(first.awb).toBe(fixture.awb);

    const detail = await inTenantA(async (tx, context) => ({
      events: await listPrintEvents(tx, context, fixture.shipmentId),
      label: await loadPrintableLabel(tx, context, fixture.shipmentId),
    }));
    expect(detail.label.printCount).toBe(2);
    expect(detail.label.lastPrintedAt).toBeInstanceOf(Date);
    expect(detail.events.map((event) => event.sequence)).toEqual([2, 1]);
    expect(detail.events[0]).toMatchObject({
      outcome: "PRINTED",
      actorNameMasked: "L••••",
      actorRole: "OPERATOR",
    });
    expect(JSON.stringify(detail.events)).not.toContain("Label User A");

    await expect(inTenantA((tx, context) =>
      tx
        .update(schema.printEvents)
        .set({ reasonCode: "TAMPERED" })
        .where(
          and(
            eq(schema.printEvents.tenantId, context.tenantId),
            eq(schema.printEvents.shipmentId, fixture.shipmentId),
          ),
        ),
    )).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(inTenantA((tx, context) =>
      tx
        .delete(schema.printEvents)
        .where(
          and(
            eq(schema.printEvents.tenantId, context.tenantId),
            eq(schema.printEvents.shipmentId, fixture.shipmentId),
          ),
        ),
    )).rejects.toMatchObject({ cause: { code: "42501" } });

    const persisted = await adminDb
      .select()
      .from(schema.printEvents)
      .where(eq(schema.printEvents.shipmentId, fixture.shipmentId));
    expect(persisted).toHaveLength(2);
  });

  it("allocates contiguous sequences for more than two concurrent prints", async () => {
    const fixture = await seedProviderShipment({ sequence: 3 });

    const events = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        inTenantA((tx, context) =>
          appendPrintAttempt(
            tx,
            context,
            fixture.shipmentId,
            printAttemptId(10 + index),
          ),
        )),
    );

    expect(events.every((event) => event.outcome === "PRINTED")).toBe(true);
    expect(events.map((event) =>
      event.outcome === "PRINTED" ? event.sequence : 0
    ).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("replays one print attempt exactly across duplicate and stale lifecycle requests", async () => {
    const fixture = await seedProviderShipment({ sequence: 30 });
    const attemptId = printAttemptId(30);

    const concurrent = await Promise.all([
      inTenantA((tx, context) =>
        appendPrintAttempt(tx, context, fixture.shipmentId, attemptId),
      ),
      inTenantA((tx, context) =>
        appendPrintAttempt(tx, context, fixture.shipmentId, attemptId),
      ),
    ]);
    expect(concurrent).toHaveLength(2);
    expect(concurrent[0]).toEqual(concurrent[1]);
    expect(concurrent[0]).toMatchObject({ outcome: "PRINTED", sequence: 1 });

    await adminPool.query(
      "UPDATE provider_order_snapshots SET status = 'FAILED', cnote_no = NULL WHERE id = $1",
      [fixture.providerOrderSnapshotId],
    );
    await adminPool.query(
      "UPDATE shipments SET status = 'FAILED' WHERE id = $1",
      [fixture.shipmentId],
    );

    const staleReplay = await inTenantA((tx, context) =>
      appendPrintAttempt(tx, context, fixture.shipmentId, attemptId),
    );
    expect(staleReplay).toEqual(concurrent[0]);
    const persisted = await adminDb
      .select()
      .from(schema.printEvents)
      .where(eq(schema.printEvents.shipmentId, fixture.shipmentId));
    expect(persisted).toHaveLength(1);
  });

  it("rejects reuse of a print attempt id for different immutable semantics", async () => {
    const firstFixture = await seedProviderShipment({ sequence: 31 });
    const secondFixture = await seedProviderShipment({ sequence: 32 });
    const attemptId = printAttemptId(31);

    await inTenantA((tx, context) =>
      appendPrintAttempt(tx, context, firstFixture.shipmentId, attemptId),
    );
    await expect(inTenantA((tx, context) =>
      appendPrintAttempt(tx, context, secondFixture.shipmentId, attemptId),
    )).rejects.toBeInstanceOf(PrintAttemptConflictError);

    const persisted = await adminDb.select().from(schema.printEvents);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].shipmentId).toBe(firstFixture.shipmentId);
  });

  it("blocks unpaid labels and records a non-print audit event", async () => {
    const fixture = await seedProviderShipment({
      sequence: 4,
      status: "AWAITING_UPSTREAM_PAYMENT",
    });

    const attemptId = printAttemptId(40);
    const blocked = await inTenantA((tx, context) =>
      appendPrintAttempt(tx, context, fixture.shipmentId, attemptId),
    );
    expect(blocked).toMatchObject({
      outcome: "BLOCKED",
      reason: "AWAITING_UPSTREAM_PAYMENT",
    });
    expect(await inTenantA((tx, context) =>
      appendPrintAttempt(tx, context, fixture.shipmentId, attemptId),
    )).toEqual(blocked);

    await adminPool.query(
      "UPDATE provider_order_snapshots SET status = 'ISSUED', is_paid = true, cnote_no = 'JNE-RECOVERED-000040' WHERE id = $1",
      [fixture.providerOrderSnapshotId],
    );
    await adminPool.query(
      "UPDATE shipments SET status = 'ISSUED' WHERE id = $1",
      [fixture.shipmentId],
    );
    expect(await inTenantA((tx, context) =>
      appendPrintAttempt(tx, context, fixture.shipmentId, attemptId),
    )).toEqual(blocked);

    const events = await adminDb
      .select()
      .from(schema.printEvents)
      .where(eq(schema.printEvents.shipmentId, fixture.shipmentId));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      outcome: "BLOCKED",
      sequence: null,
      awbSnapshot: null,
      reasonCode: "AWAITING_UPSTREAM_PAYMENT",
    });
  });

  it("lists masked same-tenant rows and treats cross-tenant ids as not found", async () => {
    const issuedA = await seedProviderShipment({
      sequence: 5,
      awb: "JNE-TENANT-A-ABC123",
    });
    const unpaidA = await seedProviderShipment({
      sequence: 6,
      status: "AWAITING_UPSTREAM_PAYMENT",
    });
    const issuedB = await seedProviderShipment({
      sequence: 7,
      tenantId: tenantB,
      outletId: outletB,
      awb: "JNE-TENANT-B-ABC123",
    });

    const issuedRows = await inTenantA((tx, context) =>
      listPrintableShipments(tx, context, {
        status: "issued",
        awbSuffix: "ABC123",
      }),
    );
    expect(issuedRows).toHaveLength(1);
    expect(issuedRows[0]).toMatchObject({
      shipmentId: issuedA.shipmentId,
      awb: "JNE-TENANT-A-ABC123",
      recipientName: "Penerima Snapshot",
      recipientPhoneMasked: "•••• 8765",
    });
    expect(issuedRows[0]).not.toHaveProperty("recipientAddress");
    expect(JSON.stringify(issuedRows[0])).not.toContain("081299998765");
    expect(JSON.stringify(issuedRows[0])).not.toContain(
      "Alamat penerima snapshot yang tidak berubah",
    );

    const unpaidRows = await inTenantA((tx, context) =>
      listPrintableShipments(tx, context, { status: "unpaid" }),
    );
    expect(unpaidRows.map((row) => row.shipmentId)).toEqual([
      unpaidA.shipmentId,
    ]);

    await expect(inTenantA((tx, context) =>
      loadPrintableLabel(tx, context, issuedB.shipmentId),
    )).rejects.toMatchObject({ reason: "NOT_FOUND" });
    expect(await adminDb.select().from(schema.printEvents)).toHaveLength(0);
  });

  it("uses RLS to reject foreign scope, altered AWBs, and non-issued prints", async () => {
    const issuedA = await seedProviderShipment({ sequence: 8 });
    const unpaidA = await seedProviderShipment({
      sequence: 9,
      status: "AWAITING_UPSTREAM_PAYMENT",
    });
    const issuedB = await seedProviderShipment({
      sequence: 10,
      tenantId: tenantB,
      outletId: outletB,
    });

    await expect(inTenantA((tx, context) =>
      tx.insert(schema.printEvents).values({
        tenantId: context.tenantId,
        shipmentId: issuedA.shipmentId,
        providerOrderSnapshotId: issuedA.providerOrderSnapshotId,
        sequence: 1,
        outcome: "PRINTED",
        awbSnapshot: "ALTERED-AWB",
        actorUserId: context.userId,
        actorRole: context.role,
      }),
    )).rejects.toMatchObject({ cause: { code: "42501" } });

    await expect(inTenantA((tx, context) =>
      tx.insert(schema.printEvents).values({
        tenantId: context.tenantId,
        shipmentId: unpaidA.shipmentId,
        providerOrderSnapshotId: unpaidA.providerOrderSnapshotId,
        sequence: 1,
        outcome: "PRINTED",
        awbSnapshot: "NOT-ISSUED",
        actorUserId: context.userId,
        actorRole: context.role,
      }),
    )).rejects.toMatchObject({ cause: { code: "42501" } });

    await expect(inTenantA((tx, context) =>
      tx.insert(schema.printEvents).values({
        tenantId: tenantB,
        shipmentId: issuedB.shipmentId,
        providerOrderSnapshotId: issuedB.providerOrderSnapshotId,
        sequence: 1,
        outcome: "PRINTED",
        awbSnapshot: issuedB.awb,
        actorUserId: context.userId,
        actorRole: context.role,
      }),
    )).rejects.toMatchObject({ cause: { code: "42501" } });

    expect(await adminDb.select().from(schema.printEvents)).toHaveLength(0);
  });
});

describe("label formatting boundaries", () => {
  it("pins density thresholds, dimensions, weight, and WIB output", () => {
    const density = (combined: number, addressLength = 100) =>
      recipientDensity({
        nameLength: combined - addressLength,
        addressLength,
        areaLabelLength: 0,
      });

    expect(density(200).tier).toBe("compact");
    expect(density(201).tier).toBe("long");
    expect(density(300).tier).toBe("long");
    expect(density(301).tier).toBe("dense");
    expect(density(380).tier).toBe("dense");
    expect(density(381).tier).toBe("ultra");
    expect(density(480).omitAreaLine).toBe(false);
    expect(density(481).omitAreaLine).toBe(true);
    expect(density(484, 484).overCapacity).toBe(false);
    expect(density(485, 485).overCapacity).toBe(true);
    expect(formatWeight(2450)).toBe("2,45 kg");
    expect(formatDimensions(40, 30, 25)).toBe("40 × 30 × 25 cm");
    expect(formatDimensions(null, null, null)).toBeNull();
    expect(formatWibDateTime("2026-08-30T00:00:00.000Z")).toContain("07.00");
    expect(formatWibDateTime("2026-08-30T00:00:00.000Z")).toContain("WIB");
  });
});
