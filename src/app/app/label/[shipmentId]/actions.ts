"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import {
  appendBlockedPrintEvent,
  appendPrintEvent,
  LabelUnavailableError,
  type LabelUnavailableReason,
} from "@/db/label-print-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LabelPrintActionState = {
  printed?: { sequence: number; printedAt: string; token: string };
  blocked?: "NOT_ISSUED" | "AWAITING_UPSTREAM_PAYMENT";
  error?: string;
};

async function requireTenantPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/tenant");
    }
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  return principal;
}

export async function recordLabelPrint(
  _previous: LabelPrintActionState,
  formData: FormData,
): Promise<LabelPrintActionState> {
  const principal = await requireTenantPrincipal();
  const shipmentId = formData.get("shipmentId");
  if (typeof shipmentId !== "string" || !UUID_PATTERN.test(shipmentId)) {
    return { error: "Kiriman tidak ditemukan." };
  }

  try {
    const outcome = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      async (tx, context) => {
        try {
          return {
            kind: "printed" as const,
            event: await appendPrintEvent(tx, context, shipmentId),
          };
        } catch (error) {
          if (!(error instanceof LabelUnavailableError)) throw error;
          if (error.reason === "NOT_FOUND") {
            return { kind: "unavailable" as const, reason: error.reason };
          }
          await appendBlockedPrintEvent(tx, context, shipmentId, error.reason);
          return { kind: "unavailable" as const, reason: error.reason };
        }
      },
    );

    if (outcome.kind === "unavailable") {
      if (outcome.reason === "NOT_FOUND") {
        return { error: "Kiriman tidak ditemukan." };
      }
      return {
        blocked: outcome.reason as Exclude<
          LabelUnavailableReason,
          "NOT_FOUND"
        >,
      };
    }

    revalidatePath(`/app/label/${shipmentId}`);
    return {
      printed: {
        sequence: outcome.event.sequence,
        printedAt: outcome.event.printedAt.toISOString(),
        token: randomUUID(),
      },
    };
  } catch {
    return { error: "Cetak tidak dapat dicatat. Coba lagi." };
  }
}
