"use server";

import { redirect } from "next/navigation";

import {
  createShipmentDraft,
  OutletUnavailableError,
} from "@/db/shipment-draft-repository";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { validateShipmentDraft } from "@/lib/shipment-draft";

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

export async function saveShipmentDraft(
  _previousState: ShipmentDraftActionState,
  formData: FormData,
): Promise<ShipmentDraftActionState> {
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

  const validation = validateShipmentDraft(formData);
  const values = valuesFrom(formData);
  if (!validation.ok) {
    return { errors: validation.errors, values };
  }

  try {
    const shipmentId = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => createShipmentDraft(tx, context, validation.input),
    );
    redirect(`/app?draft=${shipmentId}`);
  } catch (error) {
    if (error instanceof OutletUnavailableError) {
      return {
        errors: { outletId: "Outlet belum dikonfigurasi untuk pengiriman." },
        values,
      };
    }
    throw error;
  }
}
