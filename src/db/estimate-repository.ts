import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  estimateCredentialSources,
  outlets,
  shipmentDrafts,
  shipmentEstimateServices,
  shipmentEstimateSnapshots,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

export type DraftEstimateInput = {
  shipmentId: string;
  outletId: string;
  originAreaId: string;
  destinationAreaId: string;
  destinationAreaLabel: string;
  weightGrams: number;
  isCod: boolean;
};

export type EstimateRequestMetadata = {
  originAreaId: string;
  destinationAreaId: string;
  destinationAreaLabel: string;
  weightGrams: number;
  isCodRequested: boolean;
  credentialSource: (typeof estimateCredentialSources)[number];
};

export type SupportedEstimateService = {
  providerService: string;
  currency: "IDR";
  shippingAmountIdr: number;
  shippingSourceField: "price";
  insuranceAmountIdr: null;
  insuranceSourceField: null;
  deliveryEstimate: string;
  codEligible: boolean;
};

export type PersistedEstimateService = Omit<
  SupportedEstimateService,
  "insuranceAmountIdr" | "insuranceSourceField"
> & {
  estimateServiceId: string;
  insuranceAmountIdr: number | null;
  insuranceSourceField: string | null;
};

export type LatestEstimateSnapshot = {
  snapshotId: string;
  shipmentId: string;
  outletId: string;
  request: EstimateRequestMetadata;
  retrievedAt: Date;
  services: PersistedEstimateService[];
};

export class DraftEstimateUnavailableError extends Error {
  constructor() {
    super("Shipment estimate is unavailable.");
  }
}

async function loadEstimateContext(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
  appendableOnly?: boolean,
): Promise<DraftEstimateInput> {
  const rows = await tx
    .select({
      shipmentId: shipments.id,
      outletId: shipments.outletId,
      originAreaId: outlets.defaultOriginAreaId,
      destinationAreaId: shipmentDrafts.destinationAreaId,
      destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
      weightGrams: shipmentDrafts.packageWeightGrams,
      isCod: shipmentDrafts.isCod,
    })
    .from(shipments)
    .innerJoin(
      shipmentDrafts,
      and(
        eq(shipmentDrafts.shipmentId, shipments.id),
        eq(shipmentDrafts.tenantId, shipments.tenantId),
      ),
    )
    .innerJoin(
      outlets,
      and(
        eq(outlets.id, shipments.outletId),
        eq(outlets.tenantId, shipments.tenantId),
      ),
    )
    .where(
      and(
        eq(shipments.id, shipmentId),
        eq(shipments.tenantId, context.tenantId),
        appendableOnly ? inArray(shipments.status, ["DRAFT", "ESTIMATED"]) : undefined,
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row?.originAreaId) {
    throw new DraftEstimateUnavailableError();
  }

  return {
    shipmentId: row.shipmentId,
    outletId: row.outletId,
    originAreaId: row.originAreaId,
    destinationAreaId: row.destinationAreaId,
    destinationAreaLabel: row.destinationAreaLabel,
    weightGrams: row.weightGrams,
    isCod: row.isCod,
  };
}

export function loadDraftEstimateInput(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<DraftEstimateInput> {
  return loadEstimateContext(tx, context, shipmentId, true);
}

function requestMatchesDraft(
  request: EstimateRequestMetadata,
  draft: DraftEstimateInput,
) {
  return (
    request.originAreaId === draft.originAreaId &&
    request.destinationAreaId === draft.destinationAreaId &&
    request.destinationAreaLabel === draft.destinationAreaLabel &&
    request.weightGrams === draft.weightGrams &&
    request.isCodRequested === draft.isCod
  );
}

export async function appendEstimateSnapshot(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
  request: EstimateRequestMetadata,
  services: readonly SupportedEstimateService[],
): Promise<string> {
  const locked = await tx.execute<{ status: "DRAFT" | "ESTIMATED" }>(sql`
    SELECT ${shipments.status} AS status
    FROM ${shipments}
    WHERE ${shipments.id} = ${shipmentId}
      AND ${shipments.tenantId} = ${context.tenantId}
      AND ${shipments.status} IN ('DRAFT', 'ESTIMATED')
    FOR UPDATE
  `);

  const status = locked.rows[0]?.status;
  if (!status) {
    throw new DraftEstimateUnavailableError();
  }

  const draft = await loadEstimateContext(tx, context, shipmentId, true);
  if (!requestMatchesDraft(request, draft)) {
    throw new DraftEstimateUnavailableError();
  }

  if (status === "DRAFT") {
    const transitioned = await tx
      .update(shipments)
      .set({ status: "ESTIMATED", updatedAt: sql`now()` })
      .where(
        and(
          eq(shipments.id, shipmentId),
          eq(shipments.tenantId, context.tenantId),
          eq(shipments.status, "DRAFT"),
        ),
      )
      .returning({ id: shipments.id });

    if (transitioned.length !== 1) {
      throw new DraftEstimateUnavailableError();
    }
  }

  const inserted = await tx
    .insert(shipmentEstimateSnapshots)
    .values({
      credentialSource: request.credentialSource,
      destinationAreaId: request.destinationAreaId,
      destinationAreaLabel: request.destinationAreaLabel,
      isCodRequested: request.isCodRequested,
      originAreaId: request.originAreaId,
      outletId: draft.outletId,
      shipmentId,
      tenantId: context.tenantId,
      weightGrams: request.weightGrams,
    })
    .returning({ id: shipmentEstimateSnapshots.id });

  const snapshot = inserted[0];
  if (!snapshot) {
    throw new Error("Estimate snapshot was not created.");
  }

  if (services.length > 0) {
    await tx.insert(shipmentEstimateServices).values(
      services.map((service) => ({
        codEligible: service.codEligible,
        currency: service.currency,
        deliveryEstimate: service.deliveryEstimate,
        insuranceAmountIdr: service.insuranceAmountIdr,
        insuranceSourceField: service.insuranceSourceField,
        providerService: service.providerService,
        shippingAmountIdr: service.shippingAmountIdr,
        shippingSourceField: service.shippingSourceField,
        snapshotId: snapshot.id,
        tenantId: context.tenantId,
      })),
    );
  }

  return snapshot.id;
}

export async function loadLatestEstimateSnapshot(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<LatestEstimateSnapshot | null> {
  const snapshots = await tx
    .select({
      snapshotId: shipmentEstimateSnapshots.id,
      shipmentId: shipmentEstimateSnapshots.shipmentId,
      outletId: shipmentEstimateSnapshots.outletId,
      originAreaId: shipmentEstimateSnapshots.originAreaId,
      destinationAreaId: shipmentEstimateSnapshots.destinationAreaId,
      destinationAreaLabel: shipmentEstimateSnapshots.destinationAreaLabel,
      weightGrams: shipmentEstimateSnapshots.weightGrams,
      isCodRequested: shipmentEstimateSnapshots.isCodRequested,
      credentialSource: shipmentEstimateSnapshots.credentialSource,
      retrievedAt: shipmentEstimateSnapshots.retrievedAt,
    })
    .from(shipmentEstimateSnapshots)
    .innerJoin(
      shipments,
      and(
        eq(shipments.id, shipmentEstimateSnapshots.shipmentId),
        eq(shipments.tenantId, shipmentEstimateSnapshots.tenantId),
      ),
    )
    .where(
      and(
        eq(shipmentEstimateSnapshots.shipmentId, shipmentId),
        eq(shipmentEstimateSnapshots.tenantId, context.tenantId),
      ),
    )
    .orderBy(desc(shipmentEstimateSnapshots.retrievedAt), desc(shipmentEstimateSnapshots.id))
    .limit(1);

  const snapshot = snapshots[0];
  if (!snapshot) return null;

  const services = await tx
    .select({
      estimateServiceId: shipmentEstimateServices.id,
      providerService: shipmentEstimateServices.providerService,
      currency: shipmentEstimateServices.currency,
      shippingAmountIdr: shipmentEstimateServices.shippingAmountIdr,
      shippingSourceField: shipmentEstimateServices.shippingSourceField,
      insuranceAmountIdr: shipmentEstimateServices.insuranceAmountIdr,
      insuranceSourceField: shipmentEstimateServices.insuranceSourceField,
      deliveryEstimate: shipmentEstimateServices.deliveryEstimate,
      codEligible: shipmentEstimateServices.codEligible,
    })
    .from(shipmentEstimateServices)
    .where(
      and(
        eq(shipmentEstimateServices.snapshotId, snapshot.snapshotId),
        eq(shipmentEstimateServices.tenantId, context.tenantId),
      ),
    )
    .orderBy(asc(shipmentEstimateServices.providerService));

  return {
    snapshotId: snapshot.snapshotId,
    shipmentId: snapshot.shipmentId,
    outletId: snapshot.outletId,
    request: {
      originAreaId: snapshot.originAreaId,
      destinationAreaId: snapshot.destinationAreaId,
      destinationAreaLabel: snapshot.destinationAreaLabel,
      weightGrams: snapshot.weightGrams,
      isCodRequested: snapshot.isCodRequested,
      credentialSource: snapshot.credentialSource,
    },
    retrievedAt: snapshot.retrievedAt,
    services,
  };
}
