import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { contactAddresses, contacts } from "@/db/schema";
import type { ContactDirectoryInput } from "@/lib/contact-directory";

export class ContactUnavailableError extends Error {
  constructor() {
    super("Contact is unavailable.");
  }
}

export class ContactArchiveDeniedError extends Error {
  constructor() {
    super("Only tenant administrators can archive contacts.");
  }
}

export async function createContact(
  tx: TenantTransaction,
  context: TenantContext,
  input: ContactDirectoryInput,
) {
  const created = await tx
    .insert(contacts)
    .values({
      isRecipient: input.isRecipient,
      isSender: input.isSender,
      name: input.name,
      phone: input.phone,
      tenantId: context.tenantId,
    })
    .returning({ id: contacts.id });
  const contact = created[0];
  if (!contact) throw new Error("Contact was not created.");

  await tx.insert(contactAddresses).values({
    address: input.address,
    contactId: contact.id,
    destinationAreaId: input.destinationAreaId,
    destinationAreaLabel: input.destinationAreaLabel,
    isPrimary: true,
    label: input.addressLabel,
    tenantId: context.tenantId,
  });
  return contact.id;
}

export async function listContacts(
  tx: TenantTransaction,
  context: TenantContext,
  query: string,
) {
  return tx
    .select({
      archivedAt: contacts.archivedAt,
      id: contacts.id,
      isRecipient: contacts.isRecipient,
      isSender: contacts.isSender,
      name: contacts.name,
      phone: contacts.phone,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, context.tenantId),
        isNull(contacts.archivedAt),
        query ? or(ilike(contacts.name, `%${query}%`), ilike(contacts.phone, `%${query}%`)) : undefined,
      ),
    )
    .orderBy(asc(contacts.name), asc(contacts.createdAt));
}

export async function getContact(
  tx: TenantTransaction,
  context: TenantContext,
  contactId: string,
) {
  const rows = await tx
    .select({
      archivedAt: contacts.archivedAt,
      id: contacts.id,
      isRecipient: contacts.isRecipient,
      isSender: contacts.isSender,
      name: contacts.name,
      phone: contacts.phone,
      updatedAt: contacts.updatedAt,
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, context.tenantId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listContactAddresses(
  tx: TenantTransaction,
  context: TenantContext,
  contactId: string,
) {
  return tx
    .select({
      address: contactAddresses.address,
      archivedAt: contactAddresses.archivedAt,
      destinationAreaId: contactAddresses.destinationAreaId,
      destinationAreaLabel: contactAddresses.destinationAreaLabel,
      id: contactAddresses.id,
      isPrimary: contactAddresses.isPrimary,
      label: contactAddresses.label,
    })
    .from(contactAddresses)
    .where(
      and(
        eq(contactAddresses.contactId, contactId),
        eq(contactAddresses.tenantId, context.tenantId),
      ),
    )
    .orderBy(sql`${contactAddresses.isPrimary} DESC`, asc(contactAddresses.createdAt));
}

export async function addContactAddress(
  tx: TenantTransaction,
  context: TenantContext,
  contactId: string,
  input: Pick<
    ContactDirectoryInput,
    "address" | "addressLabel" | "destinationAreaId" | "destinationAreaLabel"
  >,
) {
  const contact = await getContact(tx, context, contactId);
  if (!contact || contact.archivedAt) throw new ContactUnavailableError();
  const currentAddresses = await listContactAddresses(tx, context, contactId);
  if (currentAddresses.filter((address) => !address.archivedAt).length >= 20) {
    throw new ContactUnavailableError();
  }
  const created = await tx
    .insert(contactAddresses)
    .values({
      address: input.address,
      contactId,
      destinationAreaId: input.destinationAreaId,
      destinationAreaLabel: input.destinationAreaLabel,
      isPrimary: currentAddresses.every((address) => address.archivedAt),
      label: input.addressLabel,
      tenantId: context.tenantId,
    })
    .returning({ id: contactAddresses.id });
  return created[0]?.id;
}

export async function updateContact(
  tx: TenantTransaction,
  context: TenantContext,
  contactId: string,
  input: Pick<ContactDirectoryInput, "isRecipient" | "isSender" | "name" | "phone">,
) {
  const updated = await tx
    .update(contacts)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, context.tenantId)))
    .returning({ id: contacts.id });
  if (updated.length !== 1) throw new ContactUnavailableError();
}

export async function resolveActiveContactAddress(
  tx: TenantTransaction,
  context: TenantContext,
  contactId: string,
  addressId: string,
  role: "SENDER" | "RECIPIENT",
) {
  const rows = await tx
    .select({
      address: contactAddresses.address,
      destinationAreaId: contactAddresses.destinationAreaId,
      destinationAreaLabel: contactAddresses.destinationAreaLabel,
      isRecipient: contacts.isRecipient,
      isSender: contacts.isSender,
      name: contacts.name,
      phone: contacts.phone,
    })
    .from(contacts)
    .innerJoin(
      contactAddresses,
      and(
        eq(contactAddresses.contactId, contacts.id),
        eq(contactAddresses.tenantId, contacts.tenantId),
      ),
    )
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.tenantId, context.tenantId),
        isNull(contacts.archivedAt),
        eq(contactAddresses.id, addressId),
        isNull(contactAddresses.archivedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row || (role === "SENDER" ? !row.isSender : !row.isRecipient)) {
    throw new ContactUnavailableError();
  }
  return row;
}

export async function archiveContact(
  tx: TenantTransaction,
  context: TenantContext,
  contactId: string,
) {
  if (context.role !== "TENANT_ADMIN") throw new ContactArchiveDeniedError();
  const updated = await tx
    .update(contacts)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.tenantId, context.tenantId),
        isNull(contacts.archivedAt),
      ),
    )
    .returning({ id: contacts.id });
  if (updated.length !== 1) throw new ContactUnavailableError();
}
