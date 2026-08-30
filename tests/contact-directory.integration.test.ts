import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  archiveContact,
  ContactArchiveDeniedError,
  createContact,
  getContact,
  listContactAddresses,
  listContacts,
  resolveActiveContactAddress,
  updateContact,
} from "@/db/contact-repository";
import { createShipmentDraft } from "@/db/shipment-draft-repository";
import { validateShipmentDraft } from "@/lib/shipment-draft";
import { withTenantContext } from "@/db/tenant-context";
import * as schema from "@/db/schema";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) throw new Error("Integration database URLs are required.");
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const adminDb = drizzle({ client: adminPool, schema });
const appDb = drizzle({ client: appPool, schema });
const tenantA = "00000000-0000-0000-0000-000000000401";
const tenantB = "00000000-0000-0000-0000-000000000402";
const userAdmin = "contact-admin";
const outletA = "00000000-0000-0000-0000-000000000411";
const userOperator = "contact-operator";
const userOther = "contact-other";

const input = {
  address: "Jl. Kontak 1",
  addressLabel: "Gudang Jakarta",
  destinationAreaId: "3171010",
  destinationAreaLabel: "Gambir, Jakarta Pusat",
  isRecipient: true,
  isSender: true,
  name: "Kontak Contoh",
  phone: "081212345678",
};

beforeAll(async () => {
  await adminPool.query("DROP ROLE IF EXISTS geraicuan_test_runtime");
  await adminPool.query("CREATE ROLE geraicuan_test_runtime LOGIN INHERIT IN ROLE geraicuan_app");
  await adminPool.query("TRUNCATE contact_addresses, contacts, memberships, tenants, users CASCADE");
  await adminPool.query(
    "INSERT INTO users (id,name,email) VALUES ($1,$2,$3),($4,$5,$6),($7,$8,$9)",
    [userAdmin, "Contact Admin", "contact-admin@example.test", userOperator, "Contact Operator", "contact-operator@example.test", userOther, "Contact Other", "contact-other@example.test"],
  );
  await adminPool.query(
    "INSERT INTO tenants (id,name,status) VALUES ($1,$2,'ACTIVE'),($3,$4,'ACTIVE')",
    [tenantA, "Contact Tenant A", tenantB, "Contact Tenant B"],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id,user_id,role) VALUES ($1,$2,'TENANT_ADMIN'),($1,$3,'OPERATOR'),($4,$5,'OPERATOR')",
    [tenantA, userAdmin, userOperator, tenantB, userOther],
  );
  await adminPool.query(
    "INSERT INTO outlets (id,tenant_id,name,default_pickup_address_id,default_origin_area_id) VALUES ($1,$2,$3,$4,$5)",
    [outletA, tenantA, "Contact Outlet A", "contact-pickup", "contact-origin"],
  );
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("tenant contact directory", () => {
  it("creates searchable multi-role contacts and preserves independent snapshots", async () => {
    const contactId = await withTenantContext(appDb, userAdmin, tenantA, (tx, context) =>
      createContact(tx, context, input),
    );
    const addresses = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      listContactAddresses(tx, context, contactId),
    );
    const found = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      listContacts(tx, context, "Contoh"),
    );

    expect(addresses).toHaveLength(1);
    expect(addresses[0]).toMatchObject({ isPrimary: true, label: "Gudang Jakarta" });
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ id: contactId, isRecipient: true, isSender: true })]));

    const selected = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      resolveActiveContactAddress(tx, context, contactId, addresses[0].id, "RECIPIENT"),
    );
    expect(selected).toMatchObject({ address: input.address, name: input.name, phone: input.phone });

    const draftForm = new FormData();
    for (const [field, value] of Object.entries({
      declaredValue: "150000",
      destinationAreaId: selected.destinationAreaId ?? "3171010",
      destinationAreaLabel: selected.destinationAreaLabel ?? "Gambir, Jakarta Pusat",
      outletId: outletA,
      packageContent: "Pakaian",
      packageHeightCm: "",
      packageLengthCm: "",
      packageQuantity: "1",
      packageWeightGrams: "500",
      packageWidthCm: "",
      paymentType: "NON_COD",
      recipientAddress: selected.address,
      recipientName: selected.name,
      recipientPhone: selected.phone,
      senderAddress: selected.address,
      senderName: selected.name,
      senderPhone: selected.phone,
    })) draftForm.set(field, value);
    const draft = validateShipmentDraft(draftForm);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const shipmentId = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      createShipmentDraft(tx, context, draft.input),
    );
    const beforeEdit = await adminDb
      .select({ name: schema.shipmentParties.name, phone: schema.shipmentParties.phone })
      .from(schema.shipmentParties)
      .where(eq(schema.shipmentParties.shipmentId, shipmentId));

    await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      updateContact(tx, context, contactId, {
        isRecipient: true,
        isSender: false,
        name: "Kontak Baru",
        phone: "+6281212345678",
      }),
    );
    const afterEdit = await adminDb
      .select({ name: schema.shipmentParties.name, phone: schema.shipmentParties.phone })
      .from(schema.shipmentParties)
      .where(eq(schema.shipmentParties.shipmentId, shipmentId));
    expect(afterEdit).toEqual(beforeEdit);
  });

  it("enforces tenant scope and Tenant Admin archive control", async () => {
    const [contact] = await adminDb.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.tenantId, tenantA));
    if (!contact) throw new Error("Fixture contact is missing.");

    const crossTenant = await withTenantContext(appDb, userOther, tenantB, (tx, context) =>
      getContact(tx, context, contact.id),
    );
    expect(crossTenant).toBeNull();
    await expect(
      withTenantContext(appDb, userOperator, tenantA, (tx, context) => archiveContact(tx, context, contact.id)),
    ).rejects.toBeInstanceOf(ContactArchiveDeniedError);
    await withTenantContext(appDb, userAdmin, tenantA, (tx, context) => archiveContact(tx, context, contact.id));
    const active = await withTenantContext(appDb, userOperator, tenantA, (tx, context) => listContacts(tx, context, ""));
    expect(active).toEqual([]);
  });
});
