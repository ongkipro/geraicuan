import { describe, expect, it, vi } from "vitest";

import {
  emitShipmentLifecycleEvent,
  type ShipmentLifecycleEventInput,
} from "@/lib/shipment-telemetry";

const tenantId = "00000000-0000-0000-0000-000000001001";
const outletId = "00000000-0000-0000-0000-000000001011";
const correlationId = "10000000-0000-4000-8000-000000000001";

describe("shipment lifecycle telemetry", () => {
  it("writes one allowlisted JSON event and drops raw PII, credentials, AWBs, and bodies", () => {
    const piiCanary = "081277776666";
    const credentialCanary = "sk_test_DO_NOT_LOG";
    const awbCanary = "AWB-DO-NOT-LOG";
    const bodyCanary = "RAW-BODY-DO-NOT-LOG";
    const unsafeInput: ShipmentLifecycleEventInput & {
      recipientPhone: string;
      authorization: string;
      cnoteNo: string;
      rawBody: string;
    } = {
      operation: "estimate",
      outcome: "success",
      tenantId,
      actorId: "operator-1001",
      correlationId,
      outletId,
      credentialSource: "private",
      latencyMs: 27,
      safeProviderStatus: "COMPLETED",
      retryResult: "accepted",
      queueResult: "not_applicable",
      recipientPhone: piiCanary,
      authorization: credentialCanary,
      cnoteNo: awbCanary,
      rawBody: bodyCanary,
    };
    const logger = vi.spyOn(console, "info").mockImplementation(() => undefined);

    try {
      const emitted = emitShipmentLifecycleEvent(unsafeInput);
      expect(logger).toHaveBeenCalledTimes(1);
      const line = logger.mock.calls[0]?.[0];
      expect(typeof line).toBe("string");
      const parsed = JSON.parse(line as string) as Record<string, unknown>;

      expect(parsed).toEqual(emitted);
      expect(parsed).toMatchObject({
        event: "shipment.provider.lifecycle",
        severity: "INFO",
        operation: "estimate",
        outcome: "success",
        tenantId,
        actorId: "operator-1001",
        correlationId,
        outletId,
        credentialSource: "private",
        latencyMs: 27,
        safeProviderStatus: "COMPLETED",
        retryResult: "accepted",
        queueResult: "not_applicable",
      });
      expect(Object.keys(parsed).sort()).toEqual([
        "actorId",
        "correlationId",
        "credentialSource",
        "event",
        "latencyMs",
        "occurredAt",
        "operation",
        "outcome",
        "outletId",
        "queueResult",
        "retryResult",
        "safeProviderStatus",
        "severity",
        "tenantId",
      ]);
      const serialized = JSON.stringify(parsed);
      for (const prohibited of [piiCanary, credentialCanary, awbCanary, bodyCanary]) {
        expect(serialized).not.toContain(prohibited);
      }
    } finally {
      logger.mockRestore();
    }
  });
});
