"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import {
  ShipmentReconciliationDeniedError,
  ShipmentReconciliationUnavailableError,
} from "@/db/shipment-reconciliation-repository";
import { TenantContextDeniedError } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import {
  isSanctionedReconciliationFixtureEnabled,
  resolveSanctionedReconciliationFixture,
  SanctionedReconciliationFixtureUnavailableError,
} from "@/lib/sanctioned-reconciliation-fixture";
import {
  reconcileFixtureBackedShipment,
  ShipmentReconciliationResultUnavailableError,
} from "@/lib/shipment-reconciliation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShipmentReconciliationActionState = {
  error?: string;
  reconciled?: {
    awb: string | null;
    labelHref: string | null;
    status: "AWAITING_UPSTREAM_PAYMENT" | "FAILED" | "ISSUED";
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

export async function reconcileShipmentUnknownSubmission(
  _previous: ShipmentReconciliationActionState,
  formData: FormData,
): Promise<ShipmentReconciliationActionState> {
  const shipmentId = formData.get("shipmentId");
  if (
    typeof shipmentId !== "string"
    || !UUID_PATTERN.test(shipmentId)
    || formData.get("confirmation") !== "confirmed"
  ) {
    return { error: "Tinjau status belum pasti dan centang konfirmasi rekonsiliasi." };
  }

  const principal = await requireTenantPrincipal();
  if (principal.role !== "TENANT_ADMIN") {
    return { error: "Rekonsiliasi hasil penyedia hanya tersedia untuk Tenant Admin." };
  }
  if (!isSanctionedReconciliationFixtureEnabled()) {
    return { error: "Rekonsiliasi dinonaktifkan karena fixture non-produksi yang disetujui belum diaktifkan." };
  }

  try {
    const result = await reconcileFixtureBackedShipment({
      db,
      principalId: principal.userId,
      resolveAuthoritativeResult: resolveSanctionedReconciliationFixture,
      shipmentId,
      tenantId: principal.tenantId,
    });
    revalidatePath("/app/pengiriman/[shipmentId]", "page");
    revalidatePath("/app/pengiriman");
    return {
      reconciled: {
        awb: result.awb,
        labelHref: result.status === "ISSUED" && result.awb
          ? `/app/label/${encodeURIComponent(shipmentId)}`
          : null,
        status: result.status,
      },
    };
  } catch (error) {
    if (
      error instanceof ShipmentReconciliationDeniedError
      || error instanceof ShipmentReconciliationUnavailableError
      || error instanceof ShipmentReconciliationResultUnavailableError
      || error instanceof SanctionedReconciliationFixtureUnavailableError
      || error instanceof TenantContextDeniedError
    ) {
      return { error: "Rekonsiliasi tidak dapat diproses. Muat ulang detail dan pastikan status masih memerlukan rekonsiliasi." };
    }
    throw error;
  }
}
