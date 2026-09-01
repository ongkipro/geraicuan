import { beforeEach, describe, expect, it, vi } from "vitest";

const SHIPMENT_ID = "00000000-0000-4000-8000-000000000431";
const CROSS_TENANT_SHIPMENT_ID = "00000000-0000-4000-8000-000000000499";
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000432";
const NEXT_ATTEMPT_ID = "00000000-0000-4000-8000-000000000433";
const TENANT_ID = "00000000-0000-4000-8000-000000000401";

const errors = vi.hoisted(() => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  LabelUnavailableError: class LabelUnavailableError extends Error {
    constructor(readonly reason: "AWAITING_UPSTREAM_PAYMENT" | "NOT_FOUND" | "NOT_ISSUED") {
      super("Shipment label is unavailable.");
    }
  },
}));

const mocks = vi.hoisted(() => ({
  appendCalls: [] as Array<{ attemptId: string; shipmentId: string }>,
  authorizationDenied: false,
  contextCalls: 0,
  failure: "" as "" | "generic" | "not-found",
  nextAttemptId: "00000000-0000-4000-8000-000000000433",
  outcome: {
    outcome: "PRINTED" as "BLOCKED" | "PRINTED",
    printedAt: new Date("2026-09-01T02:03:04.000Z"),
    reason: "NOT_ISSUED" as "AWAITING_UPSTREAM_PAYMENT" | "NOT_ISSUED",
    sequence: 3,
  },
  principal: {
    role: "OPERATOR" as "OPERATOR" | "TENANT_ADMIN",
    scope: "tenant" as "platform" | "tenant",
    tenantId: "00000000-0000-4000-8000-000000000401",
    userId: "label-operator",
  },
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => mocks.nextAttemptId),
}));


vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("@/db/client", () => ({ db: {} }));

vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (_db, userId, tenantId, callback) => {
    mocks.contextCalls += 1;
    return callback({}, { role: mocks.principal.role, tenantId, userId });
  }),
}));

vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: errors.CmsAuthorizationDeniedError,
  requireCmsScope: vi.fn(async () => {
    if (mocks.authorizationDenied) throw new errors.CmsAuthorizationDeniedError();
    return mocks.principal;
  }),
}));

vi.mock("@/db/label-print-repository", () => ({
  LabelUnavailableError: errors.LabelUnavailableError,
  appendPrintAttempt: vi.fn(async (_tx, _context, shipmentId, attemptId) => {
    mocks.appendCalls.push({ attemptId, shipmentId });
    if (shipmentId === CROSS_TENANT_SHIPMENT_ID || mocks.failure === "not-found") {
      throw new errors.LabelUnavailableError("NOT_FOUND");
    }
    if (mocks.failure === "generic") {
      throw new Error("DB recipient 081299998765 AWB-SECRET constraint failed");
    }
    if (mocks.outcome.outcome === "BLOCKED") {
      return {
        outcome: "BLOCKED" as const,
        printedAt: mocks.outcome.printedAt,
        reason: mocks.outcome.reason,
      };
    }
    return {
      awb: "JNE-SECRET-000431",
      outcome: "PRINTED" as const,
      printedAt: mocks.outcome.printedAt,
      sequence: mocks.outcome.sequence,
    };
  }),
}));

function printForm(shipmentId = SHIPMENT_ID, attemptId = ATTEMPT_ID) {
  const form = new FormData();
  form.set("shipmentId", shipmentId);
  form.set("attemptId", attemptId);
  return form;
}

beforeEach(() => {
  mocks.appendCalls.length = 0;
  mocks.authorizationDenied = false;
  mocks.contextCalls = 0;
  mocks.failure = "";
  mocks.nextAttemptId = NEXT_ATTEMPT_ID;
  mocks.outcome = {
    outcome: "PRINTED",
    printedAt: new Date("2026-09-01T02:03:04.000Z"),
    reason: "NOT_ISSUED",
    sequence: 3,
  };
  mocks.principal = {
    role: "OPERATOR",
    scope: "tenant",
    tenantId: TENANT_ID,
    userId: "label-operator",
  };
});

describe("recordLabelPrint", () => {
  it("authenticates before reading FormData and never enters tenant context when denied", async () => {
    mocks.authorizationDenied = true;
    const unreadableForm = {
      get: vi.fn(() => {
        throw new Error("FORM_READ_BEFORE_AUTH");
      }),
    } as unknown as FormData;
    const { recordLabelPrint } = await import("@/app/app/label/[shipmentId]/actions");

    await expect(recordLabelPrint({}, unreadableForm)).rejects.toThrow("REDIRECT:/login/tenant");
    expect(unreadableForm.get).not.toHaveBeenCalled();
    expect(mocks.contextCalls).toBe(0);
  });

  it("denies a platform principal before reading FormData or entering tenant context", async () => {
    mocks.principal.scope = "platform";
    const unreadableForm = {
      get: vi.fn(() => {
        throw new Error("FORM_READ_BEFORE_SCOPE_CHECK");
      }),
    } as unknown as FormData;
    const { recordLabelPrint } = await import("@/app/app/label/[shipmentId]/actions");

    await expect(recordLabelPrint({}, unreadableForm)).rejects.toThrow("REDIRECT:/login/tenant");
    expect(unreadableForm.get).not.toHaveBeenCalled();
    expect(mocks.contextCalls).toBe(0);
  });

  it.each([
    ["shipmentId", "not-a-uuid", ATTEMPT_ID],
    ["attemptId", SHIPMENT_ID, "not-a-uuid"],
  ])("rejects an invalid %s without tenant access", async (_field, shipmentId, attemptId) => {
    const { recordLabelPrint } = await import("@/app/app/label/[shipmentId]/actions");

    await expect(recordLabelPrint({}, printForm(shipmentId, attemptId))).resolves.toEqual({
      error: "Kiriman tidak ditemukan.",
    });
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.appendCalls).toEqual([]);
  });

  it.each(["OPERATOR", "TENANT_ADMIN"] as const)(
    "records an exact successful attempt for a %s",
    async (role) => {
      mocks.principal.role = role;
      const { recordLabelPrint } = await import("@/app/app/label/[shipmentId]/actions");

      const state = await recordLabelPrint({ error: "old state" }, printForm());

      expect(state).toEqual({
        nextAttemptId: NEXT_ATTEMPT_ID,
        printed: {
          printedAt: "2026-09-01T02:03:04.000Z",
          sequence: 3,
          token: ATTEMPT_ID,
        },
      });
      expect(mocks.appendCalls).toEqual([{ attemptId: ATTEMPT_ID, shipmentId: SHIPMENT_ID }]);
    },
  );

  it.each(["NOT_ISSUED", "AWAITING_UPSTREAM_PAYMENT"] as const)(
    "returns the %s blocked reason without claiming a print",
    async (reason) => {
      mocks.outcome.outcome = "BLOCKED";
      mocks.outcome.reason = reason;
      const { recordLabelPrint } = await import("@/app/app/label/[shipmentId]/actions");

      await expect(recordLabelPrint({}, printForm())).resolves.toEqual({
        blocked: reason,
        nextAttemptId: NEXT_ATTEMPT_ID,
      });
      expect(mocks.appendCalls).toEqual([{ attemptId: ATTEMPT_ID, shipmentId: SHIPMENT_ID }]);
    },
  );

  it("makes a missing and cross-tenant shipment indistinguishable", async () => {
    const { recordLabelPrint } = await import("@/app/app/label/[shipmentId]/actions");
    mocks.failure = "not-found";
    const missing = await recordLabelPrint({}, printForm());
    mocks.failure = "";
    const crossTenant = await recordLabelPrint({}, printForm(CROSS_TENANT_SHIPMENT_ID));

    expect(missing).toEqual({ error: "Kiriman tidak ditemukan.", nextAttemptId: ATTEMPT_ID });
    expect(crossTenant).toEqual(missing);
  });

  it("maps an unexpected repository failure to a generic state without leaking PII, AWB, or DB detail", async () => {
    mocks.failure = "generic";
    const { recordLabelPrint } = await import("@/app/app/label/[shipmentId]/actions");

    const state = await recordLabelPrint({}, printForm());
    const serialized = JSON.stringify(state);

    expect(state).toEqual({
      error: "Permintaan cetak tidak dapat dicatat. Coba lagi.",
      nextAttemptId: ATTEMPT_ID,
    });
    expect(serialized).not.toMatch(/081299998765|AWB-SECRET|constraint|DB recipient/i);
  });
});
