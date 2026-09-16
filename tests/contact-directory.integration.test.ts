import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  addContactAddress,
  archiveContact,
  countActiveContacts,
  ContactAddressLabelConflictError,
  ContactArchiveDeniedError,
  ContactUnavailableError,
  createContact,
  getContact,
  listContactAddresses,
  listContactDirectory,
  listContacts,
  resolveActiveContactAddress,
  updateContact,
  updateContactAddress,
} from "@/db/contact-repository";
import { createShipmentDraft } from "@/db/shipment-draft-repository";
import { validateShipmentDraft } from "@/lib/shipment-draft";
import { withTenantContext } from "@/db/tenant-context";
import * as schema from "@/db/schema";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) throw new Error("Integration database URLs are required.");
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const adminDb = drizzle({ client: adminPool, schema });
let capturedStatements: string[] = [];
const appDb = drizzle({
  client: appPool,
  schema,
  logger: { logQuery: (query) => { capturedStatements.push(query); } },
});
const tenantA = "00000000-0000-0000-0000-000000000401";
const tenantB = "00000000-0000-0000-0000-000000000402";
const userAdmin = "contact-admin";
const outletA = "00000000-0000-0000-0000-000000000411";
const userOperator = "contact-operator";
const userOther = "contact-other";
const userOtherAdmin = "contact-other-admin";

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
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await adminPool.query("TRUNCATE contact_addresses, contacts, memberships, tenants, users CASCADE");
  await adminPool.query(
    "INSERT INTO users (id,name,email) VALUES ($1,$2,$3),($4,$5,$6),($7,$8,$9),($10,$11,$12)",
    [userAdmin, "Contact Admin", "contact-admin@example.test", userOperator, "Contact Operator", "contact-operator@example.test", userOther, "Contact Other", "contact-other@example.test", userOtherAdmin, "Contact Other Admin", "contact-other-admin@example.test"],
  );
  await adminPool.query(
    "INSERT INTO tenants (id,name,status) VALUES ($1,$2,'ACTIVE'),($3,$4,'ACTIVE')",
    [tenantA, "Contact Tenant A", tenantB, "Contact Tenant B"],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id,user_id,role) VALUES ($1,$2,'TENANT_ADMIN'),($1,$3,'OPERATOR'),($4,$5,'OPERATOR'),($4,$6,'TENANT_ADMIN')",
    [tenantA, userAdmin, userOperator, tenantB, userOther, userOtherAdmin],
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
    await adminPool.query(
      `INSERT INTO contacts (tenant_id, name, phone, is_sender, is_recipient)
       VALUES ($1, 'Kontak Tenant B', '081200000002', true, true)`,
      [tenantB],
    );
    const [contact] = await adminDb.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.tenantId, tenantA));
    if (!contact) throw new Error("Fixture contact is missing.");

    const crossTenant = await withTenantContext(appDb, userOther, tenantB, (tx, context) =>
      getContact(tx, context, contact.id),
    );
    expect(crossTenant).toBeNull();
    const [tenantAActive, tenantBActive] = await Promise.all([
      withTenantContext(appDb, userOperator, tenantA, countActiveContacts),
      withTenantContext(appDb, userOther, tenantB, countActiveContacts),
    ]);
    expect(tenantAActive).toBe(1);
    expect(tenantBActive).toBe(1);
    await expect(
      withTenantContext(appDb, userOperator, tenantA, (tx, context) => archiveContact(tx, context, contact.id)),
    ).rejects.toBeInstanceOf(ContactArchiveDeniedError);
    await withTenantContext(appDb, userAdmin, tenantA, (tx, context) => archiveContact(tx, context, contact.id));
    const active = await withTenantContext(appDb, userOperator, tenantA, (tx, context) => listContacts(tx, context, ""));
    expect(active).toEqual([]);
    const activeCount = await withTenantContext(appDb, userOperator, tenantA, countActiveContacts);
    expect(activeCount).toBe(0);
  });

  it("supports zero, one, and many addresses while assigning only the first address as primary", async () => {
    const [bareContact] = await adminDb
      .insert(schema.contacts)
      .values({
        isRecipient: true,
        isSender: false,
        name: "Kontak Tanpa Alamat",
        phone: "081200000010",
        tenantId: tenantA,
      })
      .returning({ id: schema.contacts.id });
    if (!bareContact) throw new Error("Bare contact fixture was not created.");

    const initial = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      listContactAddresses(tx, context, bareContact.id),
    );
    expect(initial).toEqual([]);

    await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      addContactAddress(tx, context, bareContact.id, {
        address: "Jl. Alamat Pertama 1",
        addressLabel: "Alamat pertama",
        destinationAreaId: null,
        destinationAreaLabel: null,
      }),
    );
    const one = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      listContactAddresses(tx, context, bareContact.id),
    );
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ isPrimary: true, label: "Alamat pertama" });

    await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      addContactAddress(tx, context, bareContact.id, {
        address: "Jl. Alamat Kedua 2",
        addressLabel: "Alamat kedua",
        destinationAreaId: "3171010",
        destinationAreaLabel: "Gambir, Jakarta Pusat",
      }),
    );
    const many = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      listContactAddresses(tx, context, bareContact.id),
    );
    expect(many).toHaveLength(2);
    expect(many.filter(({ isPrimary }) => isPrimary)).toHaveLength(1);
  });

  it("updates only an active tenant-owned address and keeps the canonical area pair atomic", async () => {
    const contactId = await withTenantContext(appDb, userAdmin, tenantA, (tx, context) =>
      createContact(tx, context, {
        ...input,
        addressLabel: "Alamat sebelum edit",
        name: "Kontak Edit Alamat",
        phone: "081200000030",
      }),
    );
    const [address] = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      listContactAddresses(tx, context, contactId),
    );
    if (!address) throw new Error("Address fixture was not created.");

    await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      updateContactAddress(tx, context, contactId, address.id, {
        address: "Jl. Alamat Sesudah Edit 2",
        addressLabel: "Alamat sesudah edit",
        destinationArea: {
          id: "area-provider-2",
          label: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
        },
      }),
    );
    const [updated] = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      listContactAddresses(tx, context, contactId),
    );
    expect(updated).toMatchObject({
      address: "Jl. Alamat Sesudah Edit 2",
      destinationAreaId: "area-provider-2",
      destinationAreaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
      label: "Alamat sesudah edit",
    });

    await expect(withTenantContext(appDb, userOther, tenantB, (tx, context) =>
      updateContactAddress(tx, context, contactId, address.id, {
        address: "Cross tenant",
        addressLabel: "Cross tenant",
      }),
    )).rejects.toBeInstanceOf(ContactUnavailableError);

    await withTenantContext(appDb, userAdmin, tenantA, (tx, context) =>
      archiveContact(tx, context, contactId),
    );
    await expect(withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      updateContactAddress(tx, context, contactId, address.id, {
        address: "Archived mutation",
        addressLabel: "Archived mutation",
      }),
    )).rejects.toBeInstanceOf(ContactUnavailableError);
  });

  it("serializes concurrent additions at the twenty-address cap and rejects further writes", async () => {
    const contactId = await withTenantContext(appDb, userAdmin, tenantA, (tx, context) =>
      createContact(tx, context, {
        ...input,
        addressLabel: "Alamat batas 1",
        name: "Kontak Batas Alamat",
        phone: "081200000020",
      }),
    );
    for (let index = 2; index <= 19; index += 1) {
      await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
        addContactAddress(tx, context, contactId, {
          address: `Jl. Batas Alamat ${index}`,
          addressLabel: `Alamat batas ${index}`,
          destinationAreaId: null,
          destinationAreaLabel: null,
        }),
      );
    }

    const concurrent = await Promise.allSettled([
      withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
        addContactAddress(tx, context, contactId, {
          address: "Jl. Batas Alamat 20A",
          addressLabel: "Alamat batas 20A",
          destinationAreaId: null,
          destinationAreaLabel: null,
        }),
      ),
      withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
        addContactAddress(tx, context, contactId, {
          address: "Jl. Batas Alamat 20B",
          addressLabel: "Alamat batas 20B",
          destinationAreaId: null,
          destinationAreaLabel: null,
        }),
      ),
    ]);
    expect(concurrent.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = concurrent.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.any(ContactUnavailableError) });

    const atCap = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      listContactAddresses(tx, context, contactId),
    );
    expect(atCap.filter(({ archivedAt }) => !archivedAt)).toHaveLength(20);
    await expect(
      withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
        addContactAddress(tx, context, contactId, {
          address: "Jl. Melebihi Batas 21",
          addressLabel: "Alamat batas 21",
          destinationAreaId: null,
          destinationAreaLabel: null,
        }),
      ),
    ).rejects.toBeInstanceOf(ContactUnavailableError);
    const afterDenied = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      listContactAddresses(tx, context, contactId),
    );
    expect(afterDenied.filter(({ archivedAt }) => !archivedAt)).toHaveLength(20);
  });

  it("maps a duplicate address label to a safe domain error without a partial write", async () => {
    const contactId = await withTenantContext(appDb, userAdmin, tenantA, (tx, context) =>
      createContact(tx, context, {
        ...input,
        name: "Kontak Label Duplikat",
        phone: "081200000030",
      }),
    );

    await expect(
      withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
        addContactAddress(tx, context, contactId, {
          address: "Alamat yang tidak boleh tersimpan",
          addressLabel: input.addressLabel,
          destinationAreaId: null,
          destinationAreaLabel: null,
        }),
      ),
    ).rejects.toBeInstanceOf(ContactAddressLabelConflictError);
    const addresses = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      listContactAddresses(tx, context, contactId),
    );
    expect(addresses).toHaveLength(1);
    expect(addresses[0]).toMatchObject({ address: input.address, label: input.addressLabel });
  });

  it("rejects updates to archived contacts and leaves the stored identity unchanged", async () => {
    const contactId = await withTenantContext(appDb, userAdmin, tenantA, (tx, context) =>
      createContact(tx, context, {
        ...input,
        name: "Kontak Arsip Tetap",
        phone: "081200000040",
      }),
    );
    await withTenantContext(appDb, userAdmin, tenantA, (tx, context) =>
      archiveContact(tx, context, contactId),
    );
    const before = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      getContact(tx, context, contactId),
    );

    await expect(
      withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
        updateContact(tx, context, contactId, {
          isRecipient: false,
          isSender: true,
          name: "Identitas yang ditolak",
          phone: "081299999999",
        }),
      ),
    ).rejects.toBeInstanceOf(ContactUnavailableError);
    const after = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      getContact(tx, context, contactId),
    );
    expect(after).toEqual(before);
  });

  it("rejects cross-tenant update, address, and archive mutations without changing the target", async () => {
    const contactId = await withTenantContext(appDb, userAdmin, tenantA, (tx, context) =>
      createContact(tx, context, {
        ...input,
        name: "Kontak Tenant A Terlindungi",
        phone: "081200000050",
      }),
    );
    const beforeContact = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      getContact(tx, context, contactId),
    );
    const beforeAddresses = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      listContactAddresses(tx, context, contactId),
    );

    await expect(
      withTenantContext(appDb, userOtherAdmin, tenantB, (tx, context) =>
        updateContact(tx, context, contactId, {
          isRecipient: false,
          isSender: true,
          name: "Mutasi lintas tenant",
          phone: "081299999998",
        }),
      ),
    ).rejects.toBeInstanceOf(ContactUnavailableError);
    await expect(
      withTenantContext(appDb, userOtherAdmin, tenantB, (tx, context) =>
        addContactAddress(tx, context, contactId, {
          address: "Alamat lintas tenant",
          addressLabel: "Lintas tenant",
          destinationAreaId: null,
          destinationAreaLabel: null,
        }),
      ),
    ).rejects.toBeInstanceOf(ContactUnavailableError);
    await expect(
      withTenantContext(appDb, userOtherAdmin, tenantB, (tx, context) =>
        archiveContact(tx, context, contactId),
      ),
    ).rejects.toBeInstanceOf(ContactUnavailableError);

    const afterContact = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      getContact(tx, context, contactId),
    );
    const afterAddresses = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      listContactAddresses(tx, context, contactId),
    );
    expect(afterContact).toEqual(beforeContact);
    expect(afterAddresses).toEqual(beforeAddresses);
  });

  it("preserves shipment party name, phone, and address after contact archival", async () => {
    const contactId = await withTenantContext(appDb, userAdmin, tenantA, (tx, context) =>
      createContact(tx, context, {
        ...input,
        address: "Jl. Snapshot Arsip 60",
        addressLabel: "Snapshot arsip",
        name: "Kontak Snapshot Arsip",
        phone: "081200000060",
      }),
    );
    const [address] = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      listContactAddresses(tx, context, contactId),
    );
    if (!address) throw new Error("Snapshot address fixture is missing.");
    const selected = await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      resolveActiveContactAddress(tx, context, contactId, address.id, "RECIPIENT"),
    );
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
    const beforeArchive = await adminDb
      .select({
        address: schema.shipmentParties.address,
        name: schema.shipmentParties.name,
        phone: schema.shipmentParties.phone,
        role: schema.shipmentParties.role,
      })
      .from(schema.shipmentParties)
      .where(eq(schema.shipmentParties.shipmentId, shipmentId));

    await withTenantContext(appDb, userAdmin, tenantA, (tx, context) =>
      archiveContact(tx, context, contactId),
    );
    const afterArchive = await adminDb
      .select({
        address: schema.shipmentParties.address,
        name: schema.shipmentParties.name,
        phone: schema.shipmentParties.phone,
        role: schema.shipmentParties.role,
      })
      .from(schema.shipmentParties)
      .where(eq(schema.shipmentParties.shipmentId, shipmentId));
    expect(afterArchive).toEqual(beforeArchive);
    expect(afterArchive).toEqual(expect.arrayContaining([
      expect.objectContaining({ address: selected.address, name: selected.name, phone: selected.phone }),
    ]));
  });

  // T-167: /app/kontak's `peran` views over is_sender / is_recipient, and the
  // directory row's primary-or-newest address with its missing-area state.
  it("returns exactly the contacts holding each peran, a dual-role contact in both, and the primary-or-newest address per row", async () => {
    const senderOnly = await withTenantContext(appDb, userAdmin, tenantA, (tx, context) =>
      createContact(tx, context, {
        ...input,
        address: "Jl. T167 Pengirim 1",
        addressLabel: "T167 pengirim",
        destinationAreaLabel: "Kelurahan T167, Kecamatan T167, Kota T167, Provinsi T167, 40111",
        isRecipient: false,
        isSender: true,
        name: "T167 Kontak Pengirim",
        phone: "081200000101",
      }),
    );
    const recipientOnly = await withTenantContext(appDb, userAdmin, tenantA, (tx, context) =>
      createContact(tx, context, {
        ...input,
        address: "Jl. T167 Penerima 1",
        addressLabel: "T167 penerima",
        destinationAreaLabel: null,
        isRecipient: true,
        isSender: false,
        name: "T167 Kontak Penerima",
        phone: "081200000102",
      }),
    );
    const dualRole = await withTenantContext(appDb, userAdmin, tenantA, (tx, context) =>
      createContact(tx, context, {
        ...input,
        address: "Jl. T167 Dua Peran 1",
        addressLabel: "T167 dua peran utama",
        destinationAreaLabel: "Kelurahan T167 Dua, Kecamatan T167 Dua, Kota T167 Dua, Provinsi T167",
        isRecipient: true,
        isSender: true,
        name: "T167 Kontak Dua Peran",
        phone: "081200000103",
      }),
    );
    // A second, later address on the dual-role contact: addressCount counts
    // every active address, and "+N alamat" (rendered by the page) is that
    // count minus the one primary address shown in the row.
    await withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
      addContactAddress(tx, context, dualRole, {
        address: "Jl. T167 Dua Peran 2",
        addressLabel: "T167 dua peran kedua",
        destinationAreaId: null,
        destinationAreaLabel: null,
      }),
    );

    // Historic data can carry no primary flag at all (e.g. rows written
    // before the primary rule existed): the newest active address wins.
    const [fallbackContact] = await adminDb
      .insert(schema.contacts)
      .values({ isRecipient: true, isSender: false, name: "T167 Kontak Fallback", phone: "081200000104", tenantId: tenantA })
      .returning({ id: schema.contacts.id });
    if (!fallbackContact) throw new Error("Fallback contact fixture was not created.");
    await adminDb.insert(schema.contactAddresses).values([
      {
        address: "Jl. T167 Fallback Lama",
        contactId: fallbackContact.id,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        destinationAreaLabel: "Kelurahan Lama, Kecamatan Lama, Kota Lama, Provinsi Lama, 40222",
        isPrimary: false,
        label: "T167 fallback lama",
        tenantId: tenantA,
      },
      {
        address: "Jl. T167 Fallback Baru",
        contactId: fallbackContact.id,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        destinationAreaLabel: "Kelurahan Baru, Kecamatan Baru, Kota Baru, Provinsi Baru, 40333",
        isPrimary: false,
        label: "T167 fallback baru",
        tenantId: tenantA,
      },
    ]);

    const [sender, recipient, all] = await Promise.all([
      withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
        listContactDirectory(tx, context, { query: "T167", role: "sender", status: "active" }),
      ),
      withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
        listContactDirectory(tx, context, { query: "T167", role: "recipient", status: "active" }),
      ),
      withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
        listContactDirectory(tx, context, { query: "T167", role: "all", status: "active" }),
      ),
    ]);

    expect(sender.map((row) => row.id).sort()).toEqual([senderOnly, dualRole].sort());
    expect(recipient.map((row) => row.id).sort()).toEqual([recipientOnly, dualRole, fallbackContact.id].sort());
    expect(all.map((row) => row.id).sort()).toEqual([senderOnly, recipientOnly, dualRole, fallbackContact.id].sort());

    const dualRow = all.find((row) => row.id === dualRole);
    expect(dualRow).toMatchObject({
      address: "Jl. T167 Dua Peran 1",
      addressCount: 2,
      destinationAreaLabel: "Kelurahan T167 Dua, Kecamatan T167 Dua, Kota T167 Dua, Provinsi T167",
    });

    const recipientRow = all.find((row) => row.id === recipientOnly);
    expect(recipientRow).toMatchObject({ address: "Jl. T167 Penerima 1", addressCount: 1, destinationAreaLabel: null });

    const fallbackRow = all.find((row) => row.id === fallbackContact.id);
    expect(fallbackRow).toMatchObject({
      address: "Jl. T167 Fallback Baru",
      addressCount: 2,
      destinationAreaLabel: "Kelurahan Baru, Kecamatan Baru, Kota Baru, Provinsi Baru, 40333",
    });
  });

  /**
   * T-167 review: `now()` resolves once per statement, so a multi-row insert
   * (a CSV import creating several addresses for one contact) leaves them
   * sharing `created_at`. Ordering only by (is_primary, created_at) leaves the
   * winner unspecified, and the directory can show a different address on a
   * later read of unchanged data. The tie has to be broken in SQL.
   */
  it("breaks a tie on primary and created_at deterministically", async () => {
    const [contact] = await adminDb
      .insert(schema.contacts)
      .values({ isRecipient: true, isSender: false, name: "T167 Kontak Seri", phone: "081200000105", tenantId: tenantA })
      .returning({ id: schema.contacts.id });
    if (!contact) throw new Error("Tie fixture contact was not created.");
    // One statement, so both rows take the same now(); neither is primary.
    await adminDb.insert(schema.contactAddresses).values(
      ["Seri A", "Seri B"].map((label) => ({
        address: `Jl. T167 ${label}`,
        contactId: contact.id,
        isPrimary: false,
        label: `T167 ${label.toLowerCase()}`,
        tenantId: tenantA,
      })),
    );
    const stored = await adminDb
      .select({ createdAt: schema.contactAddresses.createdAt })
      .from(schema.contactAddresses)
      .where(eq(schema.contactAddresses.contactId, contact.id));
    expect(new Set(stored.map((row) => row.createdAt.toISOString())).size, "the fixture must really tie")
      .toBe(1);

    capturedStatements = [];
    const reads = await Promise.all([1, 2].map(() =>
      withTenantContext(appDb, userOperator, tenantA, (tx, context) =>
        listContactDirectory(tx, context, { query: "T167 Kontak Seri", role: "all", status: "active" }),
      ),
    ));
    expect(reads[0]?.[0]?.address).toBe(reads[1]?.[0]?.address);

    const distinctOn = capturedStatements.find((statement) => /distinct on/i.test(statement));
    expect(distinctOn, "the directory resolves the shown address with DISTINCT ON").toBeTruthy();
    expect(distinctOn ?? "", distinctOn ?? "")
      .toMatch(/order by[\s\S]*"contact_addresses"\."id"/i);
  });
});
