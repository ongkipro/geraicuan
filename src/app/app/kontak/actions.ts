"use server";

import { redirect } from "next/navigation";

import { createContact, listContacts } from "@/db/contact-repository";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { validateContactDirectory } from "@/lib/contact-directory";

const CONTACT_FIELDS = [
  "contactName",
  "contactPhone",
  "roleSender",
  "roleRecipient",
  "addressLabel",
  "addressText",
  "areaLabel",
  "areaId",
] as const;

type ContactValues = Partial<Record<(typeof CONTACT_FIELDS)[number], string>>;

export type CreateContactState = {
  errors?: Record<string, string>;
  message?: string;
  successId?: string;
  values?: ContactValues;
};

export type SafeContactSearchRow = {
  archived: boolean;
  id: string;
  isRecipient: boolean;
  isSender: boolean;
  name: string;
  phoneMasked: string;
};

export type ContactSearchState = {
  error?: string;
  rows: SafeContactSearchRow[];
  searched: boolean;
};

function valuesFrom(formData: FormData): ContactValues {
  return Object.fromEntries(
    CONTACT_FIELDS.flatMap((field) => {
      const value = formData.get(field);
      return typeof value === "string" ? [[field, value]] : [];
    }),
  );
}

async function requireTenantPrincipal() {
  try {
    const principal = await requireCmsScope("tenant");
    if (principal.scope !== "tenant") redirect("/login/tenant");
    return principal;
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
}

function maskPhone(phone: string) {
  return phone.length <= 7
    ? `${"•".repeat(Math.max(0, phone.length - 2))}${phone.slice(-2)}`
    : `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

function safeSearchRows(rows: Awaited<ReturnType<typeof listContacts>>): SafeContactSearchRow[] {
  return rows.map((contact) => ({
    archived: Boolean(contact.archivedAt),
    id: contact.id,
    isRecipient: contact.isRecipient,
    isSender: contact.isSender,
    name: contact.name,
    phoneMasked: maskPhone(contact.phone),
  }));
}

export async function searchContacts(
  _previousState: ContactSearchState,
  formData: FormData,
): Promise<ContactSearchState> {
  const principal = await requireTenantPrincipal();
  const requestedQuery = formData.get("q");
  const requestedStatus = formData.get("status");
  const query = typeof requestedQuery === "string" ? requestedQuery.trim() : "";
  const status = requestedStatus === "archived" ? "archived" : "active";
  if (query && (query.length < 2 || query.length > 80)) {
    return {
      error: query.length < 2
        ? "Kata kunci minimal 2 karakter."
        : "Kata kunci maksimal 80 karakter.",
      rows: [],
      searched: true,
    };
  }
  const rows = await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    listContacts(tx, context, query, status),
  );
  return { rows: safeSearchRows(rows), searched: Boolean(query) };
}

export async function saveContact(
  _previousState: CreateContactState,
  formData: FormData,
): Promise<CreateContactState> {
  const principal = await requireTenantPrincipal();
  const validation = validateContactDirectory(formData);
  const values = valuesFrom(formData);
  if (!validation.ok) return { errors: validation.errors, values };

  const contactId = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => createContact(tx, context, validation.input),
  );
  return { message: "Kontak tersimpan dan siap dipakai pada draf baru.", successId: contactId };
}
