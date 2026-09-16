// Imported from the pure literal module, never from `@/db/schema`: this file
// is reachable from a client component, and a value import of the schema would
// bundle the whole Drizzle table graph into the browser.
import { shipmentStatuses } from "@/lib/domain-enums";
import type { membershipRoles } from "@/lib/domain-enums";

export type ShipmentStatus = (typeof shipmentStatuses)[number];
export type ShipmentQueueStatusFilter =
  | ShipmentStatus
  | "ACTION_REQUIRED"
  | "NEEDS_ATTENTION"
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
  // Spec 19 QUE-ATTENTION. Wider than ACT-NEEDED on purpose (PR-52): it also
  // gathers the provider-reported problem and the non-COD shipment waiting for
  // upstream payment, so the panel entry covers every kiriman an operator has
  // to look at rather than only the two ACT-NEEDED acts on.
  NEEDS_ATTENTION: {
    guidance: "Rekonsiliasi, kendala kurir, kegagalan, dan menunggu pelunasan dikumpulkan di sini.",
    label: "Perlu perhatian",
    tone: "danger",
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
  IN_TRANSIT: {
    guidance: "Kurir sedang mengantar ke penerima. Jangan membuat kiriman pengganti untuk paket yang sama.",
    label: "Dalam perjalanan",
    tone: "warn",
  },
  DELIVERED: {
    guidance: "Paket tercatat sampai ke penerima dan lifecycle kiriman ini sudah selesai.",
    label: "Terkirim",
    tone: "ok",
  },
  PROBLEM: {
    guidance: "Kurir melaporkan kendala pengantaran. Penyedia yang menentukan status berikutnya untuk kiriman ini.",
    label: "Bermasalah",
    tone: "danger",
  },
  RTS_QUEUED: {
    guidance: "Paket dijadwalkan kembali ke outlet asal dan menunggu dijemput kurir.",
    label: "Antre retur",
    tone: "warn",
  },
  RTS_IN_TRANSIT: {
    guidance: "Paket retur sedang dalam perjalanan kembali ke outlet asal dan belum tercatat diterima.",
    label: "Retur dalam perjalanan",
    tone: "warn",
  },
  RTS_RECEIVED: {
    guidance: "Barang retur sudah tercatat diterima di outlet asal dan tidak menunggu langkah lifecycle lain.",
    label: "Retur diterima",
    tone: "ok",
  },
  FAILED: {
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
  { label: SHIPMENT_STATUS_PRESENTATION.NEEDS_ATTENTION.label, value: "NEEDS_ATTENTION" },
  { label: "Siap dilanjutkan", value: "READY_TO_PROGRESS" },
  { label: "Resi terbit hari ini", value: "ISSUED_TODAY" },
  ...shipmentStatuses.map((status) => ({
    label: SHIPMENT_STATUS_PRESENTATION[status].label,
    value: status,
  })),
];

/**
 * PR-52 state summary panel on Histori kiriman.
 *
 * The grouping is the owner's ("Perlu dibuatkan resi", "Perlu pickup", …) but
 * the label of every entry that names one lifecycle state is the shared
 * presentation label, not a second word for the same status — the badge in the
 * row below the panel says "Terkirim", so the entry above it must not say
 * "Sampai tujuan". The operator-facing meaning lives in the entry's own line of
 * description instead. `statuses: null` is the unfiltered total.
 */
export const SHIPMENT_QUEUE_SUMMARY_ENTRIES = [
  {
    description: "Seluruh kiriman tersimpan, apa pun tahap lifecycle-nya.",
    label: "Semua kiriman",
    metricId: "QUE-ALL",
    statuses: null,
    value: "ALL",
  },
  {
    description: "Draf dan estimasi yang belum punya nomor resi.",
    label: SHIPMENT_STATUS_PRESENTATION.READY_TO_PROGRESS.label,
    metricId: "QUE-NEEDS-AWB",
    statuses: ["DRAFT", "ESTIMATED"],
    value: "READY_TO_PROGRESS",
  },
  {
    description: "Resi sudah terbit dan paket belum tercatat bergerak.",
    label: SHIPMENT_STATUS_PRESENTATION.ISSUED.label,
    metricId: "QUE-AWAITING-PICKUP",
    statuses: ["ISSUED"],
    value: "ISSUED",
  },
  {
    description: "Kurir sedang mengantar ke penerima.",
    label: SHIPMENT_STATUS_PRESENTATION.IN_TRANSIT.label,
    metricId: "QUE-IN-TRANSIT",
    statuses: ["IN_TRANSIT"],
    value: "IN_TRANSIT",
  },
  {
    description: "Paket tercatat sampai dan lifecycle-nya selesai.",
    label: SHIPMENT_STATUS_PRESENTATION.DELIVERED.label,
    metricId: "QUE-DELIVERED",
    statuses: ["DELIVERED"],
    value: "DELIVERED",
  },
  {
    description: SHIPMENT_STATUS_PRESENTATION.NEEDS_ATTENTION.guidance,
    label: SHIPMENT_STATUS_PRESENTATION.NEEDS_ATTENTION.label,
    metricId: "QUE-ATTENTION",
    statuses: [
      "SUBMISSION_UNKNOWN",
      "PROBLEM",
      "FAILED",
      "AWAITING_UPSTREAM_PAYMENT",
    ],
    value: "NEEDS_ATTENTION",
  },
] as const satisfies readonly {
  description: string;
  label: string;
  metricId: string;
  statuses: readonly ShipmentStatus[] | null;
  value: ShipmentQueueStatusFilter;
}[];

export type ShipmentQueueSummary = Record<
  (typeof SHIPMENT_QUEUE_SUMMARY_ENTRIES)[number]["metricId"],
  number
>;

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
      requestedStatus === "NEEDS_ATTENTION" ||
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

/**
 * `carry` is the page's other URL state — since T-163 that is the PR-53 range
 * (`rentang`, `dari`, `sampai`, `tz`). Every link this builds keeps it, or
 * paginating or changing the status facet would silently reset the period.
 */
export function shipmentQueueHref(
  status: ShipmentQueueStatusFilter,
  page = 1,
  carry?: Readonly<Record<string, string>>,
) {
  const query = new URLSearchParams(carry ?? {});
  query.delete("status");
  query.delete("page");
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
