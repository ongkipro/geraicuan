import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { contactAddresses, contacts } from "@/db/schema";
import type { ContactDirectoryInput } from "@/lib/contact-directory";
import type { ContactStatusFilter } from "@/lib/contact-role-filter";

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

export class ContactAddressLabelConflictError extends Error {
  constructor() {
    super("Contact address label is already in use.");
  }
}

function isContactAddressLabelConflict(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { cause?: unknown; code?: unknown; constraint?: unknown };
    if (
      candidate.code === "23505" &&
      candidate.constraint === "contact_addresses_contact_label_key"
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
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
  status: "active" | "archived" = "active",
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
        status === "archived" ? isNotNull(contacts.archivedAt) : isNull(contacts.archivedAt),
        query ? or(ilike(contacts.name, `%${query}%`), ilike(contacts.phone, `%${query}%`)) : undefined,
      ),
    )
    .orderBy(asc(contacts.name), asc(contacts.createdAt));
}

export type ContactDirectoryRole = "all" | "recipient" | "sender";

export type ContactDirectoryRow = {
  address: string | null;
  addressCount: number;
  archivedAt: Date | null;
  destinationAreaLabel: string | null;
  id: string;
  isRecipient: boolean;
  isSender: boolean;
  name: string;
  phone: string;
};

/**
 * T-167: the Kontak directory row, filtered by role (`contacts.is_sender` /
 * `is_recipient` — a dual-role contact matches both `sender` and `recipient`)
 * and carrying the contact's primary address, falling back to the newest
 * active address when none is marked primary. `addressCount` is every active
 * address so the caller can render "+N alamat" beyond the one shown here.
 */
function contactRoleFilter(role: ContactDirectoryRole) {
  return role === "sender"
    ? eq(contacts.isSender, true)
    : role === "recipient"
      ? eq(contacts.isRecipient, true)
      : undefined;
}

/** One definition of the archived boundary, shared by the list and its counts. */
function contactStatusFilter(status: ContactStatusFilter) {
  if (status === "all") return undefined;
  return status === "archived"
    ? isNotNull(contacts.archivedAt)
    : isNull(contacts.archivedAt);
}

export async function listContactDirectory(
  tx: TenantTransaction,
  context: TenantContext,
  input: { query: string; role: ContactDirectoryRole; status: ContactStatusFilter },
): Promise<ContactDirectoryRow[]> {
  const roleFilter = contactRoleFilter(input.role);
  const contactRows = await tx
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
        contactStatusFilter(input.status),
        roleFilter,
        input.query
          ? or(ilike(contacts.name, `%${input.query}%`), ilike(contacts.phone, `%${input.query}%`))
          : undefined,
      ),
    )
    .orderBy(asc(contacts.name), asc(contacts.createdAt));
  if (contactRows.length === 0) return [];

  const contactIds = contactRows.map((row) => row.id);
  const [primaryAddressRows, addressCountRows] = await Promise.all([
    tx
      .selectDistinctOn([contactAddresses.contactId], {
        address: contactAddresses.address,
        contactId: contactAddresses.contactId,
        destinationAreaLabel: contactAddresses.destinationAreaLabel,
      })
      .from(contactAddresses)
      .where(
        and(
          eq(contactAddresses.tenantId, context.tenantId),
          inArray(contactAddresses.contactId, contactIds),
          isNull(contactAddresses.archivedAt),
        ),
      )
      // DISTINCT ON keeps the first row per contact under this order: the
      // primary address when one exists, else the newest active address. `id`
      // breaks the tie a multi-row insert creates, because `now()` is one value
      // per statement and leaves several addresses sharing `created_at`.
      .orderBy(asc(contactAddresses.contactId), sql`${contactAddresses.isPrimary} DESC`, desc(contactAddresses.createdAt), asc(contactAddresses.id)),
    tx
      .select({ contactId: contactAddresses.contactId, total: count() })
      .from(contactAddresses)
      .where(
        and(
          eq(contactAddresses.tenantId, context.tenantId),
          inArray(contactAddresses.contactId, contactIds),
          isNull(contactAddresses.archivedAt),
        ),
      )
      .groupBy(contactAddresses.contactId),
  ]);
  const addressByContact = new Map(primaryAddressRows.map((row) => [row.contactId, row]));
  const countByContact = new Map(addressCountRows.map((row) => [row.contactId, row.total]));

  return contactRows.map((row) => {
    const primary = addressByContact.get(row.id);
    return {
      ...row,
      address: primary?.address ?? null,
      addressCount: countByContact.get(row.id) ?? 0,
      destinationAreaLabel: primary?.destinationAreaLabel ?? null,
    };
  });
}

export async function countActiveContacts(
  tx: TenantTransaction,
  context: TenantContext,
) {
  const [row] = await tx
    .select({ total: count() })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, context.tenantId),
        isNull(contacts.archivedAt),
      ),
    );
  return row?.total ?? 0;
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
  const [contact] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.tenantId, context.tenantId),
        isNull(contacts.archivedAt),
      ),
    )
    .limit(1)
    .for("update");
  if (!contact) throw new ContactUnavailableError();

  const [addressCount] = await tx
    .select({ total: count() })
    .from(contactAddresses)
    .where(
      and(
        eq(contactAddresses.contactId, contactId),
        eq(contactAddresses.tenantId, context.tenantId),
        isNull(contactAddresses.archivedAt),
      ),
    );
  if ((addressCount?.total ?? 0) >= 20) {
    throw new ContactUnavailableError();
  }

  try {
    const created = await tx
      .insert(contactAddresses)
      .values({
        address: input.address,
        contactId,
        destinationAreaId: input.destinationAreaId,
        destinationAreaLabel: input.destinationAreaLabel,
        isPrimary: (addressCount?.total ?? 0) === 0,
        label: input.addressLabel,
        tenantId: context.tenantId,
      })
      .returning({ id: contactAddresses.id });
    return created[0]?.id;
  } catch (error) {
    if (isContactAddressLabelConflict(error)) {
      throw new ContactAddressLabelConflictError();
    }
    throw error;
  }
}

export async function hasActiveContactAddressMutationTarget(
  tx: TenantTransaction,
  context: TenantContext,
  contactId: string,
  addressId?: string,
) {
  if (!addressId) {
    const rows = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.tenantId, context.tenantId),
          isNull(contacts.archivedAt),
        ),
      )
      .limit(1);
    return rows.length === 1;
  }
  const rows = await tx
    .select({ id: contactAddresses.id })
    .from(contactAddresses)
    .innerJoin(
      contacts,
      and(
        eq(contacts.id, contactAddresses.contactId),
        eq(contacts.tenantId, contactAddresses.tenantId),
      ),
    )
    .where(
      and(
        eq(contactAddresses.id, addressId),
        eq(contactAddresses.contactId, contactId),
        eq(contactAddresses.tenantId, context.tenantId),
        isNull(contactAddresses.archivedAt),
        isNull(contacts.archivedAt),
      ),
    )
    .limit(1);
  return rows.length === 1;
}

export async function updateContactAddress(
  tx: TenantTransaction,
  context: TenantContext,
  contactId: string,
  addressId: string,
  input: Pick<ContactDirectoryInput, "address" | "addressLabel"> & {
    destinationArea?: { id: string; label: string } | null;
  },
) {
  const [current] = await tx
    .select({
      destinationAreaId: contactAddresses.destinationAreaId,
      destinationAreaLabel: contactAddresses.destinationAreaLabel,
    })
    .from(contactAddresses)
    .innerJoin(
      contacts,
      and(
        eq(contacts.id, contactAddresses.contactId),
        eq(contacts.tenantId, contactAddresses.tenantId),
      ),
    )
    .where(
      and(
        eq(contactAddresses.id, addressId),
        eq(contactAddresses.contactId, contactId),
        eq(contactAddresses.tenantId, context.tenantId),
        isNull(contactAddresses.archivedAt),
        isNull(contacts.archivedAt),
      ),
    )
    .limit(1)
    .for("update", { of: [contactAddresses] });
  if (!current) throw new ContactUnavailableError();
  const destinationAreaId = input.destinationArea === undefined
    ? current.destinationAreaId
    : input.destinationArea?.id ?? null;
  const destinationAreaLabel = input.destinationArea === undefined
    ? current.destinationAreaLabel
    : input.destinationArea?.label ?? null;

  try {
    const updated = await tx
      .update(contactAddresses)
      .set({
        address: input.address,
        destinationAreaId,
        destinationAreaLabel,
        label: input.addressLabel,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contactAddresses.id, addressId),
          eq(contactAddresses.contactId, contactId),
          eq(contactAddresses.tenantId, context.tenantId),
          isNull(contactAddresses.archivedAt),
        ),
      )
      .returning({ id: contactAddresses.id });
    if (updated.length !== 1) throw new ContactUnavailableError();
  } catch (error) {
    if (isContactAddressLabelConflict(error)) {
      throw new ContactAddressLabelConflictError();
    }
    throw error;
  }
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
      addressUpdatedAt: contactAddresses.updatedAt,
      contactUpdatedAt: contacts.updatedAt,
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
    .limit(1)
    .for("share", { of: [contacts, contactAddresses] });
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

export type ContactDirectorySummary = {
  "CON-ACTIVE": number;
  "CON-ALL": number;
  "CON-ARCHIVED": number;
};

/**
 * PR-52: the Kontak directory and its state panel in one pass.
 *
 * The counts carry the same tenant, role and search scope as the rows, so an
 * entry's number equals the number of rows choosing it returns. The tenant
 * predicate is the table's own column, never row-level security alone.
 */
export async function loadContactDirectoryPage(
  tx: TenantTransaction,
  context: TenantContext,
  input: { query: string; role: ContactDirectoryRole; status: ContactStatusFilter },
): Promise<{ rows: ContactDirectoryRow[]; summary: ContactDirectorySummary }> {
  const [summaryRow] = await tx
    .select({
      active: sql<number>`count(*) FILTER (WHERE ${contacts.archivedAt} IS NULL)::int`.mapWith(Number),
      all: sql<number>`count(*)::int`.mapWith(Number),
      archived: sql<number>`count(*) FILTER (WHERE ${contacts.archivedAt} IS NOT NULL)::int`.mapWith(Number),
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, context.tenantId),
        contactRoleFilter(input.role),
        input.query
          ? or(ilike(contacts.name, `%${input.query}%`), ilike(contacts.phone, `%${input.query}%`))
          : undefined,
      ),
    );

  const rows = await listContactDirectory(tx, context, input);

  return {
    rows,
    summary: {
      "CON-ACTIVE": summaryRow?.active ?? 0,
      "CON-ALL": summaryRow?.all ?? 0,
      "CON-ARCHIVED": summaryRow?.archived ?? 0,
    },
  };
}
