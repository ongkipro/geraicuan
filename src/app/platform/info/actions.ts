"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { resolvePlatformAccess } from "@/app/platform/platform-access";
import {
  AnnouncementDeniedError,
  AnnouncementStateError,
  savePlatformAnnouncement,
  unpublishPlatformAnnouncement,
} from "@/db/announcement-repository";
import { db } from "@/db/client";
import { type AnnouncementFieldErrors, parseAnnouncementForm } from "@/lib/announcements";

export type AnnouncementActionState = {
  errors?: AnnouncementFieldErrors;
  message?: string;
  outcome?: "denied" | "error" | "invalid" | "published" | "saved" | "unpublished";
  resultToken?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DENIED = "Akses admin platform diperlukan.";

function refusal(error: unknown, resultToken: string): AnnouncementActionState {
  if (error instanceof AnnouncementDeniedError) return { message: DENIED, outcome: "denied", resultToken };
  if (error instanceof AnnouncementStateError) {
    return {
      message: error.reason === "not-found" ? "Info ini tidak ditemukan. Muat ulang halaman." : "Isi info tidak valid. Periksa kembali.",
      outcome: "invalid",
      resultToken,
    };
  }
  return { message: "Info belum tersimpan. Coba lagi.", outcome: "error", resultToken };
}

/**
 * T-244 (D-31): the Admin platform creates or edits an Info terbaru announcement, published now
 * (`intent=publish`) or kept as a draft. The role is checked here and again inside
 * `save_platform_announcement`, which also writes the audit event.
 */
export async function saveAnnouncement(
  _previous: AnnouncementActionState,
  formData: FormData,
): Promise<AnnouncementActionState> {
  const resultToken = randomUUID();
  const access = await resolvePlatformAccess();
  if (access.status !== "authorized") return { message: DENIED, outcome: "denied", resultToken };

  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId !== "" ? rawId : undefined;
  if (id !== undefined && !UUID_PATTERN.test(id)) {
    return { message: "Permintaan tidak valid. Muat ulang halaman.", outcome: "invalid", resultToken };
  }
  const parsed = parseAnnouncementForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, message: "Info belum tersimpan.", outcome: "invalid", resultToken };

  try {
    await savePlatformAnnouncement(db, access.principal.userId, { ...parsed.input, id });
  } catch (error) {
    return refusal(error, resultToken);
  }
  revalidatePath("/platform/info");
  return parsed.input.publish
    ? { message: `"${parsed.input.title}" tayang untuk semua gerai.`, outcome: "published", resultToken }
    : { message: `"${parsed.input.title}" disimpan sebagai draf.`, outcome: "saved", resultToken };
}

/** T-244: takes a published announcement back to draft; gerai no longer see it. */
export async function unpublishAnnouncement(
  _previous: AnnouncementActionState,
  formData: FormData,
): Promise<AnnouncementActionState> {
  const resultToken = randomUUID();
  const access = await resolvePlatformAccess();
  if (access.status !== "authorized") return { message: DENIED, outcome: "denied", resultToken };

  const id = formData.get("id");
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    return { message: "Permintaan tidak valid. Muat ulang halaman.", outcome: "invalid", resultToken };
  }
  try {
    await unpublishPlatformAnnouncement(db, access.principal.userId, id);
  } catch (error) {
    return refusal(error, resultToken);
  }
  revalidatePath("/platform/info");
  return { message: "Info diturunkan dan kembali menjadi draf.", outcome: "unpublished", resultToken };
}
