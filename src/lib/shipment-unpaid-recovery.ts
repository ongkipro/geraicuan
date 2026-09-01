import "server-only";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import {
  listRecoveredShipmentAwbs,
  resolveShipmentUnpaidRecoveryTarget,
  type RecoveredShipmentAwb,
  type ShipmentUnpaidRecoveryTarget,
} from "@/db/shipment-unpaid-recovery-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { markStaleUnpaidRecoveryUnknown } from "@/db/unpaid-recovery-repository";
import {
  orchestrateFixtureBackedMengantarUnpaidRecovery,
  type MengantarPayUnpaidTransportLookup,
} from "@/lib/mengantar-unpaid-recovery";

export type FixtureBackedShipmentUnpaidRecoveryInput = {
  db: NodePgDatabase<typeof schema>;
  lockPool: Pool;
  principalId: string;
  tenantId: string;
  shipmentId: string;
  resolveTransport: MengantarPayUnpaidTransportLookup;
};

export type FixtureBackedShipmentUnpaidRecoveryResult = {
  duplicate: boolean;
  shipments: RecoveredShipmentAwb[];
};

export class ShipmentUnpaidRecoveryReconciliationRequiredError extends Error {
  constructor() {
    super("Shipment unpaid recovery requires reconciliation.");
  }
}


function includeRecoveredTarget(
  shipments: RecoveredShipmentAwb[],
  target: ShipmentUnpaidRecoveryTarget,
) {
  if (
    target.state !== "RECOVERED"
    || !target.awb
    || shipments.some((shipment) => shipment.shipmentId === target.shipmentId)
  ) {
    return shipments;
  }

  return [
    {
      awb: target.awb,
      labelHref: `/app/label/${encodeURIComponent(target.shipmentId)}`,
      shipmentId: target.shipmentId,
    },
    ...shipments,
  ];
}

export async function recoverFixtureBackedShipmentPayment(
  input: FixtureBackedShipmentUnpaidRecoveryInput,
): Promise<FixtureBackedShipmentUnpaidRecoveryResult> {
  const target = await withTenantContext(
    input.db,
    input.principalId,
    input.tenantId,
    (tx, context) =>
      resolveShipmentUnpaidRecoveryTarget(tx, context, input.shipmentId),
  );

  if (target.state === "RECOVERED") {
    const recovered = await withTenantContext(
      input.db,
      input.principalId,
      input.tenantId,
      (tx, context) => listRecoveredShipmentAwbs(tx, context, target.batchId),
    );
    return {
      duplicate: true,
      shipments: includeRecoveredTarget(recovered, target),
    };
  }

  if (target.recoveryStatus === "PAYING") {
    const recoveryId = target.recoveryId;
    if (recoveryId) {
      await withTenantContext(
        input.db,
        input.principalId,
        input.tenantId,
        (tx, context) => markStaleUnpaidRecoveryUnknown(
          tx,
          context,
          target.batchId,
          recoveryId,
        ),
      );
    }
    throw new ShipmentUnpaidRecoveryReconciliationRequiredError();
  }

  if (target.recoveryStatus === "PAYMENT_UNKNOWN") {
    throw new ShipmentUnpaidRecoveryReconciliationRequiredError();
  }

  const execution = await orchestrateFixtureBackedMengantarUnpaidRecovery({
    db: input.db,
    lockPool: input.lockPool,
    principalId: input.principalId,
    tenantId: input.tenantId,
    batchId: target.batchId,
    resolveTransport: input.resolveTransport,
  });
  const recovered = await withTenantContext(
    input.db,
    input.principalId,
    input.tenantId,
    (tx, context) => listRecoveredShipmentAwbs(tx, context, target.batchId),
  );
  if (!recovered.some((shipment) => shipment.shipmentId === target.shipmentId)) {
    throw new ShipmentUnpaidRecoveryReconciliationRequiredError();
  }

  return {
    duplicate: !execution.recoveries.some((recovery) => recovery.submitted),
    shipments: recovered,
  };
}
