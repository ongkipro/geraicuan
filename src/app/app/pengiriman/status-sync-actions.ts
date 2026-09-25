"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import {
  claimProviderSettlementPull,
  providerSettlementAccountKey,
  ProviderSettlementDeniedError,
  ProviderSettlementThrottledError,
  recordProviderSettlementPull,
} from "@/db/provider-settlement-repository";
import { TenantContextDeniedError, withTenantContext } from "@/db/tenant-context";
import { parseAnalyticsRange } from "@/lib/analytics-range";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import {
  lockMengantarAccountAuthority,
  MengantarConfigurationError,
  resolveMengantarAccountCredentials,
  sameMengantarAccountAuthority,
} from "@/lib/mengantar-credentials";
import {
  fetchMengantarSettlement,
  MengantarSettlementError,
  MengantarSettlementTooLargeError,
} from "@/lib/mengantar-settlement";

/*
 * T-204: the read-only Mengantar pull that moves shipments to DELIVERED,
 * PROBLEM and the RTS states. It used to live on Keuangan; that page is gone,
 * so it now runs from Histori kiriman and Retur. Behaviour is unchanged: Tenant
 * Admin only, one claimed slot per outlet account per minute (committed before
 * provider I/O), the outlet's own Mengantar account, the authority re-checked
 * before writing, and the same settlement evidence and observation rows.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Keeps one pull inside the client's page caps for a normal account.
const MAX_STATUS_PULL_DAYS = 62;

export type MengantarStatusPullState = {
  status?: "success" | "error";
  message?: string;
  acceptedAttemptId?: string;
  nextAttemptId?: string;
};

function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

async function requireTenantAdminPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant" || principal.role !== "TENANT_ADMIN") {
    redirect("/app");
  }
  return principal;
}

function failed(message: string, attemptId?: string): MengantarStatusPullState {
  return {
    status: "error",
    message,
    ...(attemptId ? { nextAttemptId: attemptId } : {}),
  };
}

export async function pullMengantarStatus(
  _previousState: MengantarStatusPullState,
  formData: FormData,
): Promise<MengantarStatusPullState> {
  const principal = await requireTenantAdminPrincipal();
  const attemptId = formString(formData, "attemptId");
  const outletId = formString(formData, "outletId");
  if (!attemptId || !UUID_PATTERN.test(attemptId) || !outletId || !UUID_PATTERN.test(outletId)) {
    return failed("Permintaan perbarui status dari Mengantar tidak valid.", attemptId);
  }
  const range = parseAnalyticsRange({
    rentang: formString(formData, "rentang"),
    tz: formString(formData, "tz"),
    dari: formString(formData, "dari"),
    sampai: formString(formData, "sampai"),
    khusus: formString(formData, "khusus"),
  }, new Date());
  if (range.issues.length > 0) {
    return failed("Periode tidak valid. Pilih ulang periode.", attemptId);
  }
  if (range.spanDays > MAX_STATUS_PULL_DAYS) {
    return failed(`Perbarui status dari Mengantar maksimal ${MAX_STATUS_PULL_DAYS} hari. Pilih periode lebih pendek.`, attemptId);
  }
  const period = { start: range.startInclusive, end: range.endExclusive };

  try {
    // Committed on its own before provider I/O, so failures and parallel tabs still spend the slot.
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      claimProviderSettlementPull(tx, context, outletId));
    const prepared = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
      await lockMengantarAccountAuthority(tx, context, outletId);
      return resolveMengantarAccountCredentials(tx, context, outletId);
    });

    // Provider I/O stays outside any transaction; the authority is re-checked before writing.
    const snapshot = await fetchMengantarSettlement(prepared.credentials, period);

    const result = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
      await lockMengantarAccountAuthority(tx, context, outletId);
      const current = await resolveMengantarAccountCredentials(tx, context, outletId);
      if (!sameMengantarAccountAuthority(prepared.authority, current.authority)) {
        throw new MengantarConfigurationError();
      }
      return recordProviderSettlementPull(tx, context, {
        outletId,
        credentialSource: current.source,
        providerAccountKey: providerSettlementAccountKey(context.tenantId, outletId, current.source),
        period,
        snapshot,
      });
    });
    // Both pages that host this action show the pull's basis line, so they are
    // refreshed every time; a delivery transition also changes the dashboard.
    revalidatePath("/app/pengiriman");
    revalidatePath("/app/pengiriman/rts");
    if (result.appliedTransitionCount > 0) {
      revalidatePath("/app");
      revalidatePath("/app/pengiriman/[shipmentId]", "page");
    }
    const found = `${result.matchedStatusCount} status cocok dengan kiriman GeraiCUAN`;
    const scanned = result.invoiceCount === null || result.orderCount === null
      ? "akun platform bersama, total akun tidak ditampilkan"
      : `${result.invoiceCount} invoice dan ${result.orderCount} order diperiksa`;
    // T-169: an unrecognised provider status is named rather than mapped to the
    // nearest lifecycle state; the shipment keeps the state it had.
    const unrecognised = result.unrecognisedStatuses.length > 0
      ? ` Status penyedia yang belum dikenali dibiarkan apa adanya: ${result.unrecognisedStatuses.join(", ")}.`
      : "";
    // A refusal is a real divergence — Mengantar reports a state the transition
    // graph will not move this shipment into, e.g. "terkirim" for one already
    // recorded as retur — so it is counted on the observation row *and* said
    // out loud.
    const refused = result.refusedTransitionCount > 0
      ? ` ${result.refusedTransitionCount} laporan Mengantar bertentangan dengan status kiriman kita dan tidak diterapkan — periksa di Histori kiriman.`
      : "";
    return {
      status: "success",
      message: `Status Mengantar diperbarui (${scanned}): ${found}. ${result.appliedTransitionCount} kiriman berpindah status sesuai laporan Mengantar.${refused}${unrecognised}`,
      acceptedAttemptId: attemptId,
      nextAttemptId: randomUUID(),
    };
  } catch (error) {
    if (error instanceof ProviderSettlementThrottledError) {
      return failed("Status Mengantar baru saja diperbarui. Tunggu satu menit lalu coba lagi.", attemptId);
    }
    if (error instanceof ProviderSettlementDeniedError || error instanceof TenantContextDeniedError) {
      return failed("Outlet tidak tersedia untuk perbarui status dari Mengantar.", attemptId);
    }
    if (error instanceof MengantarConfigurationError) {
      return failed("Koneksi Mengantar outlet belum siap atau berubah. Periksa pengaturan outlet.", attemptId);
    }
    if (error instanceof MengantarSettlementTooLargeError) {
      return failed("Data Mengantar pada periode ini terlalu banyak. Pilih periode lebih pendek.", attemptId);
    }
    if (error instanceof MengantarSettlementError) {
      return failed("Data Mengantar belum dapat dimuat atau formatnya berubah. Coba lagi nanti.", attemptId);
    }
    return failed("Perbarui status dari Mengantar tidak dapat dijalankan. Coba lagi.", attemptId);
  }
}
