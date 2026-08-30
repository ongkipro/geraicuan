import "server-only";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { requiresProviderAccountSerialization } from "@/db/order-batch-repository";
import type { ProviderBatchScope } from "@/db/order-batch-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import {
  claimUnpaidRecovery,
  completeUnpaidRecovery,
  markUnpaidRecoveryUnknown,
  prepareUnpaidRecoveries,
} from "@/db/unpaid-recovery-repository";
import {
  validateMengantarTransportScope,
  withProviderAccountSerialization,
} from "@/lib/mengantar-order";
import type { MengantarTransportScopeBinding } from "@/lib/mengantar-order";

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

export class MengantarUnpaidRecoveryTransportUnavailableError extends Error {
  constructor() {
    super("Mengantar unpaid recovery transport is unavailable.");
  }
}

type ValidatedRecoveryTransportBinding = {
  providerAccountKey: string;
  transport: MengantarPayUnpaidTransport;
};

type PayUnpaidEnvelope = {
  success?: unknown;
  data?: unknown;
};

type PayUnpaidData = {
  batch_id?: unknown;
  courier?: unknown;
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
    || !envelope.data
    || typeof envelope.data !== "object"
    || Array.isArray(envelope.data)
  ) {
    throw new MengantarUnpaidRecoveryUnknownError("PAY_UNPAID_RESPONSE_SCHEMA_UNKNOWN");
  }

  const data = envelope.data as PayUnpaidData;
  if (
    typeof data.batch_id !== "string"
    || typeof data.courier !== "string"
    || !Array.isArray(data.cnote_no)
  ) {
    throw new MengantarUnpaidRecoveryUnknownError("PAY_UNPAID_RESPONSE_SCHEMA_UNKNOWN");
  }

  const providerBatchId = data.batch_id.trim();
  const courier = data.courier.trim();
  if (!providerBatchId || providerBatchId !== expectedProviderBatchId.trim()) {
    throw new MengantarUnpaidRecoveryUnknownError("PAY_UNPAID_BATCH_CORRELATION_UNKNOWN");
  }
  if (
    !courier
    || courier.toUpperCase() !== expectedCourier.trim().toUpperCase()
  ) {
    throw new MengantarUnpaidRecoveryUnknownError("PAY_UNPAID_COURIER_CORRELATION_UNKNOWN");
  }
  if (data.cnote_no.length !== 1) {
    throw new MengantarUnpaidRecoveryUnknownError("PAY_UNPAID_ORDER_CORRELATION_UNKNOWN");
  }

  const [candidate] = data.cnote_no;
  if (typeof candidate !== "string") {
    throw new MengantarUnpaidRecoveryUnknownError("PAY_UNPAID_RESPONSE_SCHEMA_UNKNOWN");
  }
  const cnoteNo = candidate.trim();
  if (!cnoteNo || cnoteNo.length > 160) {
    throw new MengantarUnpaidRecoveryUnknownError("PAY_UNPAID_CNOTE_UNKNOWN");
  }
  return { providerBatchId, courier, cnoteNo };
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

  const results: FixtureUnpaidRecoveryResult["recoveries"] = [];
  for (const recovery of preparedWithBinding.prepared.recoveries) {
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
      const request = Object.freeze({
        batch_id: recovery.providerOrderId,
        courier: preparedWithBinding.prepared.scope.courier,
      });
      const submit = () => preparedWithBinding.binding.transport.payUnpaid(request);
      const response = requiresProviderAccountSerialization(
        preparedWithBinding.prepared.scope.courier,
      )
        ? await withProviderAccountSerialization(
            input.lockPool,
            preparedWithBinding.prepared.scope.providerAccountKey,
            submit,
          )
        : await submit();
      const normalized = normalizeMengantarPayUnpaidResponse(
        response,
        recovery.providerOrderId,
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
