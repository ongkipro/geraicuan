"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db, dbPool } from "@/db/client";
import { TenantContextDeniedError } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { isLiveMengantarOrdersEnabled, LiveMengantarOrdersDisabledError } from "@/lib/mengantar-live-transport";
import { OrderRateLimitedError } from "@/lib/order-rate-limit";
import type { ShipmentCancelRefusal } from "@/lib/shipment-cancel-rules";
import {
  cancelShipmentAtMengantar,
  ShipmentCancelDeniedError,
  ShipmentCancelUnavailableError,
} from "@/lib/shipment-cancellation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShipmentCancelActionState = {
  error?: string;
  /** `already`: the shipment was cancelled before this request; nothing was sent. */
  cancelled?: { already: boolean };
};

const NOT_ENABLED = "Pembatalan di Mengantar belum diaktifkan di GeraiCUAN. Hubungi admin GeraiCUAN.";
const UNCHANGED = "Status kiriman tidak diubah.";
const PULL_HINT = "Jalankan “Perbarui status dari Mengantar” di Histori kiriman, atau cek pesanan di aplikasi Mengantar.";

const REFUSAL_MESSAGES: Record<ShipmentCancelRefusal, string> = {
  NOT_FOUND: "Kiriman tidak ditemukan.",
  STATUS: "Kiriman ini tidak dapat dibatalkan: hanya kiriman Resi terbit atau Menunggu pembayaran yang bisa dibatalkan. Muat ulang halaman untuk melihat status terbarunya.",
  NO_ORDER_ID: "Kiriman ini belum punya nomor pesanan Mengantar, jadi tidak bisa dibatalkan dari GeraiCUAN. Batalkan lewat aplikasi Mengantar.",
  PAST_PICKUP: "Tidak dapat dibatalkan: Mengantar sudah mencatat paket dijemput atau dalam perjalanan.",
  ANTERAJA_WAIT: "Pesanan AnterAja baru bisa dibatalkan 5 menit setelah dibuat. Coba lagi sebentar lagi.",
  PAYMENT_UNCERTAIN: "Pembayaran pesanan ini belum pasti. Selesaikan pemeriksaan pembayaran dulu sebelum membatalkan.",
  COURIER_UNSUPPORTED: "Pesanan kurir ini tidak bisa dibatalkan dari GeraiCUAN. Batalkan lewat aplikasi Mengantar.",
};

function withProviderMessage(text: string, providerMessage: string | null) {
  return providerMessage ? `${text} Pesan Mengantar: “${providerMessage}”` : text;
}

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

/**
 * T-281 (D-42) "Batalkan kiriman": a Tenant Admin cancels an ISSUED or unpaid shipment on
 * Mengantar (`DELETE /order`). The tenant is the session's; the role, the live switch and every
 * rule are checked here and again in the library and the database. The shipment becomes
 * CANCELLED only after Mengantar confirms the deletion; any other answer changes nothing.
 */
export async function cancelShipmentOnMengantar(
  _previous: ShipmentCancelActionState,
  formData: FormData,
): Promise<ShipmentCancelActionState> {
  const shipmentId = formData.get("shipmentId");
  if (typeof shipmentId !== "string" || !UUID_PATTERN.test(shipmentId)) return { error: REFUSAL_MESSAGES.NOT_FOUND };
  if (formData.get("confirmation") !== "confirmed") {
    return { error: "Centang konfirmasi bahwa pembatalan tidak dapat diurungkan." };
  }

  const principal = await requireTenantPrincipal();
  if (principal.role !== "TENANT_ADMIN") return { error: "Pembatalan kiriman hanya tersedia untuk pemilik gerai." };
  if (!isLiveMengantarOrdersEnabled()) return { error: NOT_ENABLED };

  try {
    const result = await cancelShipmentAtMengantar({
      db,
      lockPool: dbPool,
      principalId: principal.userId,
      tenantId: principal.tenantId,
      shipmentId,
    });
    switch (result.outcome) {
      case "CANCELLED":
      case "ALREADY_CANCELLED":
        revalidatePath("/app/pengiriman/[shipmentId]", "page");
        revalidatePath("/app/pengiriman");
        return { cancelled: { already: result.outcome === "ALREADY_CANCELLED" } };
      case "NOT_ALLOWED":
        return { error: REFUSAL_MESSAGES[result.reason] };
      case "REFUSED":
        return { error: withProviderMessage(`Mengantar menolak pembatalan. ${UNCHANGED}`, result.providerMessage) };
      case "SKIPPED":
        return {
          error: withProviderMessage(
            `Mengantar tidak menghapus pesanan ini, biasanya karena kurir sudah menjemput paket atau pesanan sudah dibatalkan. ${UNCHANGED} ${PULL_HINT}`,
            result.providerMessage,
          ),
        };
      case "UNKNOWN":
        return { error: `Hasil pembatalan di Mengantar belum pasti. ${UNCHANGED} ${PULL_HINT}` };
      case "NOT_RECORDED":
        // T-281 review round 3: a pull cannot settle an unpaid order (no AWB), so say what to do.
        return { error: `Mengantar sudah menghapus pesanan, tetapi GeraiCUAN belum dapat mencatatnya. ${PULL_HINT} Jika kiriman belum punya resi, jangan bayar kiriman ini dan hubungi admin GeraiCUAN.` };
    }
  } catch (error) {
    if (error instanceof LiveMengantarOrdersDisabledError) return { error: NOT_ENABLED };
    if (error instanceof OrderRateLimitedError) return { error: "Terlalu banyak permintaan ke Mengantar. Tunggu beberapa menit lalu coba lagi." };
    if (
      error instanceof TenantContextDeniedError
      || error instanceof ShipmentCancelDeniedError
      || error instanceof ShipmentCancelUnavailableError
    ) {
      return { error: "Pembatalan tidak dapat diproses. Muat ulang detail kiriman lalu coba lagi." };
    }
    throw error;
  }
}
