"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { COD_ONGKIR_FIELD_NAME, parseRupiahInput } from "@/app/app/shipment-draft-experience";
import {
  CodOngkirChargeRefusedError,
  CodTotalsFormulaRetiredError,
  CodTotalsUnavailableError,
} from "@/db/cod-totals-repository";
import { db, dbPool } from "@/db/client";
import { OrderBatchUnavailableError } from "@/db/order-batch-repository";
import { TenantContextDeniedError } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { characterClassError } from "@/lib/field-character-classes";
import { formatIdr } from "@/lib/label-format";
import { COD_FORMULA_RETIRED_MESSAGE } from "@/lib/mengantar-cod-fee";
import {
  MengantarOrderPayloadError,
  MengantarOrderTransportUnavailableError,
} from "@/lib/mengantar-order";
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
  /** Present only for `MengantarOrderPayloadError`, so the panel can offer a
   *  specific recovery (e.g. re-verifying a destination area) instead of a
   *  generic retry. */
  code?: string;
  error?: string;
  issued?: { awb: string; duplicate: boolean; labelHref: string };
};

// One Indonesian operator message per `MengantarOrderPayloadError.safeCode`,
// each saying what to do next. The safeCode also already carries telemetry
// (emitted where the payload was rejected, in `mengantar-order.ts`), so this
// mapping only owns the UI message.
const PAYLOAD_ERROR_MESSAGES: Record<string, string> = {
  ORDER_COD_AMOUNT_MISSING:
    "Total COD kiriman ini belum lengkap. Muat ulang estimasi COD lalu konfirmasi ulang.",
  ORDER_DESTINATION_AREA_UNVERIFIED:
    "Area tujuan draf ini belum pernah diverifikasi ke Mengantar. Verifikasi ulang tujuan di bawah, lalu konfirmasi kembali.",
  ORDER_WEIGHT_UNCONVERTIBLE:
    "Berat paket tidak dapat dikonversi ke satuan penyedia. Perbarui berat paket pada draf kiriman.",
};

/** T-186: the server's own refusal of a COD Ongkir charge, with the exact figure. */
function codOngkirRefusalMessage(error: CodOngkirChargeRefusedError) {
  const minimum = error.breakEvenIdr === null ? "" : ` Minimal ${formatIdr(error.breakEvenIdr)} (titik impas).`;
  switch (error.reason) {
    case "BELOW_BREAK_EVEN":
      return `Ongkir COD di bawah titik impas ditolak karena membuat penjual rugi.${minimum}`;
    case "MISSING":
    case "INVALID":
      return `Isi ongkir yang ditagih kurir dalam rupiah bulat.${minimum}`;
    case "ALREADY_RECORDED":
      return `Ongkir COD kiriman ini sudah tercatat ${formatIdr(error.recordedChargeIdr ?? 0)} dan tidak dapat diubah. Konfirmasi ulang dengan nilai itu.`;
    case "NOT_COD_ONGKIR":
      return "Kiriman ini bukan COD Ongkir, jadi ongkir COD tidak dapat diisi.";
  }
}

const PAYLOAD_ERROR_FALLBACK_MESSAGE =
  "Data kiriman ini tidak dapat diproses penyedia. Perbarui draf lalu coba lagi.";

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
  const chargeValue = formData.get(COD_ONGKIR_FIELD_NAME);
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
  // Absent means the form showed no COD Ongkir field; anything present must be
  // whole rupiah, and the repository decides whether this shipment may carry it.
  let codShippingChargeIdr: number | null = null;
  if (chargeValue !== null) {
    // T-196: a letter or symbol gets its own message before the amount rules.
    const chargeClass = typeof chargeValue === "string"
      ? characterClassError("RUPIAH", "Ongkir yang ditagih kurir", chargeValue.trim())
      : null;
    if (chargeClass) return { error: chargeClass };
    codShippingChargeIdr = typeof chargeValue === "string" ? parseRupiahInput(chargeValue) : null;
    if (codShippingChargeIdr === null) {
      return { error: "Isi ongkir yang ditagih kurir dalam rupiah bulat tanpa desimal." };
    }
  }

  const principal = await requireTenantPrincipal();
  // No live Mengantar `/order` transport exists yet — the only
  // `MengantarOrderTransportLookup` implementation reads a sanitized fixture
  // (`resolveSanctionedOrderFixtureTransport`) and is disabled outright in
  // production. Issuance refuses here with an honest message rather than
  // silently exercising a code path with nothing real behind it; see
  // `src/lib/sanctioned-order-fixture.ts` and TASKS.md's T-80 entry for what
  // a real transport needs (verified provider contract, timeout/retry/error
  // handling, and it must reuse `resolveTransport`'s existing shape here).
  if (!isSanctionedOrderFixtureEnabled()) {
    return {
      error:
        "Penerbitan dinonaktifkan karena data uji non-produksi yang disetujui belum diaktifkan.",
    };
  }

  try {
    const result = await confirmFixtureBackedShipmentIssuance({
      db,
      lockPool: dbPool,
      principalId: principal.userId,
      tenantId: principal.tenantId,
      confirmation: { shipmentId, estimateSnapshotId, estimateServiceId, codShippingChargeIdr },
      resolveTransport: resolveSanctionedOrderFixtureTransport,
    });
    revalidatePath("/app/pengiriman/[shipmentId]", "page");
    revalidatePath("/app/pengiriman");
    // T-200: the one-page creation flow shows the same confirmation.
    revalidatePath("/app/pengiriman/baru");
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
    if (error instanceof CodOngkirChargeRefusedError) {
      return { error: codOngkirRefusalMessage(error) };
    }
    if (error instanceof CodTotalsFormulaRetiredError) {
      return { error: COD_FORMULA_RETIRED_MESSAGE };
    }
    if (error instanceof MengantarOrderPayloadError) {
      return {
        code: error.safeCode,
        error: PAYLOAD_ERROR_MESSAGES[error.safeCode] ?? PAYLOAD_ERROR_FALLBACK_MESSAGE,
      };
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
