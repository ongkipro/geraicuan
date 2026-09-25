import type { StatusTone } from "@/components/app/status-badge";
import type { HealthSeverity } from "@/db/platform-monitoring-repository";
import { auditActorLabel, tenantStatusLabel } from "@/lib/labels/audit";
import { formatDuration } from "@/lib/platform-monitoring-format";

/** `src/lib/labels/audit.ts` speaks ok/warn; the v3 `StatusBadge` speaks success/warning. */
const LABEL_TONE: Record<"danger" | "neutral" | "ok" | "warn", StatusTone> = {
  danger: "danger",
  neutral: "neutral",
  ok: "success",
  warn: "warning",
};

export function badgeTone(tone: "danger" | "neutral" | "ok" | "warn"): StatusTone {
  return LABEL_TONE[tone];
}

/**
 * Health severity as a badge. "Normal" asks for no decision, so it stays neutral; only
 * Perhatian (warning) and Kritis (danger) carry colour (spec 10 §1.3).
 */
export function severityBadge(severity: HealthSeverity): { label: string; tone: StatusTone } {
  if (severity === "kritis") return { label: "Kritis", tone: "danger" };
  if (severity === "perhatian") return { label: "Perhatian", tone: "warning" };
  return { label: "Normal", tone: "neutral" };
}

/** A settle time: seconds below a minute, then the shared minute/hour/day wording. */
export function formatSeconds(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(seconds)} detik`;
  return formatDuration(seconds * 1000);
}

const WIB_DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta", year: "numeric" });
const WIB_TIME = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Spec 10 §7: "25 Sep 2026, 10.13 WIB". */
export function formatWib(instant: Date): string {
  return `${WIB_DATE.format(instant)}, ${WIB_TIME.format(instant)} WIB`;
}

/** The two lines of a time cell: date, then time WIB. */
export function wibParts(instant: Date): { date: string; time: string } {
  return { date: WIB_DATE.format(instant), time: `${WIB_TIME.format(instant)} WIB` };
}

export const PLATFORM_PAGE_SIZE = 25;

/** Who acted, in the same words as the audit sentence (a self-registration is the gerai owner). */
export function auditActor(row: { action: string; actorRole: string | null }): string {
  return row.action === "TENANT_SELF_REGISTERED" ? "Pemilik gerai" : auditActorLabel(row.actorRole);
}

/** "Aktif → Ditangguhkan", or "Menjadi Disiapkan" for a tenant's first status. */
export function tenantStatusChange(row: { fromStatus: string | null; toStatus: string | null }): string | undefined {
  if (!row.fromStatus && !row.toStatus) return undefined;
  if (!row.fromStatus) return `Menjadi ${tenantStatusLabel(row.toStatus)}`;
  return `${tenantStatusLabel(row.fromStatus)} → ${tenantStatusLabel(row.toStatus)}`;
}
