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

/** Predicate after the actor: "Admin platform menangguhkan gerai". */
const actionPredicate: Record<AuditAction, string> = {
  TENANT_CREATED: "membuat gerai",
  TENANT_SUSPENDED: "menangguhkan gerai",
  TENANT_REACTIVATED: "mengaktifkan kembali gerai",
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
  ANNOUNCEMENT_SAVED: "menyimpan info terbaru",
  ANNOUNCEMENT_PUBLISHED: "menayangkan info terbaru",
  ANNOUNCEMENT_UNPUBLISHED: "menurunkan info terbaru",
  SHIPMENT_HANDOVER_RECORDED: "menandai paket sudah diserahkan ke kurir",
  SHIPMENT_HANDOVER_UNDONE: "membatalkan penandaan paket diserahkan",
  SHIPMENT_CANCELLED: "membatalkan kiriman di Mengantar",
  TENANT_ARCHIVED: "mengarsipkan gerai",
};

const actorLabels: Record<string, string> = {
  SUPER_ADMIN: "Admin platform",
  TENANT_MEMBER: "Anggota gerai",
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

/**
 * T-257: the action alone, for the Aksi column and filter where the actor has its own column:
 * "Menangguhkan gerai". An unknown code reads "Aktivitas lain", never the code.
 */
export function auditActionLabel(action: string): string {
  if (!known(actionPredicate, action)) return "Aktivitas lain";
  const predicate = actionPredicate[action];
  return predicate.charAt(0).toLocaleUpperCase("id-ID") + predicate.slice(1);
}

/** The Aksi filter's options, sorted by their words. */
export function auditActionOptions(): { label: string; value: AuditAction }[] {
  return (Object.keys(actionPredicate) as AuditAction[])
    .map((value) => ({ label: auditActionLabel(value), value }))
    .sort((a, b) => a.label.localeCompare(b.label, "id-ID"));
}

/**
 * T-259: the Gerai cell of a row whose gerai name is missing. Only a PLATFORM target is a
 * platform-wide event; any other target is about a gerai that was not stored with the row
 * (implicit prefix locks before migration 0069, refused lifecycle attempts on an unverified
 * gerai), so it must not read "Platform". Mirrors CHECK `audit_events_tenant_recorded`.
 */
export function auditTenantFallbackLabel(targetType: string | null | undefined): string {
  return targetType === "PLATFORM" ? "Platform" : "Gerai tidak tercatat";
}

export function auditOutcomeLabel(outcome: string | null | undefined): { label: string; tone: Tone } {
  if (outcome === "SUCCESS") return { label: "Berhasil", tone: "ok" };
  if (outcome === "DENIED") return { label: "Ditolak", tone: "danger" };
  return { label: "Tidak diketahui", tone: "neutral" };
}

/**
 * T-273: what a row changed, when it is not the gerai itself (the Gerai column names that). No
 * payload is stored in the platform read model, so the object is its kind plus, for an outlet,
 * the outlet's name. A shipment's number is not in the platform read model and a Super Admin
 * cannot open a gerai's shipment, so it reads "Kiriman" without a number or link.
 */
export function auditObjectLabel(row: { action: string; outletName?: string | null; targetType: string }): string | null {
  switch (row.targetType) {
    case "OUTLET": return row.outletName ? `Outlet ${row.outletName}` : "Outlet";
    case "MEMBERSHIP": return "Anggota gerai";
    case "SHIPMENT": return "Kiriman";
    case "PLATFORM":
      if (row.action.startsWith("ANNOUNCEMENT_")) return "Info terbaru";
      return row.action === "PLATFORM_MONITORING_VIEWED" ? "Pemantauan platform" : null;
    default: return null;
  }
}
