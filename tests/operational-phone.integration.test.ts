import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  authorized: true,
  scope: "tenant",
  phone: "+6280000000141",
  tenantId: "00000000-0000-4000-8000-000000000141",
  contactId: "00000000-0000-4000-8000-000000000142",
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
  }] : [],
  listContactAddresses: async () => [{
    id: "00000000-0000-4000-8000-000000000143",
    label: "Fixture destination",
    destinationAreaLabel: "Fixture district",
    archivedAt: null,
  }],
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
import { ContactDirectoryBrowser } from "@/app/app/kontak/contact-directory-browser";

beforeEach(() => {
  fixture.authorized = true;
  fixture.scope = "tenant";
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

  it.each(["unauthenticated", "platform"])("returns no contact data for %s callers", async (caller) => {
    fixture.authorized = caller !== "unauthenticated";
    fixture.scope = caller === "platform" ? "platform" : "tenant";
    const form = new FormData();
    form.set("recipientContactQuery", "fixture");
    await expect(searchRecipientShipmentContacts({}, form)).rejects.toThrow("REDIRECT:/login/tenant");
  });

  it("renders the complete phone in the contact directory", () => {
    const html = renderToStaticMarkup(createElement(ContactDirectoryBrowser, {
      initialRows: [{
        address: null,
        addressCount: 0,
        archived: false,
        destinationAreaLabel: null,
        id: fixture.contactId,
        isRecipient: true,
        isSender: false,
        name: "Operational fixture recipient",
        phone: fixture.phone,
      }],
      peran: "semua",
      status: "active",
    }));
    const visible = html.replace(/<[^>]+>/g, " ");
    expect(visible).toContain(fixture.phone);
    expect(visible).not.toContain("••••");
  });
});
