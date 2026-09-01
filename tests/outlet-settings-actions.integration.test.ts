import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "00000000-0000-4000-8000-000000000451";
const OUTLET_ID = "00000000-0000-4000-8000-000000000452";
const SECRET_SENTINEL = "submitted-credential-must-not-return";

const errors = vi.hoisted(() => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  ManagedMengantarSecretDeniedError:
    class ManagedMengantarSecretDeniedError extends Error {},
  ManagedMengantarSecretInvalidError:
    class ManagedMengantarSecretInvalidError extends Error {},
  ManagedMengantarSecretRateLimitedError:
    class ManagedMengantarSecretRateLimitedError extends Error {},
  ManagedMengantarSecretUnavailableError:
    class ManagedMengantarSecretUnavailableError extends Error {},
  MengantarConfigurationError: class MengantarConfigurationError extends Error {},
  MengantarLocationError: class MengantarLocationError extends Error {},
  OutletConnectionModeUnavailableError:
    class OutletConnectionModeUnavailableError extends Error {},
  OutletSettingsDeniedError: class OutletSettingsDeniedError extends Error {},
  OutletSettingsInvalidError: class OutletSettingsInvalidError extends Error {},
}));

const mocks = vi.hoisted(() => ({
  authorizationDenied: false,
  authorizationCalls: 0,
  credentialFailure: "" as "" | "denied" | "generic" | "invalid" | "rate" | "unavailable",
  credentialReads: 0,
  credentialWrites: 0,
  contextCalls: 0,
  failure: "" as "" | "connection" | "denied" | "generic" | "invalid",
  platformDefaultIncomplete: false,
  pickupFailure: "" as "" | "configuration" | "generic" | "provider",
  pickupOptions: [{
    originAreaId: "origin-safe-canonical",
    originLabel: "Coblong, Kota Bandung, Jawa Barat",
    pickupAddressId: "pickup-safe-preserved",
    pickupLabel: "Gudang utama, Jalan Contoh 1",
  }],
  principal: {
    role: "TENANT_ADMIN" as "OPERATOR" | "TENANT_ADMIN",
    scope: "tenant" as "platform" | "tenant",
    tenantId: "00000000-0000-4000-8000-000000000451",
    userId: "outlet-admin",
  },
  revalidated: [] as string[],
  switches: 0,
  updates: [] as Array<Record<string, string>>,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((href: string) => mocks.revalidated.push(href)),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: vi.fn(() => null) })),
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

vi.mock("@/db/outlet-readiness-repository", () => ({
  OutletConnectionModeUnavailableError: errors.OutletConnectionModeUnavailableError,
  OutletSettingsDeniedError: errors.OutletSettingsDeniedError,
  OutletSettingsInvalidError: errors.OutletSettingsInvalidError,
  updateOutletReadiness: vi.fn(async (_tx, _context, input) => {
    mocks.updates.push(input);
    if (mocks.failure === "connection") {
      throw new errors.OutletConnectionModeUnavailableError();
    }
    if (mocks.failure === "denied") throw new errors.OutletSettingsDeniedError();
    if (mocks.failure === "invalid") throw new errors.OutletSettingsInvalidError();
    if (mocks.failure === "generic") {
      throw new Error(`database failure ${SECRET_SENTINEL}`);
    }
  }),
}));

vi.mock("@/db/managed-secret-repository", () => ({
  authorizeManagedMengantarCredentialMutation: vi.fn(async () => {
    mocks.authorizationCalls += 1;
    if (mocks.credentialFailure === "denied") {
      throw new errors.ManagedMengantarSecretDeniedError();
    }
    if (mocks.credentialFailure === "rate") {
      throw new errors.ManagedMengantarSecretRateLimitedError();
    }
  }),
  ManagedMengantarSecretDeniedError: errors.ManagedMengantarSecretDeniedError,
  ManagedMengantarSecretInvalidError: errors.ManagedMengantarSecretInvalidError,
  ManagedMengantarSecretRateLimitedError: errors.ManagedMengantarSecretRateLimitedError,
  ManagedMengantarSecretUnavailableError: errors.ManagedMengantarSecretUnavailableError,
  replaceManagedMengantarApiKey: vi.fn(async (_tx, _context, _outletId, readApiKey) => {
    if (mocks.credentialFailure === "denied") {
      throw new errors.ManagedMengantarSecretDeniedError();
    }
    mocks.credentialReads += 1;
    readApiKey();
    if (mocks.credentialFailure === "invalid") {
      throw new errors.ManagedMengantarSecretInvalidError();
    }
    if (mocks.credentialFailure === "rate") {
      throw new errors.ManagedMengantarSecretRateLimitedError();
    }
    if (mocks.credentialFailure === "unavailable") {
      throw new errors.ManagedMengantarSecretUnavailableError();
    }
    if (mocks.credentialFailure === "generic") {
      throw new Error(`managed failure ${SECRET_SENTINEL}`);
    }
    mocks.credentialWrites += 1;
  }),
  restorePlatformDefaultMengantarConnection: vi.fn(
    async (_tx, _context, _outletId, assertPlatformDefaultComplete) => {
      if (mocks.credentialFailure === "denied") {
        throw new errors.ManagedMengantarSecretDeniedError();
      }
      if (mocks.credentialFailure === "rate") {
        throw new errors.ManagedMengantarSecretRateLimitedError();
      }
      assertPlatformDefaultComplete();
      if (mocks.credentialFailure === "generic") {
        throw new Error(`managed failure ${SECRET_SENTINEL}`);
      }
      mocks.switches += 1;
      return true;
    },
  ),
}));

vi.mock("@/lib/mengantar-credentials", () => ({
  MengantarConfigurationError: errors.MengantarConfigurationError,
  assertPlatformDefaultMengantarCredentialsComplete: vi.fn(() => {
    if (mocks.platformDefaultIncomplete) {
      throw new errors.MengantarConfigurationError();
    }
  }),
  resolveMengantarAccountCredentials: vi.fn(async () => {
    if (mocks.pickupFailure === "configuration") {
      throw new errors.MengantarConfigurationError();
    }
    return {
      authority: {
        connectionUpdatedAt: null,
        source: "platform_default",
      },
      credentials: {
        apiKey: "server-only-test-key",
        baseUrl: "https://api-public.mengantar.com",
        pickupAddressId: "pickup-safe-preserved",
      },
      originAreaId: "origin-safe-canonical",
      pickupAddressId: "pickup-safe-preserved",
      source: "private",
    };
  }),
}));

vi.mock("@/lib/mengantar-locations", () => ({
  MengantarLocationError: errors.MengantarLocationError,
  fetchMengantarPickupOptions: vi.fn(async () => {
    if (mocks.pickupFailure === "provider") {
      throw new errors.MengantarLocationError();
    }
    if (mocks.pickupFailure === "generic") throw new Error(SECRET_SENTINEL);
    return mocks.pickupOptions;
  }),
}));

function validForm() {
  const form = new FormData();
  form.set("outletId", OUTLET_ID);
  form.set("defaultPickupAddressId", "pickup-safe-preserved");
  form.set("connectionMode", "platform_default");
  return form;
}

beforeEach(() => {
  mocks.authorizationDenied = false;
  mocks.authorizationCalls = 0;
  mocks.credentialFailure = "";
  mocks.credentialReads = 0;
  mocks.credentialWrites = 0;
  mocks.contextCalls = 0;
  mocks.failure = "";
  mocks.platformDefaultIncomplete = false;
  mocks.pickupFailure = "";
  mocks.pickupOptions = [{
    originAreaId: "origin-safe-canonical",
    originLabel: "Coblong, Kota Bandung, Jawa Barat",
    pickupAddressId: "pickup-safe-preserved",
    pickupLabel: "Gudang utama, Jalan Contoh 1",
  }];
  mocks.principal = {
    role: "TENANT_ADMIN",
    scope: "tenant",
    tenantId: TENANT_ID,
    userId: "outlet-admin",
  };
  mocks.revalidated.length = 0;
  mocks.switches = 0;
  mocks.updates.length = 0;
});

describe("Outlet settings Server Action", () => {
  it("authenticates before reading FormData or entering tenant context", async () => {
    mocks.authorizationDenied = true;
    const unreadable = {
      get: vi.fn(() => {
        throw new Error("FORM_READ_BEFORE_AUTHORIZATION");
      }),
    } as unknown as FormData;
    const { saveOutletSettings } = await import("@/app/app/pengaturan/actions");

    await expect(saveOutletSettings({}, unreadable)).rejects.toThrow(
      "REDIRECT:/login/tenant",
    );
    expect(unreadable.get).not.toHaveBeenCalled();
    expect(mocks.contextCalls).toBe(0);
  });

  it.each([
    ["OPERATOR", "tenant", "/app"],
    ["TENANT_ADMIN", "platform", "/login/tenant"],
  ] as const)(
    "redirects a %s/%s principal before reading settings input",
    async (role, scope, destination) => {
      mocks.principal.role = role;
      mocks.principal.scope = scope;
      const unreadable = {
        get: vi.fn(() => {
          throw new Error("FORM_READ_BEFORE_ROLE_CHECK");
        }),
      } as unknown as FormData;
      const { saveOutletSettings } = await import("@/app/app/pengaturan/actions");

      await expect(saveOutletSettings({}, unreadable)).rejects.toThrow(
        `REDIRECT:${destination}`,
      );
      expect(unreadable.get).not.toHaveBeenCalled();
      expect(mocks.contextCalls).toBe(0);
    },
  );

  it("returns field errors and preserves only the safe submitted values before data access", async () => {
    const form = validForm();
    form.set("defaultPickupAddressId", "   ");
    const { saveOutletSettings } = await import("@/app/app/pengaturan/actions");

    const state = await saveOutletSettings({}, form);

    expect(state).toMatchObject({
      errors: { defaultPickupAddressId: expect.any(String) },
      values: {
        connectionMode: "platform_default",
        defaultPickupAddressId: "",
      },
    });
    expect(state).toHaveProperty("resultToken", expect.any(String));
    expect(JSON.stringify(state)).not.toContain(SECRET_SENTINEL);
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.updates).toEqual([]);
  });

  it("rejects a pickup that is not in the current account response", async () => {
    const form = validForm();
    form.set("defaultPickupAddressId", "pickup-forged");
    const { saveOutletSettings } = await import("@/app/app/pengaturan/actions");

    const state = await saveOutletSettings({}, form);

    expect(state).toMatchObject({
      errors: { defaultPickupAddressId: expect.any(String) },
    });
    expect(state).not.toHaveProperty("success", true);
    expect(mocks.updates).toEqual([]);
    expect(mocks.revalidated).toEqual([]);
  });

  it.each(["configuration", "provider", "generic"] as const)(
    "keeps the stored location unchanged on a %s pickup lookup failure",
    async (failure) => {
      mocks.pickupFailure = failure;
      const { saveOutletSettings } = await import("@/app/app/pengaturan/actions");

      const state = await saveOutletSettings({}, validForm());

      expect(state).toMatchObject({ message: expect.any(String) });
      expect(state).not.toHaveProperty("success", true);
      expect(JSON.stringify(state)).not.toContain(SECRET_SENTINEL);
      expect(mocks.updates).toEqual([]);
      expect(mocks.revalidated).toEqual([]);
    },
  );

  it.each([
    ["outletId", "not-a-uuid"],
    ["defaultPickupAddressId", "x".repeat(161)],
    ["connectionMode", "browser-forged-mode"],
  ])("rejects invalid %s without entering tenant context", async (field, value) => {
    const form = validForm();
    form.set(field, value);
    const { saveOutletSettings } = await import("@/app/app/pengaturan/actions");

    const state = await saveOutletSettings({}, form);

    expect(state.errors).toHaveProperty(field);
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.updates).toEqual([]);
  });

  it("returns the connection error with preserved safe values and no revalidation", async () => {
    mocks.failure = "connection";
    const form = validForm();
    form.set("connectionMode", "private");
    const { saveOutletSettings } = await import("@/app/app/pengaturan/actions");

    const state = await saveOutletSettings({}, form);

    expect(state).toMatchObject({
      errors: { connectionMode: expect.any(String) },
      values: {
        connectionMode: "private",
        defaultPickupAddressId: "pickup-safe-preserved",
      },
    });
    expect(state).toHaveProperty("resultToken", expect.any(String));
    expect(mocks.revalidated).toEqual([]);
  });

  it.each(["denied", "invalid", "generic"] as const)(
    "maps a %s repository failure to one sanitized retryable state",
    async (failure) => {
      mocks.failure = failure;
      const { saveOutletSettings } = await import("@/app/app/pengaturan/actions");

      const state = await saveOutletSettings({}, validForm());
      const serialized = JSON.stringify(state);

      expect(state).toMatchObject({ message: expect.any(String) });
      expect(state).not.toHaveProperty("success", true);
      expect(state).toHaveProperty("resultToken", expect.any(String));
      expect(state).toHaveProperty("values.defaultPickupAddressId", "pickup-safe-preserved");
      expect(serialized).not.toContain(SECRET_SENTINEL);
      expect(serialized).not.toContain("database failure");
      expect(mocks.revalidated).toEqual([]);
    },
  );

  it("saves normalized input and revalidates settings plus dashboard readiness", async () => {
    const form = validForm();
    mocks.pickupOptions = [{
      originAreaId: "origin-canonical",
      originLabel: "Coblong, Kota Bandung, Jawa Barat",
      pickupAddressId: "pickup-normalized",
      pickupLabel: "Gudang canonical, Jalan Contoh 2",
    }];
    form.set("defaultPickupAddressId", " pickup-normalized ");
    form.set("defaultOriginAreaId", "browser-forged-origin");
    const { saveOutletSettings } = await import("@/app/app/pengaturan/actions");

    const state = await saveOutletSettings({}, form);

    expect(state).toMatchObject({ success: true, message: expect.any(String) });
    expect(mocks.updates).toEqual([{
      connectionMode: "platform_default",
      defaultOriginAreaId: "origin-canonical",
      defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
      defaultPickupAddressId: "pickup-normalized",
      defaultPickupAddressLabel: "Gudang canonical, Jalan Contoh 2",
      expectedConnectionUpdatedAt: null,
      outletId: OUTLET_ID,
    }]);
    expect(mocks.revalidated).toEqual([
      "/app/pengaturan",
      "/app",
      "/app/pengiriman/baru",
      "/app/impor",
    ]);
  });
});

describe("Mengantar pickup option Server Action", () => {
  it("authenticates before resolving provider account data", async () => {
    mocks.authorizationDenied = true;
    const { loadMengantarPickupOptions } = await import("@/app/app/pengaturan/actions");

    await expect(loadMengantarPickupOptions(OUTLET_ID)).rejects.toThrow(
      "REDIRECT:/login/tenant",
    );
    expect(mocks.contextCalls).toBe(0);
  });

  it("returns only sanitized pickup and derived-origin display fields", async () => {
    const { loadMengantarPickupOptions } = await import("@/app/app/pengaturan/actions");

    const state = await loadMengantarPickupOptions(OUTLET_ID);

    expect(state).toEqual({ options: mocks.pickupOptions, success: true });
    expect(JSON.stringify(state)).not.toMatch(/apiKey|baseUrl|phone|PICKUP_PIC/);
    expect(Object.keys(state.options?.[0] ?? {}).sort()).toEqual([
      "originAreaId",
      "originLabel",
      "pickupAddressId",
      "pickupLabel",
    ]);
    expect(mocks.contextCalls).toBe(1);
  });
});

describe("Mengantar credential Server Actions", () => {
  function privateCredentialForm() {
    const form = new FormData();
    form.set("outletId", OUTLET_ID);
    form.set("apiKey", SECRET_SENTINEL);
    return form;
  }

  function platformDefaultForm() {
    const form = new FormData();
    form.set("outletId", OUTLET_ID);
    form.set("confirmation", "restore-platform-default");
    return form;
  }

  it("authenticates and authorizes the role before reading secret-bearing FormData", async () => {
    mocks.authorizationDenied = true;
    const unreadable = {
      get: vi.fn(() => {
        throw new Error("SECRET_FORM_READ_BEFORE_AUTHORIZATION");
      }),
    } as unknown as FormData;
    const { savePrivateMengantarCredential } = await import(
      "@/app/app/pengaturan/actions"
    );

    await expect(savePrivateMengantarCredential({}, unreadable)).rejects.toThrow(
      "REDIRECT:/login/tenant",
    );
    expect(unreadable.get).not.toHaveBeenCalled();
    expect(mocks.contextCalls).toBe(0);

    mocks.authorizationDenied = false;
    mocks.principal.role = "OPERATOR";
    await expect(savePrivateMengantarCredential({}, unreadable)).rejects.toThrow(
      "REDIRECT:/app",
    );
    expect(unreadable.get).not.toHaveBeenCalled();
    expect(mocks.contextCalls).toBe(0);
  });

  it("denies a cross-tenant outlet before invoking the API-key reader", async () => {
    mocks.credentialFailure = "denied";
    const guardedForm = {
      get: vi.fn((name: string) => {
        if (name === "outletId") return OUTLET_ID;
        throw new Error("SECRET_READ_FOR_DENIED_OUTLET");
      }),
    } as unknown as FormData;
    const { savePrivateMengantarCredential } = await import(
      "@/app/app/pengaturan/actions"
    );

    const state = await savePrivateMengantarCredential({}, guardedForm);

    expect(state).toMatchObject({ message: expect.any(String) });
    expect(state).not.toHaveProperty("success", true);
    expect(guardedForm.get).toHaveBeenCalledTimes(1);
    expect(guardedForm.get).toHaveBeenCalledWith("outletId");
    expect(mocks.credentialReads).toBe(0);
    expect(mocks.credentialWrites).toBe(0);
  });

  it("rejects a rate-limited attempt before reading the submitted API key", async () => {
    mocks.credentialFailure = "rate";
    const guardedForm = {
      get: vi.fn((name: string) => {
        if (name === "outletId") return OUTLET_ID;
        throw new Error("SECRET_READ_AFTER_RATE_LIMIT");
      }),
    } as unknown as FormData;
    const { savePrivateMengantarCredential } = await import(
      "@/app/app/pengaturan/actions"
    );

    const state = await savePrivateMengantarCredential({}, guardedForm);

    expect(state).toMatchObject({ message: expect.any(String) });
    expect(state).not.toHaveProperty("success", true);
    expect(guardedForm.get).toHaveBeenCalledTimes(1);
    expect(guardedForm.get).toHaveBeenCalledWith("outletId");
    expect(mocks.authorizationCalls).toBe(1);
    expect(mocks.contextCalls).toBe(1);
    expect(mocks.credentialReads).toBe(0);
  });

  it("returns a redacted create/replace result and never preserves the submitted API key", async () => {
    const { savePrivateMengantarCredential } = await import(
      "@/app/app/pengaturan/actions"
    );

    const state = await savePrivateMengantarCredential({}, privateCredentialForm());
    const serialized = JSON.stringify(state);

    expect(state).toMatchObject({ success: true, message: expect.any(String) });
    expect(state).toHaveProperty("resultToken", expect.any(String));
    expect(state).not.toHaveProperty("values");
    expect(serialized).not.toContain(SECRET_SENTINEL);
    expect(serialized).not.toContain("apiKey");
    expect(mocks.credentialReads).toBe(1);
    expect(mocks.credentialWrites).toBe(1);
    expect(mocks.authorizationCalls).toBe(1);
    expect(mocks.contextCalls).toBe(2);
    expect(mocks.revalidated).toEqual([
      "/app/pengaturan",
      "/app",
      "/app/pengiriman/baru",
      "/app/impor",
    ]);
  });

  it("returns a fresh redacted result token for every invalid blank credential attempt", async () => {
    mocks.credentialFailure = "invalid";
    const form = privateCredentialForm();
    form.set("apiKey", "");
    const { savePrivateMengantarCredential } = await import(
      "@/app/app/pengaturan/actions"
    );

    const first = await savePrivateMengantarCredential({}, form);
    const second = await savePrivateMengantarCredential(first, form);

    expect(first).toMatchObject({
      errors: { apiKey: expect.any(String) },
      resultToken: expect.any(String),
    });
    expect(second).toMatchObject({
      errors: { apiKey: expect.any(String) },
      resultToken: expect.any(String),
    });
    expect(second.resultToken).not.toBe(first.resultToken);
    expect(first).not.toHaveProperty("values");
    expect(second).not.toHaveProperty("values");
    expect(JSON.stringify([first, second])).not.toContain(SECRET_SENTINEL);
  });

  it.each(["invalid", "unavailable", "generic"] as const)(
    "maps a %s private-credential failure without returning secret material",
    async (failure) => {
      mocks.credentialFailure = failure;
      const { savePrivateMengantarCredential } = await import(
        "@/app/app/pengaturan/actions"
      );

      const state = await savePrivateMengantarCredential({}, privateCredentialForm());
      const serialized = JSON.stringify(state);

      expect(state).not.toHaveProperty("success", true);
      expect(state).not.toHaveProperty("values");
      expect(serialized).not.toContain(SECRET_SENTINEL);
      expect(serialized).not.toContain("managed failure");
      expect(mocks.revalidated).toEqual([]);
    },
  );

  it("keeps the private connection when the platform default is incomplete", async () => {
    mocks.platformDefaultIncomplete = true;
    const { switchMengantarToPlatformDefault } = await import(
      "@/app/app/pengaturan/actions"
    );

    const state = await switchMengantarToPlatformDefault({}, platformDefaultForm());

    expect(state).not.toHaveProperty("success", true);
    expect(state).toMatchObject({ message: expect.any(String) });
    expect(mocks.switches).toBe(0);
    expect(mocks.revalidated).toEqual([]);
  });

  it("requires explicit fallback confirmation and revalidates after a safe switch", async () => {
    const { switchMengantarToPlatformDefault } = await import(
      "@/app/app/pengaturan/actions"
    );
    const missingConfirmation = platformDefaultForm();
    missingConfirmation.delete("confirmation");

    const denied = await switchMengantarToPlatformDefault({}, missingConfirmation);
    expect(denied).toHaveProperty("errors.confirmation", expect.any(String));
    expect(mocks.contextCalls).toBe(0);

    const success = await switchMengantarToPlatformDefault({}, platformDefaultForm());
    expect(success).toMatchObject({ success: true, message: expect.any(String) });
    expect(mocks.switches).toBe(1);
    expect(mocks.revalidated).toEqual([
      "/app/pengaturan",
      "/app",
      "/app/pengiriman/baru",
      "/app/impor",
    ]);
  });
});
