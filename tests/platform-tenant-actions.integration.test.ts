import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: { status: "authorized", principal: { scope: "platform", userId: "super-admin" } } as
    | { status: "authorized"; principal: { scope: "platform"; userId: string } }
    | { status: "anonymous" }
    | { status: "forbidden"; userId: string },
  execute: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/app/platform/platform-access", () => ({
  resolvePlatformAccess: vi.fn(async () => mocks.access),
}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/db/tenant-lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/tenant-lifecycle")>();
  return { ...actual, executeTenantLifecycle: mocks.execute };
});

import { submitPlatformTenantLifecycle } from "@/app/platform/tenant/actions";

function lifecycleForm(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

beforeEach(() => {
  mocks.access = {
    status: "authorized",
    principal: { scope: "platform", userId: "super-admin" },
  };
  mocks.execute.mockReset();
  mocks.revalidate.mockReset();
});

describe("platform tenant lifecycle action", () => {
  it.each([
    { status: "anonymous" } as const,
    { status: "forbidden", userId: "tenant-member" } as const,
  ])("denies $status before reading FormData", async (access) => {
    mocks.access = access;
    let reads = 0;
    const unreadable = {
      get() {
        reads += 1;
        throw new Error("FORM_DATA_MUST_NOT_BE_READ");
      },
    } as unknown as FormData;

    await expect(submitPlatformTenantLifecycle({}, unreadable)).resolves.toMatchObject({
      outcome: "denied",
    });
    expect(reads).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("preserves a valid attempt and safe values on validation failure", async () => {
    const attemptId = randomUUID();
    const result = await submitPlatformTenantLifecycle({}, lifecycleForm({
      attemptId,
      lifecycleAction: "create",
      tenantName: "Tenant yang dipertahankan",
    }));

    expect(result).toMatchObject({
      errors: { confirmation: expect.any(String) },
      nextAttemptId: attemptId,
      outcome: "invalid",
      values: { name: "Tenant yang dipertahankan" },
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("refuses a hidden format character in a tenant name but keeps digits (T-196)", async () => {
    const hidden = await submitPlatformTenantLifecycle({}, lifecycleForm({
      attemptId: randomUUID(),
      confirmation: "confirmed",
      lifecycleAction: "create",
      tenantName: "Toko\u202E88",
    }));
    expect(hidden).toMatchObject({ errors: { tenantName: expect.stringContaining("karakter kontrol") }, outcome: "invalid" });
    expect(mocks.execute).not.toHaveBeenCalled();

    mocks.execute.mockResolvedValue({ id: randomUUID(), status: "ACTIVE" });
    await expect(submitPlatformTenantLifecycle({}, lifecycleForm({
      attemptId: randomUUID(),
      confirmation: "confirmed",
      lifecycleAction: "create",
      tenantName: "Grosir Aksesoris HP 99",
    }))).resolves.toMatchObject({ outcome: "success" });
  });

  it("rotates the attempt only after a successful exact mutation", async () => {
    const attemptId = randomUUID();
    const tenantId = randomUUID();
    mocks.execute.mockResolvedValue({ id: tenantId, status: "ACTIVE" });

    const result = await submitPlatformTenantLifecycle({}, lifecycleForm({
      attemptId,
      confirmation: "confirmed",
      lifecycleAction: "create",
      tenantName: "Tenant Baru",
    }));

    expect(mocks.execute).toHaveBeenCalledWith(
      {},
      { scope: "platform", userId: "super-admin" },
      "create",
      { attemptId, name: "Tenant Baru" },
    );
    expect(result).toMatchObject({ outcome: "success", tenant: { id: tenantId } });
    expect(result.nextAttemptId).not.toBe(attemptId);
    expect(mocks.revalidate).toHaveBeenCalledWith("/platform/tenant");
  });

  it("keeps the attempt and values when an unknown failure may be retryable", async () => {
    const attemptId = randomUUID();
    mocks.execute.mockRejectedValue(new Error("TRANSIENT_DATABASE_FAILURE"));

    const result = await submitPlatformTenantLifecycle({}, lifecycleForm({
      attemptId,
      confirmation: "confirmed",
      confirmationName: "Tenant Aman",
      lifecycleAction: "suspend",
      tenantId: randomUUID(),
    }));

    expect(result).toMatchObject({
      nextAttemptId: attemptId,
      outcome: "error",
      values: { expectedName: "Tenant Aman" },
    });
  });
});
