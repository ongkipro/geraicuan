import {
  contactListHref,
  parseContactStatusFilter,
  type ContactRole,
  type ContactStatusFilter,
} from "@/lib/contact-role-filter";

/** Contacts per directory page (spec 17: pagination 20). */
export const CONTACT_PAGE_SIZE = 20;

type SearchValue = string | string[] | undefined;
export type ContactDirectorySearchParams = { halaman?: SearchValue; status?: SearchValue };

export function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

/** `status` (unknown → Aktif) and `halaman` (anything not a positive integer → 1). */
export function parseContactDirectoryQuery(params: ContactDirectorySearchParams): { page: number; status: ContactStatusFilter } {
  const { status } = parseContactStatusFilter(firstValue(params.status));
  const raw = firstValue(params.halaman) ?? "";
  const page = /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : 1;
  return { page, status };
}

export function pageCount(total: number) {
  return Math.max(1, Math.ceil(total / CONTACT_PAGE_SIZE));
}

/** The list URL for a tab and page; the defaults (Aktif, page 1) stay out of the URL. */
export function contactDirectoryHref(role: ContactRole, status: ContactStatusFilter, page = 1) {
  const params = new URLSearchParams();
  if (status !== "active") params.set("status", status);
  if (page > 1) params.set("halaman", String(page));
  const query = params.toString();
  return query ? `${contactListHref(role)}?${query}` : contactListHref(role);
}
