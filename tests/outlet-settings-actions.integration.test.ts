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
  PickupPointDefaultRequiredError: class PickupPointDefaultRequiredError extends Error {},
  PickupPointDeniedError: class PickupPointDeniedError extends Error {},
  PickupPointInUseError: class PickupPointInUseError extends Error {},
  PickupPointInvalidError: class PickupPointInvalidError extends Error {},
  PickupPointUnavailableError: class PickupPointUnavailableError extends Error {},
  TenantContextDeniedError: class TenantContextDeniedError extends Error {},
}));

const mocks = vi.hoisted(() => ({
  authorizationDenied: false,
  authorizationCalls: 0,
  credentialFailure: "" as "" | "denied" | "generic" | "invalid" | "rate" | "unavailable",
  credentialReads: 0,
  credentialWrites: 0,
  contextCalls: 0,
  pickupPointFailure: "" as "" | "default-required" | "denied" | "generic" | "invalid" | "unavailable",
  pickupPointWrites: [] as Array<Record<string, unknown>>,
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
  TenantContextDeniedError: errors.TenantContextDeniedError,
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

function throwPickupPointFailure() {
  if (mocks.pickupPointFailure === "unavailable") {
    throw new errors.PickupPointUnavailableError();
  }
  if (mocks.pickupPointFailure === "default-required") {
    throw new errors.PickupPointDefaultRequiredError();
  }
  if (mocks.pickupPointFailure === "denied") throw new errors.PickupPointDeniedError();
  if (mocks.pickupPointFailure === "invalid") throw new errors.PickupPointInvalidError();
  if (mocks.pickupPointFailure === "generic") {
    throw new Error(`database failure ${SECRET_SENTINEL}`);
  }
}

vi.mock("@/db/outlet-pickup-point-repository", () => ({
  PickupPointDefaultRequiredError: errors.PickupPointDefaultRequiredError,
  PickupPointDeniedError: errors.PickupPointDeniedError,
  PickupPointInUseError: errors.PickupPointInUseError,
  PickupPointInvalidError: errors.PickupPointInvalidError,
  PickupPointUnavailableError: errors.PickupPointUnavailableError,
  addOutletPickupPoint: vi.fn(async (_tx, _context, input) => {
    throwPickupPointFailure();
    mocks.pickupPointWrites.push({ op: "add", ...input });
  }),
  setDefaultOutletPickupPoint: vi.fn(async (_tx, _context, outletId, pickupAddressId) => {
    throwPickupPointFailure();
    mocks.pickupPointWrites.push({ op: "default", outletId, pickupAddressId });
  }),
  removeOutletPickupPoint: vi.fn(async (_tx, _context, outletId, pickupAddressId) => {
    throwPickupPointFailure();
    mocks.pickupPointWrites.push({ op: "remove", outletId, pickupAddressId });
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

function pickupForm() {
  const form = new FormData();
  form.set("outletId", OUTLET_ID);
  form.set("pickupAddressId", "pickup-safe-preserved");
  return form;
}

beforeEach(() => {
  mocks.authorizationDenied = false;
  mocks.authorizationCalls = 0;
  mocks.credentialFailure = "";
  mocks.credentialReads = 0;
  mocks.credentialWrites = 0;
  mocks.contextCalls = 0;
  mocks.pickupPointFailure = "";
  mocks.pickupPointWrites.length = 0;
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
});

describe("PR-46/PR-47 pickup point Server Actions", () => {
  it("authenticates before reading FormData or entering tenant context", async () => {
    mocks.authorizationDenied = true;
    const unreadable = {
      get: vi.fn(() => {
        throw new Error("FORM_READ_BEFORE_AUTHORIZATION");
      }),
    } as unknown as FormData;
    const { addOutletPickupPoint } = await import("@/app/app/pengaturan/actions");

    await expect(addOutletPickupPoint({}, unreadable)).rejects.toThrow("REDIRECT:/login/tenant");
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.pickupPointWrites).toEqual([]);
  });

  it.each([
    ["OPERATOR", "tenant", "/app"],
    ["TENANT_ADMIN", "platform", "/login/tenant"],
  ] as const)("redirects a %s/%s principal before writing", async (role, scope, destination) => {
    mocks.principal.role = role;
    mocks.principal.scope = scope;
    const { addOutletPickupPoint } = await import("@/app/app/pengaturan/actions");

    await expect(addOutletPickupPoint({}, pickupForm())).rejects.toThrow(`REDIRECT:${destination}`);
    expect(mocks.pickupPointWrites).toEqual([]);
  });

  it("stores the provider's own label and origin area, never the browser's", async () => {
    const { addOutletPickupPoint } = await import("@/app/app/pengaturan/actions");
    const form = pickupForm();
    // A forged label/origin in the submission must not survive: only the id is read.
    form.set("pickupAddressLabel", "Gudang Palsu");
    form.set("originAreaLabel", "Area Palsu");

    const state = await addOutletPickupPoint({}, form);

    expect(state).toMatchObject({ success: true, message: expect.any(String) });
    expect(mocks.pickupPointWrites).toEqual([{
      op: "add",
      outletId: OUTLET_ID,
      originAreaId: "origin-safe-canonical",
      originAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
      pickupAddressId: "pickup-safe-preserved",
      pickupAddressLabel: "Gudang utama, Jalan Contoh 1",
    }]);
    expect(mocks.revalidated).toEqual([
      "/app/pengaturan/outlet",
      "/app/pengaturan/pickup",
      "/app/pengaturan/koneksi",
      "/app",
      "/app/pengiriman/baru",
      "/app/impor",
      "/app/cek-tarif",
    ]);
  });

  it("refuses an address the provider no longer lists, and writes nothing", async () => {
    mocks.pickupOptions = [{
      originAreaId: "origin-other",
      originLabel: "Sukajadi, Kota Bandung, Jawa Barat",
      pickupAddressId: "pickup-other",
      pickupLabel: "Gudang lain, Jalan Contoh 9",
    }];
    const { addOutletPickupPoint } = await import("@/app/app/pengaturan/actions");

    const state = await addOutletPickupPoint({}, pickupForm());

    expect(state.success).toBeUndefined();
    expect(state.errors?.pickupAddressId).toMatch(/Pilihan sudah berubah di Mengantar/);
    expect(mocks.pickupPointWrites).toEqual([]);
    expect(mocks.revalidated).toEqual([]);
  });

  it.each([
    ["configuration", /belum dapat diverifikasi ke Mengantar/],
    ["provider", /belum dapat diverifikasi ke Mengantar/],
    ["generic", /belum dapat diverifikasi\. Coba lagi/],
  ] as const)("keeps the saved list unchanged when the provider check fails (%s)", async (failure, message) => {
    mocks.pickupFailure = failure;
    const { addOutletPickupPoint } = await import("@/app/app/pengaturan/actions");

    const state = await addOutletPickupPoint({}, pickupForm());

    expect(state.message).toMatch(message);
    expect(JSON.stringify(state)).not.toContain(SECRET_SENTINEL);
    expect(mocks.pickupPointWrites).toEqual([]);
    expect(mocks.revalidated).toEqual([]);
  });

  it("rejects a malformed outlet or a missing address before any provider call", async () => {
    const { addOutletPickupPoint } = await import("@/app/app/pengaturan/actions");
    const form = new FormData();
    form.set("outletId", "not-a-uuid");
    form.set("pickupAddressId", "");

    const state = await addOutletPickupPoint({}, form);

    expect(state.errors).toMatchObject({
      outletId: expect.any(String),
      pickupAddressId: expect.any(String),
    });
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.pickupPointWrites).toEqual([]);
  });

  it("promotes another pickup point as the outlet default", async () => {
    const { setDefaultOutletPickupPoint } = await import("@/app/app/pengaturan/actions");

    const state = await setDefaultOutletPickupPoint({}, pickupForm());

    expect(state).toMatchObject({ success: true });
    expect(mocks.pickupPointWrites).toEqual([
      { op: "default", outletId: OUTLET_ID, pickupAddressId: "pickup-safe-preserved" },
    ]);
    expect(mocks.revalidated).toContain("/app/pengiriman/baru");
  });

  it("removes a pickup point only behind its confirmation", async () => {
    const { removeOutletPickupPoint } = await import("@/app/app/pengaturan/actions");

    const unconfirmed = await removeOutletPickupPoint({}, pickupForm());
    expect(unconfirmed.errors?.confirmation).toEqual(expect.any(String));
    expect(mocks.pickupPointWrites).toEqual([]);

    const form = pickupForm();
    form.set("confirmation", "remove-pickup-point");
    const confirmed = await removeOutletPickupPoint({}, form);

    expect(confirmed).toMatchObject({ success: true });
    expect(mocks.pickupPointWrites).toEqual([
      { op: "remove", outletId: OUTLET_ID, pickupAddressId: "pickup-safe-preserved" },
    ]);
  });

  it("explains a refused removal of the default without leaking the error", async () => {
    mocks.pickupPointFailure = "default-required";
    const { removeOutletPickupPoint } = await import("@/app/app/pengaturan/actions");
    const form = pickupForm();
    form.set("confirmation", "remove-pickup-point");

    const state = await removeOutletPickupPoint({}, form);

    expect(state.success).toBeUndefined();
    expect(state.message).toMatch(/Tetapkan titik pickup lain sebagai utama/);
    expect(mocks.revalidated).toEqual([]);
  });

  it.each([
    ["unavailable", /bukan milik outlet ini/],
    ["denied", /tidak dapat diubah/],
    ["generic", /belum dapat diubah\. Coba lagi/],
  ] as const)("maps a %s repository refusal to safe copy", async (failure, message) => {
    mocks.pickupPointFailure = failure;
    const { setDefaultOutletPickupPoint } = await import("@/app/app/pengaturan/actions");

    const state = await setDefaultOutletPickupPoint({}, pickupForm());

    expect(state.message).toMatch(message);
    expect(JSON.stringify(state)).not.toContain(SECRET_SENTINEL);
    expect(mocks.revalidated).toEqual([]);
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
      "/app/pengaturan/outlet",
      "/app/pengaturan/pickup",
      "/app/pengaturan/koneksi",
      "/app",
      "/app/pengiriman/baru",
      "/app/impor",
      "/app/cek-tarif",
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
      "/app/pengaturan/outlet",
      "/app/pengaturan/pickup",
      "/app/pengaturan/koneksi",
      "/app",
      "/app/pengiriman/baru",
      "/app/impor",
      "/app/cek-tarif",
    ]);
  });
});
