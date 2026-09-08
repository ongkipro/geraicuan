import { shipmentStatuses } from "@/db/schema";
import type { membershipRoles } from "@/db/schema";

export type ShipmentStatus = (typeof shipmentStatuses)[number];
export type ShipmentQueueStatusFilter =
  | ShipmentStatus
  | "ACTION_REQUIRED"
  | "READY_TO_PROGRESS"
  | "ISSUED_TODAY"
  | "ALL";
export type TenantShipmentRole = (typeof membershipRoles)[number];

export const SHIPMENT_QUEUE_PAGE_SIZE = 20;

export const SHIPMENT_STATUS_PRESENTATION: Record<
  Exclude<ShipmentQueueStatusFilter, "ALL" | "ACTION_REQUIRED">,
  {
    guidance: string;
    label: string;
    tone: "danger" | "neutral" | "ok" | "warn";
  }
> = {
  READY_TO_PROGRESS: {
    guidance: "Draf dan estimasi ini masih memerlukan langkah operator berikutnya.",
    label: "Siap dilanjutkan",
    tone: "neutral",
  },
  ISSUED_TODAY: {
    guidance: "AWB diterbitkan pada hari operasional WIB saat ini.",
    label: "Resi terbit hari ini",
    tone: "ok",
  },
  DRAFT: {
    guidance: "Draf sudah tersimpan dan dapat dilanjutkan untuk memuat estimasi.",
    label: "Draf",
    tone: "neutral",
  },
  ESTIMATED: {
    guidance: "Estimasi terakhir tersimpan. Tinjau layanan sebelum konfirmasi penerbitan AWB.",
    label: "Diestimasi",
    tone: "neutral",
  },
  SUBMISSION_QUEUED: {
    guidance: "Permintaan sedang menunggu pemrosesan. Jangan membuat kiriman pengganti.",
    label: "Antre kirim",
    tone: "neutral",
  },
  SUBMISSION_UNKNOWN: {
    guidance: "Hasil pengiriman belum pasti. Jangan kirim ulang sebelum rekonsiliasi penyedia selesai.",
    label: "Perlu rekonsiliasi",
    tone: "danger",
  },
  ISSUED: {
    guidance: "AWB sudah diterbitkan dan label dapat dibuka atau dicetak ulang.",
    label: "Resi terbit",
    tone: "ok",
  },
  AWAITING_UPSTREAM_PAYMENT: {
    guidance: "Kiriman non-COD menunggu pelunasan Mengantar sebelum AWB tersedia.",
    label: "Menunggu pembayaran",
    tone: "warn",
  },
  RTS_QUEUED: { guidance: "Menunggu dikembalikan", label: "RTS Antre", tone: "warn" }, RTS_IN_TRANSIT: { guidance: "Sedang dikembalikan", label: "RTS Perjalanan", tone: "warn" }, RTS_RECEIVED: { guidance: "Sudah dikembalikan", label: "RTS Selesai", tone: "neutral" }, IN_TRANSIT: { guidance: "Dalam perjalanan", label: "Perjalanan", tone: "neutral" }, DELIVERED: { guidance: "Terkirim", label: "Terkirim", tone: "ok" }, PROBLEM: { guidance: "Bermasalah", label: "Bermasalah", tone: "danger" }, FAILED: {
    guidance: "Pengiriman tidak berhasil. Periksa konteks aman di bawah sebelum membuat draf baru.",
    label: "Gagal",
    tone: "danger",
  },
};

export const SHIPMENT_STATUS_OPTIONS: readonly {
  label: string;
  value: ShipmentQueueStatusFilter;
}[] = [
  { label: "Semua status", value: "ALL" },
  { label: "Perlu tindakan", value: "ACTION_REQUIRED" },
  { label: "Siap dilanjutkan", value: "READY_TO_PROGRESS" },
  { label: "Resi terbit hari ini", value: "ISSUED_TODAY" },
  ...shipmentStatuses.map((status) => ({
    label: SHIPMENT_STATUS_PRESENTATION[status].label,
    value: status,
  })),
];

type SearchValue = string | string[] | undefined;

function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

export type ShipmentQueueQuery = {
  issues: string[];
  page: number;
  status: ShipmentQueueStatusFilter;
};

export function parseShipmentQueueQuery(input: {
  page?: SearchValue;
  status?: SearchValue;
}): ShipmentQueueQuery {
  const issues: string[] = [];
  const requestedStatus = firstValue(input.status);
  let status: ShipmentQueueStatusFilter = "ALL";

  if (requestedStatus && requestedStatus !== "ALL") {
    if (
      requestedStatus === "ACTION_REQUIRED" ||
      requestedStatus === "READY_TO_PROGRESS" ||
      requestedStatus === "ISSUED_TODAY" ||
      (shipmentStatuses as readonly string[]).includes(requestedStatus)
    ) {
      status = requestedStatus as ShipmentQueueStatusFilter;
    } else {
      issues.push("Status tidak dikenali; semua status ditampilkan.");
    }
  }

  const requestedPage = firstValue(input.page);
  let page = 1;
  if (requestedPage) {
    const parsed = Number(requestedPage);
    if (Number.isSafeInteger(parsed) && parsed >= 1) {
      page = parsed;
    } else {
      issues.push("Nomor halaman tidak valid; halaman pertama ditampilkan.");
    }
  }

  return { issues, page, status };
}

export function shipmentQueueHref(
  status: ShipmentQueueStatusFilter,
  page = 1,
) {
  const query = new URLSearchParams();
  if (status !== "ALL") query.set("status", status);
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `/app/pengiriman?${suffix}` : "/app/pengiriman";
}

export type ShipmentLifecycleAction = {
  description: string;
  href?: string;
  id:
    | "confirm-estimate"
    | "new-draft"
    | "open-label"
    | "reconcile-unknown"
    | "recover-unpaid"
    | "resume-draft"
    | "review-estimate";
  kind: "link" | "placeholder";
  label: string;
};

export function shipmentLifecycleActions(
  status: ShipmentStatus,
  role: TenantShipmentRole,
  shipmentId: string,
): ShipmentLifecycleAction[] {
  const encodedId = encodeURIComponent(shipmentId);

  switch (status) {
    case "DRAFT":
      return [
        {
          description: "Buka draf tersimpan untuk memuat estimasi tanpa mencari UUID.",
          href: `/app/pengiriman/baru?draft=${encodedId}`,
          id: "resume-draft",
          kind: "link",
          label: "Lanjutkan draf",
        },
      ];
    case "ESTIMATED":
      return [
        {
          description: "Buka estimasi terakhir dan muat ulang layanan bila diperlukan.",
          href: `/app/pengiriman/baru?draft=${encodedId}`,
          id: "review-estimate",
          kind: "link",
          label: "Tinjau estimasi",
        },
        {
          description:
            "Pilih satu layanan yang memenuhi syarat, tinjau nilai, lalu konfirmasi penerbitan sekali.",
          href: "#konfirmasi-penerbitan-awb",
          id: "confirm-estimate",
          kind: "link",
          label: "Pilih layanan dan konfirmasi",
        },
      ];
    case "ISSUED":
      return [
        {
          description: "Buka label 100 × 150 mm dan riwayat cetak kiriman ini.",
          href: `/app/label/${encodedId}`,
          id: "open-label",
          kind: "link",
          label: "Buka label dan riwayat cetak",
        },
      ];
    case "AWAITING_UPSTREAM_PAYMENT":
      return role === "TENANT_ADMIN"
        ? [
            {
              description:
                "Danai saldo Mengantar, lalu buka konfirmasi pemulihan satu kali.",
              href: "#pemulihan-pembayaran",
              id: "recover-unpaid",
              kind: "link",
              label: "Pulihkan pembayaran",
            },
          ]
        : [];
    case "FAILED":
      return [
        {
          description: "Mulai kiriman baru setelah memeriksa penyebab aman yang tersedia.",
          href: "/app/pengiriman/baru",
          id: "new-draft",
          kind: "link",
          label: "Buat draf baru",
        },
      ];
    case "SUBMISSION_UNKNOWN":
      return role === "TENANT_ADMIN"
        ? [{
            description: "Cocokkan identifier batch dan pesanan tersimpan dengan hasil authoritative tanpa mengirim ulang pesanan.",
            href: "#rekonsiliasi-pengiriman",
            id: "reconcile-unknown",
            kind: "link",
            label: "Rekonsiliasi hasil penyedia",
          }]
        : [];
    default:
      return [];
    case "SUBMISSION_QUEUED":
      return [];
  }
}
