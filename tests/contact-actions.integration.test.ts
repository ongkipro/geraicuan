import { beforeEach, describe, expect, it, vi } from "vitest";

const CONTACT_ID = "00000000-0000-4000-8000-000000000421";
const TENANT_A = "00000000-0000-4000-8000-000000000401";

const errors = vi.hoisted(() => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  ContactAddressLabelConflictError: class ContactAddressLabelConflictError extends Error {},
  ContactArchiveDeniedError: class ContactArchiveDeniedError extends Error {},
  ContactUnavailableError: class ContactUnavailableError extends Error {},
  MengantarConfigurationError: class MengantarConfigurationError extends Error {},
}));

const mocks = vi.hoisted(() => ({
  addFailure: "" as "" | "duplicate" | "unavailable",
  added: [] as Array<{ contactId: string; input: unknown }>,
  addressUpdated: [] as Array<{ addressId: string; contactId: string; input: unknown }>,
  areaValidationFailure: false,
  areaValidations: [] as Array<{ areaId: string; areaLabel: string; outletId: string; query: string }>,
  currentAuthorityVersion: 1,
  validatedAuthorityVersion: 1,
  archiveFailure: "" as "" | "unavailable",
  archived: [] as string[],
  authorizationDenied: false,
  contextCalls: 0,
  created: [] as unknown[],
  crossTenantContactId: "00000000-0000-4000-8000-000000000499",
  principal: {
    role: "OPERATOR" as "OPERATOR" | "TENANT_ADMIN",
    scope: "tenant" as "platform" | "tenant",
    tenantId: "00000000-0000-4000-8000-000000000401",
    userId: "contact-operator",
  },
  revalidated: [] as string[],
  searchRows: [] as Array<{
    archivedAt: Date | null;
    id: string;
    isRecipient: boolean;
    isSender: boolean;
    name: string;
    phone: string;
  }>,
  searches: [] as Array<{ query: string; status: string }>,
  updateFailure: "" as "" | "unavailable",
  updated: [] as Array<{ contactId: string; input: unknown }>,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((href: string) => {
    mocks.revalidated.push(href);
  }),
}));

vi.mock("@/db/client", () => ({ db: {} }));

vi.mock("@/db/outlet-readiness-repository", () => ({
  listReadyShipmentOutlets: vi.fn(async () => [{ id: "00000000-0000-4000-8000-000000000411", name: "Outlet siap" }]),
}));

vi.mock("@/app/app/location-actions", () => ({
  validateMengantarDestinationAreaSelection: vi.fn(async (outletId, query, areaId, areaLabel) => {
    mocks.areaValidations.push({ areaId, areaLabel, outletId, query });
    return mocks.areaValidationFailure
      ? { error: "selection_mismatch", message: "Pilihan area berubah.", success: false }
      : {
          authority: {
            connectionUpdatedAt: null,
            source: "platform_default",
            version: mocks.validatedAuthorityVersion,
          },
          option: { areaId, areaLabel },
          success: true,
        };
  }),
}));

vi.mock("@/lib/mengantar-credentials", () => ({
  lockMengantarAccountAuthority: vi.fn(async () => ({
    connectionUpdatedAt: null,
    source: "platform_default",
    version: mocks.currentAuthorityVersion,
  })),
  MengantarConfigurationError: errors.MengantarConfigurationError,
  sameMengantarAccountAuthority: vi.fn((expected, current) => (
    expected.source === current.source
    && expected.connectionUpdatedAt === current.connectionUpdatedAt
    && expected.version === current.version
  )),
}));

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

vi.mock("@/db/contact-repository", () => ({
  ContactAddressLabelConflictError: errors.ContactAddressLabelConflictError,
  ContactArchiveDeniedError: errors.ContactArchiveDeniedError,
  ContactUnavailableError: errors.ContactUnavailableError,
  addContactAddress: vi.fn(async (_tx, _context, contactId, input) => {
    if (contactId === mocks.crossTenantContactId) throw new errors.ContactUnavailableError();
    if (mocks.addFailure === "duplicate") throw new errors.ContactAddressLabelConflictError();
    if (mocks.addFailure === "unavailable") throw new errors.ContactUnavailableError();
    mocks.added.push({ contactId, input });
    return "00000000-0000-4000-8000-000000000422";
  }),
  archiveContact: vi.fn(async (_tx, context, contactId) => {
    if (context.role !== "TENANT_ADMIN") throw new errors.ContactArchiveDeniedError();
    if (contactId === mocks.crossTenantContactId) throw new errors.ContactUnavailableError();
    if (mocks.archiveFailure === "unavailable") throw new errors.ContactUnavailableError();
    mocks.archived.push(contactId);
  }),
  createContact: vi.fn(async (_tx, _context, input) => {
    mocks.created.push(input);
    return CONTACT_ID;
  }),
  hasActiveContactAddressMutationTarget: vi.fn(async (_tx, _context, contactId) => (
    contactId !== mocks.crossTenantContactId
  )),
  listContacts: vi.fn(async (_tx, _context, query, status) => {
    mocks.searches.push({ query, status });
    return mocks.searchRows;
  }),
  updateContact: vi.fn(async (_tx, _context, contactId, input) => {
    if (contactId === mocks.crossTenantContactId) throw new errors.ContactUnavailableError();
    if (mocks.updateFailure === "unavailable") throw new errors.ContactUnavailableError();
    mocks.updated.push({ contactId, input });
  }),
  updateContactAddress: vi.fn(async (_tx, _context, contactId, addressId, input) => {
    if (contactId === mocks.crossTenantContactId) throw new errors.ContactUnavailableError();
    if (mocks.addFailure === "duplicate") throw new errors.ContactAddressLabelConflictError();
    if (mocks.addFailure === "unavailable") throw new errors.ContactUnavailableError();
    mocks.addressUpdated.push({ addressId, contactId, input });
  }),
}));

function validCreateForm() {
  const form = new FormData();
  form.set("contactName", "Kontak Contoh");
  form.set("contactPhone", "081212345678");
  form.set("roleSender", "on");
  form.set("roleRecipient", "on");
  form.set("addressLabel", "Gudang Jakarta");
  form.set("addressText", "Jl. Kontak 1");
  form.set("areaLabel", "Gambir, Jakarta Pusat");
  form.set("areaId", "3171010");
  form.set("areaQuery", "Gambir Jakarta");
  form.set("areaOutletId", "00000000-0000-4000-8000-000000000411");
  return form;
}

function validIdentityForm() {
  const form = new FormData();
  form.set("contactId", CONTACT_ID);
  form.set("contactName", "Kontak Diperbarui");
  form.set("contactPhone", "081298765432");
  form.set("roleRecipient", "on");
  return form;
}

function validAddressForm() {
  const form = new FormData();
  form.set("contactId", CONTACT_ID);
  form.set("addressLabel", "Rumah");
  form.set("addressText", "Jl. Rumah 2");
  form.set("areaLabel", "Tebet, Jakarta Selatan");
  form.set("areaId", "3171090");
  form.set("areaQuery", "Tebet Jakarta");
  form.set("areaOutletId", "00000000-0000-4000-8000-000000000411");
  return form;
}

function validAddressUpdateForm() {
  const form = validAddressForm();
  form.set("addressId", "00000000-0000-4000-8000-000000000423");
  form.set("areaSelectionChanged", "1");
  return form;
}

function archiveForm() {
  const form = new FormData();
  form.set("contactId", CONTACT_ID);
  return form;
}

beforeEach(() => {
  mocks.addFailure = "";
  mocks.added.length = 0;
  mocks.addressUpdated.length = 0;
  mocks.areaValidationFailure = false;
  mocks.areaValidations.length = 0;
  mocks.currentAuthorityVersion = 1;
  mocks.validatedAuthorityVersion = 1;
  mocks.archiveFailure = "";
  mocks.archived.length = 0;
  mocks.authorizationDenied = false;
  mocks.contextCalls = 0;
  mocks.created.length = 0;
  mocks.principal = {
    role: "OPERATOR",
    scope: "tenant",
    tenantId: TENANT_A,
    userId: "contact-operator",
  };
  mocks.revalidated.length = 0;
  mocks.searchRows.length = 0;
  mocks.searches.length = 0;
  mocks.updateFailure = "";
  mocks.updated.length = 0;
});

describe("contact Server Actions", () => {
  it("authenticates every action before parsing or entering tenant data access", async () => {
    mocks.authorizationDenied = true;
    const { saveContact, searchContacts } = await import("@/app/app/kontak/actions");
    const {
      addContactAddressAction,
      archiveContactAction,
      updateContactAddressAction,
      updateContactAction,
    } = await import("@/app/app/kontak/[contactId]/actions");

    await expect(saveContact({}, new FormData())).rejects.toThrow("REDIRECT:/login/tenant");
    await expect(searchContacts({ rows: [], searched: false }, new FormData())).rejects.toThrow("REDIRECT:/login/tenant");
    await expect(updateContactAction({}, new FormData())).rejects.toThrow("REDIRECT:/login/tenant");
    await expect(addContactAddressAction({}, new FormData())).rejects.toThrow("REDIRECT:/login/tenant");
    await expect(updateContactAddressAction({}, new FormData())).rejects.toThrow("REDIRECT:/login/tenant");
    await expect(archiveContactAction({}, new FormData())).rejects.toThrow("REDIRECT:/login/tenant");
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.created).toEqual([]);
    expect(mocks.updated).toEqual([]);
    expect(mocks.added).toEqual([]);
    expect(mocks.archived).toEqual([]);
  });

  it("denies a platform principal for every tenant contact action", async () => {
    mocks.principal = {
      role: "TENANT_ADMIN",
      scope: "platform",
      tenantId: TENANT_A,
      userId: "platform-user",
    };
    const { saveContact, searchContacts } = await import("@/app/app/kontak/actions");
    const {
      addContactAddressAction,
      archiveContactAction,
      updateContactAddressAction,
      updateContactAction,
    } = await import("@/app/app/kontak/[contactId]/actions");

    await expect(saveContact({}, validCreateForm())).rejects.toThrow("REDIRECT:/login/tenant");
    await expect(searchContacts({ rows: [], searched: false }, new FormData())).rejects.toThrow("REDIRECT:/login/tenant");
    await expect(updateContactAction({}, validIdentityForm())).rejects.toThrow("REDIRECT:/login/tenant");
    await expect(addContactAddressAction({}, validAddressForm())).rejects.toThrow("REDIRECT:/login/tenant");
    await expect(updateContactAddressAction({}, validAddressUpdateForm())).rejects.toThrow("REDIRECT:/login/tenant");
    await expect(archiveContactAction({}, archiveForm())).rejects.toThrow("REDIRECT:/login/tenant");
    expect(mocks.contextCalls).toBe(0);
  });

  it("returns field-linked errors while preserving safe create, identity, and address values", async () => {
    const { saveContact } = await import("@/app/app/kontak/actions");
    const { addContactAddressAction, updateContactAction } = await import("@/app/app/kontak/[contactId]/actions");
    const create = validCreateForm();
    create.set("contactName", "  ");
    create.set("contactPhone", "invalid-phone");
    create.delete("roleSender");
    create.delete("roleRecipient");
    create.set("addressLabel", " Gudang tetap ");
    create.set("addressText", "");
    create.set("areaId", "");

    const createState = await saveContact({}, create);
    expect(createState.errors).toMatchObject({
      addressText: expect.any(String),
      areaLabel: expect.any(String),
      contactName: expect.any(String),
      contactPhone: expect.any(String),
      roles: expect.any(String),
    });
    expect(createState.values).toMatchObject({
      addressLabel: " Gudang tetap ",
      contactName: "  ",
      contactPhone: "invalid-phone",
    });
    expect(JSON.stringify(createState.errors)).not.toContain("invalid-phone");

    const identity = validIdentityForm();
    identity.set("contactName", "  ");
    identity.set("contactPhone", "invalid-update-phone");
    identity.delete("roleRecipient");
    const identityState = await updateContactAction({}, identity);
    expect(identityState.errors).toMatchObject({
      contactName: expect.any(String),
      contactPhone: expect.any(String),
      roles: expect.any(String),
    });
    expect(identityState.values).toEqual({
      contactName: "",
      contactPhone: "invalid-update-phone",
      roleRecipient: "",
      roleSender: "",
    });
    expect(JSON.stringify(identityState.errors)).not.toContain("invalid-update-phone");

    const address = validAddressForm();
    address.set("addressLabel", " Rumah tetap ");
    address.set("addressText", "");
    address.set("areaId", "");
    const addressState = await addContactAddressAction({}, address);
    expect(addressState.errors).toMatchObject({
      addressText: expect.any(String),
      areaLabel: expect.any(String),
    });
    expect(addressState.values).toMatchObject({
      addressLabel: "Rumah tetap",
    });
    expect(mocks.created).toEqual([]);
    expect(mocks.updated).toEqual([]);
    expect(mocks.added).toEqual([]);
  });

  it("returns complete phones to an authorized tenant contact search", async () => {
    const rawPhone = "081234567890";
    mocks.searchRows.push({
      archivedAt: new Date("2026-09-01T00:00:00.000Z"),
      id: CONTACT_ID,
      isRecipient: true,
      isSender: false,
      name: "Kontak Arsip",
      phone: rawPhone,
    });
    const { searchContacts } = await import("@/app/app/kontak/actions");
    const form = new FormData();
    form.set("q", "  Arsip  ");
    form.set("status", "archived");

    const state = await searchContacts({ rows: [], searched: false }, form);
    expect(state).toEqual({
      rows: [{
        archived: true,
        id: CONTACT_ID,
        isRecipient: true,
        isSender: false,
        name: "Kontak Arsip",
        phone: rawPhone,
      }],
      searched: true,
    });
    expect(JSON.stringify(state)).toContain(rawPhone);
    expect(mocks.searches).toEqual([{ query: "Arsip", status: "archived" }]);

    const invalid = new FormData();
    invalid.set("q", "x");
    const invalidState = await searchContacts({ rows: [], searched: false }, invalid);
    expect(invalidState).toMatchObject({ error: expect.any(String), rows: [], searched: true });
    expect(mocks.searches).toHaveLength(1);
  });

  it("allows an Operator to create, update, and add an address with scoped success outcomes", async () => {
    const { saveContact } = await import("@/app/app/kontak/actions");
    const { addContactAddressAction, updateContactAction } = await import("@/app/app/kontak/[contactId]/actions");

    await expect(saveContact({}, validCreateForm())).resolves.toEqual({
      message: "Kontak tersimpan dan siap dipakai pada draf baru.",
      successId: CONTACT_ID,
    });
    const identityState = await updateContactAction({}, validIdentityForm());
    const addressState = await addContactAddressAction({}, validAddressForm());
    expect(identityState).toMatchObject({ success: true });
    expect(addressState).toMatchObject({ success: true });
    expect(mocks.created).toHaveLength(1);
    expect(mocks.updated).toHaveLength(1);
    expect(mocks.added).toHaveLength(1);
    expect(mocks.revalidated).toEqual([
      `/app/kontak/${CONTACT_ID}`,
      `/app/kontak/${CONTACT_ID}`,
    ]);
  });

  it("keeps destination area optional while rejecting a stale or tampered non-null pair with zero writes", async () => {
    const { saveContact } = await import("@/app/app/kontak/actions");
    const { addContactAddressAction } = await import("@/app/app/kontak/[contactId]/actions");
    const withoutArea = validCreateForm();
    for (const field of ["areaId", "areaLabel", "areaQuery", "areaOutletId"]) withoutArea.delete(field);
    await expect(saveContact({}, withoutArea)).resolves.toMatchObject({ successId: CONTACT_ID });

    mocks.areaValidationFailure = true;
    const stale = await addContactAddressAction({}, validAddressForm());
    expect(stale).toMatchObject({
      areaQuery: { query: "Tebet Jakarta" },
      errors: { areaLabel: "Pilihan area berubah." },
    });
    expect(stale).not.toHaveProperty("selectedArea");
    expect(mocks.added).toEqual([]);
  });

  it("rejects contact and address writes when Mengantar authority changes after area validation", async () => {
    const { saveContact } = await import("@/app/app/kontak/actions");
    const { addContactAddressAction, updateContactAddressAction } = await import("@/app/app/kontak/[contactId]/actions");
    mocks.currentAuthorityVersion = 2;

    const created = await saveContact({}, validCreateForm());
    const added = await addContactAddressAction({}, validAddressForm());
    const updated = await updateContactAddressAction({}, validAddressUpdateForm());

    expect(created).toMatchObject({
      errors: { areaLabel: "Koneksi Mengantar berubah. Cari dan pilih ulang area tujuan." },
      selectedArea: { areaId: "3171010", areaLabel: "Gambir, Jakarta Pusat" },
    });
    expect(added).toMatchObject({
      errors: { areaLabel: "Koneksi Mengantar berubah. Cari dan pilih ulang area tujuan." },
      selectedArea: { areaId: "3171090", areaLabel: "Tebet, Jakarta Selatan" },
    });
    expect(updated).toMatchObject({
      errors: { areaLabel: "Koneksi Mengantar berubah. Cari dan pilih ulang area tujuan." },
      selectedArea: { areaId: "3171090", areaLabel: "Tebet, Jakarta Selatan" },
    });
    expect(mocks.created).toEqual([]);
    expect(mocks.added).toEqual([]);
    expect(mocks.addressUpdated).toEqual([]);
  });

  it("revalidates a selected area again after an edit label conflict before retrying the update", async () => {
    const { updateContactAddressAction } = await import("@/app/app/kontak/[contactId]/actions");
    mocks.addFailure = "duplicate";
    const first = await updateContactAddressAction({}, validAddressUpdateForm());
    expect(first).toMatchObject({
      errors: { addressLabel: "Label alamat sudah digunakan pada kontak ini." },
      selectedArea: { areaId: "3171090", query: "Tebet Jakarta" },
    });
    expect(mocks.areaValidations).toHaveLength(1);

    mocks.addFailure = "";
    const retry = validAddressUpdateForm();
    const result = await updateContactAddressAction(first, retry);
    expect(result).toMatchObject({ success: true });
    expect(mocks.areaValidations).toHaveLength(2);
    expect(mocks.addressUpdated).toHaveLength(1);
    expect(mocks.addressUpdated[0].input).toMatchObject({
      destinationArea: { id: "3171090", label: "Tebet, Jakarta Selatan" },
    });
  });

  it("maps duplicate and unavailable contacts to safe states without leaking internal errors", async () => {
    const { addContactAddressAction, updateContactAction } = await import("@/app/app/kontak/[contactId]/actions");
    mocks.addFailure = "duplicate";
    const duplicate = await addContactAddressAction({}, validAddressForm());
    expect(duplicate).toMatchObject({
      errors: { addressLabel: "Label alamat sudah digunakan pada kontak ini." },
      message: "Periksa alamat baru.",
      values: { addressLabel: "Rumah", addressText: "Jl. Rumah 2" },
    });
    expect(JSON.stringify(duplicate)).not.toContain("ContactAddressLabelConflictError");

    mocks.addFailure = "unavailable";
    const unavailableAddress = await addContactAddressAction({}, validAddressForm());
    mocks.updateFailure = "unavailable";
    const unavailableIdentity = await updateContactAction({}, validIdentityForm());
    expect(unavailableAddress).toEqual({
      message: "Kontak tidak tersedia atau batas 20 alamat aktif sudah tercapai.",
    });
    expect(unavailableIdentity).toEqual({
      message: "Kontak tidak tersedia atau sudah diarsipkan.",
    });
    expect(mocks.added).toEqual([]);
    expect(mocks.updated).toEqual([]);
    expect(mocks.revalidated).toEqual([]);
  });

  it("maps cross-tenant mutation targets to safe outcomes with zero writes", async () => {
    mocks.principal.role = "TENANT_ADMIN";
    const { addContactAddressAction, archiveContactAction, updateContactAction } = await import("@/app/app/kontak/[contactId]/actions");
    const identity = validIdentityForm();
    identity.set("contactId", mocks.crossTenantContactId);
    const address = validAddressForm();
    address.set("contactId", mocks.crossTenantContactId);
    const archive = archiveForm();
    archive.set("contactId", mocks.crossTenantContactId);

    await expect(updateContactAction({}, identity)).resolves.toEqual({
      message: "Kontak tidak tersedia atau sudah diarsipkan.",
    });
    await expect(addContactAddressAction({}, address)).resolves.toEqual({
      message: "Kontak tidak tersedia atau batas 20 alamat aktif sudah tercapai.",
    });
    await expect(archiveContactAction({}, archive)).resolves.toEqual({
      error: "Kontak tidak tersedia atau actor tidak memiliki izin Tenant Admin.",
    });
    expect(mocks.updated).toEqual([]);
    expect(mocks.added).toEqual([]);
    expect(mocks.archived).toEqual([]);
    expect(mocks.revalidated).toEqual([]);
  });

  it("keeps archive Tenant-Admin-only and maps cross-tenant or unavailable targets safely", async () => {
    const { archiveContactAction } = await import("@/app/app/kontak/[contactId]/actions");
    await expect(archiveContactAction({}, archiveForm())).resolves.toEqual({
      error: "Kontak tidak tersedia atau actor tidak memiliki izin Tenant Admin.",
    });
    expect(mocks.archived).toEqual([]);

    mocks.principal.role = "TENANT_ADMIN";
    mocks.archiveFailure = "unavailable";
    await expect(archiveContactAction({}, archiveForm())).resolves.toEqual({
      error: "Kontak tidak tersedia atau actor tidak memiliki izin Tenant Admin.",
    });
    expect(mocks.archived).toEqual([]);

    mocks.archiveFailure = "";
    await expect(archiveContactAction({}, archiveForm())).rejects.toThrow(
      `REDIRECT:/app/kontak/${CONTACT_ID}?diarsipkan=1`,
    );
    expect(mocks.archived).toEqual([CONTACT_ID]);
  });
});
