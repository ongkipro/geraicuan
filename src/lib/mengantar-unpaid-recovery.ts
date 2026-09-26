import "server-only";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import type { ProviderBatchScope } from "@/db/order-batch-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import {
  claimUnpaidRecovery,
  completeUnpaidRecovery,
  markUnpaidRecoveryUnknown,
  MengantarUnpaidRecoveryBatchIdMissingError,
  prepareUnpaidRecoveries,
  UnpaidRecoveryDeniedError,
} from "@/db/unpaid-recovery-repository";
import {
  normalizeMengantarProviderIdentifier,
  validateMengantarTransportScope,
  withProviderAccountSerialization,
} from "@/lib/mengantar-order";
import type { MengantarTransportScopeBinding } from "@/lib/mengantar-order";
import { mengantarDocumentedOrderCourier } from "@/lib/mengantar-couriers";
import { enforceUnpaidRecoveryRateLimit } from "@/lib/order-rate-limit";

export type MengantarPayUnpaidRequest = {
  batch_id: string;
  courier: string;
};

export type MengantarPayUnpaidTransport = {
  payUnpaid(request: Readonly<MengantarPayUnpaidRequest>): Promise<unknown>;
};

export type MengantarPayUnpaidTransportBinding = Omit<
  MengantarTransportScopeBinding,
  "transport"
> & {
  transport: MengantarPayUnpaidTransport;
};

export type MengantarPayUnpaidTransportLookup = (
  scope: Readonly<ProviderBatchScope>,
  tx: TenantTransaction,
  context: TenantContext,
) => Promise<MengantarPayUnpaidTransportBinding>;

export type FixtureUnpaidRecoveryInput = {
  db: NodePgDatabase<typeof schema>;
  lockPool: Pool;
  principalId: string;
  tenantId: string;
  batchId: string;
  resolveTransport: MengantarPayUnpaidTransportLookup;
};

export type FixtureUnpaidRecoveryResult = {
  batchId: string;
  recoveries: Array<{
    id: string;
    shipmentId: string;
    created: boolean;
    submitted: boolean;
    status: (typeof schema.providerUnpaidRecoveries.$inferSelect)["status"];
  }>;
};

export class MengantarUnpaidRecoveryUnknownError extends Error {
  readonly safeCode: string;

  constructor(safeCode: string) {
    super("Mengantar unpaid recovery outcome is unknown.");
    this.safeCode = safeCode;
  }
}

/**
 * DATA-13: `pay-unpaid` takes the Mengantar `batch_id` (an object id, documented;
 * T-237), which is neither the order id nor the readable `batch` code.
 * A row accepted before T-223 has no stored batch, so nothing is sent for it:
 * sending the order id instead was the bug. Subclasses the repository's
 * unavailable error so every caller already maps it to a safe refusal.
 */
export { MengantarUnpaidRecoveryBatchIdMissingError };

export class MengantarUnpaidRecoveryTransportUnavailableError extends Error {
  constructor() {
    super("Mengantar unpaid recovery transport is unavailable.");
  }
}

type ValidatedRecoveryTransportBinding = {
  providerAccountKey: string;
  transport: MengantarPayUnpaidTransport;
};

/**
 * D-26 (T-237): the documented `POST /order/pay-unpaid` response —
 * `{"success": true, "data": 2, "cnote_no": ["DMP00097790689", "DMP00097790690"]}`
 * (api-public.mengantar.com/docs, read 2026-09-26): `data` is the number of
 * orders paid and `cnote_no` their AWBs. Nothing is echoed back, so the batch and
 * courier are correlated from the request alone. The earlier parser read an
 * assumed `data: {batch_id, courier, cnote_no}` object that the docs never show.
 */
type PayUnpaidEnvelope = {
  success?: unknown;
  data?: unknown;
  cnote_no?: unknown;
};


function validateRecoveryTransportBinding(
  scope: Readonly<ProviderBatchScope>,
  value: unknown,
): ValidatedRecoveryTransportBinding {
  let binding: { providerAccountKey: string; transport: unknown };
  try {
    binding = validateMengantarTransportScope(scope, value);
  } catch {
    throw new MengantarUnpaidRecoveryTransportUnavailableError();
  }
  if (
    typeof binding.transport !== "object"
    || typeof (binding.transport as Partial<MengantarPayUnpaidTransport>).payUnpaid
      !== "function"
  ) {
    throw new MengantarUnpaidRecoveryTransportUnavailableError();
  }
  return binding as ValidatedRecoveryTransportBinding;
}

export function normalizeMengantarPayUnpaidResponse(
  response: unknown,
  expectedProviderBatchId: string,
  expectedCourier: string,
) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new MengantarUnpaidRecoveryUnknownError("PAY_UNPAID_RESPONSE_SCHEMA_UNKNOWN");
  }
  const envelope = response as PayUnpaidEnvelope;
  if (
    envelope.success !== true
    || typeof envelope.data !== "number"
    || !Number.isSafeInteger(envelope.data)
    || envelope.data < 0
    || !Array.isArray(envelope.cnote_no)
    || envelope.cnote_no.length !== envelope.data
  ) {
    throw new MengantarUnpaidRecoveryUnknownError("PAY_UNPAID_RESPONSE_SCHEMA_UNKNOWN");
  }
  // One order per batch (orders are submitted one per request): exactly one paid.
  if (envelope.data !== 1) {
    throw new MengantarUnpaidRecoveryUnknownError("PAY_UNPAID_ORDER_CORRELATION_UNKNOWN");
  }

  let cnoteNo: string;
  try {
    cnoteNo = normalizeMengantarProviderIdentifier(
      envelope.cnote_no[0],
      "PAY_UNPAID_CNOTE_UNSAFE",
    );
  } catch {
    throw new MengantarUnpaidRecoveryUnknownError("PAY_UNPAID_RESPONSE_IDENTIFIER_UNSAFE");
  }

  return {
    providerBatchId: expectedProviderBatchId.trim(),
    courier: expectedCourier.trim(),
    cnoteNo,
  };
}

async function markUnknown(
  input: FixtureUnpaidRecoveryInput,
  recoveryId: string,
  safeCode: string,
) {
  await withTenantContextForRecovery(input, (tx, context) =>
    markUnpaidRecoveryUnknown(
      tx,
      context,
      input.batchId,
      recoveryId,
      safeCode,
    ),
  );
}

async function withTenantContextForRecovery<T>(
  input: FixtureUnpaidRecoveryInput,
  work: (tx: TenantTransaction, context: TenantContext) => Promise<T>,
) {
  return withTenantContext(
    input.db,
    input.principalId,
    input.tenantId,
    work,
  );
}

export async function orchestrateFixtureBackedMengantarUnpaidRecovery(
  input: FixtureUnpaidRecoveryInput,
): Promise<FixtureUnpaidRecoveryResult> {
  await withTenantContextForRecovery(input, async (tx, context) => {
    if (context.role !== "TENANT_ADMIN") {
      throw new UnpaidRecoveryDeniedError();
    }
    await enforceUnpaidRecoveryRateLimit(tx, context);
  });

  const preparedWithBinding = await withTenantContextForRecovery(
    input,
    async (tx, context) => {
      const prepared = await prepareUnpaidRecoveries(tx, context, input.batchId);
      const providerScope: ProviderBatchScope = {
        tenantId: prepared.scope.tenantId,
        outletId: prepared.scope.outletId,
        pickupAddressId: prepared.scope.pickupAddressId,
        courier: prepared.scope.courier,
        credentialSource: prepared.scope.credentialSource,
      };
      const immutableScope = Object.freeze(providerScope);
      let resolved: unknown;
      try {
        resolved = await input.resolveTransport(immutableScope, tx, context);
      } catch {
        throw new MengantarUnpaidRecoveryTransportUnavailableError();
      }
      const binding = validateRecoveryTransportBinding(immutableScope, resolved);
      if (binding.providerAccountKey !== prepared.scope.providerAccountKey) {
        throw new MengantarUnpaidRecoveryTransportUnavailableError();
      }
      return { prepared, binding };
    },
  );

  // Checked for the whole batch before anything is claimed or sent.
  const payable = preparedWithBinding.prepared.recoveries.map((recovery) => {
    if (recovery.status === "PAYMENT_QUEUED" && !recovery.providerBatchId) {
      throw new MengantarUnpaidRecoveryBatchIdMissingError();
    }
    return recovery;
  });

  const results: FixtureUnpaidRecoveryResult["recoveries"] = [];
  for (const recovery of payable) {
    if (recovery.status !== "PAYMENT_QUEUED") {
      results.push({
        id: recovery.id,
        shipmentId: recovery.shipmentId,
        created: recovery.created,
        submitted: false,
        status: recovery.status,
      });
      continue;
    }

    const claimed = await withTenantContextForRecovery(input, (tx, context) =>
      claimUnpaidRecovery(tx, context, input.batchId, recovery.id),
    );
    if (!claimed) {
      results.push({
        id: recovery.id,
        shipmentId: recovery.shipmentId,
        created: recovery.created,
        submitted: false,
        status: recovery.status,
      });
      continue;
    }

    try {
      const providerBatchId = recovery.providerBatchId!;
      // The documented `courier` spelling ("Sap", not the catalogue's "SAP").
      const courier = preparedWithBinding.prepared.scope.courier;
      const request = Object.freeze({
        batch_id: providerBatchId,
        courier: mengantarDocumentedOrderCourier(courier) ?? courier,
      });
      const response = await withProviderAccountSerialization(
        input.lockPool,
        preparedWithBinding.prepared.scope.providerAccountKey,
        () => preparedWithBinding.binding.transport.payUnpaid(request),
      );
      const normalized = normalizeMengantarPayUnpaidResponse(
        response,
        providerBatchId,
        preparedWithBinding.prepared.scope.courier,
      );
      await withTenantContextForRecovery(input, (tx, context) =>
        completeUnpaidRecovery(
          tx,
          context,
          input.batchId,
          recovery.id,
          normalized,
        ),
      );
      results.push({
        id: recovery.id,
        shipmentId: recovery.shipmentId,
        created: recovery.created,
        submitted: true,
        status: "COMPLETED",
      });
    } catch (error) {
      const safeCode = error instanceof MengantarUnpaidRecoveryUnknownError
        ? error.safeCode
        : "PAY_UNPAID_OUTCOME_UNKNOWN";
      await markUnknown(input, recovery.id, safeCode);
      results.push({
        id: recovery.id,
        shipmentId: recovery.shipmentId,
        created: recovery.created,
        submitted: true,
        status: "PAYMENT_UNKNOWN",
      });
    }
  }

  return { batchId: input.batchId, recoveries: results };
}
