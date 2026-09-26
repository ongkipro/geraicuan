import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "00000000-0000-4000-8000-000000000461";
const MEMBER_ID = "00000000-0000-4000-8000-000000000462";
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000463";
const SECRET_SENTINEL = "session://t46/private-token-must-not-cross-action-boundary";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const errors = vi.hoisted(() => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
}));

const mocks = vi.hoisted(() => ({
  authorizationDenied: false,
  contextCalls: 0,
  failure: "" as "" | "generic",
  inviteCalls: [] as Array<Record<string, string>>,
  roleCalls: [] as Array<Record<string, string>>,
  deactivateCalls: [] as Array<Record<string, string>>,
  inviteResult: null as null | Record<string, unknown>,
  roleResult: null as null | Record<string, unknown>,
  deactivateResult: null as null | Record<string, unknown>,
  principal: {
    role: "TENANT_ADMIN" as "OPERATOR" | "TENANT_ADMIN",
    scope: "tenant" as "platform" | "tenant",
    tenantId: "00000000-0000-4000-8000-000000000461",
    userId: "member-admin",
  },
  revalidated: [] as string[],
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

vi.mock("@/db/member-governance-repository", () => ({
  inviteTenantMember: vi.fn(async (_tx, _context, input) => {
    mocks.inviteCalls.push(input);
    if (mocks.failure === "generic") throw new Error(`database ${SECRET_SENTINEL}`);
    return mocks.inviteResult ?? {
      member: { name: "Ayu Admin", role: input.role },
      ok: true,
    };
  }),
  changeTenantMemberRole: vi.fn(async (_tx, _context, input) => {
    mocks.roleCalls.push(input);
    if (mocks.failure === "generic") throw new Error(`database ${SECRET_SENTINEL}`);
    return mocks.roleResult ?? {
      member: { name: "Bima Operator", role: input.role },
      ok: true,
    };
  }),
  deactivateTenantMember: vi.fn(async (_tx, _context, input) => {
    mocks.deactivateCalls.push(input);
    if (mocks.failure === "generic") throw new Error(`database ${SECRET_SENTINEL}`);
    return mocks.deactivateResult ?? {
      member: { name: "Bima Operator", role: "OPERATOR" },
      ok: true,
    };
  }),
}));

function inviteForm() {
  const form = new FormData();
  form.set("attemptId", ATTEMPT_ID);
  form.set("email", "  MEMBER@Example.COM ");
  form.set("role", "OPERATOR");
  return form;
}

function roleForm() {
  const form = new FormData();
  form.set("attemptId", ATTEMPT_ID);
  form.set("membershipId", MEMBER_ID);
  form.set("role", "TENANT_ADMIN");
  form.set("confirmation", "CONFIRM_ROLE_CHANGE");
  return form;
}

function deactivateForm() {
  const form = new FormData();
  form.set("attemptId", ATTEMPT_ID);
  form.set("membershipId", MEMBER_ID);
  form.set("confirmation", "CONFIRM_DEACTIVATE");
  return form;
}

beforeEach(() => {
  mocks.authorizationDenied = false;
  mocks.contextCalls = 0;
  mocks.failure = "";
  mocks.inviteCalls.length = 0;
  mocks.roleCalls.length = 0;
  mocks.deactivateCalls.length = 0;
  mocks.inviteResult = null;
  mocks.roleResult = null;
  mocks.deactivateResult = null;
  mocks.principal = {
    role: "TENANT_ADMIN",
    scope: "tenant",
    tenantId: TENANT_ID,
    userId: "member-admin",
  };
  mocks.revalidated.length = 0;
});

describe("Member governance Server Actions", () => {
  it.each([
    ["inviteMemberAction"],
    ["changeMemberRoleAction"],
    ["deactivateMemberAction"],
  ] as const)("authenticates before %s reads FormData or enters tenant context", async (name) => {
    mocks.authorizationDenied = true;
    const unreadable = {
      get: vi.fn(() => {
        throw new Error("FORM_READ_BEFORE_AUTHORIZATION");
      }),
    } as unknown as FormData;
    const actions = await import("@/app/app/anggota/actions");

    await expect(actions[name]({}, unreadable)).rejects.toThrow(
      "REDIRECT:/login/tenant",
    );
    expect(unreadable.get).not.toHaveBeenCalled();
    expect(mocks.contextCalls).toBe(0);
  });

  it.each([
    ["OPERATOR", "tenant", "/app"],
    ["TENANT_ADMIN", "platform", "/login/tenant"],
  ] as const)(
    "rejects a %s/%s principal before any protected input read",
    async (role, scope, destination) => {
      mocks.principal.role = role;
      mocks.principal.scope = scope;
      const unreadable = {
        get: vi.fn(() => {
          throw new Error("FORM_READ_BEFORE_ROLE_CHECK");
        }),
      } as unknown as FormData;
      const { inviteMemberAction } = await import("@/app/app/anggota/actions");

      await expect(inviteMemberAction({}, unreadable)).rejects.toThrow(
        `REDIRECT:${destination}`,
      );
      expect(unreadable.get).not.toHaveBeenCalled();
      expect(mocks.contextCalls).toBe(0);
    },
  );

  it.each([
    ["inviteMemberAction", inviteForm],
    ["changeMemberRoleAction", roleForm],
    ["deactivateMemberAction", deactivateForm],
  ] as const)("replaces an invalid attemptId before %s performs a write", async (name, formFactory) => {
    const form = formFactory();
    form.set("attemptId", "forged-attempt");
    const actions = await import("@/app/app/anggota/actions");

    const state = await actions[name]({}, form);

    expect(state).toMatchObject({
      errors: { confirmation: expect.any(String) },
      nextAttemptId: expect.stringMatching(UUID_PATTERN),
      resultToken: expect.stringMatching(UUID_PATTERN),
      status: "error",
    });
    expect(state.nextAttemptId).not.toBe("forged-attempt");
    expect(mocks.contextCalls).toBe(0);
  });

  it("preserves normalized safe invite values and a valid attemptId on validation failure", async () => {
    const form = inviteForm();
    form.set("email", "  invalid-address ");
    const { inviteMemberAction } = await import("@/app/app/anggota/actions");

    const state = await inviteMemberAction({}, form);

    expect(state).toMatchObject({
      errors: { email: expect.any(String) },
      nextAttemptId: ATTEMPT_ID,
      resultToken: expect.stringMatching(UUID_PATTERN),
      status: "error",
      values: { email: "invalid-address", role: "OPERATOR" },
    });
    expect(mocks.contextCalls).toBe(0);
  });

  it.each([
    ["changeMemberRoleAction", roleForm, "CONFIRM_ROLE_CHANGE"],
    ["deactivateMemberAction", deactivateForm, "CONFIRM_DEACTIVATE"],
  ] as const)("requires explicit confirmation for %s without writing", async (name, formFactory, confirmation) => {
    const form = formFactory();
    form.delete("confirmation");
    const actions = await import("@/app/app/anggota/actions");

    const state = await actions[name]({}, form);

    expect(state).toMatchObject({
      errors: { confirmation: expect.any(String) },
      nextAttemptId: ATTEMPT_ID,
      resultToken: expect.stringMatching(UUID_PATTERN),
      status: "error",
    });
    expect(JSON.stringify(state)).not.toContain(confirmation);
    expect(mocks.contextCalls).toBe(0);
  });

  it("returns the last-admin denial as a sanitized retryable result", async () => {
    mocks.deactivateResult = { ok: false, reason: "LAST_ACTIVE_ADMIN" };
    const { deactivateMemberAction } = await import("@/app/app/anggota/actions");

    const state = await deactivateMemberAction({}, deactivateForm());

    expect(state).toMatchObject({
      message: expect.stringContaining("pemilik gerai aktif"),
      nextAttemptId: ATTEMPT_ID,
      resultToken: expect.stringMatching(UUID_PATTERN),
      status: "error",
    });
    expect(mocks.revalidated).toEqual([]);
  });

  it("returns an invitation conflict without losing safe input or rotating the retry UUID", async () => {
    mocks.inviteResult = { ok: false, reason: "ALREADY_ACTIVE" };
    const { inviteMemberAction } = await import("@/app/app/anggota/actions");

    const state = await inviteMemberAction({}, inviteForm());

    expect(state).toMatchObject({
      message: expect.stringContaining("sudah menjadi anggota aktif"),
      nextAttemptId: ATTEMPT_ID,
      resultToken: expect.stringMatching(UUID_PATTERN),
      status: "error",
      values: { email: "member@example.com", role: "OPERATOR" },
    });
    expect(mocks.revalidated).toEqual([]);
  });

  it.each([
    ["inviteMemberAction", inviteForm],
    ["changeMemberRoleAction", roleForm],
    ["deactivateMemberAction", deactivateForm],
  ] as const)("sanitizes an unexpected %s failure and preserves its retry UUID", async (name, formFactory) => {
    mocks.failure = "generic";
    const actions = await import("@/app/app/anggota/actions");

    const state = await actions[name]({}, formFactory());
    const serialized = JSON.stringify(state);

    expect(state).toMatchObject({
      message: expect.any(String),
      nextAttemptId: ATTEMPT_ID,
      resultToken: expect.stringMatching(UUID_PATTERN),
      status: "error",
    });
    expect(serialized).not.toContain(SECRET_SENTINEL);
    expect(serialized).not.toContain("database");
    expect(mocks.revalidated).toEqual([]);
  });

  it.each([
    ["inviteMemberAction", inviteForm, "inviteCalls"],
    ["changeMemberRoleAction", roleForm, "roleCalls"],
    ["deactivateMemberAction", deactivateForm, "deactivateCalls"],
  ] as const)("writes normalized input, rotates the UUID, and revalidates after %s succeeds", async (name, formFactory, callsKey) => {
    const actions = await import("@/app/app/anggota/actions");

    const state = await actions[name]({}, formFactory());

    expect(state).toMatchObject({
      message: expect.any(String),
      nextAttemptId: expect.stringMatching(UUID_PATTERN),
      resultToken: expect.stringMatching(UUID_PATTERN),
      status: "success",
    });
    expect(state.nextAttemptId).not.toBe(ATTEMPT_ID);
    expect(mocks[callsKey]).toHaveLength(1);
    expect(mocks[callsKey][0]).toMatchObject({ attemptId: ATTEMPT_ID });
    if (name === "inviteMemberAction") {
      expect(mocks.inviteCalls[0]).toMatchObject({
        email: "member@example.com",
        role: "OPERATOR",
      });
    }
    expect(mocks.revalidated).toEqual(["/app/anggota"]);
  });
});
