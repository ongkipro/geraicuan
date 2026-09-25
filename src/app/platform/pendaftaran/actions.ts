"use server";

import { randomUUID } from "node:crypto";

import { resolvePlatformAccess } from "@/app/platform/platform-access";
import { db } from "@/db/client";
import { validate } from "@/lib/field-character-classes";
import {
  RegistrationReviewDeniedError,
  RegistrationReviewStateError,
  reviewTenantRegistration,
} from "@/db/tenant-registration-repository";
import {
  sendRegistrationApprovedMail,
  sendRegistrationRejectedMail,
} from "@/lib/account-mail";

export type RegistrationReviewState = {
  errors?: { reason?: string };
  message?: string;
  outcome?: "approved" | "conflict" | "denied" | "error" | "invalid" | "rejected";
  resultToken?: string;
  tenantId?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PR-61: a Super Admin approves or rejects a store awaiting approval. The role
 * is checked here, again in the repository, and a third time inside
 * `review_tenant_registration`, which also writes the audit event.
 */
export async function reviewRegistration(
  _previous: RegistrationReviewState,
  formData: FormData,
): Promise<RegistrationReviewState> {
  const resultToken = randomUUID();
  const access = await resolvePlatformAccess();
  if (access.status !== "authorized") {
    return { message: "Akses Super Admin diperlukan.", outcome: "denied", resultToken };
  }

  const tenantId = formData.get("tenantId");
  const decision = formData.get("decision");
  const rawReason = formData.get("reason");
  const reason = typeof rawReason === "string" ? rawReason.replace(/\s+/gu, " ").trim() : "";
  if (
    typeof tenantId !== "string"
    || !UUID_PATTERN.test(tenantId)
    || (decision !== "APPROVE" && decision !== "REJECT")
  ) {
    return { message: "Permintaan tidak valid. Muat ulang halaman.", outcome: "invalid", resultToken };
  }
  if (decision === "REJECT") {
    if (reason.length < 5) {
      return {
        errors: { reason: "Tulis alasan penolakan, minimal 5 karakter. Alasan ini dikirim ke pemilik gerai." },
        message: "Pendaftaran belum ditolak.",
        outcome: "invalid",
        resultToken,
        tenantId,
      };
    }
    if (reason.length > 500 || !validate("FREE_TEXT", reason)) {
      return {
        errors: { reason: "Alasan maksimal 500 karakter tanpa karakter kontrol." },
        message: "Pendaftaran belum ditolak.",
        outcome: "invalid",
        resultToken,
        tenantId,
      };
    }
  }

  let reviewed;
  try {
    reviewed = await reviewTenantRegistration(db, access.principal.userId, {
      decision,
      reason: decision === "REJECT" ? reason : undefined,
      tenantId,
    });
  } catch (error) {
    if (error instanceof RegistrationReviewDeniedError) {
      return { message: "Akses Super Admin diperlukan.", outcome: "denied", resultToken, tenantId };
    }
    if (error instanceof RegistrationReviewStateError) {
      return {
        message: error.reason === "unverified"
          ? "Email pemilik belum terverifikasi. Gerai dapat disetujui setelah pemilik memverifikasi emailnya."
          : error.reason === "invalid"
            ? "Permintaan tidak valid. Muat ulang halaman."
            : "Pendaftaran ini sudah diproses atau tidak lagi menunggu persetujuan. Muat ulang halaman.",
        outcome: error.reason === "invalid" ? "invalid" : "conflict",
        resultToken,
        tenantId,
      };
    }
    return { message: "Keputusan belum tersimpan. Coba lagi.", outcome: "error", resultToken, tenantId };
  }

  let mailed = true;
  try {
    if (reviewed.status === "ACTIVE") {
      await sendRegistrationApprovedMail(reviewed.ownerEmail, reviewed.ownerName, reviewed.storeName);
    } else {
      await sendRegistrationRejectedMail(reviewed.ownerEmail, reason);
    }
  } catch {
    mailed = false;
  }

  // No revalidation: every platform page is rendered per request, and a
  // revalidation would refresh this list and unmount the decided card before
  // its result is read. The next visit lists only stores still awaiting approval.
  const notice = mailed
    ? "Pemilik gerai sudah dikirimi email."
    : "Email ke pemilik belum terkirim; hubungi pemilik secara langsung.";
  return reviewed.status === "ACTIVE"
    ? { message: `Gerai ${reviewed.storeName} disetujui. ${notice}`, outcome: "approved", resultToken, tenantId }
    : { message: `Pendaftaran ${reviewed.storeName} ditolak. ${notice}`, outcome: "rejected", resultToken, tenantId };
}
