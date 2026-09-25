"use server";

import { redirect } from "next/navigation";

import { parseTrackingLookupKey } from "@/app/app/cek-resi/lookup-key";
import {
  enforceTrackingLookupRateLimit,
  TrackingLookupRateLimitedError,
} from "@/app/app/cek-resi/lookup-rate-limit";
import { db } from "@/db/client";
import { lookupShipmentByTrackingKey } from "@/db/shipment-tracking-lookup-repository";
import { TenantContextDeniedError, withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import type { shipmentStatuses } from "@/lib/domain-enums";
import type { PaymentMethod } from "@/lib/payment-method";

export type TrackingLookupState =
  | { kind: "idle" }
  | { kind: "invalid"; query: string }
  | { kind: "limited"; query: string }
  | { kind: "missing"; query: string }
  | { kind: "unavailable"; query: string }
  | {
    kind: "found";
    query: string;
    result: {
      awb: string | null;
      courier: string | null;
      declaredValueIdr: number;
      destinationAreaLabel: string;
      observation: { observedAtIso: string; providerStatus: string } | null;
      paymentMethod: PaymentMethod;
      providerCodAmountIdr: number | null;
      providerService: string | null;
      publicReference: string;
      status: (typeof shipmentStatuses)[number];
      updatedAtIso: string;
    };
  };

export async function lookupShipmentTracking(
  _previous: TrackingLookupState,
  formData: FormData,
): Promise<TrackingLookupState> {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");

  const raw = formData.get("trackingKey");
  const query = typeof raw === "string" ? raw.trim() : "";
  const key = parseTrackingLookupKey(query);
  if (!key) return { kind: "invalid", query };

  try {
    enforceTrackingLookupRateLimit(principal.tenantId, principal.userId);
    const result = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => lookupShipmentByTrackingKey(tx, context, key),
    );
    // One outcome for "no such shipment" and "another tenant's shipment": the query never left
    // the tenant, so neither branch exists here to time or word differently.
    if (!result) return { kind: "missing", query };
    return {
      kind: "found",
      query,
      result: {
        awb: result.awb,
        courier: result.courier,
        declaredValueIdr: result.declaredValueIdr,
        destinationAreaLabel: result.destinationAreaLabel,
        observation: result.observation
          ? {
            observedAtIso: result.observation.observedAt.toISOString(),
            providerStatus: result.observation.providerStatus,
          }
          : null,
        paymentMethod: result.paymentMethod,
        providerCodAmountIdr: result.providerCodAmountIdr,
        providerService: result.providerService,
        publicReference: result.publicReference,
        status: result.status,
        updatedAtIso: result.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof TrackingLookupRateLimitedError) return { kind: "limited", query };
    if (error instanceof TenantContextDeniedError) return { kind: "unavailable", query };
    throw error;
  }
}
