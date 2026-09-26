import type { KpiDelta } from "@/components/app/kpi-card";
import { shipmentDetailHref } from "@/lib/shipment-number";
import type { ShipmentStatus, TenantShipmentRole } from "@/lib/shipment-queue";

/** Rows the "Kiriman terbaru" card shows (the reference lists six). */
export const RECENT_ROWS = 6;

/** The dashboard's default period; the filter row offers "Hapus filter" only away from it. */
export const DASHBOARD_DEFAULT_PRESET = "7-hari";

type RecentRow = { publicReference: string; shipmentId: string; status: ShipmentStatus; updatedAt: Date };

/**
 * The next step of a recent shipment, per role. Every row gets a link; a shipment with nothing
 * to do opens its detail ("Lihat detail", as the reference does for Resi terbit / Terkirim).
 */
export function recentNextStep(row: { publicReference: string; shipmentId: string; status: ShipmentStatus }, role: TenantShipmentRole) {
  const detail = shipmentDetailHref(row.publicReference);
  const draft = `/app/pengiriman/baru?draft=${encodeURIComponent(row.shipmentId)}`;
  switch (row.status) {
    case "DRAFT":
      return { actionable: true, href: draft, label: "Lanjutkan draf" };
    case "ESTIMATED":
      return { actionable: true, href: draft, label: "Tinjau estimasi" };
    case "AWAITING_UPSTREAM_PAYMENT":
      return role === "TENANT_ADMIN"
        ? { actionable: true, href: `${detail}#pemulihan-pembayaran`, label: "Pulihkan pembayaran" }
        : { actionable: true, href: detail, label: "Lihat panduan" };
    case "SUBMISSION_UNKNOWN":
      // An Operator cannot reconcile; the detail tells them to ask the Pemilik gerai.
      return { actionable: true, href: detail, label: role === "TENANT_ADMIN" ? "Periksa rekonsiliasi" : "Lihat panduan" };
    case "FAILED":
      return { actionable: true, href: detail, label: "Periksa kegagalan" };
    default:
      return { actionable: false, href: detail, label: "Lihat detail" };
  }
}

const EXCEPTIONS: ReadonlySet<ShipmentStatus> = new Set(["AWAITING_UPSTREAM_PAYMENT", "SUBMISSION_UNKNOWN", "FAILED"]);

/**
 * One list from the actionable and recent reads, each shipment once: exceptions first, then the
 * other shipments with a next step, then the rest; newest first inside each group.
 */
export function mergeRecentShipments<T extends RecentRow>(actionable: readonly T[], recent: readonly T[], role: TenantShipmentRole, limit = RECENT_ROWS): T[] {
  const byId = new Map<string, T>();
  for (const row of [...actionable, ...recent]) if (!byId.has(row.shipmentId)) byId.set(row.shipmentId, row);
  const rank = (row: T) => (EXCEPTIONS.has(row.status) ? 0 : recentNextStep(row, role).actionable ? 1 : 2);
  return [...byId.values()]
    .sort((a, b) => rank(a) - rank(b) || b.updatedAt.getTime() - a.updatedAt.getTime() || (a.shipmentId < b.shipmentId ? 1 : -1))
    .slice(0, limit);
}

/** A KPI change against the comparison period; the percentage is null when that period was zero. */
export function kpiDelta(current: number, previous: number): KpiDelta {
  const change = current - previous;
  return { change, percent: previous === 0 ? null : (change / previous) * 100 };
}

/** Courier recap totals; a hidden cost (Operator) stays null rather than reading as Rp 0. */
export function courierTotals(rows: readonly { deliveredCount: number; returnedCount: number; shipmentCount: number; shippingCostIdr: number | null }[]) {
  return rows.reduce(
    (sum, row) => ({
      deliveredCount: sum.deliveredCount + row.deliveredCount,
      returnedCount: sum.returnedCount + row.returnedCount,
      shipmentCount: sum.shipmentCount + row.shipmentCount,
      shippingCostIdr: row.shippingCostIdr === null ? sum.shippingCostIdr : (sum.shippingCostIdr ?? 0) + row.shippingCostIdr,
    }),
    { deliveredCount: 0, returnedCount: 0, shipmentCount: 0, shippingCostIdr: null as number | null },
  );
}
