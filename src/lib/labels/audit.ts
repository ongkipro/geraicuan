import type { auditEventActions, tenantStatuses } from "@/db/schema";

/**
 * Spec 10 §8 / spec 18 `/platform/audit`: audit events render as Indonesian
 * sentences, never as the stored action code (V-6). One map per stored
 * vocabulary; `Record` over the schema tuples makes a new action or status a
 * type error here until it is worded.
 */
type AuditAction = (typeof auditEventActions)[number];
type TenantStatus = (typeof tenantStatuses)[number];
type Tone = "danger" | "neutral" | "ok" | "warn";

/** Predicate after the actor: "Super Admin menangguhkan tenant". */
const actionPredicate: Record<AuditAction, string> = {
  TENANT_CREATED: "membuat tenant",
  TENANT_SUSPENDED: "menangguhkan tenant",
  TENANT_REACTIVATED: "mengaktifkan kembali tenant",
  PLATFORM_MONITORING_VIEWED: "membuka pemantauan platform",
  MEMBER_INVITED: "mengundang anggota",
  MEMBER_ROLE_CHANGED: "mengubah peran anggota",
  MEMBER_DEACTIVATED: "menonaktifkan anggota",
  OUTLET_SETTINGS_CHANGED: "mengubah pengaturan outlet",
  MENGANTAR_CREDENTIAL_CREATED: "menghubungkan akun Mengantar milik gerai",
  MENGANTAR_CREDENTIAL_REPLACED: "mengganti akun Mengantar milik gerai",
  MENGANTAR_PLATFORM_DEFAULT_RESTORED: "kembali memakai akun Mengantar bawaan platform",
  SHIPMENT_PREFIX_LOCKED: "mengunci awalan nomor kiriman",
  SHIPMENT_PREFIX_UNLOCKED: "membuka kunci awalan nomor kiriman",
  TENANT_SELF_REGISTERED: "mendaftarkan gerai baru",
  TENANT_REGISTRATION_APPROVED: "menyetujui pendaftaran gerai",
  TENANT_REGISTRATION_REJECTED: "menolak pendaftaran gerai",
  TENANT_CONTACT_UPDATED: "mengubah WhatsApp gerai",
};

const actorLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  TENANT_MEMBER: "Anggota tenant",
};

export const tenantStatusPresentation: Record<TenantStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Aktif", tone: "ok" },
  PROVISIONING: { label: "Disiapkan", tone: "warn" },
  SUSPENDED: { label: "Ditangguhkan", tone: "danger" },
  ARCHIVED: { label: "Diarsipkan", tone: "neutral" },
};

function known<T extends string>(map: Record<T, unknown>, value: string): value is T {
  return Object.hasOwn(map, value);
}

/** Tenant status in words; an unknown value never reaches the page as a code. */
export function tenantStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return known(tenantStatusPresentation, status) ? tenantStatusPresentation[status].label : "Status lain";
}

export function tenantStatusTone(status: string): Tone {
  return known(tenantStatusPresentation, status) ? tenantStatusPresentation[status].tone : "neutral";
}

export function auditActorLabel(actorRole: string | null | undefined): string {
  return actorRole && Object.hasOwn(actorLabels, actorRole) ? actorLabels[actorRole] : "Sistem";
}

/**
 * One sentence per event: actor + predicate. A denied event reads as an attempt,
 * so the sentence never claims a change that did not happen. An unknown code
 * gets a generic sentence instead of the raw code.
 */
export function auditActionSentence({
  action,
  actorRole,
  outcome,
}: {
  action: string;
  actorRole?: string | null;
  outcome?: string | null;
}): string {
  const actor = action === "TENANT_SELF_REGISTERED" ? "Pemilik gerai" : auditActorLabel(actorRole);
  if (!known(actionPredicate, action)) {
    return outcome === "DENIED" ? `${actor} mencoba aktivitas lain` : `${actor} melakukan aktivitas lain`;
  }
  const predicate = actionPredicate[action];
  return outcome === "DENIED" ? `${actor} mencoba ${predicate}` : `${actor} ${predicate}`;
}

export function auditOutcomeLabel(outcome: string | null | undefined): { label: string; tone: Tone } {
  if (outcome === "SUCCESS") return { label: "Berhasil", tone: "ok" };
  if (outcome === "DENIED") return { label: "Ditolak", tone: "danger" };
  return { label: "Tidak diketahui", tone: "neutral" };
}
