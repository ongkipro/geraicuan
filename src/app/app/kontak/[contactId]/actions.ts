"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { validateMengantarDestinationAreaSelection } from "@/app/app/location-actions";
import {
  addContactAddress,
  archiveContact,
  ContactAddressLabelConflictError,
  ContactArchiveDeniedError,
  ContactUnavailableError,
  hasActiveContactAddressMutationTarget,
  updateContact,
  updateContactAddress,
} from "@/db/contact-repository";
import { db } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import {
  withTenantContext,
  type TenantContext,
  type TenantTransaction,
} from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { contactAddressErrors, contactIdentityErrors } from "@/lib/contact-directory";
import {
  CONTACT_ROLE_NAME_CONFLICT_MESSAGE,
  CONTACT_ROLES_CARD,
  DEFAULT_CONTACT_ROLE,
  parseContactRole,
} from "@/lib/contact-role-filter";
import { normalizeFieldText, validate } from "@/lib/field-character-classes";
import {
  lockMengantarAccountAuthority,
  MengantarConfigurationError,
  sameMengantarAccountAuthority,
} from "@/lib/mengantar-credentials";
import { normalizePartyPhone } from "@/lib/shipment-draft";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AREA_LENGTH = 160;

type IdentityField = "contactName" | "contactPhone" | "roles";
type AddressField = "addressLabel" | "addressText" | "areaId" | "areaLabel";

type IdentityValues = Partial<Record<"contactName" | "contactPhone" | "roleRecipient" | "roleSender", string>>;
type AddressValues = Partial<Record<"addressLabel" | "addressText" | "areaId" | "areaLabel", string>>;

export type ContactIdentityState = {
  errors?: Partial<Record<IdentityField, string>>;
  message?: string;
  success?: boolean;
  values?: IdentityValues;
};

export type ContactAddressState = {
  areaQuery?: { outletId: string; query: string };
  errors?: Partial<Record<AddressField, string>>;
  message?: string;
  selectedArea?: {
    areaId: string;
    areaLabel: string;
    outletId: string;
    query: string;
  };
  success?: boolean;
  values?: AddressValues;
};

export type ContactArchiveState = { error?: string };

function readText(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? normalizeFieldText(value) : "";
}

function requireContactId(formData: FormData) {
  const contactId = formData.get("contactId");
  if (typeof contactId === "string" && UUID_PATTERN.test(contactId)) return contactId;
  redirect("/app/kontak/tidak-ditemukan");
}

function requireAddressId(formData: FormData) {
  const addressId = formData.get("addressId");
  if (typeof addressId === "string" && UUID_PATTERN.test(addressId)) return addressId;
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

function identityValues(formData: FormData): IdentityValues {
  return {
    contactName: readText(formData, "contactName"),
    contactPhone: readText(formData, "contactPhone"),
    roleRecipient: formData.get("roleRecipient") === "on" ? "on" : "",
    roleSender: formData.get("roleSender") === "on" ? "on" : "",
  };
}

function addressValues(formData: FormData): AddressValues {
  return {
    addressLabel: readText(formData, "addressLabel"),
    addressText: readText(formData, "addressText"),
    areaId: readText(formData, "areaId"),
    areaLabel: readText(formData, "areaLabel"),
  };
}

function validateIdentity(formData: FormData) {
  const name = readText(formData, "contactName");
  const rawPhone = readText(formData, "contactPhone");
  const phone = normalizePartyPhone(rawPhone);
  const isRecipient = formData.get("roleRecipient") === "on";
  const isSender = formData.get("roleSender") === "on";
  const errors: Partial<Record<IdentityField, string>> = contactIdentityErrors(name, rawPhone, { isSender });
  if (!isSender && !isRecipient) errors.roles = "Pilih minimal satu peran kontak.";
  else if (
    formData.get("card") === CONTACT_ROLES_CARD
    && errors.contactName
    && !isSender
    && name.length > 0
    && name.length <= 120
    && validate("BUSINESS_NAME", name)
  ) {
    // Unticking Pengirim made the stored store name break the person-name rule.
    delete errors.contactName;
    errors.roles = CONTACT_ROLE_NAME_CONFLICT_MESSAGE;
  }

  if (Object.keys(errors).length > 0 || !phone) return { errors, ok: false as const };
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
  const errors: Partial<Record<AddressField, string>> = contactAddressErrors(addressLabel, address);
  if (
    (destinationAreaId && !destinationAreaLabel) ||
    (!destinationAreaId && destinationAreaLabel)
  ) {
    errors.areaLabel = "Cari dan pilih ulang area tujuan.";
  } else {
    if (destinationAreaId.length > MAX_AREA_LENGTH) errors.areaId = "Pilih area tujuan yang valid.";
    if (destinationAreaLabel.length > MAX_AREA_LENGTH) errors.areaLabel = "Cari dan pilih ulang area tujuan.";
  }

  if (Object.keys(errors).length > 0) return { errors, ok: false as const };
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

async function validateSelectedArea(
  principal: Awaited<ReturnType<typeof requireTenantPrincipal>>,
  formData: FormData,
) {
  const outletId = readText(formData, "areaOutletId");
  const query = readText(formData, "areaQuery");
  const areaId = readText(formData, "areaId");
  const areaLabel = readText(formData, "areaLabel");
  if (!outletId || !query || !areaId || !areaLabel) {
    return { message: "Cari dan pilih area tujuan Mengantar.", ok: false as const };
  }
  const outletReady = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    async (tx, context) => (await listReadyShipmentOutlets(tx, context))
      .some((outlet) => outlet.id === outletId),
  );
  if (!outletReady) {
    return { message: "Outlet tidak siap atau tidak tersedia.", ok: false as const };
  }
  const authority = await validateMengantarDestinationAreaSelection(
    outletId,
    query,
    areaId,
    areaLabel,
  );
  if (!authority.success || !authority.option) {
    return {
      message: authority.message ?? "Cari dan pilih ulang area tujuan.",
      ok: false as const,
    };
  }
  if (!authority.authority) {
    return {
      message: "Koneksi Mengantar berubah. Cari dan pilih ulang area tujuan.",
      ok: false as const,
    };
  }
  return {
    authority: authority.authority,
    ok: true as const,
    option: authority.option,
    outletId,
  };
}

function hasAreaSelectionPart(formData: FormData) {
  return ["areaOutletId", "areaQuery", "areaId", "areaLabel"]
    .some((field) => Boolean(readText(formData, field)));
}

function selectedAreaState(
  formData: FormData,
  option: { areaId: string; areaLabel: string },
) {
  return {
    ...option,
    outletId: readText(formData, "areaOutletId"),
    query: readText(formData, "areaQuery"),
  };
}

async function requireCurrentSelectedAreaAuthority(
  tx: TenantTransaction,
  context: TenantContext,
  selection: Extract<Awaited<ReturnType<typeof validateSelectedArea>>, { ok: true }>,
) {
  const current = await lockMengantarAccountAuthority(
    tx,
    context,
    selection.outletId,
  );
  if (!sameMengantarAccountAuthority(selection.authority, current)) {
    throw new MengantarConfigurationError();
  }
}

export async function updateContactAction(
  _previousState: ContactIdentityState,
  formData: FormData,
): Promise<ContactIdentityState> {
  const principal = await requireTenantPrincipal();
  const contactId = requireContactId(formData);
  const validation = validateIdentity(formData);
  if (!validation.ok) {
    return { errors: validation.errors, message: "Periksa data kontak.", values: identityValues(formData) };
  }

  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      updateContact(tx, context, contactId, validation.input),
    );
  } catch (error) {
    if (error instanceof ContactUnavailableError) return { message: "Kontak tidak tersedia atau sudah diarsipkan." };
    throw error;
  }
  revalidatePath(`/app/kontak/${contactId}`);
  return { message: "Perubahan kontak tersimpan. Kiriman lama tetap memakai data saat kiriman dibuat.", success: true };
}

export async function addContactAddressAction(
  _previousState: ContactAddressState,
  formData: FormData,
): Promise<ContactAddressState> {
  const principal = await requireTenantPrincipal();
  const contactId = requireContactId(formData);
  const validation = validateAddress(formData);
  const targetAvailable = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => hasActiveContactAddressMutationTarget(tx, context, contactId),
  );
  if (!targetAvailable) {
    return { message: "Kontak tidak tersedia atau batas 20 alamat aktif sudah tercapai." };
  }
  const authority = hasAreaSelectionPart(formData)
    ? await validateSelectedArea(principal, formData)
    : null;
  if (authority && !authority.ok) {
    const localErrors = !validation.ok
      ? validation.errors
      : {};
    return {
      errors: { ...localErrors, areaLabel: authority.message },
      areaQuery: {
        outletId: readText(formData, "areaOutletId"),
        query: readText(formData, "areaQuery"),
      },
      message: "Area tujuan belum dapat divalidasi.",
      values: addressValues(formData),
    };
  }
  const selectedArea = authority?.ok ? selectedAreaState(formData, authority.option) : undefined;
  if (!validation.ok) {
    return { errors: validation.errors, message: "Periksa alamat baru.", selectedArea, values: addressValues(formData) };
  }

  try {
    await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
      if (authority?.ok) {
        await requireCurrentSelectedAreaAuthority(tx, context, authority);
      }
      return addContactAddress(tx, context, contactId, {
        ...validation.input,
        destinationAreaId: authority?.ok ? authority.option.areaId : null,
        destinationAreaLabel: authority?.ok ? authority.option.areaLabel : null,
      });
    });
  } catch (error) {
    if (error instanceof MengantarConfigurationError) {
      return {
        errors: { areaLabel: "Koneksi Mengantar berubah. Cari dan pilih ulang area tujuan." },
        message: "Area tujuan belum dapat disimpan.",
        selectedArea,
        values: addressValues(formData),
      };
    }
    if (error instanceof ContactUnavailableError) {
      return { message: "Kontak tidak tersedia atau batas 20 alamat aktif sudah tercapai." };
    }
    if (error instanceof ContactAddressLabelConflictError) {
      return {
        errors: { addressLabel: "Label alamat sudah digunakan pada kontak ini." },
        message: "Periksa alamat baru.",
        selectedArea,
        values: addressValues(formData),
      };
    }
    throw error;
  }
  revalidatePath(`/app/kontak/${contactId}`);
  return { message: "Alamat tersimpan dan siap dipakai pada draf berikutnya.", success: true };
}

export async function updateContactAddressAction(
  _previousState: ContactAddressState,
  formData: FormData,
): Promise<ContactAddressState> {
  const principal = await requireTenantPrincipal();
  const contactId = requireContactId(formData);
  const addressId = requireAddressId(formData);
  const validation = validateAddress(formData);
  const targetAvailable = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => hasActiveContactAddressMutationTarget(tx, context, contactId, addressId),
  );
  if (!targetAvailable) {
    return { message: "Alamat tidak tersedia atau kontak sudah diarsipkan." };
  }
  const selectionChanged = formData.get("areaSelectionChanged") === "1";
  const authority = selectionChanged && hasAreaSelectionPart(formData)
    ? await validateSelectedArea(principal, formData)
    : null;
  if (authority && !authority.ok) {
    const localErrors = !validation.ok
      ? validation.errors
      : {};
    return {
      errors: { ...localErrors, areaLabel: authority.message },
      areaQuery: {
        outletId: readText(formData, "areaOutletId"),
        query: readText(formData, "areaQuery"),
      },
      message: "Area tujuan belum dapat divalidasi.",
      values: addressValues(formData),
    };
  }
  const selectedArea = authority?.ok ? selectedAreaState(formData, authority.option) : undefined;
  if (!validation.ok) {
    return { errors: validation.errors, message: "Periksa perubahan alamat.", selectedArea, values: addressValues(formData) };
  }

  try {
    await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
      if (authority?.ok) {
        await requireCurrentSelectedAreaAuthority(tx, context, authority);
      }
      return updateContactAddress(tx, context, contactId, addressId, {
        address: validation.input.address,
        addressLabel: validation.input.addressLabel,
        destinationArea: !selectionChanged
          ? undefined
          : authority?.ok
            ? { id: authority.option.areaId, label: authority.option.areaLabel }
            : null,
      });
    });
  } catch (error) {
    if (error instanceof MengantarConfigurationError) {
      return {
        errors: { areaLabel: "Koneksi Mengantar berubah. Cari dan pilih ulang area tujuan." },
        message: "Area tujuan belum dapat disimpan.",
        selectedArea,
        values: addressValues(formData),
      };
    }
    if (error instanceof ContactUnavailableError) {
      return { message: "Alamat tidak tersedia atau kontak sudah diarsipkan." };
    }
    if (error instanceof ContactAddressLabelConflictError) {
      return {
        errors: { addressLabel: "Label alamat sudah digunakan pada kontak ini." },
        message: "Periksa perubahan alamat.",
        selectedArea,
        values: addressValues(formData),
      };
    }
    throw error;
  }
  revalidatePath(`/app/kontak/${contactId}`);
  return { message: "Perubahan alamat tersimpan. Data pada kiriman lama tidak berubah.", success: true };
}

export async function archiveContactAction(
  _previousState: ContactArchiveState,
  formData: FormData,
): Promise<ContactArchiveState> {
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
      return { error: "Kontak tidak tersedia atau akun Anda tidak memiliki izin Tenant Admin." };
    }
    throw error;
  }
  // T-188: stay under the menu the contact was opened from.
  const requestedRole = formData.get("dari");
  const role = parseContactRole(typeof requestedRole === "string" ? requestedRole : null) ?? DEFAULT_CONTACT_ROLE;
  redirect(`/app/kontak/${contactId}?dari=${role}&diarsipkan=1`);
}
