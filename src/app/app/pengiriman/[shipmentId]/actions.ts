"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CodTotalsUnavailableError } from "@/db/cod-totals-repository";
import { db, dbPool } from "@/db/client";
import { OrderBatchUnavailableError } from "@/db/order-batch-repository";
import { TenantContextDeniedError } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { MengantarOrderTransportUnavailableError } from "@/lib/mengantar-order";
import { OrderRateLimitedError } from "@/lib/order-rate-limit";
import {
  isSanctionedOrderFixtureEnabled,
  resolveSanctionedOrderFixtureTransport,
} from "@/lib/sanctioned-order-fixture";
import {
  confirmFixtureBackedShipmentIssuance,
  ShipmentIssuanceUnavailableError,
} from "@/lib/shipment-issuance";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShipmentIssuanceActionState = {
  error?: string;
  issued?: { awb: string; duplicate: boolean; labelHref: string };
};

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

export async function confirmShipmentIssuance(
  _previous: ShipmentIssuanceActionState,
  formData: FormData,
): Promise<ShipmentIssuanceActionState> {
  const shipmentId = formData.get("shipmentId");
  const estimateSnapshotId = formData.get("estimateSnapshotId");
  const estimateServiceId = formData.get("estimateServiceId");
  const confirmation = formData.get("confirmation");
  if (
    typeof shipmentId !== "string" ||
    typeof estimateSnapshotId !== "string" ||
    typeof estimateServiceId !== "string" ||
    !UUID_PATTERN.test(shipmentId) ||
    !UUID_PATTERN.test(estimateSnapshotId) ||
    !UUID_PATTERN.test(estimateServiceId) ||
    confirmation !== "confirmed"
  ) {
    return { error: "Pilih layanan yang tersedia dan centang konfirmasi penerbitan AWB." };
  }

  const principal = await requireTenantPrincipal();
  if (!isSanctionedOrderFixtureEnabled()) {
    return {
      error:
        "Penerbitan dinonaktifkan karena fixture non-produksi yang disetujui belum diaktifkan.",
    };
  }

  try {
    const result = await confirmFixtureBackedShipmentIssuance({
      db,
      lockPool: dbPool,
      principalId: principal.userId,
      tenantId: principal.tenantId,
      confirmation: { shipmentId, estimateSnapshotId, estimateServiceId },
      resolveTransport: resolveSanctionedOrderFixtureTransport,
    });
    revalidatePath(`/app/pengiriman/${shipmentId}`);
    revalidatePath("/app/pengiriman");
    if (result.status !== "ISSUED" || !result.awb || !result.labelHref) {
      return {
        error:
          result.status === "SUBMISSION_UNKNOWN"
            ? "Hasil penyedia belum pasti. Jangan konfirmasi ulang sebelum rekonsiliasi selesai."
            : "AWB belum diterbitkan. Muat ulang detail untuk melihat status terbaru.",
      };
    }

    return {
      issued: {
        awb: result.awb,
        duplicate: result.duplicate,
        labelHref: result.labelHref,
      },
    };
  } catch (error) {
    if (error instanceof OrderRateLimitedError) {
      return { error: "Terlalu banyak konfirmasi. Tunggu beberapa menit lalu coba lagi." };
    }
    if (
      error instanceof CodTotalsUnavailableError ||
      error instanceof OrderBatchUnavailableError ||
      error instanceof TenantContextDeniedError ||
      error instanceof MengantarOrderTransportUnavailableError ||
      error instanceof ShipmentIssuanceUnavailableError
    ) {
      return {
        error:
          "Konfirmasi tidak dapat diproses. Muat ulang detail dan pilih estimasi terbaru yang tersedia.",
      };
    }
    throw error;
  }
}
