import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  authorized: true,
  scope: "tenant",
  phone: "+6280000000141",
  tenantId: "00000000-0000-4000-8000-000000000141",
  contactId: "00000000-0000-4000-8000-000000000142",
  // T-197: address reads share the transaction's one connection; count overlaps.
  extraContact: false,
  addressReadsInFlight: 0,
  maxAddressReadsInFlight: 0,
}));

vi.mock("next/navigation", () => ({
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/cms-auth", () => {
  class CmsAuthorizationDeniedError extends Error {}
  return {
    CmsAuthorizationDeniedError,
    requireCmsScope: async () => {
      if (!fixture.authorized) throw new CmsAuthorizationDeniedError();
      return { scope: fixture.scope, role: "OPERATOR", tenantId: fixture.tenantId, userId: "fixture-operator" };
    },
  };
});
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: async (_db: unknown, userId: string, tenantId: string, work: (tx: unknown, context: unknown) => Promise<unknown>) =>
    work({}, { tenantId, userId, role: "OPERATOR" }),
}));
vi.mock("@/db/contact-repository", () => ({
  ContactUnavailableError: class ContactUnavailableError extends Error {},
  createContact: vi.fn(),
  resolveActiveContactAddress: vi.fn(),
  listContacts: async (_tx: unknown, context: { tenantId: string }) => context.tenantId === fixture.tenantId ? [{
    id: fixture.contactId,
    name: "Operational fixture recipient",
    phone: fixture.phone,
    isRecipient: true,
    isSender: false,
    archivedAt: null,
  }, ...(fixture.extraContact ? [{
    id: "00000000-0000-4000-8000-000000000144",
    name: "Second fixture recipient",
    phone: "+6280000000144",
    isRecipient: true,
    isSender: false,
    archivedAt: null,
  }] : [])] : [],
  listContactAddresses: async () => {
    fixture.addressReadsInFlight += 1;
    fixture.maxAddressReadsInFlight = Math.max(fixture.maxAddressReadsInFlight, fixture.addressReadsInFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    fixture.addressReadsInFlight -= 1;
    return [{
      id: "00000000-0000-4000-8000-000000000143",
      label: "Fixture destination",
      destinationAreaLabel: "Fixture district",
      archivedAt: null,
    }];
  },
}));
vi.mock("@/db/shipment-draft-repository", () => ({
  checkDuplicateShipment: vi.fn(),
  createShipmentDraft: vi.fn(),
  DUPLICATE_SHIPMENT_WINDOW_DAYS: 7,
  DraftSubmissionConflictError: class DraftSubmissionConflictError extends Error {},
  OutletUnavailableError: class OutletUnavailableError extends Error {},
  resolveExistingShipmentDraftReplay: vi.fn(),
}));
vi.mock("@/db/outlet-readiness-repository", () => ({ listReadyShipmentOutlets: vi.fn() }));
vi.mock("@/app/app/location-actions", () => ({ validateMengantarDestinationAreaSelection: vi.fn() }));
vi.mock("@/lib/mengantar-credentials", () => ({
  lockMengantarAccountAuthority: vi.fn(),
  MengantarConfigurationError: class MengantarConfigurationError extends Error {},
  sameMengantarAccountAuthority: vi.fn(),
}));

import { searchRecipientShipmentContacts, searchSenderShipmentContacts } from "@/app/app/actions";

beforeEach(() => {
  fixture.authorized = true;
  fixture.scope = "tenant";
  fixture.extraContact = false;
  fixture.addressReadsInFlight = 0;
  fixture.maxAddressReadsInFlight = 0;
});

describe("authorized operational phone display", () => {
  it("preserves the full phone including its international prefix in a recipient search", async () => {
    const form = new FormData();
    form.set("recipientContactQuery", "fixture");
    const result = await searchRecipientShipmentContacts({}, form);
    expect(result.results).toEqual([{
      addressId: "00000000-0000-4000-8000-000000000143",
      addressLabel: "Fixture destination",
      contactId: fixture.contactId,
      destinationAreaLabel: "Fixture district",
      name: "Operational fixture recipient",
      phone: fixture.phone,
    }]);

    form.set("senderContactQuery", "fixture");
    expect((await searchSenderShipmentContacts({}, form)).results).toEqual([]);
  });

  it("reads each contact's addresses in turn inside the tenant transaction (T-197)", async () => {
    fixture.extraContact = true;
    const form = new FormData();
    form.set("recipientContactQuery", "fixture");
    const result = await searchRecipientShipmentContacts({}, form);
    expect(result.results?.map((row) => row.contactId)).toEqual([fixture.contactId, "00000000-0000-4000-8000-000000000144"]);
    expect(fixture.maxAddressReadsInFlight).toBe(1);
  });

  it.each(["unauthenticated", "platform"])("returns no contact data for %s callers", async (caller) => {
    fixture.authorized = caller !== "unauthenticated";
    fixture.scope = caller === "platform" ? "platform" : "tenant";
    const form = new FormData();
    form.set("recipientContactQuery", "fixture");
    await expect(searchRecipientShipmentContacts({}, form)).rejects.toThrow("REDIRECT:/login/tenant");
  });
});
