import type { HealthSeverity, PlatformHealth, TenantUsageRow } from "@/db/platform-monitoring-repository";
import type { PlatformFilters } from "@/lib/platform-monitoring-filters";
import { formatCount, formatDuration } from "@/lib/platform-monitoring-format";

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
      { detail: `${formatCount(health.failures.count)} pengajuan gagal · ${Math.round(health.failures.share * 100)}% dari periode`, key: "failures", tile: health.failures, title: "Kegagalan provider" },
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

/** Filters differ from the default window (30 hari, no tenant/outcome/query) → "Hapus filter". */
export function filtersChanged(filters: PlatformFilters, { ignoreTenant = false } = {}): boolean {
  return (
    filters.range.presetId !== "30-hari" ||
    Boolean(filters.outcome) ||
    Boolean(filters.query) ||
    (!ignoreTenant && filters.scope.kind === "tenant")
  );
}

const REGISTRATION_DECISIONS = ["TENANT_REGISTRATION_APPROVED", "TENANT_REGISTRATION_REJECTED"];

/** Successful approve/reject events of the registration queue, newest first, at most `limit`. */
export function registrationDecisions<T extends { action: string; outcome: string }>(rows: readonly T[], limit = 10): T[] {
  return rows.filter((row) => row.outcome === "SUCCESS" && REGISTRATION_DECISIONS.includes(row.action)).slice(0, limit);
}
