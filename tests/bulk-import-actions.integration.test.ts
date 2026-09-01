import { beforeEach, describe, expect, it, vi } from "vitest";

import { BULK_TEMPLATE_HEADERS } from "@/lib/bulk-shipment-intake-contract";

const mocks = vi.hoisted(() => ({
  authorizationDenied: false,
  created: [] as Array<{ input: unknown; submissionId: string }>,
  rateAttempts: 0,
  configuredChecks: 0,
  principal: {
    role: "OPERATOR", scope: "tenant", tenantId: "00000000-0000-4000-8000-000000000101", userId: "operator-a",
  } as { role?: "OPERATOR"; scope: "platform" | "tenant"; tenantId?: string; userId: string },
}));
const authTypes = vi.hoisted(() => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => { throw new Error(`REDIRECT:${href}`); }),
}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (_db, _actorId, tenantId, callback) => callback({}, { tenantId })),
}));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: authTypes.CmsAuthorizationDeniedError,
  requireCmsScope: vi.fn(async () => {
    if (mocks.authorizationDenied) throw new authTypes.CmsAuthorizationDeniedError();
    return mocks.principal;
  }),
}));
vi.mock("@/lib/bulk-import-rate-limit", () => ({
  BulkImportRateLimitedError: class BulkImportRateLimitedError extends Error {},
  enforceBulkImportRateLimit: vi.fn(async () => { mocks.rateAttempts += 1; }),
}));
vi.mock("@/db/shipment-draft-repository", () => ({
  DraftSubmissionConflictError: class DraftSubmissionConflictError extends Error {},
  OutletUnavailableError: class OutletUnavailableError extends Error {},
  createShipmentDraft: vi.fn(async (_tx, _context, input, submissionId) => {
    if (!mocks.created.some((row) => row.submissionId === submissionId)) {
      mocks.created.push({ input, submissionId });
    }
    return submissionId;
  }),
  requireConfiguredShipmentOutlet: vi.fn(async () => { mocks.configuredChecks += 1; }),
}));

const outletId = "00000000-0000-4000-8000-000000000111";
const validRow = [
  "Pengirim", "081212345678", "Jl. Asia Afrika 8", "Penerima", "081234567890",
  "Jl. Medan Merdeka Barat 1", "3171010", "Gambir Jakarta Pusat", "Pakaian", "500",
  "1", "", "", "", "150000", "NON_COD",
];

function uploadForm() {
  const form = new FormData();
  form.set("outletId", outletId);
  form.set("csv", new File([
    `${BULK_TEMPLATE_HEADERS.join(",")}\n${validRow.join(",")}`,
  ], "kiriman.csv", { type: "text/csv" }));
  return form;
}

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = "t41-action-test-signing-secret-32-bytes";
  mocks.authorizationDenied = false;
  mocks.principal = {
    role: "OPERATOR", scope: "tenant", tenantId: "00000000-0000-4000-8000-000000000101", userId: "operator-a",
  };
  mocks.created.length = 0;
  mocks.rateAttempts = 0;
  mocks.configuredChecks = 0;
});

describe("bulk import actions", () => {
  it("authenticates, rate-limits one preview, and creates only its explicitly selected signed row", async () => {
    const { createSelectedDrafts, uploadBulkIntake } = await import("@/app/app/impor/actions");
    const previewState = await uploadBulkIntake({}, uploadForm());
    expect(mocks.rateAttempts).toBe(1);
    expect(mocks.configuredChecks).toBe(1);
    expect(previewState.preview?.validRows).toHaveLength(1);
    expect(mocks.created).toEqual([]);

    const confirmation = new FormData();
    confirmation.set("rowToken", previewState.preview!.validRows[0]!.confirmationToken);
    await expect(createSelectedDrafts({}, confirmation)).rejects.toThrow("REDIRECT:/app/pengiriman?status=DRAFT");
    await expect(createSelectedDrafts({}, confirmation)).rejects.toThrow("REDIRECT:/app/pengiriman?status=DRAFT");
    expect(mocks.rateAttempts).toBe(1);
    expect(mocks.created).toHaveLength(1);
    expect(mocks.created[0]!.submissionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects empty or tampered selection without creating a draft", async () => {
    const { createSelectedDrafts, uploadBulkIntake } = await import("@/app/app/impor/actions");
    await expect(createSelectedDrafts({}, new FormData())).resolves.toMatchObject({
      message: "Pilih minimal satu baris untuk dibuat.",
    });
    const previewState = await uploadBulkIntake({}, uploadForm());
    const confirmation = new FormData();
    confirmation.set("rowToken", `${previewState.preview!.validRows[0]!.confirmationToken}tampered`);
    await expect(createSelectedDrafts({}, confirmation)).resolves.toMatchObject({
      message: "Tidak ada draf yang dibuat.",
    });
    expect(mocks.created).toEqual([]);
  });

  it("denies unauthenticated, suspended, and platform principals before rate or data access", async () => {
    const { createSelectedDrafts, uploadBulkIntake } = await import("@/app/app/impor/actions");
    for (const deniedState of ["unauthenticated", "suspended"] as const) {
      mocks.authorizationDenied = true;
      await expect(uploadBulkIntake({}, uploadForm())).rejects.toThrow("REDIRECT:/login/tenant");
      await expect(createSelectedDrafts({}, new FormData())).rejects.toThrow("REDIRECT:/login/tenant");
      expect(mocks.rateAttempts, deniedState).toBe(0);
      expect(mocks.configuredChecks, deniedState).toBe(0);
      mocks.authorizationDenied = false;
    }
    mocks.principal = { scope: "platform", userId: "platform-user" };
    await expect(uploadBulkIntake({}, uploadForm())).rejects.toThrow("REDIRECT:/login/tenant");
    await expect(createSelectedDrafts({}, new FormData())).rejects.toThrow("REDIRECT:/login/tenant");
    expect(mocks.created).toEqual([]);
  });

  it("rejects a selected envelope replayed by a different tenant", async () => {
    const { createSelectedDrafts, uploadBulkIntake } = await import("@/app/app/impor/actions");
    const previewState = await uploadBulkIntake({}, uploadForm());
    const confirmation = new FormData();
    confirmation.set("rowToken", previewState.preview!.validRows[0]!.confirmationToken);
    mocks.principal = {
      role: "OPERATOR", scope: "tenant", tenantId: "00000000-0000-4000-8000-000000000102", userId: "operator-b",
    };
    await expect(createSelectedDrafts({}, confirmation)).resolves.toMatchObject({
      message: "Tidak ada draf yang dibuat.",
    });
    expect(mocks.created).toEqual([]);
  });
});

describe("bulk import template endpoint", () => {
  it("returns the exact safe template contract for a tenant principal", async () => {
    const { GET } = await import("@/app/app/impor/template.csv/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="template-kiriman-geraicuan.csv"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      Buffer.from(`\uFEFF${BULK_TEMPLATE_HEADERS.join(",")}\r\n`, "utf8"),
    );
  });

  it("denies unauthenticated, suspended, and platform principals", async () => {
    const { GET } = await import("@/app/app/impor/template.csv/route");
    for (const deniedState of ["unauthenticated", "suspended"] as const) {
      mocks.authorizationDenied = true;
      await expect(GET(), deniedState).rejects.toThrow("REDIRECT:/login/tenant");
      mocks.authorizationDenied = false;
    }
    mocks.principal = { scope: "platform", userId: "platform-user" };
    await expect(GET()).rejects.toThrow("REDIRECT:/login/tenant");
  });
});
