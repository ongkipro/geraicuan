import type { ContactSearchRow } from "@/app/app/kontak/actions";
import type { ContactDirectoryRow } from "@/db/contact-repository";
import {
  contactDetailHref,
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

/** One directory row as the list renders it; shared by the page and the search action. */
export function toContactSearchRow(contact: ContactDirectoryRow): ContactSearchRow {
  return {
    address: contact.address,
    addressCount: contact.addressCount,
    archived: Boolean(contact.archivedAt),
    category: contact.category,
    contactNumber: contact.contactNumber,
    deliveredCount: contact.deliveredCount,
    destinationAreaLabel: contact.destinationAreaLabel,
    id: contact.id,
    isRecipient: contact.isRecipient,
    isSender: contact.isSender,
    name: contact.name,
    phone: contact.phone,
    shipmentCount: contact.shipmentCount,
  };
}

const percent = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** "83,3%" (one decimal at most), or `null` when there is nothing to divide (the UI prints "—"). */
export function shareText(part: number, whole: number) {
  return whole > 0 ? `${percent.format((part / whole) * 100)}%` : null;
}

/** T-241 detail history tabs: `riwayat` is `cod` / `non-cod` (absent = Semua), `halaman` its page. */
export type ContactHistorySearchParams = { diarsipkan?: SearchValue; halaman?: SearchValue; riwayat?: SearchValue; tersimpan?: SearchValue };

export function parseContactHistoryQuery(params: ContactHistorySearchParams): { page: number; payment: "all" | "cod" | "noncod" } {
  const raw = firstValue(params.riwayat);
  const payment = raw === "cod" ? "cod" : raw === "non-cod" ? "noncod" : "all";
  const pageRaw = firstValue(params.halaman) ?? "";
  return { page: /^[1-9]\d{0,5}$/.test(pageRaw) ? Number(pageRaw) : 1, payment };
}

/**
 * T-247 (review L10): where a contact opened under the role it no longer holds is sent — the
 * same page under its other role, keeping the known query keys (`riwayat`, `halaman` and the
 * one-shot `tersimpan` / `diarsipkan` notices). Anything else is dropped, never echoed.
 */
export function contactRoleRedirectHref(contactNumber: number, role: ContactRole, query: ContactHistorySearchParams) {
  const params = new URLSearchParams();
  for (const key of ["riwayat", "halaman", "tersimpan", "diarsipkan"] as const) {
    const value = firstValue(query[key]);
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return `${contactDetailHref(contactNumber, role)}${search ? `?${search}` : ""}`;
}

/** The detail URL for a history tab and page; the defaults stay out of the URL, as on the list. */
export function contactHistoryHref(role: ContactRole, contactNumber: number, payment: "all" | "cod" | "noncod", page = 1) {
  const params = new URLSearchParams();
  if (payment !== "all") params.set("riwayat", payment === "cod" ? "cod" : "non-cod");
  if (page > 1) params.set("halaman", String(page));
  const query = params.toString();
  return `${contactDetailHref(contactNumber, role)}${query ? `?${query}` : ""}`;
}
