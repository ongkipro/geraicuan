import "server-only";

import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import * as schema from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import {
  DEFAULT_LABEL_FIELDS,
  DEFAULT_LABEL_FIELDS_BY_SIZE,
  type LabelFieldsBySize,
} from "@/lib/label-fields";
import {
  geraiLogoSrc,
  LOGO_SHA256_PATTERN,
  SELECTABLE_COURIERS,
  validateLogoUpload,
  type BusinessCategory,
  type GeraiProfileInput,
  type LogoMime,
} from "@/lib/gerai-settings";
import { DEFAULT_LABEL_SIZE, LABEL_SIZES, type LabelSize } from "@/lib/label-size";

export class TenantSettingsDeniedError extends Error {
  constructor() {
    super("Tenant settings change is not authorized.");
  }
}

export class TenantContactInvalidError extends Error {
  constructor() {
    super("Tenant WhatsApp is invalid.");
  }
}

function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Profil gerai: the name (Super Admin owns it) and the WhatsApp the owner may change. */
export async function loadTenantProfile(tx: TenantTransaction, context: TenantContext) {
  const [row] = await tx
    .select({ name: schema.tenants.name, contactWhatsapp: schema.tenants.contactWhatsapp })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, context.tenantId))
    .limit(1);
  if (!row) throw new TenantSettingsDeniedError();
  return row;
}

/**
 * T-233: the definer function checks an active Tenant Admin of the current tenant, writes
 * only `contact_whatsapp` and audits a change. Invoices already issued keep the number in
 * their snapshot (DATA-14); shipments already created keep their sender party.
 */
export async function saveTenantContactWhatsapp(
  tx: TenantTransaction,
  context: TenantContext,
  whatsapp: string,
) {
  if (context.role !== "TENANT_ADMIN") throw new TenantSettingsDeniedError();
  try {
    await tx.execute(sql`SELECT public.set_tenant_contact_whatsapp(${whatsapp})`);
  } catch (error) {
    const state = sqlState(error);
    if (state === "22023") throw new TenantContactInvalidError();
    if (state === "42501") throw new TenantSettingsDeniedError();
    throw error;
  }
}

/** T-229: the saved choice per size; a size without a row prints the defaults. */
export async function loadTenantLabelFields(
  tx: TenantTransaction,
  context: TenantContext,
): Promise<LabelFieldsBySize> {
  const rows = await tx
    .select()
    .from(schema.tenantLabelSettings)
    .where(eq(schema.tenantLabelSettings.tenantId, context.tenantId));
  const result: LabelFieldsBySize = { ...DEFAULT_LABEL_FIELDS_BY_SIZE };
  for (const row of rows) {
    result[row.labelSize] = {
      senderAddress: row.showSenderAddress,
      senderPhone: row.showSenderPhone,
      recipientName: row.showRecipientName,
      recipientPhone: row.showRecipientPhone,
      recipientAddressDetail: row.showRecipientAddressDetail,
      returnWarning: row.showReturnWarning,
      courierLogo: row.showCourierLogo,
      geraiLogo: row.showGeraiLogo,
      labelNote: row.showLabelNote,
    };
  }
  return result;
}

/** Both sizes in one upsert each; RLS also requires an active Tenant Admin of this tenant. */
export async function saveTenantLabelFields(
  tx: TenantTransaction,
  context: TenantContext,
  fields: LabelFieldsBySize,
) {
  if (context.role !== "TENANT_ADMIN") throw new TenantSettingsDeniedError();
  for (const size of Object.keys(LABEL_SIZES) as LabelSize[]) {
    const choice = { ...DEFAULT_LABEL_FIELDS, ...fields[size] };
    const values = {
      showSenderAddress: choice.senderAddress,
      showSenderPhone: choice.senderPhone,
      showRecipientName: choice.recipientName,
      showRecipientPhone: choice.recipientPhone,
      showRecipientAddressDetail: choice.recipientAddressDetail,
      showReturnWarning: choice.returnWarning,
      showCourierLogo: choice.courierLogo,
      showGeraiLogo: choice.geraiLogo,
      showLabelNote: choice.labelNote,
      updatedByUserId: context.userId,
      updatedAt: new Date(),
    };
    try {
      await tx
        .insert(schema.tenantLabelSettings)
        .values({ tenantId: context.tenantId, labelSize: size, ...values })
        .onConflictDoUpdate({
          target: [schema.tenantLabelSettings.tenantId, schema.tenantLabelSettings.labelSize],
          set: values,
        });
    } catch (error) {
      if (sqlState(error) === "42501") throw new TenantSettingsDeniedError();
      throw error;
    }
  }
}

// ------------------------------------------------------------------ T-243

/** A logo, a courier choice or another brand value the rules refuse. */
export class TenantSettingsInvalidError extends Error {
  constructor() {
    super("Tenant settings value is invalid.");
  }
}

export type TenantBrand = {
  businessCategory: BusinessCategory | null;
  csEmail: string | null;
  labelNote: string | null;
  website: string | null;
  defaultLabelSize: LabelSize;
  disabledCouriers: string[];
  logo: { mime: LogoMime; sha256: string; updatedAt: Date } | null;
};

const EMPTY_BRAND: TenantBrand = {
  businessCategory: null,
  csEmail: null,
  labelNote: null,
  website: null,
  defaultLabelSize: DEFAULT_LABEL_SIZE,
  disabledCouriers: [],
  logo: null,
};

/** Profil gerai & brand without the logo bytes; a tenant without a row reads the defaults. */
export async function loadTenantBrand(tx: TenantTransaction, context: TenantContext): Promise<TenantBrand> {
  const [row] = await tx
    .select({
      businessCategory: schema.tenantBrandSettings.businessCategory,
      csEmail: schema.tenantBrandSettings.csEmail,
      labelNote: schema.tenantBrandSettings.labelNote,
      website: schema.tenantBrandSettings.website,
      defaultLabelSize: schema.tenantBrandSettings.defaultLabelSize,
      disabledCouriers: schema.tenantBrandSettings.disabledCouriers,
      logoMime: schema.tenantBrandSettings.logoMime,
      logoSha256: schema.tenantBrandSettings.logoSha256,
      logoUpdatedAt: schema.tenantBrandSettings.logoUpdatedAt,
    })
    .from(schema.tenantBrandSettings)
    .where(eq(schema.tenantBrandSettings.tenantId, context.tenantId))
    .limit(1);
  if (!row) return { ...EMPTY_BRAND };
  return {
    businessCategory: row.businessCategory,
    csEmail: row.csEmail,
    labelNote: row.labelNote,
    website: row.website,
    defaultLabelSize: row.defaultLabelSize,
    disabledCouriers: row.disabledCouriers,
    logo: row.logoMime && row.logoSha256 && row.logoUpdatedAt
      ? { mime: row.logoMime, sha256: row.logoSha256, updatedAt: new Date(row.logoUpdatedAt) }
      : null,
  };
}

/** What a label or invoice needs to print the brand: the logo URL, the catatan and the default size. */
export async function loadPrintBrand(tx: TenantTransaction, context: TenantContext) {
  const brand = await loadTenantBrand(tx, context);
  return {
    defaultLabelSize: brand.defaultLabelSize,
    logoSrc: geraiLogoSrc(brand.logo?.sha256 ?? null),
    note: brand.labelNote,
  };
}

/** The logo bytes for the authenticated route; RLS and the tenant filter keep it to this tenant. */
export async function loadTenantLogo(tx: TenantTransaction, context: TenantContext) {
  const [row] = await tx
    .select({
      bytes: schema.tenantBrandSettings.logoBytes,
      mime: schema.tenantBrandSettings.logoMime,
      sha256: schema.tenantBrandSettings.logoSha256,
    })
    .from(schema.tenantBrandSettings)
    .where(eq(schema.tenantBrandSettings.tenantId, context.tenantId))
    .limit(1);
  if (!row?.bytes || !row.mime || !row.sha256) return null;
  return { bytes: row.bytes, mime: row.mime, sha256: row.sha256 };
}

/**
 * One upsert that writes only the columns this save owns; the first save creates the row.
 * RLS also requires an active Tenant Admin of this tenant.
 */
async function upsertBrand(
  tx: TenantTransaction,
  context: TenantContext,
  values: Partial<typeof schema.tenantBrandSettings.$inferInsert>,
) {
  if (context.role !== "TENANT_ADMIN") throw new TenantSettingsDeniedError();
  const set = { ...values, updatedByUserId: context.userId, updatedAt: new Date() };
  try {
    await tx
      .insert(schema.tenantBrandSettings)
      .values({ tenantId: context.tenantId, ...set })
      .onConflictDoUpdate({ target: schema.tenantBrandSettings.tenantId, set });
  } catch (error) {
    if (sqlState(error) === "42501") throw new TenantSettingsDeniedError();
    throw error;
  }
}

export async function saveTenantBrandProfile(tx: TenantTransaction, context: TenantContext, profile: GeraiProfileInput) {
  await upsertBrand(tx, context, {
    businessCategory: profile.businessCategory,
    csEmail: profile.csEmail,
    labelNote: profile.labelNote,
    website: profile.website,
  });
}

/** Validates the bytes again (the action is not the only caller) and stores them with their hash. */
export async function saveTenantLogo(
  tx: TenantTransaction,
  context: TenantContext,
  upload: { bytes: Uint8Array; declaredType: string; name: string },
) {
  const checked = validateLogoUpload(upload);
  if (!checked.ok) throw new TenantSettingsInvalidError();
  const bytes = Buffer.from(upload.bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await upsertBrand(tx, context, { logoBytes: bytes, logoMime: checked.logo.mime, logoSha256: sha256, logoUpdatedAt: new Date() });
  // T-247 (L3): keep every saved version (content-addressed), so an issued invoice can still
  // render the logo it was issued with after this one is replaced or removed.
  await tx
    .insert(schema.tenantLogoVersions)
    .values({ tenantId: context.tenantId, sha256, bytes, mime: checked.logo.mime, createdByUserId: context.userId })
    .onConflictDoNothing({ target: [schema.tenantLogoVersions.tenantId, schema.tenantLogoVersions.sha256] });
  return { sha256 };
}

/** T-247 (L3): one saved logo version of the session's tenant; RLS and the tenant filter keep it there. */
export async function loadTenantLogoVersion(tx: TenantTransaction, context: TenantContext, sha256: string) {
  if (!LOGO_SHA256_PATTERN.test(sha256)) return null;
  const [row] = await tx
    .select({ bytes: schema.tenantLogoVersions.bytes, mime: schema.tenantLogoVersions.mime, sha256: schema.tenantLogoVersions.sha256 })
    .from(schema.tenantLogoVersions)
    .where(and(eq(schema.tenantLogoVersions.tenantId, context.tenantId), eq(schema.tenantLogoVersions.sha256, sha256)))
    .limit(1);
  return row ?? null;
}

export async function removeTenantLogo(tx: TenantTransaction, context: TenantContext) {
  await upsertBrand(tx, context, { logoBytes: null, logoMime: null, logoSha256: null, logoUpdatedAt: null });
}

export async function saveTenantCourierPreferences(
  tx: TenantTransaction,
  context: TenantContext,
  disabledCouriers: readonly string[],
) {
  const valid = [...new Set(disabledCouriers)].filter((courier) => (SELECTABLE_COURIERS as readonly string[]).includes(courier));
  // At least one courier stays on, or Cek tarif and Buat kiriman could offer nothing.
  if (valid.length !== disabledCouriers.length || valid.length >= SELECTABLE_COURIERS.length) {
    throw new TenantSettingsInvalidError();
  }
  await upsertBrand(tx, context, { disabledCouriers: valid });
}

export async function saveTenantDefaultLabelSize(tx: TenantTransaction, context: TenantContext, size: LabelSize) {
  await upsertBrand(tx, context, { defaultLabelSize: size });
}

/** The switched-off couriers only (Cek tarif, Buat kiriman). */
export async function loadTenantDisabledCouriers(tx: TenantTransaction, context: TenantContext) {
  const [row] = await tx
    .select({ disabled: schema.tenantBrandSettings.disabledCouriers })
    .from(schema.tenantBrandSettings)
    .where(eq(schema.tenantBrandSettings.tenantId, context.tenantId))
    .limit(1);
  return row?.disabled ?? [];
}
