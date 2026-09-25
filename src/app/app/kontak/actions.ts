"use server";

import { redirect } from "next/navigation";

import { validateMengantarDestinationAreaSelection } from "@/app/app/location-actions";
import { createContact, listContactDirectory, type ContactDirectoryRow } from "@/db/contact-repository";
import { db } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { validateContactDirectory } from "@/lib/contact-directory";
import {
  contactRoleFor,
  contactRoleToRepositoryRole,
  DEFAULT_CONTACT_ROLE,
  parseContactRole,
  parseContactStatusFilter,
  type ContactRole,
} from "@/lib/contact-role-filter";
import {
  lockMengantarAccountAuthority,
  MengantarConfigurationError,
  type MengantarAccountAuthority,
  sameMengantarAccountAuthority,
} from "@/lib/mengantar-credentials";

const CONTACT_FIELDS = [
  "contactName",
  "contactPhone",
  "roleSender",
  "roleRecipient",
  "addressLabel",
  "addressText",
] as const;

type ContactValues = Partial<Record<(typeof CONTACT_FIELDS)[number], string>>;

export type CreateContactState = {
  areaQuery?: { outletId: string; query: string };
  errors?: Record<string, string>;
  message?: string;
  selectedArea?: {
    areaId: string;
    areaLabel: string;
    outletId: string;
    query: string;
  };
  successId?: string;
  /** T-188: the list the new contact is shown under — the role the form was opened for, when the contact holds it. */
  successRole?: ContactRole;
  values?: ContactValues;
};

export type ContactSearchRow = {
  address: string | null;
  addressCount: number;
  archived: boolean;
  destinationAreaLabel: string | null;
  id: string;
  isRecipient: boolean;
  isSender: boolean;
  name: string;
  phone: string;
};

export type ContactSearchState = {
  error?: string;
  rows: ContactSearchRow[];
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

function contactSearchRows(rows: ContactDirectoryRow[]): ContactSearchRow[] {
  return rows.map((contact) => ({
    address: contact.address,
    addressCount: contact.addressCount,
    archived: Boolean(contact.archivedAt),
    destinationAreaLabel: contact.destinationAreaLabel,
    id: contact.id,
    isRecipient: contact.isRecipient,
    isSender: contact.isSender,
    name: contact.name,
    phone: contact.phone,
  }));
}

export async function searchContacts(
  _previousState: ContactSearchState,
  formData: FormData,
): Promise<ContactSearchState> {
  const principal = await requireTenantPrincipal();
  const requestedQuery = formData.get("q");
  const requestedStatus = formData.get("status");
  const requestedPeran = formData.get("peran");
  const query = typeof requestedQuery === "string" ? requestedQuery.trim() : "";
  const { status } = parseContactStatusFilter(
    typeof requestedStatus === "string" ? requestedStatus : undefined,
  );
  // T-188: a search never leaves its list's role; anything else is the default list.
  const role = contactRoleToRepositoryRole(
    parseContactRole(typeof requestedPeran === "string" ? requestedPeran : undefined) ?? DEFAULT_CONTACT_ROLE,
  );
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
    listContactDirectory(tx, context, { query, role, status }),
  );
  return { rows: contactSearchRows(rows), searched: Boolean(query) };
}

export async function saveContact(
  _previousState: CreateContactState,
  formData: FormData,
): Promise<CreateContactState> {
  const principal = await requireTenantPrincipal();
  const validation = validateContactDirectory(formData);
  const values = valuesFrom(formData);

  const outletId = formData.get("areaOutletId");
  const query = formData.get("areaQuery");
  const areaId = formData.get("areaId");
  const areaLabel = formData.get("areaLabel");
  const selectionParts = [outletId, query, areaId, areaLabel];
  const hasSelectionPart = selectionParts.some((value) => typeof value === "string" && value);
  let selectedArea: CreateContactState["selectedArea"];
  let validatedAuthority: MengantarAccountAuthority | null = null;
  let areaQuery: CreateContactState["areaQuery"];
  let areaError: string | undefined;
  if (hasSelectionPart) {
    if (!selectionParts.every((value) => typeof value === "string" && value)) {
      areaError = "Cari dan pilih ulang area tujuan.";
    } else {
      areaQuery = { outletId: outletId as string, query: query as string };
      const outletReady = await withTenantContext(
        db,
        principal.userId,
        principal.tenantId,
        async (tx, context) => (await listReadyShipmentOutlets(tx, context))
          .some((outlet) => outlet.id === outletId),
      );
      if (!outletReady) {
        areaError = "Outlet tidak siap atau tidak tersedia.";
      } else {
        const authority = await validateMengantarDestinationAreaSelection(
          outletId as string,
          query as string,
          areaId as string,
          areaLabel as string,
        );
        if (!authority.success || !authority.option) {
          areaError = authority.message ?? "Cari dan pilih ulang area tujuan.";
        } else {
          validatedAuthority = authority.authority ?? null;
          selectedArea = {
            ...authority.option,
            outletId: outletId as string,
            query: query as string,
          };
        }
      }
    }
  }
  if (!validation.ok || areaError) {
    return {
      errors: { ...(!validation.ok ? validation.errors : {}), ...(areaError ? { areaLabel: areaError } : {}) },
      areaQuery: selectedArea ? undefined : areaQuery,
      selectedArea,
      values,
    };
  }

  let contactId: string;
  try {
    contactId = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      async (tx, context) => {
        if (selectedArea) {
          const currentAuthority = await lockMengantarAccountAuthority(
            tx,
            context,
            selectedArea.outletId,
          );
          if (
            !validatedAuthority
            || !sameMengantarAccountAuthority(validatedAuthority, currentAuthority)
          ) {
            throw new MengantarConfigurationError();
          }
        }
        return createContact(tx, context, {
          ...validation.input,
          destinationAreaId: selectedArea?.areaId ?? null,
          destinationAreaLabel: selectedArea?.areaLabel ?? null,
        });
      },
    );
  } catch (error) {
    if (error instanceof MengantarConfigurationError) {
      return {
        areaQuery: selectedArea
          ? { outletId: selectedArea.outletId, query: selectedArea.query }
          : areaQuery,
        errors: { areaLabel: "Koneksi Mengantar berubah. Cari dan pilih ulang area tujuan." },
        selectedArea,
        values,
      };
    }
    throw error;
  }
  const requestedRole = formData.get("peran");
  return {
    message: "Kontak tersimpan dan siap dipakai pada draf baru.",
    successId: contactId,
    successRole: contactRoleFor(validation.input, parseContactRole(typeof requestedRole === "string" ? requestedRole : null)),
  };
}
