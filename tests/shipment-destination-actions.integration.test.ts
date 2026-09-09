import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  authority: vi.fn(),
  checkDuplicate: vi.fn(async () => false),
  create: vi.fn(),
  currentAuthority: { connectionUpdatedAt: null, source: "platform_default" as const, version: 4 },
  lockAuthority: vi.fn(),
  redirect: vi.fn(),
  resolveCredentials: vi.fn(),
  resolveContact: vi.fn(),
  replay: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: fixture.redirect,
}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => ({
    role: "OPERATOR",
    scope: "tenant" as const,
    tenantId: "00000000-0000-0000-0000-000000000101",
    userId: "shipment-destination-user",
  })),
}));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (_db, userId, tenantId, work) => work({}, {
    role: "OPERATOR",
    tenantId,
    userId,
  })),
}));
vi.mock("@/db/shipment-draft-repository", () => ({
  checkDuplicateShipment: fixture.checkDuplicate,
  createShipmentDraft: fixture.create,
  DraftSubmissionConflictError: class DraftSubmissionConflictError extends Error {},
  OutletUnavailableError: class OutletUnavailableError extends Error {},
  resolveExistingShipmentDraftReplay: fixture.replay,
}));
vi.mock("@/db/contact-repository", () => ({
  ContactUnavailableError: class ContactUnavailableError extends Error {},
  listContactAddresses: vi.fn(),
  listContacts: vi.fn(),
  resolveActiveContactAddress: fixture.resolveContact,
}));
vi.mock("@/app/app/location-actions", () => ({
  validateMengantarDestinationAreaSelection: fixture.authority,
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

import { saveShipmentDraft } from "@/app/app/actions";

const outletId = "00000000-0000-0000-0000-000000000111";

function form() {
  const data = new FormData();
  for (const [field, value] of Object.entries({
    areaId: "submitted-area",
    areaLabel: "Submitted area",
    areaOutletId: outletId,
    areaQuery: "Submitted query",
    declaredValue: "100000",
    destinationAreaId: "submitted-area",
    destinationAreaLabel: "Submitted area",
    destinationMode: "manual",
    outletId,
    packageContent: "Sanitized package",
    packageHeightCm: "",
    packageLengthCm: "",
    packageQuantity: "1",
    packageWeightGrams: "1000",
    packageWidthCm: "",
    paymentType: "NON_COD",
    recipientAddress: "Sanitized destination",
    recipientName: "Recipient",
    recipientPhone: "081234567890",
    senderAddress: "Sanitized origin",
    senderName: "Sender",
    senderPhone: "081234567891",
    submissionId: "00000000-0000-4000-8000-000000000123",
  })) data.set(field, value);
  return data;
}

beforeEach(() => {
  fixture.authority.mockReset().mockImplementation(async (_outletId, _query, areaId, areaLabel) => ({
    authority: fixture.currentAuthority,
    option: { areaId, areaLabel },
    success: true,
  }));
  fixture.create.mockReset();
  fixture.lockAuthority.mockReset().mockResolvedValue(fixture.currentAuthority);
  fixture.redirect.mockReset();
  fixture.replay.mockReset().mockResolvedValue(null);
  fixture.resolveContact.mockReset();
  fixture.resolveCredentials.mockReset().mockResolvedValue({
    authority: fixture.currentAuthority,
  });
  fixture.create.mockResolvedValue("00000000-0000-4000-8000-000000000123");
  fixture.redirect.mockImplementation(() => undefined);
});

describe("shipment destination authority action", () => {
  it("writes nothing when a deliberate manual selection no longer matches authority", async () => {
    fixture.authority.mockResolvedValue({
      error: "selection_mismatch",
      message: "Pilihan area berubah.",
      success: false,
    });

    await expect(saveShipmentDraft({}, form())).resolves.toMatchObject({
      errors: { destinationAreaLabel: "Pilihan area berubah." },
    });
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.replay).not.toHaveBeenCalled();
  });

  it("rejects a manual selection authorized under a different outlet", async () => {
    const data = form();
    data.set("areaOutletId", "00000000-0000-0000-0000-000000000112");

    await expect(saveShipmentDraft({}, data)).resolves.toMatchObject({
      errors: { destinationAreaLabel: expect.stringContaining("outlet asal") },
    });
    expect(fixture.authority).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it("persists only the exact manual pair returned by current outlet authority", async () => {
    fixture.authority.mockResolvedValue({
      authority: fixture.currentAuthority,
      option: { areaId: "canonical-area", areaLabel: "Canonical area" },
      success: true,
    });

    await saveShipmentDraft({}, form());

    expect(fixture.authority).toHaveBeenCalledWith(
      outletId,
      "Submitted query",
      "submitted-area",
      "Submitted area",
    );
    expect(fixture.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: "00000000-0000-0000-0000-000000000101" }),
      expect.objectContaining({
        destinationAreaId: "canonical-area",
        destinationAreaLabel: "Canonical area",
        outletId,
      }),
      "00000000-0000-4000-8000-000000000123",
    );
  });

  it("derives contact-prefilled authority from the freshly resolved active address", async () => {
    const selectedAt = new Date("2026-09-02T00:00:00.000Z");
    fixture.resolveContact.mockResolvedValue({
      address: "Contact destination",
      addressUpdatedAt: selectedAt,
      contactUpdatedAt: selectedAt,
      destinationAreaId: "contact-area",
      destinationAreaLabel: "Contact canonical area",
      name: "Contact recipient",
      phone: "081234567899",
    });
    const data = form();
    data.set("destinationMode", "contact");
    data.set("destinationAreaId", "tampered-hidden-area");
    data.set("destinationAreaLabel", "Tampered hidden area");
    data.set("recipientContactId", "00000000-0000-0000-0000-000000000201");
    data.set("recipientContactAddressId", "00000000-0000-0000-0000-000000000202");
    data.set("recipientContactUpdatedAt", selectedAt.toISOString());
    data.set("recipientContactAddressUpdatedAt", selectedAt.toISOString());
    data.set("recipientContactSnapshotName", "Contact recipient");
    data.set("recipientContactSnapshotPhone", "081234567899");
    data.set("recipientContactSnapshotAddress", "Contact destination");
    data.set("recipientContactSnapshotDestinationAreaId", "contact-area");
    data.set("recipientContactSnapshotDestinationAreaLabel", "Contact canonical area");

    await saveShipmentDraft({}, data);

    expect(fixture.authority).toHaveBeenCalledWith(
      outletId,
      "Contact canonical area",
      "contact-area",
      "Contact canonical area",
    );
    expect(fixture.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        destinationAreaId: "contact-area",
        destinationAreaLabel: "Contact canonical area",
      }),
      expect.any(String),
    );
  });

  it("rejects a provider-authoritative selection when the account changes before the locked write", async () => {
    fixture.lockAuthority.mockResolvedValue({ ...fixture.currentAuthority, version: 5 });

    await expect(saveShipmentDraft({}, form())).resolves.toMatchObject({
      errors: { destinationAreaLabel: expect.stringContaining("Koneksi Mengantar berubah") },
    });
    expect(fixture.lockAuthority).toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it("writes nothing when contact-prefilled authority changed after selection", async () => {
    const selectedAt = new Date("2026-09-02T00:00:00.000Z");
    fixture.resolveContact.mockResolvedValue({
      address: "Contact destination",
      addressUpdatedAt: selectedAt,
      contactUpdatedAt: selectedAt,
      destinationAreaId: "different-contact-area",
      destinationAreaLabel: "Different contact area",
      name: "Contact recipient",
      phone: "081234567899",
    });
    const data = form();
    data.set("destinationMode", "contact");
    data.set("recipientContactId", "00000000-0000-0000-0000-000000000201");
    data.set("recipientContactAddressId", "00000000-0000-0000-0000-000000000202");
    data.set("recipientContactUpdatedAt", selectedAt.toISOString());
    data.set("recipientContactAddressUpdatedAt", selectedAt.toISOString());
    data.set("recipientContactSnapshotName", "Contact recipient");
    data.set("recipientContactSnapshotPhone", "081234567899");
    data.set("recipientContactSnapshotAddress", "Contact destination");
    data.set("recipientContactSnapshotDestinationAreaId", "contact-area");
    data.set("recipientContactSnapshotDestinationAreaLabel", "Contact canonical area");

    await expect(saveShipmentDraft({}, data)).resolves.toMatchObject({
      errors: { recipientContactSelection: expect.any(String) },
    });
    expect(fixture.authority).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it("writes nothing when the selected contact address changed after selection", async () => {
    const selectedAt = new Date("2026-09-02T00:00:00.000Z");
    fixture.resolveContact.mockResolvedValue({
      address: "Contact destination",
      addressUpdatedAt: new Date("2026-09-02T00:01:00.000Z"),
      contactUpdatedAt: selectedAt,
      destinationAreaId: "contact-area",
      destinationAreaLabel: "Contact canonical area",
      name: "Contact recipient",
      phone: "081234567899",
    });
    const data = form();
    data.set("destinationMode", "contact");
    data.set("recipientContactId", "00000000-0000-0000-0000-000000000201");
    data.set("recipientContactAddressId", "00000000-0000-0000-0000-000000000202");
    data.set("recipientContactUpdatedAt", selectedAt.toISOString());
    data.set("recipientContactAddressUpdatedAt", selectedAt.toISOString());
    data.set("recipientContactSnapshotName", "Contact recipient");
    data.set("recipientContactSnapshotPhone", "081234567899");
    data.set("recipientContactSnapshotAddress", "Contact destination");
    data.set("recipientContactSnapshotDestinationAreaId", "contact-area");
    data.set("recipientContactSnapshotDestinationAreaLabel", "Contact canonical area");

    await expect(saveShipmentDraft({}, data)).resolves.toMatchObject({
      errors: { recipientContactSelection: expect.any(String) },
    });
    expect(fixture.authority).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
  });
});
