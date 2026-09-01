"use server";

import { redirect } from "next/navigation";

import {
  ContactUnavailableError,
  listContactAddresses,
  listContacts,
  resolveActiveContactAddress,
} from "@/db/contact-repository";
import {
  createShipmentDraft,
  DraftSubmissionConflictError,
  OutletUnavailableError,
  resolveExistingShipmentDraftReplay,
} from "@/db/shipment-draft-repository";
import { db } from "@/db/client";
import {
  withTenantContext,
  type TenantContext,
  type TenantTransaction,
} from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import {
  validateShipmentDraft,
} from "@/lib/shipment-draft";

const CONTACT_QUERY_MAX_LENGTH = 80;
const CONTACT_SEARCH_LIMIT = 8;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ShipmentContactRole = "RECIPIENT" | "SENDER";

export type ShipmentContactSearchResult = {
  addressId: string;
  addressLabel: string;
  contactId: string;
  destinationAreaLabel: string | null;
  name: string;
  phoneMasked: string;
};

export type ShipmentContactSearchActionState = {
  error?: string;
  message?: string;
  query?: string;
  results?: ShipmentContactSearchResult[];
  role?: ShipmentContactRole;
};

export type ShipmentContactSelection = {
  address: string;
  addressId: string;
  addressUpdatedAt: string;
  contactId: string;
  contactUpdatedAt: string;
  destinationAreaId: string | null;
  destinationAreaLabel: string | null;
  name: string;
  phone: string;
  role: ShipmentContactRole;
};

export type ShipmentContactSelectionActionState = {
  error?: string;
  selection?: ShipmentContactSelection;
};

const CONTACT_SELECTION_COPY: Record<
  ShipmentContactRole,
  { field: string; message: string }
> = {
  RECIPIENT: {
    field: "recipientContactSelection",
    message: "Pilihan kontak penerima tidak tersedia. Cari dan pilih kembali.",
  },
  SENDER: {
    field: "senderContactSelection",
    message: "Pilihan kontak pengirim tidak tersedia. Cari dan pilih kembali.",
  },
};

const FORM_FIELDS = [
  "senderName",
  "senderPhone",
  "senderAddress",
  "recipientName",
  "recipientPhone",
  "recipientAddress",
  "destinationAreaId",
  "destinationAreaLabel",
  "packageContent",
  "packageWeightGrams",
  "packageQuantity",
  "packageLengthCm",
  "packageWidthCm",
  "packageHeightCm",
  "declaredValue",
  "paymentType",
  "outletId",
] as const;

type DraftFormValues = Partial<Record<(typeof FORM_FIELDS)[number], string>>;

export type ShipmentDraftActionState = {
  errors?: Record<string, string>;
  message?: string;
  values?: DraftFormValues;
};

function valuesFrom(formData: FormData): DraftFormValues {
  return Object.fromEntries(
    FORM_FIELDS.flatMap((field) => {
      const value = formData.get(field);
      return typeof value === "string" ? [[field, value]] : [];
    }),
  );
}

type DraftContactSelector = {
  addressId: string;
  addressUpdatedAt: string;
  contactId: string;
  contactUpdatedAt: string;
  role: ShipmentContactRole;
};

type ContactPickerSelector = Pick<DraftContactSelector, "addressId" | "contactId" | "role">;

type ContactSelectionSnapshot = {
  address: string;
  destinationAreaId: string | null;
  destinationAreaLabel: string | null;
  name: string;
  phone: string;
};

type DraftSaveOutcome =
  | { ok: false; state: ShipmentDraftActionState }
  | { ok: true; shipmentId: string };

class DraftContactUnavailableError extends Error {
  constructor(readonly role: ShipmentContactRole) {
    super("Selected contact is unavailable.");
  }
}

function isContactRole(value: unknown): value is ShipmentContactRole {
  return value === "SENDER" || value === "RECIPIENT";
}

function maskPhone(phone: string) {
  const suffix = phone.replace(/\D/g, "").slice(-4);
  return suffix ? `•••• ${suffix}` : "Nomor tersimpan";
}

function selectionFrom(formData: FormData): ContactPickerSelector | null {
  const value = formData.get("contactSelection");
  if (typeof value !== "string") return null;
  const parts = value.split(":");
  if (parts.length !== 3) return null;
  const [roleValue, contactId, addressId] = parts;
  if (
    !isContactRole(roleValue) ||
    !UUID_PATTERN.test(contactId) ||
    !UUID_PATTERN.test(addressId)
  ) {
    return null;
  }
  return { addressId, contactId, role: roleValue };
}

function draftSelectorFrom(
  formData: FormData,
  role: ShipmentContactRole,
): DraftContactSelector | null {
  const prefix = role === "SENDER" ? "sender" : "recipient";
  const contactValue = formData.get(`${prefix}ContactId`);
  const addressValue = formData.get(`${prefix}ContactAddressId`);
  const contactUpdatedAtValue = formData.get(`${prefix}ContactUpdatedAt`);
  const addressUpdatedAtValue = formData.get(`${prefix}ContactAddressUpdatedAt`);
  if (
    (contactValue === null || contactValue === "") &&
    (addressValue === null || addressValue === "")
  ) {
    return null;
  }
  if (
    typeof contactValue !== "string" ||
    typeof addressValue !== "string" ||
    typeof contactUpdatedAtValue !== "string" ||
    typeof addressUpdatedAtValue !== "string"
  ) {
    throw new DraftContactUnavailableError(role);
  }
  const contactId = contactValue.trim();
  const addressId = addressValue.trim();
  const contactUpdatedAt = contactUpdatedAtValue.trim();
  const addressUpdatedAt = addressUpdatedAtValue.trim();
  if (
    !UUID_PATTERN.test(contactId) ||
    !UUID_PATTERN.test(addressId) ||
    !isCanonicalTimestamp(contactUpdatedAt) ||
    !isCanonicalTimestamp(addressUpdatedAt)
  ) {
    throw new DraftContactUnavailableError(role);
  }
  return { addressId, addressUpdatedAt, contactId, contactUpdatedAt, role };
}

function isCanonicalTimestamp(value: string) {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function selectionSnapshotFrom(
  formData: FormData,
  role: ShipmentContactRole,
): ContactSelectionSnapshot | null {
  const prefix = role === "SENDER" ? "sender" : "recipient";
  const name = formData.get(`${prefix}ContactSnapshotName`);
  const phone = formData.get(`${prefix}ContactSnapshotPhone`);
  const address = formData.get(`${prefix}ContactSnapshotAddress`);
  if (typeof name !== "string" || typeof phone !== "string" || typeof address !== "string") {
    return null;
  }
  const destinationAreaId = formData.get(`${prefix}ContactSnapshotDestinationAreaId`);
  const destinationAreaLabel = formData.get(`${prefix}ContactSnapshotDestinationAreaLabel`);
  return {
    address,
    destinationAreaId: typeof destinationAreaId === "string" ? destinationAreaId : null,
    destinationAreaLabel: typeof destinationAreaLabel === "string" ? destinationAreaLabel : null,
    name,
    phone,
  };
}

async function requireTenantPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/tenant");
    }
    throw error;
  }
  if (principal.scope !== "tenant") {
    redirect("/login/tenant");
  }
  return principal;
}

async function resolveDraftContact(
  tx: TenantTransaction,
  context: TenantContext,
  selector: DraftContactSelector,
) {
  try {
    const resolved = await resolveActiveContactAddress(
      tx,
      context,
      selector.contactId,
      selector.addressId,
      selector.role,
    );
    if (
      resolved.contactUpdatedAt.toISOString() !== selector.contactUpdatedAt ||
      resolved.addressUpdatedAt.toISOString() !== selector.addressUpdatedAt
    ) {
      throw new DraftContactUnavailableError(selector.role);
    }
    return resolved;
  } catch (error) {
    if (error instanceof ContactUnavailableError) {
      throw new DraftContactUnavailableError(selector.role);
    }
    throw error;
  }
}

type ResolvedContact = {
  address: string;
  addressUpdatedAt: Date;
  contactUpdatedAt: Date;
  destinationAreaId: string | null;
  destinationAreaLabel: string | null;
  name: string;
  phone: string;
};

function assertSelectionMatchesResolved(
  resolved: ResolvedContact,
  selected: ContactSelectionSnapshot | null,
  role: ShipmentContactRole,
) {
  if (
    !selected ||
    resolved.name !== selected.name ||
    resolved.phone !== selected.phone ||
    resolved.address !== selected.address ||
    (role === "RECIPIENT" && (
      resolved.destinationAreaId !== selected.destinationAreaId ||
      resolved.destinationAreaLabel !== selected.destinationAreaLabel
    ))
  ) {
    throw new DraftContactUnavailableError(role);
  }
}

async function searchShipmentContactsForRole(
  role: ShipmentContactRole,
  formData: FormData,
): Promise<ShipmentContactSearchActionState> {
  const principal = await requireTenantPrincipal();
  const queryField = role === "SENDER" ? "senderContactQuery" : "recipientContactQuery";
  const queryValue = formData.get(queryField);
  const query = typeof queryValue === "string" ? queryValue.trim() : "";
  const hasEnoughSearchText = /[\p{L}\p{N}].*[\p{L}\p{N}]/u.test(query);
  if (
    query.length < 2 ||
    query.length > CONTACT_QUERY_MAX_LENGTH ||
    !hasEnoughSearchText ||
    /[%_\\]/u.test(query)
  ) {
    return {
      error: "Masukkan 2–80 karakter nama atau nomor telepon.",
      query,
      role,
    };
  }

  const results = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    async (tx, context) => {
      const matchingContacts = (await listContacts(tx, context, query))
        .filter((contact) => role === "SENDER" ? contact.isSender : contact.isRecipient)
        .slice(0, CONTACT_SEARCH_LIMIT);
      const addressResults = await Promise.all(
        matchingContacts.map(async (contact) => {
          const addresses = await listContactAddresses(tx, context, contact.id);
          return addresses
            .filter((address) => address.archivedAt === null)
            .map((address) => ({
              addressId: address.id,
              addressLabel: address.label,
              contactId: contact.id,
              destinationAreaLabel: address.destinationAreaLabel,
              name: contact.name,
              phoneMasked: maskPhone(contact.phone),
            }));
        }),
      );
      return addressResults.flat();
    },
  );

  return {
    message: results.length === 0 ? "Kontak atau alamat aktif tidak ditemukan." : undefined,
    query,
    results,
    role,
  };
}

export async function searchSenderShipmentContacts(
  _previousState: ShipmentContactSearchActionState,
  formData: FormData,
) {
  return searchShipmentContactsForRole("SENDER", formData);
}

export async function searchRecipientShipmentContacts(
  _previousState: ShipmentContactSearchActionState,
  formData: FormData,
) {
  return searchShipmentContactsForRole("RECIPIENT", formData);
}

export async function selectShipmentContact(
  _previousState: ShipmentContactSelectionActionState,
  formData: FormData,
): Promise<ShipmentContactSelectionActionState> {
  const principal = await requireTenantPrincipal();
  const selector = selectionFrom(formData);
  if (!selector) return { error: "Pilihan kontak tidak valid." };

  try {
    const resolved = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => resolveActiveContactAddress(
        tx,
        context,
        selector.contactId,
        selector.addressId,
        selector.role,
      ),
    );
    return {
      selection: {
        address: resolved.address,
        addressId: selector.addressId,
        addressUpdatedAt: resolved.addressUpdatedAt.toISOString(),
        contactId: selector.contactId,
        contactUpdatedAt: resolved.contactUpdatedAt.toISOString(),
        destinationAreaId: resolved.destinationAreaId,
        destinationAreaLabel: resolved.destinationAreaLabel,
        name: resolved.name,
        phone: resolved.phone,
        role: selector.role,
      },
    };
  } catch (error) {
    if (error instanceof ContactUnavailableError) {
      return { error: CONTACT_SELECTION_COPY[selector.role].message };
    }
    throw error;
  }
}

export async function saveShipmentDraft(
  _previousState: ShipmentDraftActionState,
  formData: FormData,
): Promise<ShipmentDraftActionState> {
  const principal = await requireTenantPrincipal();
  const submissionIdValue = formData.get("submissionId");
  const submissionId = typeof submissionIdValue === "string"
    ? submissionIdValue.trim()
    : "";
  const validation = validateShipmentDraft(formData);
  const values = valuesFrom(formData);
  if (!UUID_V4_PATTERN.test(submissionId)) {
    return {
      errors: { form: "Sesi formulir tidak valid. Muat ulang halaman lalu coba kembali." },
      values,
    };
  }
  const senderSnapshot = selectionSnapshotFrom(formData, "SENDER");
  const recipientSnapshot = selectionSnapshotFrom(formData, "RECIPIENT");

  let senderSelector: DraftContactSelector | null;
  let recipientSelector: DraftContactSelector | null;
  try {
    senderSelector = draftSelectorFrom(formData, "SENDER");
    recipientSelector = draftSelectorFrom(formData, "RECIPIENT");
  } catch (error) {
    if (error instanceof DraftContactUnavailableError) {
      return {
        errors: {
          [CONTACT_SELECTION_COPY[error.role].field]:
            CONTACT_SELECTION_COPY[error.role].message,
        },
        values,
      };
    }
    throw error;
  }

  if (!validation.ok && !senderSelector && !recipientSelector) {
    return { errors: validation.errors, values };
  }

  let outcome: DraftSaveOutcome;
  try {
    outcome = await withTenantContext<DraftSaveOutcome>(
      db,
      principal.userId,
      principal.tenantId,
      async (tx, context) => {
        if (!validation.ok) {
          return { ok: false, state: { errors: validation.errors, values } };
        }

        const replay = await resolveExistingShipmentDraftReplay(
          tx,
          context,
          validation.input,
          submissionId,
        );
        if (replay) return { ok: true, shipmentId: replay };

        const sender = senderSelector
          ? await resolveDraftContact(tx, context, senderSelector)
          : null;
        const recipient = recipientSelector
          ? await resolveDraftContact(tx, context, recipientSelector)
          : null;
        if (sender) assertSelectionMatchesResolved(sender, senderSnapshot, "SENDER");
        if (recipient) assertSelectionMatchesResolved(recipient, recipientSnapshot, "RECIPIENT");
        const shipmentId = await createShipmentDraft(
          tx,
          context,
          validation.input,
          submissionId,
        );
        return { ok: true, shipmentId };
      },
    );
  } catch (error) {
    if (error instanceof DraftContactUnavailableError) {
      return {
        errors: {
          [CONTACT_SELECTION_COPY[error.role].field]:
            CONTACT_SELECTION_COPY[error.role].message,
        },
        values,
      };
    }
    if (error instanceof OutletUnavailableError) {
      return {
        errors: { outletId: "Outlet belum dikonfigurasi untuk pengiriman." },
        values,
      };
    }
    if (error instanceof DraftSubmissionConflictError) {
      return {
        errors: { form: "Formulir ini sudah berubah atau pernah digunakan. Muat ulang lalu coba kembali." },
        values,
      };
    }
    throw error;
  }

  if (!outcome.ok) return outcome.state;
  redirect(`/app/pengiriman/baru?draft=${outcome.shipmentId}`);
}
