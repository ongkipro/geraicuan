import "server-only";

import { eq, sql } from "drizzle-orm";

import * as schema from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import {
  DEFAULT_LABEL_FIELDS,
  DEFAULT_LABEL_FIELDS_BY_SIZE,
  type LabelFieldsBySize,
} from "@/lib/label-fields";
import { LABEL_SIZES, type LabelSize } from "@/lib/label-size";

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
