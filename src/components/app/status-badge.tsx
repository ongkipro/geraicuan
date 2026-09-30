import { Ban, Calculator, CircleAlert, CircleCheck, CircleDot, CircleX, Clock, FilePen, PackageCheck, TriangleAlert, Truck, Undo2, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SHIPMENT_STATUS_PRESENTATION, type ShipmentStatus } from "@/lib/shipment-queue";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "pending" | "neutral";

const TONES: Record<StatusTone, { className: string; icon: LucideIcon }> = {
  danger: { className: "bg-danger-surface text-danger", icon: CircleX },
  info: { className: "bg-info-surface text-info", icon: Clock },
  neutral: { className: "bg-muted text-muted-foreground", icon: CircleDot },
  pending: { className: "bg-pending-surface text-pending", icon: Clock },
  success: { className: "bg-ok-surface text-ok", icon: CircleCheck },
  warning: { className: "bg-warn-surface text-warn", icon: TriangleAlert },
};

/**
 * Spec 10 §2.1/§9: a status is an icon plus a word, never colour alone. Tones: success
 * (Terkirim, Retur diterima), pending (Resi terbit), warning (Menunggu, Antre retur, Perlu
 * perhatian), danger (Gagal, Bermasalah, Dibatalkan), info (in progress) and neutral (Draf).
 */
export function StatusBadge({
  className,
  icon,
  label,
  tone,
}: {
  className?: string;
  /** Overrides the tone's default icon. */
  icon?: LucideIcon;
  label: string;
  tone: StatusTone;
}) {
  const Icon = icon ?? TONES[tone].icon;
  return (
    <Badge className={cn(TONES[tone].className, className)} data-tone={tone} variant="secondary">
      <Icon aria-hidden="true" data-icon="inline-start" />
      {label}
    </Badge>
  );
}

/**
 * Spec 10 v3.1 §4.12: the one shipment status → tone + icon mapping. Labels come from the lifecycle
 * source. T-262: the stat strip bars colour by these tones, so the stages a strip shows side by side
 * never share one (Resi terbit pending ≠ Terkirim success; Dibatalkan danger ≠ Lainnya grey).
 */
const SHIPMENT_STATUS_BADGE: Record<ShipmentStatus, { icon: LucideIcon; tone: StatusTone }> = {
  AWAITING_UPSTREAM_PAYMENT: { icon: Clock, tone: "warning" },
  CANCELLED: { icon: Ban, tone: "danger" },
  DELIVERED: { icon: PackageCheck, tone: "success" },
  DRAFT: { icon: FilePen, tone: "neutral" },
  ESTIMATED: { icon: Calculator, tone: "info" },
  FAILED: { icon: CircleX, tone: "danger" },
  IN_TRANSIT: { icon: Truck, tone: "info" },
  ISSUED: { icon: CircleCheck, tone: "pending" },
  PROBLEM: { icon: TriangleAlert, tone: "danger" },
  RTS_IN_TRANSIT: { icon: Truck, tone: "info" },
  RTS_QUEUED: { icon: Undo2, tone: "warning" },
  RTS_RECEIVED: { icon: PackageCheck, tone: "success" },
  SUBMISSION_QUEUED: { icon: Clock, tone: "info" },
  SUBMISSION_UNKNOWN: { icon: CircleAlert, tone: "danger" },
};

/**
 * The statuses plus Histori's "Perlu perhatian" filter (T-262, spec 10 §2.1): the statuses it groups
 * need an action, so it is warning, apart from Dibatalkan's danger in the same strip.
 */
const SHIPMENT_FILTER_BADGE: Record<string, { icon: LucideIcon; tone: StatusTone }> = {
  ...SHIPMENT_STATUS_BADGE,
  NEEDS_ATTENTION: { icon: TriangleAlert, tone: "warning" },
};

/** The §4.12 tone of a shipment status or queue filter, or `null` when `value` is neither (e.g. a metric id). */
export function shipmentStatusTone(value: string): StatusTone | null {
  return Object.hasOwn(SHIPMENT_FILTER_BADGE, value) ? SHIPMENT_FILTER_BADGE[value].tone : null;
}

/** The §4.12 icon of a shipment status or queue filter, or `null` when `value` is neither (status tiles share it). */
export function shipmentStatusIcon(value: string): LucideIcon | null {
  return Object.hasOwn(SHIPMENT_FILTER_BADGE, value) ? SHIPMENT_FILTER_BADGE[value].icon : null;
}

/**
 * T-262: the Cetak resi print states, one tone each for the row badge and the stat strip. Belum
 * dicetak asks for the print (warning), Sudah dicetak is done (success), Dibatalkan is the
 * cancelled resi's §4.12 tone.
 */
export const PRINT_STATE_TONE = {
  batal: SHIPMENT_STATUS_BADGE.CANCELLED.tone,
  belum: "warning",
  // T-267: handed over, waiting for the courier's pickup scan — in progress, its own hue.
  diserahkan: "info",
  sudah: "success",
} as const satisfies Record<"batal" | "belum" | "diserahkan" | "sudah", StatusTone>;

export function ShipmentStatusBadge({ className, status }: { className?: string; status: ShipmentStatus }) {
  const { icon, tone } = SHIPMENT_STATUS_BADGE[status];
  return <StatusBadge className={className} icon={icon} label={SHIPMENT_STATUS_PRESENTATION[status].label} tone={tone} />;
}

