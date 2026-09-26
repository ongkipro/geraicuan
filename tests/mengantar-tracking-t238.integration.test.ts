import { readFileSync } from "node:fs";

import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { attentionSignals, buildTrackingTimeline } from "@/app/app/pengiriman/[shipmentId]/detail-model";
import { AttentionSignals } from "@/app/app/pengiriman/[shipmentId]/detail-parts";
import { TrackingResultCard } from "@/app/app/cek-resi/tracking-lookup";
import { trackingTimeline } from "@/app/app/cek-resi/tracking-result-model";
import { PLATFORM_WEBHOOK_ACCOUNT_KEY, recordMengantarWebhookEvent } from "@/db/mengantar-webhook-repository";
import { appendPrintAttempt, LabelUnavailableError, loadLabelIndexPage, loadPrintableLabel } from "@/db/label-print-repository";
import { completeProviderOrder } from "@/db/order-batch-repository";
import { recordProviderSettlementPull } from "@/db/provider-settlement-repository";
import { listProviderHistoryEvents } from "@/db/provider-tracking-repository";
import { loadRtsShipmentsPage } from "@/db/rts-repository";
import * as schema from "@/db/schema";
import { issueShipmentInvoice, loadShipmentInvoice } from "@/db/shipment-invoice-repository";
import { loadTenantLogoVersion, removeTenantLogo, saveTenantLogo } from "@/db/tenant-settings-repository";
import { lookupShipmentByTrackingKey } from "@/db/shipment-tracking-lookup-repository";
import { withTenantContext } from "@/db/tenant-context";
import { normalizeMengantarOrderPage, type ProviderOrderStatus } from "@/lib/mengantar-settlement";
import {
  ALLOWED_TRANSITIONS,
  decideProviderDeliveryTransition,
  PROVIDER_DELIVERY_TRANSITION_OUTCOMES,
} from "@/lib/provider-delivery-status";
import { shipmentStatuses } from "@/lib/domain-enums";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

// T-238: tracking history, return resi, attention signals and the webhook's
// database path. Evidence levels: `history[]` is documented (not captured);
// `lastHistory`, `cnote_no_rts`, `isBreach`, `lastUndeliveredCode`,
// `claimStatus`, `ticketStatus`, `pod_code` are live-observed keys
// (tests/fixtures/mengantar-order-contract.shape.json).

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
if (!adminUrl || !appUrl) throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
if (new URL(adminUrl).pathname !== "/geraicuan_test") throw new Error("T-238 tests require geraicuan_test.");

const adminPool = new Pool({ connectionString: adminUrl });
const appPool = new Pool({ connectionString: appUrl });
const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-5800-0000-000000000001";
const tenantB = "00000000-0000-5800-0000-000000000002";
const outletA = "00000000-0000-5801-0000-000000000001";
const outletB = "00000000-0000-5801-0000-000000000002";
const adminA = "t238-admin-a";
const operatorA = "t238-operator-a";
const adminB = "t238-admin-b";
const privateKey = "d".repeat(64);
const period = { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-10-01T00:00:00Z") };
const contract = JSON.parse(readFileSync("tests/fixtures/mengantar-order-contract.shape.json", "utf8"));

let sequence = 0;

async function seedIssuedShipment(input: { cnoteNo: string; tenantId?: string; accountKey?: string }) {
  sequence += 1;
  const tenantId = input.tenantId ?? tenantA;
  const outletId = tenantId === tenantA ? outletA : outletB;
  const suffix = String(sequence).padStart(12, "0");
  const ids = {
    shipmentId: `00000000-0000-5810-0000-${suffix}`,
    snapshotId: `00000000-0000-5811-0000-${suffix}`,
    serviceId: `00000000-0000-5812-0000-${suffix}`,
    batchId: `00000000-0000-5813-0000-${suffix}`,
    orderId: `00000000-0000-5814-0000-${suffix}`,
  };
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status, created_at) VALUES ($1, $2, $3, 'SUBMISSION_QUEUED', '2026-09-05T03:00:00Z')",
    [ids.shipmentId, tenantId, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (shipment_id, tenant_id, destination_area_id, destination_area_label, package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod)
     VALUES ($1, $2, 'fixture-area', 'Fixture area', 'Sanitized parcel', 1000, 1, 100000, false)`,
    [ids.shipmentId, tenantId],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
     VALUES ($1, $2, 'RECIPIENT', 'Penerima Uji', '081100000000', 'Alamat uji', 'fixture-area', 'Fixture area'),
            ($1, $2, 'SENDER', 'Pengirim Uji', '081100000001', 'Kota uji', NULL, NULL)`,
    [tenantId, ids.shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id, destination_area_label, weight_grams, is_cod_requested, credential_source)
     VALUES ($1, $2, $3, $4, 'fixture-origin', 'fixture-area', 'Fixture area', 1000, false, 'platform_default')`,
    [ids.snapshotId, tenantId, ids.shipmentId, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible)
     VALUES ($1, $2, $3, 'JNE REG', 'IDR', 10000, 'price', 'fixture', false)`,
    [ids.serviceId, tenantId, ids.snapshotId],
  );
  await adminPool.query(
    `INSERT INTO provider_batches (id, tenant_id, outlet_id, pickup_address_id, courier, credential_source, provider_account_key, idempotency_key, status, submission_attempted_at)
     VALUES ($1, $2, $3, 'fixture-pickup', 'JNE', 'platform_default', $4, $5, 'SUBMITTING', now())`,
    [ids.batchId, tenantId, outletId, input.accountKey ?? PLATFORM_WEBHOOK_ACCOUNT_KEY, suffix.padStart(64, "0")],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id, position, provider_service, destination_area_id, destination_area_label, currency, shipping_amount_idr, is_cod)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG', 'fixture-area', 'Fixture area', 'IDR', 10000, false)`,
    [ids.orderId, tenantId, ids.batchId, ids.shipmentId, ids.snapshotId, ids.serviceId],
  );
  await withTenantContext(appDb, tenantId === tenantA ? adminA : adminB, tenantId, (tx, context) =>
    completeProviderOrder(tx, context, ids.batchId, {
      shipmentId: ids.shipmentId,
      providerOrderId: `provider-${ids.orderId}`,
      isPaid: true,
      cnoteNo: input.cnoteNo,
    }));
  return ids.shipmentId;
}

function pull(orderStatuses: ProviderOrderStatus[], tenantId = tenantA) {
  return withTenantContext(appDb, tenantId === tenantA ? adminA : adminB, tenantId, (tx, context) =>
    recordProviderSettlementPull(tx, context, {
      outletId: tenantId === tenantA ? outletA : outletB,
      credentialSource: "platform_default",
      providerAccountKey: PLATFORM_WEBHOOK_ACCOUNT_KEY,
      period,
      snapshot: { invoiceCount: 0, orderCount: orderStatuses.length, items: [], refunds: [], orderStatuses },
    }));
}

/** One captured-shape order record, with the T-238 keys the caller sets. */
function orderRecord(cnoteNo: string, status: string, extra: Record<string, unknown> = {}) {
  return { _id: `id-${cnoteNo}`, cnote_no: cnoteNo, status, isDeleted: false, ...extra };
}

function parsed(records: Record<string, unknown>[]) {
  return normalizeMengantarOrderPage({ success: true, count: records.length, data: records }).orders;
}

async function statusOf(shipmentId: string) {
  const { rows } = await adminPool.query<{ status: string }>("SELECT status FROM shipments WHERE id = $1", [shipmentId]);
  return rows[0]?.status;
}

function webhook(cnoteNo: string, providerStatus: string, mappedStatus: (typeof shipmentStatuses)[number] | null, at: string, recognised = true) {
  return recordMengantarWebhookEvent(appDb, { cnoteNo, eventAt: new Date(at), mappedStatus, providerStatus, recognised });
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appUrl);
});

beforeEach(async () => {
  await adminPool.query(
    `TRUNCATE print_events, shipment_invoices, shipment_rate_limits, provider_order_history_events, provider_order_status_observations, provider_settlement_items,
      provider_settlement_pulls, ledger_entries, reconciliation_runs, provider_unpaid_recoveries, provider_order_snapshots,
      provider_batches, shipment_cod_totals, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties,
      shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE`,
  );
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES ($1, 'Admin A', 't238-a@example.test'), ($2, 'Operator A', 't238-op@example.test'),
      ($3, 'Admin B', 't238-b@example.test')`,
    [adminA, operatorA, adminB],
  );
  await adminPool.query("INSERT INTO tenants (id, name, status) VALUES ($1, 'T238 A', 'ACTIVE'), ($2, 'T238 B', 'ACTIVE')", [tenantA, tenantB]);
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR'), ($4, $5, 'TENANT_ADMIN')",
    [tenantA, adminA, operatorA, tenantB, adminB],
  );
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
     VALUES ($1, $2, 'Outlet A', 'fixture-pickup', 'fixture-origin'), ($3, $4, 'Outlet B', 'fixture-pickup', 'fixture-origin')`,
    [outletA, tenantA, outletB, tenantB],
  );
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("T-238 order record parsing", () => {
  it("reads the documented history[] and the observed lastHistory as one de-duplicated list", () => {
    const [order] = parsed([orderRecord("AWB-1", "DELIVERED", {
      history: [
        { date: "27-09-2026 08:30", desc: "Order Created" },
        { date: "27-09-2026 12:00", desc: "  With\u0000courier\n  " },
        { date: "2026-09-27T12:00:00Z", desc: "ISO date is not the documented format" },
        { date: "28-09-2026 10:00", desc: "" },
        "not an entry",
        { date: "28-09-2026 16:16", desc: "DELIVERED TO [BUDI | 28-09-2026 16:16 | JAKARTA]" },
      ],
      lastHistory: { ...contract.fields.lastHistory.shape, date: "28-09-2026 16:16", desc: "DELIVERED TO [BUDI | 28-09-2026 16:16 | JAKARTA]" },
    })]);
    expect(order.historyEvents).toEqual([
      { occurredAt: new Date("2026-09-27T01:30:00.000Z"), description: "Order Created", source: "HISTORY" },
      { occurredAt: new Date("2026-09-27T05:00:00.000Z"), description: "With courier", source: "HISTORY" },
      { occurredAt: new Date("2026-09-28T09:16:00.000Z"), description: "DELIVERED TO [BUDI | 28-09-2026 16:16 | JAKARTA]", source: "HISTORY" },
    ]);
  });

  it("keeps lastHistory alone when a list record has no history, and caps the description at 500", () => {
    const [order] = parsed([orderRecord("AWB-2", "RTS", { lastHistory: { date: "05-09-2026 16:16", desc: "x".repeat(700) } })]);
    expect(order.historyEvents).toHaveLength(1);
    expect(order.historyEvents?.[0]).toMatchObject({ source: "LAST_HISTORY", occurredAt: new Date("2026-09-05T09:16:00.000Z") });
    expect(order.historyEvents?.[0].description).toHaveLength(500);
  });

  it("T-247 (L4): over the 100 cap keeps the newest entries and always lastHistory", () => {
    const at = (minute: number) => `27-09-2026 ${String(8 + Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const history = Array.from({ length: 150 }, (_, index) => ({ date: at(index), desc: `Event ${index}` }));
    const [order] = parsed([orderRecord("AWB-CAP-1", "DELIVERED", { history, lastHistory: { date: at(200), desc: "Delivered" } })]);
    const descriptions = order.historyEvents!.map((event) => event.description);
    expect(descriptions).toHaveLength(100);
    expect(descriptions[0]).toBe("Event 51");
    expect(descriptions.at(-2)).toBe("Event 149");
    expect(descriptions.at(-1)).toBe("Delivered");
    // A lastHistory older than every kept entry is still kept, in place of the oldest.
    const [odd] = parsed([orderRecord("AWB-CAP-2", "DELIVERED", { history, lastHistory: { date: at(0), desc: "Stale last" } })]);
    const oddDescriptions = odd.historyEvents!.map((event) => event.description);
    expect(oddDescriptions).toHaveLength(100);
    expect(oddDescriptions).toContain("Stale last");
    expect(oddDescriptions).not.toContain("Event 50");
    expect(oddDescriptions.at(-2)).toBe("Event 149");
  });

  it("T-247 (L5): strips C1 controls so the database CHECK never refuses a pull", async () => {
    const [order] = parsed([orderRecord("AWB-NEL-1", "DELIVERED", { lastHistory: { date: "27-09-2026 15:00", desc: "Tiba\u0085di\u009fhub" } })]);
    expect(order.lastHistoryDesc).toBe("Tiba di hub");
    expect(order.historyEvents?.[0].description).toBe("Tiba di hub");
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-NEL-1" });
    await pull([order]);
    const { rows } = await adminPool.query("SELECT description FROM provider_order_history_events WHERE shipment_id = $1", [shipment]);
    expect(rows).toEqual([{ description: "Tiba di hub" }]);
    // The CHECK this guards against is real on this database: [[:cntrl:]] matches U+0085.
    const { rows: [probe] } = await adminPool.query("SELECT $1::text ~ '[[:cntrl:]]' AS refused", ["a\u0085b"]);
    expect(probe.refused).toBe(true);
  });

  it("reads the live-observed return resi and attention fields, null when unreadable", () => {
    const [signals, broken] = parsed([
      orderRecord("AWB-3", "RTS", {
        cnote_no_rts: " RTS-AWB-3 ", isBreach: true, lastUndeliveredCode: "CONSIGNEE NOT AVAILABLE",
        claimStatus: "statusPending", ticketStatus: "Replied", pod_code: "402",
      }),
      orderRecord("AWB-4", "RTS", {
        cnote_no_rts: null, isBreach: "true", lastUndeliveredCode: { code: "U05" }, claimStatus: "<b>x</b>", ticketStatus: "",
      }),
    ]);
    expect(signals).toMatchObject({
      returnCnoteNo: "RTS-AWB-3", isBreach: true, lastUndeliveredCode: "CONSIGNEE NOT AVAILABLE",
      claimStatus: "statusPending", ticketStatus: "Replied", podCode: "402",
    });
    expect(broken).toMatchObject({ returnCnoteNo: null, isBreach: null, lastUndeliveredCode: null, claimStatus: null, ticketStatus: null });
    // Every value the capture recorded for these keys is readable.
    for (const code of Object.keys(contract.vocabulary.lastUndeliveredCode)) {
      expect(parsed([orderRecord("AWB-5", "RTS", { lastUndeliveredCode: code })])[0].lastUndeliveredCode, code).toBe(code);
    }
    for (const key of ["claimStatus", "ticketStatus"] as const) {
      for (const value of Object.keys(contract.vocabulary[key])) {
        expect(parsed([orderRecord("AWB-6", "RTS", { [key]: value })])[0][key], value).toBe(value);
      }
    }
  });
});

describe("T-238 return progress", () => {
  it("moves a return with its own resi to RTS_IN_TRANSIT, and never back", () => {
    expect(decideProviderDeliveryTransition("RTS", "ISSUED", { returnCnoteNo: "R1" })).toMatchObject({ mappedStatus: "RTS_IN_TRANSIT", outcome: "APPLIED" });
    expect(decideProviderDeliveryTransition("RTS", "RTS_QUEUED", { returnCnoteNo: "R1" })).toMatchObject({ mappedStatus: "RTS_IN_TRANSIT", outcome: "APPLIED" });
    expect(decideProviderDeliveryTransition("RTS", "RTS_QUEUED", { returnCnoteNo: "  " })).toMatchObject({ mappedStatus: "RTS_QUEUED", outcome: "UNCHANGED" });
    // A later plain RTS report is behind where the return stands: nothing new, not a conflict.
    expect(decideProviderDeliveryTransition("RTS", "RTS_IN_TRANSIT")).toMatchObject({ outcome: "UNCHANGED" });
    expect(decideProviderDeliveryTransition("RTS", "RTS_RECEIVED", { returnCnoteNo: "R1" })).toMatchObject({ outcome: "UNCHANGED" });
    expect(decideProviderDeliveryTransition("DELIVERED", "RTS_IN_TRANSIT").outcome).toBe("REFUSED");
    // The return resi never turns a delivery into a return.
    expect(decideProviderDeliveryTransition("DELIVERED", "ISSUED", { returnCnoteNo: "R1" })).toMatchObject({ mappedStatus: "DELIVERED" });
  });

  it("stores the return resi on the order and the observation, and a later pull without one keeps it", async () => {
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-RTS-1" });
    await pull(parsed([orderRecord("AWB-RTS-1", "RTS")]));
    expect(await statusOf(shipment)).toBe("RTS_QUEUED");

    const result = await pull(parsed([orderRecord("AWB-RTS-1", "RTS", { cnote_no_rts: "RTS-RESI-1" })]));
    expect(result.appliedTransitionCount).toBe(1);
    expect(await statusOf(shipment)).toBe("RTS_IN_TRANSIT");

    await pull(parsed([orderRecord("AWB-RTS-1", "RTS")]));
    expect(await statusOf(shipment)).toBe("RTS_IN_TRANSIT");
    const { rows: observations } = await adminPool.query(
      "SELECT cnote_no_rts, transition_outcome, mapped_status FROM provider_order_status_observations WHERE shipment_id = $1 ORDER BY observed_at, id",
      [shipment],
    );
    expect(observations).toEqual([
      { cnote_no_rts: null, transition_outcome: "APPLIED", mapped_status: "RTS_QUEUED" },
      { cnote_no_rts: "RTS-RESI-1", transition_outcome: "APPLIED", mapped_status: "RTS_IN_TRANSIT" },
      { cnote_no_rts: null, transition_outcome: "UNCHANGED", mapped_status: "RTS_QUEUED" },
    ]);

    // Both roles see the return resi on Retur and in Cek resi.
    for (const user of [adminA, operatorA]) {
      const page = await withTenantContext(appDb, user, tenantA, (tx, context) =>
        loadRtsShipmentsPage(tx, context, { page: 1, pageSize: 20, status: "ALL" }));
      expect(page.rows.map((row) => row.returnAwb), user).toEqual(["RTS-RESI-1"]);
      const lookup = await withTenantContext(appDb, user, tenantA, (tx, context) =>
        lookupShipmentByTrackingKey(tx, context, { awb: "AWB-RTS-1", prefix: null, tenantNumber: null }));
      expect(lookup?.returnAwb, user).toBe("RTS-RESI-1");
    }
  });
});

describe("T-238 tracking history", () => {
  it("appends each courier event once, readable by both roles and scoped to the tenant", async () => {
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-HIST-1" });
    const other = await seedIssuedShipment({ cnoteNo: "AWB-HIST-B", tenantId: tenantB });
    const record = orderRecord("AWB-HIST-1", "DELIVERED", {
      history: [{ date: "27-09-2026 08:30", desc: "Order Created" }, { date: "27-09-2026 12:00", desc: "On delivery" }],
      lastHistory: { date: "27-09-2026 15:00", desc: "Delivered" },
    });
    const first = await pull(parsed([record]));
    expect(first.historyEventCount).toBe(3);
    const second = await pull(parsed([record]));
    expect(second.historyEventCount).toBe(0);
    await pull(parsed([orderRecord("AWB-HIST-B", "DELIVERED", { lastHistory: { date: "27-09-2026 09:00", desc: "Tenant B event" } })]), tenantB);

    for (const user of [adminA, operatorA]) {
      const events = await withTenantContext(appDb, user, tenantA, (tx, context) => listProviderHistoryEvents(tx, context, shipment));
      expect(events.map((event) => event.description), user).toEqual(["Delivered", "On delivery", "Order Created"]);
      // Another tenant's shipment id yields nothing, even when asked for directly.
      expect(await withTenantContext(appDb, user, tenantA, (tx, context) => listProviderHistoryEvents(tx, context, other))).toEqual([]);
    }
    const lookup = await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      lookupShipmentByTrackingKey(tx, context, { awb: "AWB-HIST-1", prefix: null, tenantNumber: null }));
    expect(lookup?.historyEvents.map((event) => event.description)).toEqual(["Delivered", "On delivery", "Order Created"]);
    // The operator still cannot read the admin-only observations.
    expect(lookup?.observation).toBeNull();
  });

  it("is append-only and writable only by a Tenant Admin", async () => {
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-HIST-2" });
    await pull(parsed([orderRecord("AWB-HIST-2", "DELIVERED", { lastHistory: { date: "27-09-2026 15:00", desc: "Delivered" } })]));
    const attempt = (user: string, statement: SQL) =>
      withTenantContext(appDb, user, tenantA, (tx) => tx.execute(statement))
        .then(() => "accepted", (error) => error.cause?.code ?? error.code);
    const insert = (description: string) => sql`INSERT INTO provider_order_history_events
      (tenant_id, shipment_id, outlet_id, occurred_at, description, source)
      VALUES (${tenantA}, ${shipment}, ${outletA}, now(), ${description}, 'HISTORY')`;

    expect(await attempt(operatorA, insert("forged"))).toBe("42501");
    expect(await attempt(adminA, sql`UPDATE provider_order_history_events SET description = 'changed'`)).toBe("42501");
    expect(await attempt(adminA, sql`DELETE FROM provider_order_history_events`)).toBe("42501");
    expect(await attempt(adminA, insert("bad\u0007text"))).toBe("23514");
    expect(await attempt(adminA, insert("ok text"))).toBe("accepted");
  });

  it("shows history newest first on Detail and Cek resi without repeating what an observation shows", () => {
    const at = (iso: string) => new Date(iso);
    const timeline = buildTrackingTimeline({
      awb: "AWB-1",
      createdAt: at("2026-09-26T01:00:00Z"),
      historyEvents: [
        { description: "Delivered", occurredAt: at("2026-09-27T08:00:00Z") },
        { description: "Order Created", occurredAt: at("2026-09-26T02:00:00Z") },
      ],
      issuedAt: at("2026-09-26T01:30:00Z"),
      observations: [{
        lastHistoryAt: at("2026-09-27T08:00:00Z"), lastHistoryDesc: "Delivered", mappedStatus: "DELIVERED",
        observedAt: at("2026-09-27T09:00:00Z"), providerStatus: "DELIVERED",
      }],
    });
    expect(timeline.map((entry) => entry.title)).toEqual(["Terkirim", "Order Created", "Resi terbit", "Kiriman dibuat"]);
    expect(timeline[0].detail).toBe("Delivered");

    const cekResi = trackingTimeline({
      awb: "AWB-1", courier: "JNE", declaredValueIdr: 0, destinationAreaLabel: "X",
      historyEvents: [
        { description: "Delivered", occurredAtIso: "2026-09-27T08:00:00Z" },
        { description: "Order Created", occurredAtIso: "2026-09-26T02:00:00Z" },
      ],
      observation: null, paymentMethod: "NON_COD", providerCodAmountIdr: null, providerService: "JNE REG",
      publicReference: "GC-1", returnAwb: null, status: "DELIVERED", updatedAtIso: "2026-09-27T09:00:00Z",
    });
    expect(cekResi.map((entry) => `${entry.source}:${entry.title}`)).toEqual(["GeraiCUAN:Terkirim", "Kurir:Delivered", "Kurir:Order Created"]);

    const card = renderToStaticMarkup(createElement(TrackingResultCard, { result: {
      awb: "AWB-1", courier: "JNE", declaredValueIdr: 0, destinationAreaLabel: "X",
      historyEvents: [{ description: "Retur menuju pengirim", occurredAtIso: "2026-09-27T08:00:00Z" }],
      observation: null, paymentMethod: "NON_COD", providerCodAmountIdr: null, providerService: "JNE REG",
      publicReference: "GC-10001", returnAwb: "RTS-RESI-9", status: "RTS_IN_TRANSIT", updatedAtIso: "2026-09-27T09:00:00Z",
    } }));
    expect(card).toContain("RTS-RESI-9");
    expect(card).toContain("Retur menuju pengirim");
    expect(card).toContain("WIB · Kurir");
  });
});

describe("T-238 attention signals", () => {
  it("names only what Mengantar reported", () => {
    expect(attentionSignals(null)).toEqual([]);
    expect(attentionSignals({ claimStatus: null, isBreach: false, lastUndeliveredCode: null, podCode: null, ticketStatus: "none" })).toEqual([]);
    expect(attentionSignals({
      claimStatus: "statusDisapproved", isBreach: true, lastUndeliveredCode: "REJECTED", podCode: "402", ticketStatus: "Closed",
    }).map((signal) => `${signal.urgent ? "!" : ""}${signal.label}`)).toEqual([
      "!Melewati batas waktu kirim", "!Gagal antar terakhir: REJECTED", "Klaim ditolak", "Tiket: Closed", "Kode POD: 402",
    ]);
  });

  it("renders as badges, urgent ones on the warn surface, and nothing when there are none", () => {
    expect(renderToStaticMarkup(createElement(AttentionSignals, { signals: [] }))).toBe("");
    const html = renderToStaticMarkup(createElement(AttentionSignals, {
      signals: attentionSignals({ claimStatus: null, isBreach: true, lastUndeliveredCode: null, podCode: "402", ticketStatus: null }),
    }));
    expect(html).toContain("Catatan dari Mengantar");
    expect(html).toMatch(/bg-warn-surface[^>]*>Melewati batas waktu kirim</);
    expect(html).toMatch(/bg-muted[^>]*>Kode POD: 402</);
  });

  it("stores the fields on the pull observation", async () => {
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-SIG-1" });
    await pull(parsed([orderRecord("AWB-SIG-1", "DELIVERY PROBLEM", {
      isBreach: true, lastUndeliveredCode: "BAD ADDRESS", claimStatus: "statusPending", ticketStatus: "Replied", pod_code: "U05",
    })]));
    const { rows } = await adminPool.query(
      "SELECT is_breach, last_undelivered_code, claim_status, ticket_status, pod_code, source FROM provider_order_status_observations WHERE shipment_id = $1",
      [shipment],
    );
    expect(rows).toEqual([{
      is_breach: true, last_undelivered_code: "BAD ADDRESS", claim_status: "statusPending", ticket_status: "Replied", pod_code: "U05", source: "PULL",
    }]);
  });
});

describe("T-238 webhook ingestion (database path)", () => {
  it("decides in SQL exactly as decideProviderDeliveryTransition does", async () => {
    const mapped = [null, "IN_TRANSIT", "PROBLEM", "DELIVERED", "RTS_QUEUED", "RTS_IN_TRANSIT", "RTS_RECEIVED", "CANCELLED"] as const;
    const { rows } = await adminPool.query<{ current: string; mapped: string | null; outcome: string }>(
      `SELECT c AS current, m AS mapped, public.provider_delivery_outcome(c, m, true) AS outcome
         FROM unnest($1::text[]) c CROSS JOIN unnest($2::text[]) m`,
      [shipmentStatuses, mapped],
    );
    expect(rows).toHaveLength(shipmentStatuses.length * mapped.length);
    // A status whose single mapping is each target, so the TypeScript decision can be asked directly.
    const statusFor: Record<string, string> = {
      IN_TRANSIT: "ON DELIVERY", PROBLEM: "DELIVERY PROBLEM", DELIVERED: "DELIVERED", RTS_QUEUED: "RTS", RTS_IN_TRANSIT: "RTS",
      CANCELLED: "CANCELLED",
    };
    for (const row of rows) {
      if (row.mapped === "RTS_RECEIVED") {
        // No provider value maps to RTS_RECEIVED; the SQL graph still matches ALLOWED_TRANSITIONS.
        const allowed = ALLOWED_TRANSITIONS[row.current as keyof typeof ALLOWED_TRANSITIONS] ?? [];
        const expected = row.current === "RTS_RECEIVED" ? "UNCHANGED" : allowed.includes("RTS_RECEIVED") ? "APPLIED" : "REFUSED";
        expect(row.outcome, `${row.current} → RTS_RECEIVED`).toBe(expected);
        continue;
      }
      const decision = row.mapped === null
        ? decideProviderDeliveryTransition("PENDING PICKUP", row.current as never)
        : decideProviderDeliveryTransition(statusFor[row.mapped], row.current as never, { returnCnoteNo: row.mapped === "RTS_IN_TRANSIT" ? "R" : null });
      expect(row.outcome, `${row.current} → ${row.mapped}`).toBe(decision.outcome);
    }
    const { rows: [unknown] } = await adminPool.query("SELECT public.provider_delivery_outcome('ISSUED', NULL, false) AS outcome");
    expect(unknown.outcome).toBe("UNRECOGNISED");
    expect(PROVIDER_DELIVERY_TRANSITION_OUTCOMES).toContain("SUPERSEDED");
  });

  it("applies a signed delivery to the one matching shipment, idempotently, as the runtime role without a tenant context", async () => {
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-WH-1" });
    expect(await webhook("AWB-WH-1", "PICKED UP", "IN_TRANSIT", "2026-09-27T01:00:00Z")).toBe("APPLIED");
    expect(await statusOf(shipment)).toBe("IN_TRANSIT");
    // Mengantar retries a delivery it thinks failed: recorded once.
    expect(await webhook("AWB-WH-1", "PICKED UP", "IN_TRANSIT", "2026-09-27T01:00:00Z")).toBe("DUPLICATE");
    expect(await webhook("AWB-WH-1", "DELIVERED", "DELIVERED", "2026-09-27T05:00:00Z")).toBe("APPLIED");
    // An older delivery arriving late is recorded as history, neither applied nor a conflict.
    expect(await webhook("AWB-WH-1", "UNDELIVERED", "PROBLEM", "2026-09-27T03:00:00Z")).toBe("SUPERSEDED");
    expect(await statusOf(shipment)).toBe("DELIVERED");
    const { rows } = await adminPool.query(
      `SELECT provider_status, source, pull_id, from_status, mapped_status, transition_outcome
         FROM provider_order_status_observations WHERE shipment_id = $1 ORDER BY provider_event_at`,
      [shipment],
    );
    expect(rows).toEqual([
      { provider_status: "PICKED UP", source: "WEBHOOK", pull_id: null, from_status: "ISSUED", mapped_status: "IN_TRANSIT", transition_outcome: "APPLIED" },
      { provider_status: "UNDELIVERED", source: "WEBHOOK", pull_id: null, from_status: "DELIVERED", mapped_status: "PROBLEM", transition_outcome: "SUPERSEDED" },
      { provider_status: "DELIVERED", source: "WEBHOOK", pull_id: null, from_status: "IN_TRANSIT", mapped_status: "DELIVERED", transition_outcome: "APPLIED" },
    ]);
  });

  it("does not apply an allowed move older than a delivery already recorded", async () => {
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-WH-2" });
    expect(await webhook("AWB-WH-2", "UNDELIVERED", "PROBLEM", "2026-09-27T05:00:00Z")).toBe("APPLIED");
    expect(await webhook("AWB-WH-2", "RTS", "RTS_QUEUED", "2026-09-27T02:00:00Z")).toBe("SUPERSEDED");
    expect(await statusOf(shipment)).toBe("PROBLEM");
    expect(await webhook("AWB-WH-2", "SOMETHING NEW", null, "2026-09-27T06:00:00Z", false)).toBe("UNRECOGNISED");
    expect(await statusOf(shipment)).toBe("PROBLEM");
  });

  it("finds nothing outside the platform account or an active tenant", async () => {
    const privateShipment = await seedIssuedShipment({ cnoteNo: "AWB-PRIVATE", accountKey: privateKey });
    const suspended = await seedIssuedShipment({ cnoteNo: "AWB-SUSPENDED", tenantId: tenantB });
    await adminPool.query("UPDATE tenants SET status = 'SUSPENDED' WHERE id = $1", [tenantB]);
    expect(await webhook("AWB-PRIVATE", "DELIVERED", "DELIVERED", "2026-09-27T01:00:00Z")).toBe("NOT_FOUND");
    expect(await webhook("AWB-SUSPENDED", "DELIVERED", "DELIVERED", "2026-09-27T01:00:00Z")).toBe("NOT_FOUND");
    expect(await webhook("AWB-NOWHERE", "DELIVERED", "DELIVERED", "2026-09-27T01:00:00Z")).toBe("NOT_FOUND");
    expect(await statusOf(privateShipment)).toBe("ISSUED");
    expect(await statusOf(suspended)).toBe("ISSUED");
    const { rows } = await adminPool.query("SELECT count(*)::int AS total FROM provider_order_status_observations");
    expect(rows[0].total).toBe(0);
  });

  it("refuses invalid arguments and leaves the runtime role no direct write", async () => {
    await expect(webhook("AWB 1", "DELIVERED", "DELIVERED", "2026-09-27T01:00:00Z")).rejects.toMatchObject({ cause: { code: "22023" } });
    await expect(webhook("AWB-1", "DELIVERED", "DRAFT" as never, "2026-09-27T01:00:00Z")).rejects.toMatchObject({ cause: { code: "22023" } });
    await expect(webhook("AWB-1", "SOMETHING", "DELIVERED", "2026-09-27T01:00:00Z", false)).rejects.toMatchObject({ cause: { code: "22023" } });
    // Without a tenant context the runtime role sees and writes nothing itself.
    await expect(appPool.query(
      `INSERT INTO provider_order_status_observations (tenant_id, shipment_id, outlet_id, cnote_no, provider_status, source, provider_event_at)
       VALUES ($1, $1, $1, 'x', 'DELIVERED', 'WEBHOOK', now())`, [tenantA],
    )).rejects.toMatchObject({ code: "42501" });
    const { rows } = await adminPool.query<{ grantee: string }>(
      `SELECT grantee FROM information_schema.routine_privileges
        WHERE routine_name = 'record_mengantar_webhook_event' AND privilege_type = 'EXECUTE' ORDER BY grantee`,
    );
    expect(rows.map((row) => row.grantee)).toEqual(["geraicuan_app", "postgres"]);
  });
});

describe("T-238 CANCELLED (owner 2026-09-26)", () => {
  it("reaches CANCELLED only from ISSUED, IN_TRANSIT or PROBLEM, through the pull and the webhook", async () => {
    const pulled = await seedIssuedShipment({ cnoteNo: "AWB-CANCEL-1" });
    await pull(parsed([orderRecord("AWB-CANCEL-1", "CANCELLED")]));
    expect(await statusOf(pulled)).toBe("CANCELLED");

    const pushed = await seedIssuedShipment({ cnoteNo: "AWB-CANCEL-2" });
    expect(await webhook("AWB-CANCEL-2", "PICKED UP", "IN_TRANSIT", "2026-09-27T01:00:00Z")).toBe("APPLIED");
    expect(await webhook("AWB-CANCEL-2", "CANCELED", "CANCELLED", "2026-09-27T02:00:00Z")).toBe("APPLIED");
    expect(await statusOf(pushed)).toBe("CANCELLED");
    // Terminal: nothing later moves it.
    expect(await webhook("AWB-CANCEL-2", "DELIVERED", "DELIVERED", "2026-09-27T03:00:00Z")).toBe("REFUSED");

    const delivered = await seedIssuedShipment({ cnoteNo: "AWB-CANCEL-3" });
    expect(await webhook("AWB-CANCEL-3", "DELIVERED", "DELIVERED", "2026-09-27T01:00:00Z")).toBe("APPLIED");
    expect(await webhook("AWB-CANCEL-3", "CANCELLED", "CANCELLED", "2026-09-27T02:00:00Z")).toBe("REFUSED");
    const returned = await seedIssuedShipment({ cnoteNo: "AWB-CANCEL-4" });
    await pull(parsed([orderRecord("AWB-CANCEL-4", "RTS")]));
    await pull(parsed([orderRecord("AWB-CANCEL-4", "CANCELLED")]));
    expect([await statusOf(delivered), await statusOf(returned)]).toEqual(["DELIVERED", "RTS_QUEUED"]);
  });

  it("T-247 (M1): accepts Mengantar cancelling an unpaid order, in SQL and in TypeScript alike", async () => {
    // Neither path can match an unpaid order today (both key on the AWB, which an unpaid order
    // lacks — TASKS T-247 open item), so the decision is pinned where both paths take it.
    const { rows: [row] } = await adminPool.query(
      "SELECT public.provider_delivery_outcome('AWAITING_UPSTREAM_PAYMENT', 'CANCELLED', true) AS outcome");
    expect(row.outcome).toBe("APPLIED");
    expect(decideProviderDeliveryTransition("CANCELED", "AWAITING_UPSTREAM_PAYMENT")).toMatchObject({ mappedStatus: "CANCELLED", outcome: "APPLIED" });
  });

  it("refuses the label, records the blocked attempt as CANCELLED, and issues no new invoice", async () => {
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-CANCEL-5" });
    await pull(parsed([orderRecord("AWB-CANCEL-5", "CANCELLED")]));

    const refusal = await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      loadPrintableLabel(tx, context, shipment)).catch((error) => error);
    expect(refusal).toBeInstanceOf(LabelUnavailableError);
    expect(refusal.reason).toBe("CANCELLED");

    const attemptId = "00000000-0000-4238-8000-000000000001";
    const attempt = () => withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      appendPrintAttempt(tx, context, shipment, attemptId));
    expect(await attempt()).toMatchObject({ outcome: "BLOCKED", reason: "CANCELLED" });
    // Replayed, not duplicated.
    expect(await attempt()).toMatchObject({ outcome: "BLOCKED", reason: "CANCELLED" });
    const { rows } = await adminPool.query(
      "SELECT outcome, reason_code, sequence FROM print_events WHERE shipment_id = $1", [shipment]);
    expect(rows).toEqual([{ outcome: "BLOCKED", reason_code: "CANCELLED", sequence: null }]);

    // The runtime role cannot forge a PRINTED row for it either (0017 policy: shipment must be ISSUED).
    const forged = await withTenantContext(appDb, adminA, tenantA, (tx) => tx.execute(sql`
      INSERT INTO print_events (tenant_id, shipment_id, provider_order_snapshot_id, sequence, outcome, awb_snapshot, actor_user_id, actor_role)
      SELECT ${tenantA}, ${shipment}, id, 1, 'PRINTED', cnote_no, ${adminA}, 'TENANT_ADMIN'
      FROM provider_order_snapshots WHERE shipment_id = ${shipment}`)).then(() => "accepted", (error) => error.cause?.code);
    expect(forged).toBe("42501");

    // T-247 (L2): its own code, decided inside the insert statement.
    expect(await withTenantContext(appDb, adminA, tenantA, (tx, context) => issueShipmentInvoice(tx, context, shipment)))
      .toEqual({ ok: false, code: "CANCELLED" });
    const { rows: invoices } = await adminPool.query("SELECT count(*)::int AS total FROM shipment_invoices WHERE shipment_id = $1", [shipment]);
    expect(invoices[0].total).toBe(0);
  });

  it("lists a cancelled resi under Dibatalkan on Cetak resi, never under Semua resi", async () => {
    await seedIssuedShipment({ cnoteNo: "AWB-CANCEL-6" });
    await seedIssuedShipment({ cnoteNo: "AWB-KEEP-7" });
    await pull(parsed([orderRecord("AWB-CANCEL-6", "CANCELLED")]));
    const load = (printState: "semua" | "batal") => withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadLabelIndexPage(tx, context, { status: "issued", printState }));
    const all = await load("semua");
    expect(all.summary).toEqual({ "LBL-ALL": 1, "LBL-PRINTED": 0, "LBL-UNPRINTED": 1, "LBL-CANCELLED": 1 });
    expect(all.rows.map((row) => row.awb)).toEqual(["AWB-KEEP-7"]);
    expect((await load("batal")).rows.map((row) => row.awb)).toEqual(["AWB-CANCEL-6"]);
  });
});

describe("T-247 (L3) invoice logo snapshot", () => {
  function png(width: number) {
    const bytes = Buffer.alloc(40);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
    bytes.writeUInt32BE(13, 8);
    bytes.write("IHDR", 12, "ascii");
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(40, 20);
    return new Uint8Array(bytes);
  }
  const asAdmin = <T,>(work: Parameters<typeof withTenantContext<T>>[3]) => withTenantContext(appDb, adminA, tenantA, work);

  it("records the logo at issuance and keeps rendering it after the logo is replaced or removed", async () => {
    const first = await asAdmin((tx, context) => saveTenantLogo(tx, context, { bytes: png(100), declaredType: "image/png", name: "a.png" }));
    const shipment = await seedIssuedShipment({ cnoteNo: "AWB-LOGO-1" });
    const issued = await withTenantContext(appDb, operatorA, tenantA, (tx, context) => issueShipmentInvoice(tx, context, shipment));
    expect(issued).toMatchObject({ ok: true, invoice: { logoSha256: first.sha256 } });

    await asAdmin((tx, context) => saveTenantLogo(tx, context, { bytes: png(120), declaredType: "image/png", name: "b.png" }));
    await asAdmin(removeTenantLogo);
    const reread = await withTenantContext(appDb, operatorA, tenantA, (tx, context) => loadShipmentInvoice(tx, context, shipment));
    expect(reread?.logoSha256).toBe(first.sha256);
    // The version it names is still there for both roles of this tenant, and only this tenant.
    expect(await withTenantContext(appDb, operatorA, tenantA, (tx, context) => loadTenantLogoVersion(tx, context, first.sha256)))
      .toMatchObject({ mime: "image/png", sha256: first.sha256 });
    expect(await withTenantContext(appDb, adminB, tenantB, (tx, context) => loadTenantLogoVersion(tx, context, first.sha256))).toBeNull();

    // Issued with no logo on file: none recorded, none rendered.
    const later = await seedIssuedShipment({ cnoteNo: "AWB-LOGO-2" });
    expect(await asAdmin((tx, context) => issueShipmentInvoice(tx, context, later)))
      .toMatchObject({ ok: true, invoice: { logoSha256: null } });
  });
});
