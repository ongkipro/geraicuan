"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { resolvePlatformAccess } from "@/app/platform/platform-access";
import { db } from "@/db/client";
import {
  ShipmentPrefixDeniedError,
  ShipmentPrefixLockedError,
  unlockTenantShipmentPrefix,
} from "@/db/shipment-number-repository";

export type ShipmentPrefixUnlockState = {
  outcome?: "success" | "error";
  message?: string;
  resultToken?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function unlockShipmentPrefix(
  _previous: ShipmentPrefixUnlockState,
  formData: FormData,
): Promise<ShipmentPrefixUnlockState> {
  const done = (outcome: "success" | "error", message: string) => ({ outcome, message, resultToken: randomUUID() });
  const access = await resolvePlatformAccess();
  if (access.status !== "authorized") return done("error", "Akses admin platform diperlukan.");
  const tenantId = formData.get("tenantId");
  const attemptId = formData.get("attemptId");
  if (typeof tenantId !== "string" || !UUID_PATTERN.test(tenantId) || typeof attemptId !== "string" || !UUID_PATTERN.test(attemptId)) {
    return done("error", "Permintaan tidak valid. Muat ulang halaman.");
  }
  try {
    await unlockTenantShipmentPrefix(db, access.principal.userId, tenantId, attemptId);
  } catch (error) {
    if (error instanceof ShipmentPrefixLockedError) return done("error", "Awalan gerai ini belum terkunci; tidak ada yang perlu dibuka.");
    if (error instanceof ShipmentPrefixDeniedError) return done("error", "Akses admin platform diperlukan.");
    return done("error", "Kunci awalan belum dapat dibuka. Coba lagi.");
  }
  revalidatePath(`/platform/tenant/${tenantId}`);
  return done("success", "Kunci awalan dibuka dan tercatat di audit. Pemilik gerai dapat memilih awalan sekali lagi di Pengaturan.");
}
