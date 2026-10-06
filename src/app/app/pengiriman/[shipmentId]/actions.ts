"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { COD_ONGKIR_FIELD_NAME, parseRupiahInput } from "@/lib/shipment-draft-logic";
import {
  CodOngkirChargeRefusedError,
  CodTotalsFormulaRetiredError,
  CodTotalsUnavailableError,
} from "@/db/cod-totals-repository";
import { db, dbPool } from "@/db/client";
import { OrderBatchUnavailableError, OrderCourierDisabledError } from "@/db/order-batch-repository";
import { TenantContextDeniedError } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { characterClassError } from "@/lib/field-character-classes";
import { formatIdr } from "@/lib/label-format";
import { COD_FORMULA_RETIRED_MESSAGE } from "@/lib/mengantar-cod-fee";
import { courierDisplayName } from "@/lib/mengantar-couriers";
import {
  isLiveMengantarOrdersEnabled,
  LiveMengantarOrdersDisabledError,
  resolveLiveMengantarOrderTransport,
} from "@/lib/mengantar-live-transport";
import {
  MengantarOrderPayloadError,
  MengantarOrderRefusedError,
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
  ORDER_COURIER_UNDOCUMENTED:
    "Ekspedisi ini bisa dicek tarifnya, tetapi belum bisa dipesan lewat API Mengantar. Pilih ekspedisi lain.",
  ORDER_SERVICE_UNDOCUMENTED:
    "Layanan ini belum bisa dipesan lewat API Mengantar. Pilih layanan lain dari ekspedisi yang sama.",
  ORDER_CARGO_DANGEROUS_GOODS:
    "Barang berbahaya tidak dapat dikirim dengan layanan kargo. Pilih layanan reguler.",
  ORDER_PICKUP_TIME_UNAVAILABLE:
    "Jadwal penjemputan belum bisa dikirim ke Mengantar. Buat kiriman baru dengan Drop di outlet.",
  ORDER_PICKUP_SLOT_UNAVAILABLE:
    "Jadwal penjemputan kiriman ini sudah lewat atau di luar 09.00–18.00 WIB. Buat kiriman baru dan pilih jadwal lagi.",
  ORDER_PICKUP_VOLUME_MISSING:
    "Penjemputan terjadwal perlu kendaraan (Motor/Mobil/Truk). Buat kiriman baru dan pilih kendaraan.",
  // T-280: Mengantar answered and created nothing; the shipment is back in the queue.
  ORDER_PROVIDER_CONFLICT:
    "Mengantar sedang memproses pesanan lain di akun ini. Tunggu sebentar lalu terbitkan lagi.",
  ORDER_PROVIDER_REFUSED_400:
    "Mengantar menolak pesanan ini, jadi tidak ada resi yang dibuat. Periksa data kiriman lalu terbitkan lagi.",
  ORDER_PROVIDER_REFUSED_403:
    "Akun Mengantar belum diizinkan untuk pesanan ini (misalnya COD Pos). Pilih kurir lain atau hubungi Mengantar.",
  ORDER_PROVIDER_REFUSED_422:
    "Mengantar menolak data pesanan ini, jadi tidak ada resi yang dibuat. Periksa data kiriman lalu terbitkan lagi.",
  PICKUP_TIME_REFUSED:
    "Mengantar menolak jadwal penjemputan ini. Pilih jadwal lain atau gunakan Drop di outlet.",
  ORDER_NOT_SENT:
    "Pesanan belum terkirim ke Mengantar, jadi tidak ada resi yang dibuat. Coba terbitkan lagi.",
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
    case "NOT_COMPUTED":
      return `Nilai COD Ongkir dihitung otomatis (ongkir + biaya COD) dan tidak dapat diubah: ${formatIdr(error.breakEvenIdr ?? 0)}. Muat ulang lalu konfirmasi lagi.`;
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
    return { error: "Pilih layanan yang tersedia dan centang konfirmasi penerbitan resi." };
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
  // T-280 (D-42): the live transport when switched on, else the sanctioned fixture
  // (development only), else no issuance at all.
  const resolveTransport = isLiveMengantarOrdersEnabled()
    ? resolveLiveMengantarOrderTransport
    : isSanctionedOrderFixtureEnabled()
      ? resolveSanctionedOrderFixtureTransport
      : null;
  if (!resolveTransport) {
    return {
      error:
        "Penerbitan resi belum diaktifkan di GeraiCUAN. Hubungi admin GeraiCUAN.",
    };
  }

  try {
    const result = await confirmFixtureBackedShipmentIssuance({
      db,
      lockPool: dbPool,
      principalId: principal.userId,
      tenantId: principal.tenantId,
      confirmation: { shipmentId, estimateSnapshotId, estimateServiceId, codShippingChargeIdr },
      resolveTransport,
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
            : "Resi belum diterbitkan. Muat ulang detail untuk melihat status terbaru.",
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
    if (error instanceof MengantarOrderRefusedError) {
      const known = PAYLOAD_ERROR_MESSAGES[error.safeCode] ?? PAYLOAD_ERROR_FALLBACK_MESSAGE;
      return {
        code: error.safeCode,
        error: error.providerMessage ? `${known} Pesan Mengantar: “${error.providerMessage}”` : known,
      };
    }
    if (error instanceof OrderRateLimitedError) {
      return { error: "Terlalu banyak konfirmasi. Tunggu beberapa menit lalu coba lagi." };
    }
    if (error instanceof OrderCourierDisabledError) {
      return {
        error: `Kurir ${courierDisplayName(error.courier)} sedang dinonaktifkan di Pengaturan › Mitra kurir. Pilih layanan kurir lain, atau aktifkan kembali kurirnya.`,
      };
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
      error instanceof LiveMengantarOrdersDisabledError ||
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
