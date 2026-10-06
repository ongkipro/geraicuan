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
import {
  isLiveMengantarOrdersEnabled,
  resolveLiveMengantarPayUnpaidTransport,
} from "@/lib/mengantar-live-transport";
import {
  MengantarPayUnpaidRefusedError,
  MengantarUnpaidRecoveryTransportUnavailableError,
} from "@/lib/mengantar-unpaid-recovery";
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
  // T-282 (D-42): the live transport when switched on, else the sanctioned fixture
  // (development only), else no recovery at all.
  const resolveTransport = isLiveMengantarOrdersEnabled()
    ? resolveLiveMengantarPayUnpaidTransport
    : isSanctionedUnpaidRecoveryFixtureEnabled()
      ? resolveSanctionedUnpaidRecoveryFixtureTransport
      : null;
  if (!resolveTransport) {
    return {
      error: "Pemulihan pembayaran belum diaktifkan di GeraiCUAN. Hubungi admin GeraiCUAN.",
    };
  }

  try {
    const result = await recoverFixtureBackedShipmentPayment({
      db,
      lockPool: dbPool,
      principalId: principal.userId,
      tenantId: principal.tenantId,
      shipmentId,
      resolveTransport,
    });

    revalidatePath("/app/pengiriman/[shipmentId]", "page");
    revalidatePath("/app/pengiriman");
    return { recovered: result };
  } catch (error) {
    if (error instanceof MengantarPayUnpaidRefusedError) {
      revalidatePath("/app/pengiriman/[shipmentId]", "page");
      if (error.safeCode === "PAY_UNPAID_NOT_SENT") {
        return { error: "Pembayaran belum terkirim ke Mengantar dan tidak ada saldo yang terpotong. Coba lagi." };
      }
      const known =
        "Mengantar menolak pembayaran ini, biasanya karena saldo Mengantar belum cukup. Isi saldo (top up) di aplikasi Mengantar, lalu jalankan pemulihan lagi.";
      return {
        error: error.providerMessage ? `${known} Pesan Mengantar: “${error.providerMessage}”` : known,
      };
    }
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
