import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  append: vi.fn(),
  fetchEstimate: vi.fn(),
  lockAuthority: vi.fn(),
  loadFixture: vi.fn(),
  redirect: vi.fn(),
  resolveCredentials: vi.fn(),
  useFixture: false,
}));

vi.mock("next/navigation", () => ({ redirect: fixture.redirect }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => ({
    role: "OPERATOR",
    scope: "tenant" as const,
    tenantId: "00000000-0000-0000-0000-000000000101",
    userId: "estimate-authority-user",
  })),
}));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (_db, userId, tenantId, work) => work({}, {
    role: "OPERATOR",
    tenantId,
    userId,
  })),
}));
vi.mock("@/db/estimate-repository", () => ({
  appendEstimateSnapshot: fixture.append,
  DraftEstimateUnavailableError: class DraftEstimateUnavailableError extends Error {},
  loadDraftEstimateInput: vi.fn(async () => ({
    destinationAreaId: "canonical-area",
    destinationAreaLabel: "Canonical destination",
    isCod: false,
    originAreaId: "origin-area",
    outletId: "00000000-0000-0000-0000-000000000111",
    shipmentId: "00000000-0000-0000-0000-000000000121",
    weightGrams: 1000,
  })),
}));
vi.mock("@/lib/estimate-rate-limit", () => ({
  enforceEstimateRateLimit: vi.fn(),
  EstimateRateLimitedError: class EstimateRateLimitedError extends Error {},
}));
vi.mock("@/lib/mengantar-credentials", () => ({
  lockMengantarAccountAuthority: fixture.lockAuthority,
  MengantarConfigurationError: class MengantarConfigurationError extends Error {},
  resolveMengantarAccountCredentials: fixture.resolveCredentials,
  sameMengantarAccountAuthority: (
    first: { connectionUpdatedAt: Date | null; source: string; version: number },
    second: { connectionUpdatedAt: Date | null; source: string; version: number },
  ) => (
    first.source === second.source
    && first.version === second.version
    && (first.connectionUpdatedAt?.getTime() ?? null)
      === (second.connectionUpdatedAt?.getTime() ?? null)
  ),
}));
vi.mock("@/lib/mengantar-estimate", () => ({
  fetchMengantarEstimate: fixture.fetchEstimate,
  MengantarEstimateError: class MengantarEstimateError extends Error {},
}));
vi.mock("@/lib/sanctioned-estimate-fixture", () => ({
  isSanctionedEstimateFixtureEnabled: () => fixture.useFixture,
  loadSanctionedEstimateFixture: fixture.loadFixture,
}));
vi.mock("@/lib/shipment-telemetry", () => ({
  createShipmentCorrelationId: () => "00000000-0000-4000-8000-000000000122",
  emitShipmentLifecycleEvent: vi.fn(),
}));

import { loadShipmentEstimate } from "@/app/app/estimate-actions";

const shipmentId = "00000000-0000-0000-0000-000000000121";
const currentCredentials = {
  authority: {
    connectionUpdatedAt: new Date("2026-09-02T00:00:00.000Z"),
    source: "private" as const,
    version: 7,
  },
  credentials: { apiKey: "not-a-real-secret", baseUrl: "https://example.test" },
  originAreaId: "origin-area",
  pickupAddressId: "pickup-address",
  source: "private" as const,
};

beforeEach(() => {
  fixture.append.mockReset().mockResolvedValue("snapshot-id");
  fixture.fetchEstimate.mockReset().mockResolvedValue([]);
  fixture.lockAuthority.mockReset().mockResolvedValue(undefined);
  fixture.loadFixture.mockReset().mockResolvedValue([]);
  fixture.redirect.mockReset().mockImplementation(() => undefined);
  fixture.resolveCredentials.mockReset()
    .mockResolvedValueOnce(currentCredentials)
    .mockResolvedValueOnce(currentCredentials);
  fixture.useFixture = false;
});

function estimateForm() {
  const data = new FormData();
  data.set("shipmentId", shipmentId);
  return data;
}

describe("shipment estimate destination authority", () => {
  it("copies the immutable pair only after current authority remains unchanged", async () => {
    await loadShipmentEstimate({}, estimateForm());

    expect(fixture.resolveCredentials).toHaveBeenCalledTimes(2);
    expect(fixture.lockAuthority).toHaveBeenCalledOnce();
    expect(fixture.fetchEstimate).toHaveBeenCalledOnce();
    expect(fixture.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      shipmentId,
      expect.objectContaining({
        destinationAreaId: "canonical-area",
        destinationAreaLabel: "Canonical destination",
      }),
      [],
    );
  });

  it("writes no estimate snapshot when the credential authority changes in flight", async () => {
    fixture.resolveCredentials.mockReset()
      .mockResolvedValueOnce(currentCredentials)
      .mockResolvedValueOnce({
        ...currentCredentials,
        authority: {
          ...currentCredentials.authority,
          version: 8,
        },
      });

    await expect(loadShipmentEstimate({}, estimateForm())).resolves.toEqual({
      error: expect.stringContaining("Estimasi tidak dapat dimuat"),
    });
    expect(fixture.append).not.toHaveBeenCalled();
  });

  it("keeps sanctioned fixture snapshots bound to the current account without provider I/O", async () => {
    fixture.useFixture = true;

    await loadShipmentEstimate({}, estimateForm());

    expect(fixture.loadFixture).toHaveBeenCalledOnce();
    expect(fixture.fetchEstimate).not.toHaveBeenCalled();
    expect(fixture.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      shipmentId,
      expect.objectContaining({ credentialSource: "private" }),
      [],
    );
  });
});
