import "server-only";

import { and, eq } from "drizzle-orm";

import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import * as schema from "@/db/schema";

export type MengantarCredentials = {
  apiKey: string;
  baseUrl: string;
  originAreaId: string;
  pickupAddressId: string;
};

export type ManagedSecretLoader = (reference: string) => Promise<MengantarCredentials>;

export class MengantarConfigurationError extends Error {
  constructor() {
    super("Mengantar configuration is unavailable.");
  }
}

function requireCompleteCredentials(value: MengantarCredentials) {
  let baseUrl: URL;
  try {
    baseUrl = new URL(value.baseUrl);
  } catch {
    throw new MengantarConfigurationError();
  }

  if (
    !value.apiKey.trim()
    || baseUrl.protocol !== "https:"
    || !baseUrl.hostname
    || !value.originAreaId.trim()
    || !value.pickupAddressId.trim()
  ) {
    throw new MengantarConfigurationError();
  }

  return value;
}

function platformCredentials(): MengantarCredentials {
  return requireCompleteCredentials({
    apiKey: process.env.MENGANTAR_API_KEY ?? "",
    baseUrl: process.env.MENGANTAR_BASE_URL ?? "",
    originAreaId: process.env.MENGANTAR_ORIGIN_AREA_ID ?? "",
    pickupAddressId: process.env.MENGANTAR_PICKUP_ADDRESS_ID ?? "",
  });
}

export async function resolveMengantarCredentials(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
  loadSecret: ManagedSecretLoader,
): Promise<{ credentials: MengantarCredentials; source: "private" | "platform_default" }> {
  const outlet = await tx
    .select({ id: schema.outlets.id })
    .from(schema.outlets)
    .where(
      and(
        eq(schema.outlets.id, outletId),
        eq(schema.outlets.tenantId, context.tenantId),
      ),
    )
    .limit(1);
  if (outlet.length !== 1) {
    throw new MengantarConfigurationError();
  }

  const connection = await tx
    .select({ secretReference: schema.mengantarConnections.secretReference })
    .from(schema.mengantarConnections)
    .where(
      and(
        eq(schema.mengantarConnections.tenantId, context.tenantId),
        eq(schema.mengantarConnections.outletId, outletId),
      ),
    )
    .limit(1);

  if (connection.length === 1) {
    const expectedReference = `managed://mengantar/${context.tenantId}/${outlet[0].id}`;
    if (connection[0].secretReference !== expectedReference) {
      throw new MengantarConfigurationError();
    }

    return {
      credentials: requireCompleteCredentials(await loadSecret(expectedReference)),
      source: "private",
    };
  }

  return { credentials: platformCredentials(), source: "platform_default" };
}
