"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { db } from "@/db/client";
import {
  appendPrintAttempt,
  LabelUnavailableError,
} from "@/db/label-print-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LabelPrintActionState = {
  printed?: { sequence: number; printedAt: string; token: string };
  blocked?: "NOT_ISSUED" | "AWAITING_UPSTREAM_PAYMENT" | "CANCELLED";
  error?: string;
  nextAttemptId?: string;
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
  const attemptId = formData.get("attemptId");
  if (
    typeof shipmentId !== "string"
    || !UUID_PATTERN.test(shipmentId)
    || typeof attemptId !== "string"
    || !UUID_PATTERN.test(attemptId)
  ) {
    return { error: "Kiriman tidak ditemukan." };
  }

  try {
    const outcome = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => appendPrintAttempt(
        tx,
        context,
        shipmentId,
        attemptId,
      ),
    );

    if (outcome.outcome === "BLOCKED") {
      return {
        blocked: outcome.reason,
        nextAttemptId: randomUUID(),
      };
    }

    return {
      printed: {
        sequence: outcome.sequence,
        printedAt: outcome.printedAt.toISOString(),
        token: attemptId,
      },
      nextAttemptId: randomUUID(),
    };
  } catch (error) {
    if (
      error instanceof LabelUnavailableError
      && error.reason === "NOT_FOUND"
    ) {
      return { error: "Kiriman tidak ditemukan.", nextAttemptId: attemptId };
    }
    return {
      error: "Permintaan cetak tidak dapat dicatat. Coba lagi.",
      nextAttemptId: attemptId,
    };
  }
}
