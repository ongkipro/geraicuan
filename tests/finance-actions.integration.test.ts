import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "00000000-0000-4000-8000-000000000401";
const OUTLET_ID = "00000000-0000-4000-8000-000000000411";
const ENTRY_ID = "00000000-0000-4000-8000-000000000421";
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000431";
const NEXT_ATTEMPT_ID = "00000000-0000-4000-8000-000000000432";

const errors = vi.hoisted(() => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  LedgerDeniedError: class LedgerDeniedError extends Error {},
  LedgerUnavailableError: class LedgerUnavailableError extends Error {},
}));

const mocks = vi.hoisted(() => ({
  adjustmentCalls: [] as Array<{ attemptId: string; entryId: string }>,
  authorizationDenied: false,
  contextCalls: 0,
  failure: "" as "" | "denied" | "generic" | "unavailable",
  nextAttemptId: "00000000-0000-4000-8000-000000000432",
  principal: {
    role: "TENANT_ADMIN" as "OPERATOR" | "TENANT_ADMIN",
    scope: "tenant" as "platform" | "tenant",
    tenantId: "00000000-0000-4000-8000-000000000401",
    userId: "finance-admin",
  },
  reconciliationCalls: [] as Array<{
    attemptId: string;
    cadence: "DAILY" | "MONTHLY";
    outletId: string;
    periodEnd: Date;
    periodStart: Date;
  }>,
  revalidated: [] as string[],
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => mocks.nextAttemptId),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((href: string) => mocks.revalidated.push(href)),
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

function repositoryFailure() {
  if (mocks.failure === "denied") throw new errors.LedgerDeniedError();
  if (mocks.failure === "unavailable") throw new errors.LedgerUnavailableError();
  if (mocks.failure === "generic") {
    throw new Error("DB ledger tenant-secret recipient 081299998765");
  }
}

vi.mock("@/db/ledger-repository", () => ({
  LedgerDeniedError: errors.LedgerDeniedError,
  LedgerUnavailableError: errors.LedgerUnavailableError,
  appendLedgerAdjustment: vi.fn(async (_tx, _context, entryId, attemptId) => {
    mocks.adjustmentCalls.push({ attemptId, entryId });
    repositoryFailure();
  }),
  reconcileLedgerPeriod: vi.fn(async (_tx, _context, input) => {
    mocks.reconciliationCalls.push({
      attemptId: input.attemptId ?? input.sourceEventPrefix?.replace(/^reconciliation:/, ""),
      cadence: input.cadence,
      outletId: input.outletId,
      periodEnd: input.periodEnd,
      periodStart: input.periodStart,
    });
    repositoryFailure();
  }),
}));

function baseForm() {
  const form = new FormData();
  form.set("attemptId", ATTEMPT_ID);
  form.set("outletId", OUTLET_ID);
  form.set("rentang", "kustom");
  form.set("tz", "Asia/Jakarta");
  form.set("khusus", "1");
  return form;
}

function dailyForm() {
  const form = baseForm();
  form.set("cadence", "DAILY");
  form.set("dari", "2026-08-01");
  form.set("sampai", "2026-08-01");
  return form;
}

function monthlyForm() {
  const form = baseForm();
  form.set("cadence", "MONTHLY");
  form.set("dari", "2026-08-01");
  form.set("sampai", "2026-08-31");
  return form;
}

function adjustmentForm() {
  const form = baseForm();
  form.set("entryId", ENTRY_ID);
  form.set("confirmation", "confirmed");
  return form;
}

beforeEach(() => {
  mocks.adjustmentCalls.length = 0;
  mocks.authorizationDenied = false;
  mocks.contextCalls = 0;
  mocks.failure = "";
  mocks.nextAttemptId = NEXT_ATTEMPT_ID;
  mocks.principal = {
    role: "TENANT_ADMIN",
    scope: "tenant",
    tenantId: TENANT_ID,
    userId: "finance-admin",
  };
  mocks.reconciliationCalls.length = 0;
  mocks.revalidated.length = 0;
});

describe("Finance Server Actions", () => {
  it("authenticates both actions before reading FormData or entering tenant context", async () => {
    mocks.authorizationDenied = true;
    const unreadable = {
      get: vi.fn(() => {
        throw new Error("FORM_READ_BEFORE_AUTH");
      }),
    } as unknown as FormData;
    const { reverseLedgerEntry, runLedgerReconciliation } = await import(
      "@/app/app/keuangan/actions"
    );

    await expect(runLedgerReconciliation({}, unreadable)).rejects.toThrow(
      "REDIRECT:/login/tenant",
    );
    await expect(reverseLedgerEntry({}, unreadable)).rejects.toThrow(
      "REDIRECT:/login/tenant",
    );
    expect(unreadable.get).not.toHaveBeenCalled();
    expect(mocks.contextCalls).toBe(0);
  });

  it.each([
    ["OPERATOR", "tenant"],
    ["TENANT_ADMIN", "platform"],
  ] as const)(
    "redirects a %s/%s principal before reading either mutation",
    async (role, scope) => {
      mocks.principal.role = role;
      mocks.principal.scope = scope;
      const unreadable = {
        get: vi.fn(() => {
          throw new Error("FORM_READ_BEFORE_ROLE_CHECK");
        }),
      } as unknown as FormData;
      const { reverseLedgerEntry, runLedgerReconciliation } = await import(
        "@/app/app/keuangan/actions"
      );

      await expect(runLedgerReconciliation({}, unreadable)).rejects.toThrow(
        "REDIRECT:/app",
      );
      await expect(reverseLedgerEntry({}, unreadable)).rejects.toThrow(
        "REDIRECT:/app",
      );
      expect(unreadable.get).not.toHaveBeenCalled();
      expect(mocks.contextCalls).toBe(0);
    },
  );

  it.each([
    ["attempt reconciliation", () => {
      const form = dailyForm();
      form.set("attemptId", "bad-attempt");
      return form;
    }],
    ["outlet", () => {
      const form = dailyForm();
      form.set("outletId", "bad-outlet");
      return form;
    }],
    ["cadence", () => {
      const form = dailyForm();
      form.set("cadence", "WEEKLY");
      return form;
    }],
    ["daily range", () => {
      const form = dailyForm();
      form.set("sampai", "2026-08-02");
      return form;
    }],
    ["monthly range", () => {
      const form = monthlyForm();
      form.set("sampai", "2026-08-30");
      return form;
    }],
  ] as const)("rejects an invalid %s before tenant data access", async (_case, buildForm) => {
    const { runLedgerReconciliation } = await import("@/app/app/keuangan/actions");

    const state = await runLedgerReconciliation({}, buildForm());

    expect(state).toMatchObject({ status: "error" });
    expect(state).not.toHaveProperty("acceptedAttemptId");
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.reconciliationCalls).toEqual([]);
  });

  it.each([
    ["entryId", "bad-entry", ATTEMPT_ID, "confirmed"],
    ["attemptId", ENTRY_ID, "bad-attempt", "confirmed"],
    ["confirmation", ENTRY_ID, ATTEMPT_ID, "not-confirmed"],
  ])("rejects an invalid adjustment %s before tenant data access", async (
    _field,
    entryId,
    attemptId,
    confirmation,
  ) => {
    const form = adjustmentForm();
    form.set("entryId", entryId);
    form.set("attemptId", attemptId);
    form.set("confirmation", confirmation);
    const { reverseLedgerEntry } = await import("@/app/app/keuangan/actions");

    const state = await reverseLedgerEntry({}, form);

    expect(state).toMatchObject({ status: "error" });
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.adjustmentCalls).toEqual([]);
  });

  it("rejects an omitted reversal confirmation before tenant data access", async () => {
    const form = adjustmentForm();
    form.delete("confirmation");
    const { reverseLedgerEntry } = await import("@/app/app/keuangan/actions");
    expect(await reverseLedgerEntry({}, form)).toMatchObject({ status: "error" });
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.adjustmentCalls).toEqual([]);
  });

  it.each([
    ["DAILY", dailyForm, "2026-07-31T17:00:00.000Z", "2026-08-01T17:00:00.000Z"],
    ["MONTHLY", monthlyForm, "2026-07-31T17:00:00.000Z", "2026-08-31T17:00:00.000Z"],
  ] as const)(
    "records a stable %s attempt and returns a fresh next attempt",
    async (cadence, buildForm, start, end) => {
      const { runLedgerReconciliation } = await import("@/app/app/keuangan/actions");

      const state = await runLedgerReconciliation({}, buildForm());

      expect(state).toMatchObject({
        acceptedAttemptId: ATTEMPT_ID,
        nextAttemptId: NEXT_ATTEMPT_ID,
        status: "success",
      });
      expect(state.message).toEqual(expect.any(String));
      expect(mocks.reconciliationCalls).toEqual([{
        attemptId: ATTEMPT_ID,
        cadence,
        outletId: OUTLET_ID,
        periodEnd: new Date(end),
        periodStart: new Date(start),
      }]);
      expect(mocks.revalidated).toEqual(["/app/keuangan"]);
    },
  );

  it.each(["Asia/Makassar", "Asia/Jayapura", "UTC"])("locks daily and monthly reconciliation boundaries to WIB for legacy %s context", async (tz) => {
    const { runLedgerReconciliation } = await import("@/app/app/keuangan/actions");
    for (const [buildForm, end] of [
      [dailyForm, "2026-08-01T17:00:00.000Z"],
      [monthlyForm, "2026-08-31T17:00:00.000Z"],
    ] as const) {
      const form = buildForm();
      form.set("tz", tz);
      expect(await runLedgerReconciliation({}, form)).toMatchObject({ status: "success" });
      expect(mocks.reconciliationCalls.at(-1)).toMatchObject({ periodStart: new Date("2026-07-31T17:00:00.000Z"), periodEnd: new Date(end) });
    }
  });

  it("forwards an adjustment attempt exactly and returns action-state success", async () => {
    const { reverseLedgerEntry } = await import("@/app/app/keuangan/actions");

    const state = await reverseLedgerEntry({}, adjustmentForm());

    expect(state).toMatchObject({
      acceptedAttemptId: ATTEMPT_ID,
      nextAttemptId: NEXT_ATTEMPT_ID,
      status: "success",
    });
    expect(mocks.adjustmentCalls).toEqual([{ attemptId: ATTEMPT_ID, entryId: ENTRY_ID }]);
    expect(mocks.revalidated).toEqual(["/app/keuangan"]);
  });

  it.each(["denied", "unavailable", "generic"] as const)(
    "returns one safe retryable state for a %s repository failure",
    async (failure) => {
      mocks.failure = failure;
      const { runLedgerReconciliation } = await import("@/app/app/keuangan/actions");

      const state = await runLedgerReconciliation({}, dailyForm());
      const serialized = JSON.stringify(state);

      expect(state).toMatchObject({
        nextAttemptId: ATTEMPT_ID,
        status: "error",
      });
      expect(state).not.toHaveProperty("acceptedAttemptId");
      expect(serialized).not.toMatch(/tenant-secret|081299998765|DB ledger/i);
      expect(mocks.revalidated).toEqual([]);
    },
  );

  it.each(["unavailable", "generic"] as const)(
    "returns a safe stable adjustment retry after a %s failure",
    async (failure) => {
      mocks.failure = failure;
      const { reverseLedgerEntry } = await import("@/app/app/keuangan/actions");

      const state = await reverseLedgerEntry({}, adjustmentForm());
      const serialized = JSON.stringify(state);

      expect(state).toMatchObject({
        nextAttemptId: ATTEMPT_ID,
        status: "error",
      });
      expect(state).not.toHaveProperty("acceptedAttemptId");
      expect(serialized).not.toMatch(/tenant-secret|081299998765|DB ledger/i);
      expect(mocks.revalidated).toEqual([]);
    },
  );
});
