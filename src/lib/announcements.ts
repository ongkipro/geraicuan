import type { announcementCategories } from "@/db/schema";
import { validate } from "@/lib/field-character-classes";
import { formatRelativeAge } from "@/lib/relative-age";

/**
 * T-244 (D-31): Info terbaru — platform announcements. Shared by the platform form, the
 * Server Actions and the tenant page, so it stays free of server-only imports.
 */
export type AnnouncementCategory = (typeof announcementCategories)[number];

export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 2000;
/** A body longer than this, or with more than a few lines, collapses behind "Baca selengkapnya". */
export const ANNOUNCEMENT_PREVIEW_CHARS = 280;
export const ANNOUNCEMENT_PREVIEW_LINES = 4;

export const ANNOUNCEMENT_CATEGORY_LABEL: Record<AnnouncementCategory, string> = {
  FITUR_BARU: "Fitur baru",
  INFO_KURIR: "Info kurir",
  JADWAL: "Jadwal",
  PEMELIHARAAN: "Pemeliharaan",
  LAINNYA: "Lainnya",
};

export const ANNOUNCEMENT_CATEGORIES = Object.keys(ANNOUNCEMENT_CATEGORY_LABEL) as AnnouncementCategory[];

export type AnnouncementInput = {
  body: string;
  category: AnnouncementCategory;
  pinned: boolean;
  publish: boolean;
  title: string;
};

export type AnnouncementFieldErrors = Partial<Record<"body" | "category" | "title", string>>;

function isCategory(value: unknown): value is AnnouncementCategory {
  return typeof value === "string" && Object.hasOwn(ANNOUNCEMENT_CATEGORY_LABEL, value);
}

/**
 * The form's fields, normalised: title on one line, body with `\n` line breaks (CRLF and tabs
 * folded), both trimmed. Returns field errors in Indonesian instead of throwing.
 */
export function parseAnnouncementForm(form: FormData):
  | { errors: AnnouncementFieldErrors; ok: false }
  | { input: AnnouncementInput; ok: true } {
  const rawTitle = form.get("title");
  const rawBody = form.get("body");
  const category = form.get("category");
  const title = typeof rawTitle === "string" ? rawTitle.replace(/\s+/gu, " ").trim() : "";
  const body = typeof rawBody === "string"
    ? rawBody.replace(/\r\n?/gu, "\n").replace(/\t/gu, "    ").replace(/[ \u00a0]+$/gmu, "").trim()
    : "";
  const errors: AnnouncementFieldErrors = {};

  if (!title) errors.title = "Tulis judul info.";
  else if (title.length > ANNOUNCEMENT_TITLE_MAX) errors.title = `Judul maksimal ${ANNOUNCEMENT_TITLE_MAX} karakter.`;
  else if (!validate("FREE_TEXT", title)) errors.title = "Judul memuat karakter yang tidak didukung.";

  if (!body) errors.body = "Tulis isi info.";
  else if (body.length > ANNOUNCEMENT_BODY_MAX) errors.body = `Isi maksimal ${ANNOUNCEMENT_BODY_MAX.toLocaleString("id-ID")} karakter.`;
  // FREE_TEXT per line (PR-66): line breaks are the only control character a body keeps.
  else if (!body.split("\n").every((line) => validate("FREE_TEXT", line))) errors.body = "Isi memuat karakter yang tidak didukung.";

  if (!isCategory(category)) errors.category = "Pilih kategori.";

  if (Object.keys(errors).length > 0 || !isCategory(category)) return { errors, ok: false };
  return {
    input: { body, category, pinned: form.get("pinned") === "on", publish: form.get("intent") === "publish", title },
    ok: true,
  };
}

/** Whether a body needs the "Baca selengkapnya" expander on the tenant page. */
export function announcementIsLong(body: string) {
  return body.length > ANNOUNCEMENT_PREVIEW_CHARS || body.split("\n").length > ANNOUNCEMENT_PREVIEW_LINES;
}

export type AnnouncementStatus = "DRAF" | "TAYANG" | "DISEMATKAN";

/** Platform list status: a draft is Draf whatever its pin; a published pinned row is Disematkan. */
export function announcementStatus(row: { pinned: boolean; publishedAt: Date | null }): AnnouncementStatus {
  if (!row.publishedAt) return "DRAF";
  return row.pinned ? "DISEMATKAN" : "TAYANG";
}

export const ANNOUNCEMENT_STATUS_LABEL: Record<AnnouncementStatus, string> = {
  DISEMATKAN: "Disematkan",
  DRAF: "Draf",
  TAYANG: "Tayang",
};

/**
 * T-256: the tenant category filter's URL values (`/app/info?kategori=info-kurir`). An unknown
 * or missing value is "Semua", never an error.
 */
export const ANNOUNCEMENT_CATEGORY_SLUG: Record<AnnouncementCategory, string> = {
  FITUR_BARU: "fitur-baru",
  INFO_KURIR: "info-kurir",
  JADWAL: "jadwal",
  PEMELIHARAAN: "pemeliharaan",
  LAINNYA: "lainnya",
};

export function parseAnnouncementCategoryParam(value: string | string[] | undefined): AnnouncementCategory | null {
  const slug = typeof value === "string" ? value : null;
  return ANNOUNCEMENT_CATEGORIES.find((category) => ANNOUNCEMENT_CATEGORY_SLUG[category] === slug) ?? null;
}

/** Rows per category plus `all`, for the filter's counts (every category present, zero included). */
export function countAnnouncementsByCategory(rows: readonly { category: AnnouncementCategory }[]) {
  const counts = Object.fromEntries(ANNOUNCEMENT_CATEGORIES.map((category) => [category, 0])) as Record<AnnouncementCategory, number>;
  for (const row of rows) counts[row.category] += 1;
  return { all: rows.length, ...counts };
}

const wibShortDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

/**
 * T-256: an announcement's age for its card — `formatRelativeAge` capitalised, then the WIB date
 * ("12 Sep 2026") after six days. The card carries the full WIB date and time in `title` and
 * `<time dateTime>`.
 */
export function formatAnnouncementAge(publishedAt: Date, now: Date) {
  const age = formatRelativeAge(publishedAt, now, 6);
  return age ? age.charAt(0).toUpperCase() + age.slice(1) : wibShortDate.format(publishedAt);
}

/** T-256: one wording for unread info — the Dasbor line and the sidebar badge's accessible name. */
export function unreadInfoLabel(count: number) {
  return `${count > 99 ? "99+" : count} info baru`;
}

export type AnnouncementResult = "published" | "saved" | "unpublished";

/**
 * T-256: the page-level success line after a save or takedown on /platform/info. It names the
 * announcement and what gerai now see, and replaces the previous line, so an earlier "disimpan
 * sebagai draf" never outlives a later publish (T-244 review).
 */
export function announcementResultMessage(outcome: AnnouncementResult, title: string, wasPublished: boolean) {
  const name = `“${title}”`;
  if (outcome === "unpublished") return `${name} diturunkan dan kembali menjadi draf. Gerai tidak lagi melihatnya.`;
  if (outcome === "published") {
    return wasPublished ? `Perubahan ${name} tersimpan dan tetap tayang.` : `${name} tayang di Info terbaru semua gerai.`;
  }
  return wasPublished
    ? `${name} diturunkan dan disimpan sebagai draf. Gerai tidak lagi melihatnya.`
    : `${name} disimpan sebagai draf. Gerai belum melihatnya.`;
}

export type PlatformAnnouncementStatusFilter = "draf" | "semua" | "tayang";
export type PlatformAnnouncementOrder = "terbaru" | "terlama";

/** `/platform/info?status=` and `?urut=`; anything else is the default (Semua, Terbaru). */
export function parsePlatformAnnouncementView(params: { status?: string | string[]; urut?: string | string[] }) {
  const status: PlatformAnnouncementStatusFilter = params.status === "draf" || params.status === "tayang" ? params.status : "semua";
  const order: PlatformAnnouncementOrder = params.urut === "terlama" ? "terlama" : "terbaru";
  return { order, status };
}

/**
 * T-256: the Admin platform list by the date it shows — published at, or last changed for a
 * draft — newest or oldest first, optionally only live or only drafts; ties by id.
 */
export function viewPlatformAnnouncements<T extends { id: string; publishedAt: Date | null; updatedAt: Date }>(
  rows: readonly T[],
  view: { order: PlatformAnnouncementOrder; status: PlatformAnnouncementStatusFilter },
) {
  const shown = rows.filter((row) => view.status === "semua" || (view.status === "tayang") === (row.publishedAt !== null));
  const direction = view.order === "terbaru" ? -1 : 1;
  return shown.sort((left, right) => {
    const difference = (left.publishedAt ?? left.updatedAt).getTime() - (right.publishedAt ?? right.updatedAt).getTime();
    return difference === 0 ? left.id.localeCompare(right.id) : difference * direction;
  });
}
