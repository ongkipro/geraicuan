"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db, dbPool } from "@/db/client";
import { TenantContextDeniedError } from "@/db/tenant-context";
import {
  UnpaidRecoveryDeniedError,
  UnpaidRecoveryUnavailableError,
} from "@/db/unpaid-recovery-repository";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { MengantarUnpaidRecoveryTransportUnavailableError } from "@/lib/mengantar-unpaid-recovery";
import { UnpaidRecoveryRateLimitedError } from "@/lib/order-rate-limit";
import {
  isSanctionedUnpaidRecoveryFixtureEnabled,
  resolveSanctionedUnpaidRecoveryFixtureTransport,
  SanctionedUnpaidRecoveryFixtureUnavailableError,
} from "@/lib/sanctioned-unpaid-recovery-fixture";
import {
  recoverFixtureBackedShipmentPayment,
  ShipmentUnpaidRecoveryReconciliationRequiredError,
} from "@/lib/shipment-unpaid-recovery";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShipmentUnpaidRecoveryActionState = {
  error?: string;
  recovered?: {
    duplicate: boolean;
    shipments: Array<{
      awb: string;
      labelHref: string;
      shipmentId: string;
    }>;
  };
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

export async function recoverShipmentUnpaidPayment(
  _previous: ShipmentUnpaidRecoveryActionState,
  formData: FormData,
): Promise<ShipmentUnpaidRecoveryActionState> {
  const shipmentId = formData.get("shipmentId");
  const confirmation = formData.get("confirmation");
  if (
    typeof shipmentId !== "string"
    || !UUID_PATTERN.test(shipmentId)
    || confirmation !== "confirmed"
  ) {
    return {
      error:
        "Centang konfirmasi setelah saldo Mengantar didanai dan status kiriman ditinjau.",
    };
  }

  const principal = await requireTenantPrincipal();
  if (principal.role !== "TENANT_ADMIN") {
    return { error: "Pemulihan pembayaran hanya tersedia untuk pemilik gerai." };
  }
  if (!isSanctionedUnpaidRecoveryFixtureEnabled()) {
    return {
      error:
        "Pemulihan dinonaktifkan karena data uji non-produksi yang disetujui belum diaktifkan.",
    };
  }

  try {
    const result = await recoverFixtureBackedShipmentPayment({
      db,
      lockPool: dbPool,
      principalId: principal.userId,
      tenantId: principal.tenantId,
      shipmentId,
      resolveTransport: resolveSanctionedUnpaidRecoveryFixtureTransport,
    });

    revalidatePath("/app/pengiriman/[shipmentId]", "page");
    revalidatePath("/app/pengiriman");
    return { recovered: result };
  } catch (error) {
    if (error instanceof UnpaidRecoveryRateLimitedError) {
      return {
        error: "Terlalu banyak pemulihan. Tunggu beberapa menit lalu coba lagi.",
      };
    }
    if (error instanceof ShipmentUnpaidRecoveryReconciliationRequiredError) {
      revalidatePath("/app/pengiriman/[shipmentId]", "page");
      revalidatePath("/app/pengiriman");
      return {
        error:
          "Hasil pembayaran perlu direkonsiliasi. Jangan menjalankan pemulihan ulang sebelum status penyedia dipastikan.",
      };
    }
    if (
      error instanceof TenantContextDeniedError
      || error instanceof UnpaidRecoveryDeniedError
      || error instanceof UnpaidRecoveryUnavailableError
      || error instanceof MengantarUnpaidRecoveryTransportUnavailableError
      || error instanceof SanctionedUnpaidRecoveryFixtureUnavailableError
    ) {
      return {
        error:
          "Pemulihan tidak dapat diproses. Muat ulang detail dan pastikan kiriman masih menunggu pembayaran.",
      };
    }
    throw error;
  }
}
