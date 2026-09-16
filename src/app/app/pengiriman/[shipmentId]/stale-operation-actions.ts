"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { OrderBatchUnavailableError } from "@/db/order-batch-repository";
import { checkShipmentStaleOperation } from "@/db/shipment-stale-operation-repository";
import { TenantContextDeniedError, withTenantContext } from "@/db/tenant-context";
import {
  UnpaidRecoveryDeniedError,
  UnpaidRecoveryUnavailableError,
} from "@/db/unpaid-recovery-repository";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShipmentStaleOperationActionState = { message?: string; error?: string };

export async function checkStaleShipmentOperation(
  _previous: ShipmentStaleOperationActionState,
  formData: FormData,
): Promise<ShipmentStaleOperationActionState> {
  const shipmentId = formData.get("shipmentId");
  if (typeof shipmentId !== "string" || !UUID_PATTERN.test(shipmentId)) {
    return { error: "Kiriman tidak valid." };
  }

  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");

  let result;
  try {
    result = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => checkShipmentStaleOperation(tx, context, shipmentId),
    );
  } catch (error) {
    if (
      error instanceof OrderBatchUnavailableError
      || error instanceof TenantContextDeniedError
      || error instanceof UnpaidRecoveryDeniedError
      || error instanceof UnpaidRecoveryUnavailableError
    ) {
      return { error: "Pemeriksaan state tidak tersedia untuk kiriman ini." };
    }
    throw error;
  }
  revalidatePath("/app/pengiriman/[shipmentId]", "page");
  revalidatePath("/app/pengiriman");
  return result === "UPDATED"
    ? { message: "Status upaya tersendat sudah diamankan. Tinjau status terbaru." }
    : result === "ACTIVE"
      ? { message: "Upaya masih berada dalam jendela proses aman. Periksa kembali nanti." }
      : { message: "Tidak ada upaya tersendat yang perlu diperbarui." };
}
