/**
 * T-188: Pengirim and Penerima are separate menus over one `contacts` table,
 * layered on the existing `is_sender` / `is_recipient` flags — a dual-role
 * contact is listed under both. The role is the list route's own segment
 * (`/app/kontak/pengirim`, `/app/kontak/penerima`), `peran` on the create form
 * and `dari` on a contact detail. No "server-only" here: server pages, client
 * components and the shell navigation all read these.
 */
export type ContactRole = "pengirim" | "penerima";

export const CONTACT_ROLES: readonly ContactRole[] = ["pengirim", "penerima"];

/** The role a contact URL falls back to when it names none (or an unknown one). */
export const DEFAULT_CONTACT_ROLE: ContactRole = "pengirim";

export const CONTACT_ROLE_DESCRIPTIONS: Record<ContactRole, string> = {
  penerima: "Pembeli tujuan kiriman, siap dipilih saat membuat draf.",
  pengirim: "Toko atau gudang asal kiriman, siap dipilih saat membuat draf.",
};

/** What holding a role does, shown beside the role checkbox on create and detail. */
export const CONTACT_ROLE_EFFECTS: Record<ContactRole, string> = {
  penerima: "Muncul di menu Penerima dan bisa dipilih sebagai tujuan kiriman.",
  pengirim: "Muncul di menu Pengirim dan bisa dipilih sebagai asal kiriman.",
};

/**
 * T-199: the Peran card cannot drop Pengirim while the stored name only fits
 * the sender rule ("Toko 88"), because a recipient-only name is a person's name.
 * The card says exactly what to do and links to the name field.
 */
export const CONTACT_ROLE_NAME_CONFLICT_MESSAGE =
  "Nama kontak ini memuat angka atau simbol yang hanya boleh untuk pengirim. Ubah nama tanpa angka dulu di kartu Kontak, lalu lepas peran Pengirim.";

/** The hidden field value the Peran card posts, so its errors are phrased for that card. */
export const CONTACT_ROLES_CARD = "peran";

export function otherContactRole(role: ContactRole): ContactRole {
  return role === "pengirim" ? "penerima" : "pengirim";
}

export function parseContactRole(value: string | null | undefined): ContactRole | null {
  return value === "pengirim" || value === "penerima" ? value : null;
}

export function contactRoleLabel(role: ContactRole) {
  return role === "pengirim" ? "Pengirim" : "Penerima";
}

export function contactRoleToRepositoryRole(role: ContactRole): "recipient" | "sender" {
  return role === "pengirim" ? "sender" : "recipient";
}

export function contactListHref(role: ContactRole) {
  return `/app/kontak/${role}`;
}

export function contactDetailHref(contactId: string, role: ContactRole) {
  return `/app/kontak/${contactId}?dari=${role}`;
}

/** The role a contact is shown under: the requested one when it still holds it, else its first role. */
export function contactRoleFor(
  contact: { isRecipient: boolean; isSender: boolean },
  requested: ContactRole | null,
): ContactRole {
  if (requested === "pengirim" && contact.isSender) return "pengirim";
  if (requested === "penerima" && contact.isRecipient) return "penerima";
  return contact.isSender ? "pengirim" : "penerima";
}

/**
 * PR-52: the state panel writes the list's `status` URL state. `active` and
 * `archived` keep their spelling so every bookmarked link resolves unchanged.
 */
export type ContactStatusFilter = "all" | "active" | "archived";

/**
 * T-188: each role list counts only its own role, so each count has its own
 * metric ID (spec 19). Aktif first: it is the default and the everyday view.
 */
export function contactStatusEntries(role: ContactRole) {
  const noun = contactRoleLabel(role).toLowerCase();
  const id = contactMetricPrefix(role);
  return [
    { description: "Dapat dipilih saat membuat draf kiriman.", label: "Aktif", metricId: `${id}-ACTIVE`, value: "active" },
    { description: "Disimpan untuk riwayat, tidak dapat dipilih lagi.", label: "Diarsipkan", metricId: `${id}-ARCHIVED`, value: "archived" },
    { description: `Semua ${noun}, aktif dan diarsipkan.`, label: "Semua", metricId: `${id}-ALL`, value: "all" },
  ] as const satisfies readonly { description: string; label: string; metricId: string; value: ContactStatusFilter }[];
}

export function contactMetricPrefix(role: ContactRole) {
  return role === "pengirim" ? "CON-SENDER" : "CON-RECIPIENT";
}

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
