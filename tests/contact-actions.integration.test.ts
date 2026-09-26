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
    address: string | null;
    addressCount: number;
    archivedAt: Date | null;
    destinationAreaLabel: string | null;
    id: string;
    isRecipient: boolean;
    isSender: boolean;
    name: string;
    phone: string;
  }>,
  searches: [] as Array<{ query: string; role: string; status: string }>,
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
    return 7;
  }),
  createContact: vi.fn(async (_tx, _context, input) => {
    mocks.created.push(input);
    return CONTACT_ID;
  }),
  // T-241: the create action reads the allocated number back in the same transaction.
  getContact: vi.fn(async (_tx, _context, contactId) => ({ contactNumber: 7, id: contactId })),
  hasActiveContactAddressMutationTarget: vi.fn(async (_tx, _context, contactId) => (
    contactId !== mocks.crossTenantContactId
  )),
  listContactDirectory: vi.fn(async (_tx, _context, input) => {
    mocks.searches.push(input);
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

  it("refuses a digit in a recipient-only contact name and a letter in a phone on create, edit, and address saves (T-196)", async () => {
    const { saveContact } = await import("@/app/app/kontak/actions");
    const { addContactAddressAction, updateContactAction, updateContactAddressAction } = await import("@/app/app/kontak/[contactId]/actions");
    const nameRule = "Nama kontak hanya boleh berisi huruf, spasi, titik, koma, apostrof, dan tanda hubung.";
    const phoneRule = "Nomor telepon kontak hanya boleh berisi angka, boleh diawali +.";

    const create = validCreateForm();
    create.delete("roleSender");
    create.set("contactName", "Budi 2");
    create.set("contactPhone", "0812345678x9");
    create.set("addressText", "Jl. Mawar 🏠 No. 5");
    const createState = await saveContact({}, create);
    expect(createState.errors).toMatchObject({
      addressText: "Alamat hanya boleh berisi huruf, angka, spasi, dan tanda baca, tanpa emoji.",
      contactName: nameRule,
      contactPhone: phoneRule,
    });
    // The typed value comes back untouched for the operator to correct.
    expect(createState.values).toMatchObject({ contactName: "Budi 2", contactPhone: "0812345678x9" });

    // A stored recipient name that already holds a digit is refused on save, not rewritten.
    const identity = validIdentityForm();
    identity.set("contactName", "Toko 88");
    const identityState = await updateContactAction({}, identity);
    expect(identityState.errors).toEqual({ contactName: nameRule });
    expect(identityState.values).toMatchObject({ contactName: "Toko 88" });

    // T-199: the Peran card unticking Pengirim on "Toko 88" says what to do instead of a bare name rule.
    const rolesCard = validIdentityForm();
    rolesCard.set("contactName", "Toko 88");
    rolesCard.set("card", "peran");
    const rolesState = await updateContactAction({}, rolesCard);
    expect(rolesState.errors).toEqual({
      roles: "Nama kontak ini memuat angka atau simbol yang hanya boleh untuk pengirim. Ubah nama tanpa angka dulu di kartu Kontak, lalu lepas peran Pengirim.",
    });
    // Still a refusal: the recipient-only rule is kept, and a name that breaks every rule keeps its own message.
    const rolesEmoji = validIdentityForm();
    rolesEmoji.set("contactName", "Toko 88 😀");
    rolesEmoji.set("card", "peran");
    expect((await updateContactAction({}, rolesEmoji)).errors).toEqual({ contactName: nameRule });

    const address = validAddressForm();
    address.set("addressLabel", "Rumah\u202E");
    const addressState = await addContactAddressAction({}, address);
    expect(addressState.errors).toEqual({
      addressLabel: "Label alamat tidak boleh memuat emoji, karakter kontrol, atau karakter tersembunyi.",
    });
    const addressUpdate = validAddressUpdateForm();
    addressUpdate.set("addressText", "Jl. Mawar 👍🏽 No. 5");
    const addressUpdateState = await updateContactAddressAction({}, addressUpdate);
    expect(addressUpdateState.errors).toMatchObject({ addressText: expect.stringContaining("hanya boleh berisi huruf, angka") });

    // Indonesian names and house-address punctuation still pass.
    const valid = validCreateForm();
    valid.set("contactName", "Siti Nur'aini");
    valid.set("contactPhone", "+62 812-3456-7890");
    valid.set("addressLabel", "Toko 88");
    valid.set("addressText", "Blok C2/5, RT 03/RW 07 (belakang masjid) #2");
    await expect(saveContact({}, valid)).resolves.toMatchObject({ successId: CONTACT_ID });
    const renamed = validIdentityForm();
    renamed.set("contactName", "R.A. Kartini");
    await expect(updateContactAction({}, renamed)).resolves.toMatchObject({ success: true });

    expect(mocks.created).toHaveLength(1);
    expect(mocks.updated).toHaveLength(1);
    expect(mocks.added).toEqual([]);
    expect(mocks.addressUpdated).toEqual([]);
  });

  it("reads a non-breaking space as a word boundary and keeps everyday address punctuation (T-199)", async () => {
    const { saveContact } = await import("@/app/app/kontak/actions");
    const form = validCreateForm();
    form.delete("roleSender");
    form.set("contactName", "Siti\u00A0\u00A0Aminah\u202F");
    form.set("addressText", "Jl. Ma\u2019ruf Blok C&D; km 5+200 \"Ruko\" @Pasar_Baru");
    await expect(saveContact({}, form)).resolves.toMatchObject({ successId: CONTACT_ID });
    expect(mocks.created).toEqual([
      expect.objectContaining({
        address: "Jl. Ma\u2019ruf Blok C&D; km 5+200 \"Ruko\" @Pasar_Baru",
        name: "Siti Aminah",
      }),
    ]);
  });

  it("lets a sender contact name carry digits, alone or with the recipient role, but never an emoji (T-196 owner decision)", async () => {
    const { saveContact } = await import("@/app/app/kontak/actions");
    const { updateContactAction } = await import("@/app/app/kontak/[contactId]/actions");
    const senderOnly = validCreateForm();
    senderOnly.delete("roleRecipient");
    senderOnly.set("contactName", "Toko 88");
    await expect(saveContact({}, senderOnly)).resolves.toMatchObject({ successId: CONTACT_ID });
    const bothRoles = validCreateForm();
    bothRoles.set("contactName", "Grosir Aksesoris HP 99");
    await expect(saveContact({}, bothRoles)).resolves.toMatchObject({ successId: CONTACT_ID });
    const senderEdit = validIdentityForm();
    senderEdit.delete("roleRecipient");
    senderEdit.set("roleSender", "on");
    senderEdit.set("contactName", "Toko 88");
    await expect(updateContactAction({}, senderEdit)).resolves.toMatchObject({ success: true });
    const emoji = validCreateForm();
    emoji.delete("roleRecipient");
    emoji.set("contactName", "Toko 88 😀");
    await expect(saveContact({}, emoji)).resolves.toMatchObject({
      errors: { contactName: "Nama kontak tidak boleh memuat emoji, karakter kontrol, atau karakter tersembunyi." },
    });
    // Dropping the sender role makes the same stored name a person's name again.
    const recipientEdit = validIdentityForm();
    recipientEdit.set("contactName", "Toko 88");
    await expect(updateContactAction({}, recipientEdit)).resolves.toMatchObject({
      errors: { contactName: "Nama kontak hanya boleh berisi huruf, spasi, titik, koma, apostrof, dan tanda hubung." },
    });
    expect(mocks.created).toHaveLength(2);
    expect(mocks.updated).toHaveLength(1);
  });

  it("returns complete phones to an authorized tenant contact search", async () => {
    const rawPhone = "081234567890";
    mocks.searchRows.push({
      address: "Jl. Arsip 1",
      addressCount: 1,
      archivedAt: new Date("2026-09-01T00:00:00.000Z"),
      destinationAreaLabel: "Gambir, Jakarta Pusat",
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
    form.set("peran", "penerima");

    const state = await searchContacts({ rows: [], searched: false }, form);
    expect(state).toEqual({
      rows: [{
        address: "Jl. Arsip 1",
        addressCount: 1,
        archived: true,
        destinationAreaLabel: "Gambir, Jakarta Pusat",
        id: CONTACT_ID,
        isRecipient: true,
        isSender: false,
        name: "Kontak Arsip",
        phone: rawPhone,
      }],
      searched: true,
    });
    expect(JSON.stringify(state)).toContain(rawPhone);
    expect(mocks.searches).toEqual([{ query: "Arsip", role: "recipient", status: "archived" }]);

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
      successNumber: 7,
      successRole: "pengirim",
    });
    // T-188: success returns to the list the form was opened from while the
    // contact holds that role, else the contact's first role.
    const fromRecipients = validCreateForm();
    fromRecipients.set("peran", "penerima");
    await expect(saveContact({}, fromRecipients)).resolves.toMatchObject({ successRole: "penerima" });
    const senderOnly = validCreateForm();
    senderOnly.set("peran", "penerima");
    senderOnly.delete("roleRecipient");
    await expect(saveContact({}, senderOnly)).resolves.toMatchObject({ successRole: "pengirim" });
    mocks.created.splice(1);
    const identityState = await updateContactAction({}, validIdentityForm());
    const addressState = await addContactAddressAction({}, validAddressForm());
    expect(identityState).toMatchObject({ success: true });
    expect(addressState).toMatchObject({ success: true });
    expect(mocks.created).toHaveLength(1);
    expect(mocks.updated).toHaveLength(1);
    expect(mocks.added).toHaveLength(1);
    // T-241: both numbered detail routes, once per successful action.
    expect(mocks.revalidated).toEqual([
      "/app/kontak/pengirim/[nomor]",
      "/app/kontak/penerima/[nomor]",
      "/app/kontak/pengirim/[nomor]",
      "/app/kontak/penerima/[nomor]",
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
      error: "Kontak tidak tersedia atau akun Anda tidak memiliki izin pemilik gerai.",
    });
    expect(mocks.updated).toEqual([]);
    expect(mocks.added).toEqual([]);
    expect(mocks.archived).toEqual([]);
    expect(mocks.revalidated).toEqual([]);
  });

  it("keeps archive Tenant-Admin-only and maps cross-tenant or unavailable targets safely", async () => {
    const { archiveContactAction } = await import("@/app/app/kontak/[contactId]/actions");
    await expect(archiveContactAction({}, archiveForm())).resolves.toEqual({
      error: "Kontak tidak tersedia atau akun Anda tidak memiliki izin pemilik gerai.",
    });
    expect(mocks.archived).toEqual([]);

    mocks.principal.role = "TENANT_ADMIN";
    mocks.archiveFailure = "unavailable";
    await expect(archiveContactAction({}, archiveForm())).resolves.toEqual({
      error: "Kontak tidak tersedia atau akun Anda tidak memiliki izin pemilik gerai.",
    });
    expect(mocks.archived).toEqual([]);

    mocks.archiveFailure = "";
    await expect(archiveContactAction({}, archiveForm())).rejects.toThrow(
      "REDIRECT:/app/kontak/pengirim/7?diarsipkan=1",
    );
    expect(mocks.archived).toEqual([CONTACT_ID]);
    // T-188: archiving stays under the menu the contact was opened from.
    const fromRecipients = archiveForm();
    fromRecipients.set("dari", "penerima");
    await expect(archiveContactAction({}, fromRecipients)).rejects.toThrow(
      "REDIRECT:/app/kontak/penerima/7?diarsipkan=1",
    );
  });

  it("refuses a tampered kategori with zero writes and saves a listed one (T-241)", async () => {
    const { saveContact } = await import("@/app/app/kontak/actions");
    const { updateContactAction } = await import("@/app/app/kontak/[contactId]/actions");
    const tampered = validCreateForm();
    tampered.set("category", "SKOR_MENGANTAR");
    expect((await saveContact({}, tampered)).errors).toMatchObject({ category: "Pilih kategori dari daftar." });
    expect(mocks.created).toEqual([]);
    const listed = validCreateForm();
    listed.set("category", "RESELLER");
    await expect(saveContact({}, listed)).resolves.toMatchObject({ successNumber: 7 });
    expect(mocks.created).toEqual([expect.objectContaining({ category: "RESELLER" })]);

    const identity = validIdentityForm();
    identity.set("category", "BUKAN_KATEGORI");
    expect((await updateContactAction({}, identity)).errors).toMatchObject({ category: "Pilih kategori dari daftar." });
    expect(mocks.updated).toEqual([]);
    identity.set("category", "");
    await expect(updateContactAction({}, identity)).resolves.toMatchObject({ success: true });
    // Without the field (the Peran card) the stored kategori is left alone: `undefined`, not `null`.
    await updateContactAction({}, validIdentityForm());
    expect(mocks.updated.map((call) => (call.input as { category?: unknown }).category)).toEqual([null, undefined]);
  });
});
