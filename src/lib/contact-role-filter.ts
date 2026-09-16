/**
 * T-167: the `peran` URL state on `/app/kontak` (`?peran=pengirim|penerima|semua`),
 * layered over the existing `contacts.is_sender` / `is_recipient` flags — a dual-role
 * contact matches both "pengirim" and "penerima". No "server-only" here: both the
 * server page and the client browser component read these.
 */
export type ContactRoleFilter = "pengirim" | "penerima" | "semua";

export const CONTACT_ROLE_FILTERS: readonly ContactRoleFilter[] = ["semua", "pengirim", "penerima"];

export function contactRoleFilterLabel(value: ContactRoleFilter) {
  return value === "pengirim" ? "Pengirim" : value === "penerima" ? "Penerima" : "Semua";
}

/** Parses the `peran` search param; an unrecognized value falls back to "semua" and is flagged invalid. */
export function parseContactRoleFilter(value: string | undefined): { invalid: boolean; peran: ContactRoleFilter } {
  if (value === undefined) return { invalid: false, peran: "semua" };
  if (value === "pengirim" || value === "penerima" || value === "semua") return { invalid: false, peran: value };
  return { invalid: true, peran: "semua" };
}

export function contactRoleFilterToRepositoryRole(peran: ContactRoleFilter): "all" | "recipient" | "sender" {
  return peran === "pengirim" ? "sender" : peran === "penerima" ? "recipient" : "all";
}

/**
 * PR-52: the Kontak state panel writes this page's existing `status` URL state
 * and adds "Semua kontak" to it. `active` and `archived` keep their spelling so
 * every bookmarked link resolves unchanged.
 */
export type ContactStatusFilter = "all" | "active" | "archived";

export const CONTACT_STATUS_ENTRIES = [
  { description: "Kontak aktif dan yang sudah diarsipkan.", label: "Semua kontak", metricId: "CON-ALL", value: "all" },
  { description: "Dapat dipilih saat membuat draf kiriman.", label: "Aktif", metricId: "CON-ACTIVE", value: "active" },
  { description: "Disimpan untuk riwayat, tidak dapat dipilih lagi.", label: "Diarsipkan", metricId: "CON-ARCHIVED", value: "archived" },
] as const satisfies readonly {
  description: string;
  label: string;
  metricId: string;
  value: ContactStatusFilter;
}[];

/** Parses the `status` search param; an unrecognized value falls back to "active" and is flagged invalid. */
export function parseContactStatusFilter(
  value: string | undefined,
): { invalid: boolean; status: ContactStatusFilter } {
  if (value === undefined) return { invalid: false, status: "active" };
  if (value === "all" || value === "active" || value === "archived") {
    return { invalid: false, status: value };
  }
  return { invalid: true, status: "active" };
}
