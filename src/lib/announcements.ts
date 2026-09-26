import type { announcementCategories } from "@/db/schema";
import { validate } from "@/lib/field-character-classes";

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
