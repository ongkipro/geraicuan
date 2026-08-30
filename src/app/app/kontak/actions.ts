"use server";

import { redirect } from "next/navigation";

import { createContact } from "@/db/contact-repository";
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
  values?: ContactValues;
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

export async function saveContact(
  _previousState: CreateContactState,
  formData: FormData,
): Promise<CreateContactState> {
  const validation = validateContactDirectory(formData);
  const values = valuesFrom(formData);
  if (!validation.ok) return { errors: validation.errors, values };

  const principal = await requireTenantPrincipal();
  const contactId = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => createContact(tx, context, validation.input),
  );
  redirect(`/app/kontak/${contactId}?dibuat=1`);
}
