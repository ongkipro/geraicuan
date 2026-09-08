import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  createContact,
  listContactAddresses,
  resolveActiveContactAddress,
  updateContactAddress,
} from "@/db/contact-repository";
import {
  appendEstimateSnapshot,
  loadLatestEstimateSnapshot,
} from "@/db/estimate-repository";
import {
  deriveProviderAccountKey,
  OrderBatchUnavailableError,
  prepareProviderBatches,
  type OrderConfirmation,
} from "@/db/order-batch-repository";
import { updateOutletReadiness } from "@/db/outlet-readiness-repository";
import * as schema from "@/db/schema";
import { createShipmentDraft } from "@/db/shipment-draft-repository";
import { withTenantContext } from "@/db/tenant-context";
import { buildMengantarOrderPayload } from "@/lib/mengantar-order";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("Integration database URLs are required.");
}
if (
  new URL(adminDatabaseUrl).pathname !== "/geraicuan_test"
  || new URL(appDatabaseUrl).pathname !== "/geraicuan_test"
) {
  throw new Error("Mengantar location authority tests require geraicuan_test.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const adminDb = drizzle({ client: adminPool, schema });
const appDb = drizzle({ client: appPool, schema });

const tenantId = "74000000-0000-4000-8000-000000000001";
const outletId = "74000000-0000-4000-8000-000000000011";
const adminId = "mengantar-authority-admin";
const operatorId = "mengantar-authority-operator";
const pickup = {
  id: "pickup-account-current",
  label: "Gudang Utama Bandung",
  originId: "origin-account-current",
  originLabel: "Coblong, Kota Bandung, Jawa Barat",
};
const destination = {
  id: "destination-provider-current",
  label: "Gambir, Jakarta Pusat, DKI Jakarta, 10110",
};

async function configureOutlet(next = pickup) {
  await withTenantContext(appDb, adminId, tenantId, (tx, context) =>
    updateOutletReadiness(tx, context, {
      outletId,
      defaultPickupAddressId: next.id,
      defaultPickupAddressLabel: next.label,
      defaultOriginAreaId: next.originId,
      defaultOriginAreaLabel: next.originLabel,
      connectionMode: "platform_default",
      expectedConnectionUpdatedAt: null,
    }));
}

async function createEstimatedContactShipment() {
  const contactId = await withTenantContext(appDb, operatorId, tenantId, (tx, context) =>
    createContact(tx, context, {
      address: "Jl. Tujuan Sintetis 10",
      addressLabel: "Alamat penerima",
      destinationAreaId: destination.id,
      destinationAreaLabel: destination.label,
      isRecipient: true,
      isSender: false,
      name: "Penerima Sintetis",
      phone: "080000000001",
    }));
  const [contactAddress] = await withTenantContext(
    appDb,
    operatorId,
    tenantId,
    (tx, context) => listContactAddresses(tx, context, contactId),
  );
  if (!contactAddress) throw new Error("Expected one contact address.");

  const recipient = await withTenantContext(appDb, operatorId, tenantId, (tx, context) =>
    resolveActiveContactAddress(tx, context, contactId, contactAddress.id, "RECIPIENT"));
  const shipmentId = await withTenantContext(appDb, operatorId, tenantId, (tx, context) =>
    createShipmentDraft(tx, context, {
      declaredValueIdr: 125_000, cogsAmountIdr: null,
      destinationAreaId: recipient.destinationAreaId ?? "",
      destinationAreaLabel: recipient.destinationAreaLabel ?? "",
      isCod: false,
      outletId,
      packageContent: "Barang uji sintetis",
      packageHeightCm: null,
      packageLengthCm: null,
      packageQuantity: 1,
      packageWeightGrams: 1_000,
      packageWidthCm: null,
      recipientAddress: recipient.address,
      recipientName: recipient.name,
      recipientPhone: recipient.phone,
      senderAddress: "Jl. Asal Sintetis 1",
      senderName: "Pengirim Sintetis",
      senderPhone: "080000000002",
    }));

  const snapshotId = await withTenantContext(appDb, operatorId, tenantId, (tx, context) =>
    appendEstimateSnapshot(tx, context, shipmentId, {
      credentialSource: "platform_default",
      destinationAreaId: destination.id,
      destinationAreaLabel: destination.label,
      isCodRequested: false,
      originAreaId: pickup.originId,
      weightGrams: 1_000,
    }, [{
      codEligible: true,
      currency: "IDR",
      deliveryEstimate: "2-3 days",
      insuranceAmountIdr: null,
      insuranceSourceField: null,
      providerService: "JNE REG",
      shippingAmountIdr: 15_000,
      shippingSourceField: "price",
    }]));
  const estimate = await withTenantContext(appDb, operatorId, tenantId, (tx, context) =>
    loadLatestEstimateSnapshot(tx, context, shipmentId));
  const estimateServiceId = estimate?.services[0]?.estimateServiceId;
  if (!estimateServiceId) throw new Error("Expected one persisted estimate service.");

  return {
    confirmation: { shipmentId, estimateSnapshotId: snapshotId, estimateServiceId },
    contactAddressId: contactAddress.id,
    contactId,
  };
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await adminPool.query(
    "TRUNCATE audit_events, provider_order_snapshots, provider_batches, shipment_cod_totals, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties, shipment_drafts, shipments, contact_addresses, contacts, mengantar_connections, outlets, memberships, tenants, users CASCADE",
  );
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'Mengantar Authority Admin', 'authority-admin@example.test'),
      ($2, 'Mengantar Authority Operator', 'authority-operator@example.test')`,
    [adminId, operatorId],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'Mengantar Authority Tenant', 'ACTIVE')",
    [tenantId],
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'TENANT_ADMIN'),
      ($1, $3, 'OPERATOR')`,
    [tenantId, adminId, operatorId],
  );
  await adminPool.query(
    "INSERT INTO outlets (id, tenant_id, name) VALUES ($1, $2, 'Authority Outlet')",
    [outletId, tenantId],
  );
  await configureOutlet();
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("Mengantar location authority milestone", () => {
  it("preserves one provider destination pair and current-account pickup through order payload construction", async () => {
    const { confirmation, contactAddressId, contactId } = await createEstimatedContactShipment();

    await withTenantContext(appDb, operatorId, tenantId, (tx, context) =>
      updateContactAddress(tx, context, contactId, contactAddressId, {
        address: "Jl. Tujuan Sintetis 11",
        addressLabel: "Alamat penerima diperbarui",
        destinationArea: {
          id: "destination-provider-newer",
          label: "Coblong, Kota Bandung, Jawa Barat, 40135",
        },
      }));

    const [prepared] = await withTenantContext(appDb, operatorId, tenantId, (tx, context) =>
      prepareProviderBatches(
        tx,
        context,
        [confirmation],
        async () => deriveProviderAccountKey("platform_default"),
      ));
    if (!prepared?.orders[0]) throw new Error("Expected one prepared provider order.");
    const payload = buildMengantarOrderPayload(prepared.orders);

    const [contactAddress] = await adminDb
      .select({
        destinationAreaId: schema.contactAddresses.destinationAreaId,
        destinationAreaLabel: schema.contactAddresses.destinationAreaLabel,
      })
      .from(schema.contactAddresses)
      .where(eq(schema.contactAddresses.id, contactAddressId));
    const [draft] = await adminDb
      .select({
        destinationAreaId: schema.shipmentDrafts.destinationAreaId,
        destinationAreaLabel: schema.shipmentDrafts.destinationAreaLabel,
      })
      .from(schema.shipmentDrafts)
      .where(eq(schema.shipmentDrafts.shipmentId, confirmation.shipmentId));
    const [recipientParty] = await adminDb
      .select({
        destinationAreaId: schema.shipmentParties.destinationAreaId,
        destinationAreaLabel: schema.shipmentParties.destinationAreaLabel,
      })
      .from(schema.shipmentParties)
      .where(and(
        eq(schema.shipmentParties.shipmentId, confirmation.shipmentId),
        eq(schema.shipmentParties.role, "RECIPIENT"),
      ));
    const [estimate] = await adminDb
      .select({
        destinationAreaId: schema.shipmentEstimateSnapshots.destinationAreaId,
        destinationAreaLabel: schema.shipmentEstimateSnapshots.destinationAreaLabel,
        originAreaId: schema.shipmentEstimateSnapshots.originAreaId,
      })
      .from(schema.shipmentEstimateSnapshots)
      .where(eq(schema.shipmentEstimateSnapshots.id, confirmation.estimateSnapshotId));
    const [order] = await adminDb
      .select({
        destinationAreaId: schema.providerOrderSnapshots.destinationAreaId,
        destinationAreaLabel: schema.providerOrderSnapshots.destinationAreaLabel,
      })
      .from(schema.providerOrderSnapshots)
      .where(eq(schema.providerOrderSnapshots.shipmentId, confirmation.shipmentId));

    expect(contactAddress).toEqual({
      destinationAreaId: "destination-provider-newer",
      destinationAreaLabel: "Coblong, Kota Bandung, Jawa Barat, 40135",
    });
    for (const persisted of [draft, recipientParty, estimate, order]) {
      expect(persisted).toMatchObject({
        destinationAreaId: destination.id,
        destinationAreaLabel: destination.label,
      });
    }
    expect(estimate?.originAreaId).toBe(pickup.originId);
    expect(prepared).toMatchObject({
      credentialSource: "platform_default",
      outletId,
      pickupAddressId: pickup.id,
    });
    expect(prepared.orders[0]).toMatchObject({
      destinationAreaId: destination.id,
      destinationAreaLabel: destination.label,
      pickupAddressId: pickup.id,
    });
    expect(payload).toEqual([expect.objectContaining({
      destination_id: destination.id,
      pickup_address_id: pickup.id,
    })]);
  });

  it("fails closed before order snapshot creation when outlet location authority becomes stale", async () => {
    const { confirmation } = await createEstimatedContactShipment();
    await configureOutlet({
      id: "pickup-account-replaced",
      label: "Gudang Pengganti",
      originId: "origin-account-replaced",
      originLabel: "Cicendo, Kota Bandung, Jawa Barat",
    });

    await expect(withTenantContext(appDb, operatorId, tenantId, (tx, context) =>
      prepareProviderBatches(
        tx,
        context,
        [confirmation] satisfies OrderConfirmation[],
        async () => deriveProviderAccountKey("platform_default"),
      ))).rejects.toBeInstanceOf(OrderBatchUnavailableError);

    const snapshots = await adminDb
      .select({ id: schema.providerOrderSnapshots.id })
      .from(schema.providerOrderSnapshots);
    expect(snapshots).toEqual([]);
  });
});
