"use server";

import { redirect } from "next/navigation";

import {
  addContactAddress,
  archiveContact,
  ContactArchiveDeniedError,
  ContactUnavailableError,
  updateContact,
} from "@/db/contact-repository";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { normalizePartyPhone } from "@/lib/shipment-draft";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ADDRESS_LABEL_LENGTH = 60;
const MAX_ADDRESS_LENGTH = 500;
const MAX_AREA_LENGTH = 160;
const MAX_NAME_LENGTH = 120;

type IdentityField = "contactName" | "contactPhone" | "roles";
type AddressField = "addressLabel" | "addressText" | "areaId" | "areaLabel";

function readText(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function requireContactId(formData: FormData) {
  const contactId = formData.get("contactId");
  if (typeof contactId === "string" && UUID_PATTERN.test(contactId)) return contactId;
  redirect("/app/kontak/tidak-ditemukan");
}

async function requireTenantPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  return principal;
}

function redirectWithFieldErrors(
  contactId: string,
  parameter: "alamatGagal" | "ubahGagal",
  fields: readonly string[],
): never {
  const query = new URLSearchParams({ [parameter]: fields.join(",") });
  redirect(`/app/kontak/${contactId}?${query.toString()}`);
}

function validateIdentity(formData: FormData) {
  const name = readText(formData, "contactName");
  const phone = normalizePartyPhone(readText(formData, "contactPhone"));
  const isRecipient = formData.get("roleRecipient") === "on";
  const isSender = formData.get("roleSender") === "on";
  const fields: IdentityField[] = [];

  if (!name || name.length > MAX_NAME_LENGTH) fields.push("contactName");
  if (!phone) fields.push("contactPhone");
  if (!isSender && !isRecipient) fields.push("roles");

  if (fields.length > 0 || !phone) return { fields, ok: false as const };
  return {
    input: { isRecipient, isSender, name, phone },
    ok: true as const,
  };
}

function validateAddress(formData: FormData) {
  const address = readText(formData, "addressText");
  const addressLabel = readText(formData, "addressLabel");
  const destinationAreaId = readText(formData, "areaId");
  const destinationAreaLabel = readText(formData, "areaLabel");
  const fields: AddressField[] = [];

  if (!addressLabel || addressLabel.length > MAX_ADDRESS_LABEL_LENGTH) {
    fields.push("addressLabel");
  }
  if (!address || address.length > MAX_ADDRESS_LENGTH) fields.push("addressText");
  if (
    (destinationAreaId && !destinationAreaLabel) ||
    (!destinationAreaId && destinationAreaLabel)
  ) {
    fields.push("areaLabel");
  } else {
    if (destinationAreaId.length > MAX_AREA_LENGTH) fields.push("areaId");
    if (destinationAreaLabel.length > MAX_AREA_LENGTH) fields.push("areaLabel");
  }

  if (fields.length > 0) return { fields, ok: false as const };
  return {
    input: {
      address,
      addressLabel,
      destinationAreaId: destinationAreaId || null,
      destinationAreaLabel: destinationAreaLabel || null,
    },
    ok: true as const,
  };
}

export async function updateContactAction(formData: FormData) {
  const principal = await requireTenantPrincipal();
  const contactId = requireContactId(formData);
  const validation = validateIdentity(formData);
  if (!validation.ok) {
    redirectWithFieldErrors(contactId, "ubahGagal", validation.fields);
  }

  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      updateContact(tx, context, contactId, validation.input),
    );
  } catch (error) {
    if (error instanceof ContactUnavailableError) redirect(`/app/kontak/${contactId}`);
    throw error;
  }
  redirect(`/app/kontak/${contactId}?disimpan=1`);
}

export async function addContactAddressAction(formData: FormData) {
  const principal = await requireTenantPrincipal();
  const contactId = requireContactId(formData);
  const validation = validateAddress(formData);
  if (!validation.ok) {
    redirectWithFieldErrors(contactId, "alamatGagal", validation.fields);
  }

  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      addContactAddress(tx, context, contactId, validation.input),
    );
  } catch (error) {
    if (error instanceof ContactUnavailableError) {
      redirect(`/app/kontak/${contactId}?alamatGagal=tidakTersedia#alamat-heading`);
    }
    throw error;
  }
  redirect(`/app/kontak/${contactId}?alamatDisimpan=1#alamat`);
}

export async function archiveContactAction(formData: FormData) {
  const principal = await requireTenantPrincipal();
  const contactId = requireContactId(formData);

  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      archiveContact(tx, context, contactId),
    );
  } catch (error) {
    if (
      error instanceof ContactArchiveDeniedError ||
      error instanceof ContactUnavailableError
    ) {
      redirect(`/app/kontak/${contactId}?arsipGagal=1`);
    }
    throw error;
  }
  redirect(`/app/kontak/${contactId}?diarsipkan=1`);
}
