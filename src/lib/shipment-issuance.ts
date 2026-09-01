import "server-only";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { ensureCodTotalsForConfirmation } from "@/db/cod-totals-repository";
import type { OrderConfirmation } from "@/db/order-batch-repository";
import * as schema from "@/db/schema";
import { loadShipmentDetail } from "@/db/shipment-queue-repository";
import {
  withTenantContext,
  type TenantContext,
  type TenantTransaction,
} from "@/db/tenant-context";
import {
  orchestrateFixtureBackedMengantarOrders,
  type MengantarOrderTransportLookup,
} from "@/lib/mengantar-order";

export type FixtureBackedShipmentIssuanceInput = {
  db: NodePgDatabase<typeof schema>;
  lockPool: Pool;
  principalId: string;
  tenantId: string;
  confirmation: OrderConfirmation;
  resolveTransport: MengantarOrderTransportLookup;
};

export type FixtureBackedShipmentIssuanceResult = {
  awb: string | null;
  duplicate: boolean;
  labelHref: string | null;
  shipmentId: string;
  status: (typeof schema.shipmentStatuses)[number];
};

export class ShipmentIssuanceUnavailableError extends Error {
  constructor() {
    super("Shipment issuance is unavailable.");
  }
}

export async function confirmFixtureBackedShipmentIssuance(
  input: FixtureBackedShipmentIssuanceInput,
): Promise<FixtureBackedShipmentIssuanceResult> {
  const execution = await orchestrateFixtureBackedMengantarOrders({
    db: input.db,
    lockPool: input.lockPool,
    principalId: input.principalId,
    tenantId: input.tenantId,
    confirmations: [input.confirmation],
    prepareConfirmations: async (
      tx: TenantTransaction,
      context: TenantContext,
      confirmations: readonly OrderConfirmation[],
    ) => {
      for (const confirmation of confirmations) {
        await ensureCodTotalsForConfirmation(tx, context, {
          shipmentId: confirmation.shipmentId,
          estimateSnapshotId: confirmation.estimateSnapshotId,
          estimateServiceId: confirmation.estimateServiceId,
        });
      }
    },
    resolveTransport: input.resolveTransport,
  });
  const batch = execution.batches[0];
  if (!batch || execution.batches.length !== 1) {
    throw new ShipmentIssuanceUnavailableError();
  }

  const detail = await withTenantContext(
    input.db,
    input.principalId,
    input.tenantId,
    (tx, context) =>
      loadShipmentDetail(tx, context, input.confirmation.shipmentId),
  );
  if (!detail) throw new ShipmentIssuanceUnavailableError();

  const awb = detail.provider?.awb ?? null;
  const labelHref =
    detail.status === "ISSUED" && awb
      ? `/app/label/${encodeURIComponent(detail.shipmentId)}`
      : null;

  return {
    awb,
    duplicate: !batch.submitted,
    labelHref,
    shipmentId: detail.shipmentId,
    status: detail.status,
  };
}
