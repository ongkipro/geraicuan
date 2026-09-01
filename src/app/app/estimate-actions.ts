"use server";

import { redirect } from "next/navigation";

import {
  appendEstimateSnapshot,
  DraftEstimateUnavailableError,
  loadDraftEstimateInput,
} from "@/db/estimate-repository";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { EstimateRateLimitedError, enforceEstimateRateLimit } from "@/lib/estimate-rate-limit";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import {
  MengantarConfigurationError,
  resolveMengantarCredentials,
} from "@/lib/mengantar-credentials";
import { fetchMengantarEstimate, MengantarEstimateError } from "@/lib/mengantar-estimate";
import {
  isSanctionedEstimateFixtureEnabled,
  loadSanctionedEstimateFixture,
} from "@/lib/sanctioned-estimate-fixture";
import {
  createShipmentCorrelationId,
  emitShipmentLifecycleEvent,
} from "@/lib/shipment-telemetry";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShipmentEstimateActionState = {
  error?: string;
  unconfigured?: boolean;
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
  if (principal.scope !== "tenant") {
    redirect("/login/tenant");
  }
  return principal;
}

export async function loadShipmentEstimate(
  _previous: ShipmentEstimateActionState,
  formData: FormData,
): Promise<ShipmentEstimateActionState> {
  const shipmentId = formData.get("shipmentId");
  if (typeof shipmentId !== "string" || !UUID_PATTERN.test(shipmentId)) {
    return { error: "Draf kiriman tidak dapat dimuat." };
  }

  const startedAt = Date.now();
  const correlationId = createShipmentCorrelationId();
  let verifiedContext: { tenantId: string; actorId: string } | undefined;
  let estimateScope:
    | {
      tenantId: string;
      actorId: string;
      outletId: string;
      credentialSource: "private" | "platform_default";
    }
    | undefined;
  try {
    const principal = await requireTenantPrincipal();
    verifiedContext = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      async (tx, context) => {
        try {
          await enforceEstimateRateLimit(tx, context);
        } catch (error) {
          if (error instanceof EstimateRateLimitedError) {
            emitShipmentLifecycleEvent({
              operation: "estimate",
              outcome: "rate_limited",
              tenantId: context.tenantId,
              actorId: context.userId,
              correlationId,
              latencyMs: Date.now() - startedAt,
              safeProviderStatus: "NOT_CALLED",
              retryResult: "rejected",
              queueResult: "not_applicable",
            });
          }
          throw error;
        }
        return { tenantId: context.tenantId, actorId: context.userId };
      },
    );

    const prepared = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      async (tx, context) => {
        const draft = await loadDraftEstimateInput(tx, context, shipmentId);
        if (isSanctionedEstimateFixtureEnabled()) {
          return { draft, resolved: null };
        }
        const resolved = await resolveMengantarCredentials(
          tx,
          context,
          draft.outletId,
        );
        return { draft, resolved };
      },
    );
    estimateScope = {
      ...verifiedContext,
      outletId: prepared.draft.outletId,
      credentialSource: prepared.resolved?.source ?? "platform_default",
    };

    const estimateRequest = {
      destinationAreaId: prepared.draft.destinationAreaId,
      originAreaId: prepared.draft.originAreaId,
      weightGrams: prepared.draft.weightGrams,
    };
    const services = prepared.resolved
      ? await fetchMengantarEstimate(prepared.resolved.credentials, estimateRequest)
      : await loadSanctionedEstimateFixture();

    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      appendEstimateSnapshot(tx, context, shipmentId, {
        credentialSource: prepared.resolved?.source ?? "platform_default",
        destinationAreaId: prepared.draft.destinationAreaId,
        isCodRequested: prepared.draft.isCod,
        originAreaId: prepared.draft.originAreaId,
        weightGrams: prepared.draft.weightGrams,
      }, services),
    );
    emitShipmentLifecycleEvent({
      operation: "estimate",
      outcome: "success",
      ...estimateScope,
      correlationId,
      latencyMs: Date.now() - startedAt,
      safeProviderStatus: "COMPLETED",
      retryResult: "accepted",
      queueResult: "not_applicable",
    });
  } catch (error) {
    if (verifiedContext && !(error instanceof EstimateRateLimitedError)) {
      emitShipmentLifecycleEvent({
        operation: "estimate",
        outcome: "failure",
        ...(estimateScope ?? verifiedContext),
        correlationId,
        latencyMs: Date.now() - startedAt,
        safeProviderStatus: error instanceof MengantarEstimateError ? "UNAVAILABLE" : "NOT_CALLED",
        retryResult: "accepted",
        queueResult: "not_applicable",
      });
    }
    if (error instanceof MengantarConfigurationError) {
      return { unconfigured: true };
    }
    if (error instanceof EstimateRateLimitedError) {
      return { error: "Terlalu banyak permintaan estimasi. Coba lagi beberapa menit lagi." };
    }
    if (
      error instanceof CmsAuthorizationDeniedError ||
      error instanceof DraftEstimateUnavailableError ||
      error instanceof MengantarEstimateError
    ) {
      return { error: "Estimasi tidak dapat dimuat saat ini. Periksa draf lalu coba lagi." };
    }
    throw error;
  }

  redirect(`/app/pengiriman/baru?draft=${shipmentId}`);
}
