import { type HealthSeverity, PLATFORM_HEALTH_THRESHOLDS as T, type PlatformHealth, type TenantUsageRow } from "@/db/platform-monitoring-repository";
import type { PlatformFilters } from "@/lib/platform-monitoring-filters";
import { formatCount, formatDuration } from "@/lib/platform-monitoring-format";
import { formatRate } from "@/lib/shipment-report-analytics";

const minutes = (ms: number) => ms / 60_000;
const percent = (share: number) => `${share * 100}%`;

/**
 * The "Cara membaca kesehatan platform" caption (spec 19 M-2, T-93), worded from the same
 * thresholds `platformHealthSeverities` applies, so a changed threshold changes its sentence. It
 * names where a rule ignores the period filter (the rolling hour).
 */
export const PLATFORM_HEALTH_CAPTION: readonly string[] = [
  `Antrean pengajuan menghitung pengajuan ke Mengantar yang tertahan lebih dari ${minutes(T.queueStuckMs)} menit. Kritis bila ${T.queueCriticalCount} atau lebih, atau yang terlama lebih dari ${minutes(T.queueCriticalAgeMs)} menit.`,
  `Kegagalan provider adalah pengajuan gagal pada periode ini; persennya dari semua pengajuan periode ini. Perhatian di atas ${percent(T.failureAttentionShare)}, Kritis di atas ${percent(T.failureCriticalShare)}.`,
  `Kritis juga bila ${T.failureRecentCodeCount} pengajuan gagal dengan kode yang sama dalam ${minutes(T.failureRecentWindowMs)} menit terakhir — dihitung dari waktu halaman dimuat, bukan dari periode filter — atau bila ada kegagalan autentikasi, kredensial, atau skema pada periode ini.`,
  `Status tidak diketahui perlu rekonsiliasi sebelum dicoba lagi; Kritis bila yang terlama lebih dari ${minutes(T.unknownCriticalAgeMs)} menit.`,
  `Menunggu pembayaran adalah pesanan yang belum dibayar ke Mengantar; Perhatian bila ada satu pun, Kritis bila yang terlama lebih dari ${minutes(T.unpaidCriticalAgeMs) / 60} jam. Durasi penyelesaian adalah median waktu pengajuan sampai selesai.`,
  "Tanda Perhatian atau Kritis hanya muncul bila perlu tindakan.",
];

export type AttentionItem = {
  detail: string;
  href?: string;
  key: string;
  severity: Exclude<HealthSeverity, "normal">;
  title: string;
};

/**
 * "Perlu perhatian" on the Ringkasan: every health signal above Normal, then each tenant with
 * failed, unknown or unpaid submissions in the period — Kritis first. Empty means nothing asks
 * for a decision.
 */
export function attentionItems(health: PlatformHealth | null, tenants: readonly TenantUsageRow[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (health) {
    const signals = [
      { detail: `${formatCount(health.queue.count)} pengajuan tertahan · terlama ${formatDuration(health.queue.oldestMs)}`, key: "queue", tile: health.queue, title: "Antrean pengajuan" },
      { detail: `${formatCount(health.failures.count)} pengajuan gagal · ${health.failures.submissions === 0 ? "—" : formatRate(health.failures.share * 100)} dari periode`, key: "failures", tile: health.failures, title: "Kegagalan provider" },
      { detail: `${formatCount(health.unknown.count)} hasil belum pasti · perlu rekonsiliasi`, key: "unknown", tile: health.unknown, title: "Status tidak diketahui" },
      { detail: `${formatCount(health.unpaid.count)} kiriman · ${formatCount(health.unpaid.recovering)} pemulihan berjalan`, key: "unpaid", tile: health.unpaid, title: "Menunggu pembayaran" },
    ];
    for (const signal of signals) {
      if (signal.tile.severity === "normal") continue;
      const affected = signal.tile.affectedTenants ? ` · ${formatCount(signal.tile.affectedTenants)} gerai terdampak` : "";
      items.push({ detail: `${signal.detail}${affected}`, key: signal.key, severity: signal.tile.severity, title: signal.title });
    }
  }
  for (const tenant of tenants) {
    const parts = [
      [tenant.failed, "pengajuan gagal"],
      [tenant.unknown, "status tidak diketahui"],
      [tenant.unpaid, "menunggu pembayaran"],
    ] as const;
    const present = parts.filter(([count]) => count > 0);
    if (!present.length) continue;
    items.push({
      detail: present.map(([count, word]) => `${formatCount(count)} ${word}`).join(" · "),
      href: `/platform/tenant/${tenant.tenantId}`,
      key: `tenant-${tenant.tenantId}`,
      severity: tenant.failed > 0 || tenant.unknown > 0 ? "kritis" : "perhatian",
      title: tenant.name,
    });
  }
  return items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "kritis" ? -1 : 1));
}

/** Filters differ from the default window (30 hari, no tenant/outcome/query/aksi/status gerai, page views hidden) → "Hapus filter". */
export function filtersChanged(filters: PlatformFilters, { ignoreTenant = false } = {}): boolean {
  return (
    filters.range.presetId !== "30-hari" ||
    Boolean(filters.showMonitoringViews) ||
    Boolean(filters.outcome) ||
    Boolean(filters.query) ||
    Boolean(filters.action) ||
    Boolean(filters.tenantStatus) ||
    (!ignoreTenant && filters.scope.kind === "tenant")
  );
}

/**
 * Spec 19 PLT-TREND-TOTALS (T-257): the period totals beside the trend legend — the sums of the
 * trend's buckets, which equal PLT/SHP-CREATED and SHP-ISSUED for the same filters.
 */
export function platformTrendTotals(buckets: readonly { created: number; issued: number }[]) {
  return buckets.reduce((sum, bucket) => ({ created: sum.created + bucket.created, issued: sum.issued + bucket.issued }), { created: 0, issued: 0 });
}
