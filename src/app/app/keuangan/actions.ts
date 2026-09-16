"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import {
  appendLedgerAdjustment,
  LedgerDeniedError,
  LedgerUnavailableError,
  reconcileLedgerPeriod,
} from "@/db/ledger-repository";
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FinanceActionState = {
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

function failed(message: string, attemptId?: string): FinanceActionState {
  return {
    status: "error",
    message,
    ...(attemptId ? { nextAttemptId: attemptId } : {}),
  };
}

function succeeded(message: string, attemptId: string): FinanceActionState {
  return {
    status: "success",
    message,
    acceptedAttemptId: attemptId,
    nextAttemptId: randomUUID(),
  };
}

function cadenceMatchesRange(
  cadence: string,
  startDate: string,
  lastIncludedDate: string,
) {
  if (cadence === "DAILY") return startDate === lastIncludedDate;
  if (cadence !== "MONTHLY") return false;
  const match = /^(\d{4})-(\d{2})-01$/.exec(startDate);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return lastIncludedDate === `${match[1]}-${match[2]}-${String(finalDay).padStart(2, "0")}`;
}

export async function runLedgerReconciliation(
  _previousState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const principal = await requireTenantAdminPrincipal();
  const attemptId = formString(formData, "attemptId");
  const outletId = formString(formData, "outletId");
  const cadence = formString(formData, "cadence");
  if (
    !attemptId
    || !UUID_PATTERN.test(attemptId)
    || !outletId
    || !UUID_PATTERN.test(outletId)
    || (cadence !== "DAILY" && cadence !== "MONTHLY")
  ) {
    return failed("Permintaan rekonsiliasi tidak valid.", attemptId);
  }

  const periodDate = formString(formData, "periodDate");
  const periodMonth = formString(formData, "periodMonth");
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(periodMonth ?? "");
  const monthLastDate = monthMatch
    ? `${periodMonth}-${String(new Date(Date.UTC(Number(monthMatch[1]), Number(monthMatch[2]), 0)).getUTCDate()).padStart(2, "0")}`
    : undefined;
  const range = parseAnalyticsRange(
    cadence === "DAILY" && /^\d{4}-\d{2}-\d{2}$/.test(periodDate ?? "")
      ? { rentang: "kustom", tz: formString(formData, "tz"), dari: periodDate, sampai: periodDate, khusus: "1" }
      : cadence === "MONTHLY" && monthMatch && monthLastDate
        ? { rentang: "kustom", tz: formString(formData, "tz"), dari: `${periodMonth}-01`, sampai: monthLastDate, khusus: "1" }
        : {
            rentang: formString(formData, "rentang"),
            tz: formString(formData, "tz"),
            dari: formString(formData, "dari"),
            sampai: formString(formData, "sampai"),
            khusus: formString(formData, "khusus"),
          },
    new Date(),
  );
  if (
    range.issues.length > 0
    || !cadenceMatchesRange(cadence, range.startDate, range.lastIncludedDate)
  ) {
    return failed(
      cadence === "DAILY"
        ? "Rekonsiliasi harian harus mencakup tepat satu tanggal lokal."
        : "Rekonsiliasi bulanan harus mencakup tepat satu bulan kalender lokal.",
      attemptId,
    );
  }

  try {
    await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) =>
        reconcileLedgerPeriod(tx, context, {
          attemptId,
          outletId,
          cadence,
          periodStart: range.startInclusive,
          periodEnd: range.endExclusive,
        }),
    );
    revalidatePath("/app/keuangan");
    return succeeded(
      "Rekonsiliasi tersimpan. Total sumber dan ledger dicatat sebagai snapshot append-only.",
      attemptId,
    );
  } catch (error) {
    if (error instanceof LedgerDeniedError || error instanceof LedgerUnavailableError) {
      return failed("Rekonsiliasi tidak tersedia untuk outlet atau periode ini.", attemptId);
    }
    return failed("Rekonsiliasi tidak dapat dijalankan. Coba lagi.", attemptId);
  }
}

// Keeps one pull inside the client's page caps for a normal account.
const MAX_SETTLEMENT_PULL_DAYS = 62;

export async function pullMengantarSettlement(
  _previousState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const principal = await requireTenantAdminPrincipal();
  const attemptId = formString(formData, "attemptId");
  const outletId = formString(formData, "outletId");
  if (!attemptId || !UUID_PATTERN.test(attemptId) || !outletId || !UUID_PATTERN.test(outletId)) {
    return failed("Permintaan tarik data Mengantar tidak valid.", attemptId);
  }
  const range = parseAnalyticsRange({
    rentang: formString(formData, "rentang"),
    tz: formString(formData, "tz"),
    dari: formString(formData, "dari"),
    sampai: formString(formData, "sampai"),
    khusus: formString(formData, "khusus"),
  }, new Date());
  if (range.issues.length > 0) {
    return failed("Periode tidak valid. Pilih ulang periode workspace.", attemptId);
  }
  if (range.spanDays > MAX_SETTLEMENT_PULL_DAYS) {
    return failed(`Tarik data Mengantar maksimal ${MAX_SETTLEMENT_PULL_DAYS} hari. Pilih periode lebih pendek.`, attemptId);
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
    // A delivery transition changes what /app and the RTS queue show, so the
    // pages that read `shipments.status` are refreshed with Keuangan.
    revalidatePath("/app/keuangan");
    if (result.appliedTransitionCount > 0) {
      revalidatePath("/app");
      revalidatePath("/app/pengiriman");
      revalidatePath("/app/pengiriman/rts");
    }
    const found = `${result.matchedItemCount} bukti pencairan dan ${result.matchedStatusCount} status cocok dengan kiriman GeraiCUAN`;
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
    // out loud. Counting it and showing it to nobody is how a contradiction
    // between the provider and the ledger's cohort stays invisible.
    const refused = result.refusedTransitionCount > 0
      ? ` ${result.refusedTransitionCount} laporan Mengantar bertentangan dengan status kiriman kita dan tidak diterapkan — periksa di Histori kiriman.`
      : "";
    return succeeded(
      `Data Mengantar ditarik (${scanned}): ${found}. ${result.appliedTransitionCount} kiriman berpindah status sesuai laporan Mengantar. Ledger tidak diubah.${refused}${unrecognised}`,
      attemptId,
    );
  } catch (error) {
    if (error instanceof ProviderSettlementThrottledError) {
      return failed("Data Mengantar baru saja ditarik. Tunggu satu menit lalu coba lagi.", attemptId);
    }
    if (error instanceof ProviderSettlementDeniedError || error instanceof TenantContextDeniedError) {
      return failed("Outlet tidak tersedia untuk tarik data Mengantar.", attemptId);
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
    return failed("Tarik data Mengantar tidak dapat dijalankan. Coba lagi.", attemptId);
  }
}

export async function reverseLedgerEntry(
  _previousState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const principal = await requireTenantAdminPrincipal();
  const attemptId = formString(formData, "attemptId");
  const entryId = formString(formData, "entryId");
  const confirmed = formString(formData, "confirmation") === "confirmed";
  if (
    !attemptId
    || !UUID_PATTERN.test(attemptId)
    || !entryId
    || !UUID_PATTERN.test(entryId)
    || !confirmed
  ) {
    return failed("Permintaan penyesuaian tidak valid.", attemptId);
  }

  try {
    await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => appendLedgerAdjustment(tx, context, entryId, attemptId),
    );
    revalidatePath("/app/keuangan");
    return succeeded(
      "Penyesuaian pembalik tersimpan. Entri asal tetap utuh.",
      attemptId,
    );
  } catch (error) {
    if (error instanceof LedgerDeniedError || error instanceof LedgerUnavailableError) {
      return failed("Entri tidak tersedia atau sudah memiliki pembalik.", attemptId);
    }
    return failed("Penyesuaian tidak dapat dibuat. Coba lagi.", attemptId);
  }
}
