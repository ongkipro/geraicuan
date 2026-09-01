import "server-only";

import { and, eq } from "drizzle-orm";

import {
  loadManagedMengantarApiKey,
  ManagedMengantarSecretUnavailableError,
} from "@/db/managed-secret-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { mengantarSecretReference } from "@/db/outlet-readiness-repository";
import * as schema from "@/db/schema";

export type MengantarCredentials = {
  apiKey: string;
  baseUrl: string;
  originAreaId: string;
  pickupAddressId: string;
};

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
    || Boolean(baseUrl.username)
    || Boolean(baseUrl.password)
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

export function assertPlatformDefaultMengantarCredentialsComplete() {
  platformCredentials();
}

function platformBaseUrl() {
  const value = process.env.MENGANTAR_BASE_URL ?? "";
  let baseUrl: URL;
  try {
    baseUrl = new URL(value);
  } catch {
    throw new MengantarConfigurationError();
  }
  if (
    baseUrl.protocol !== "https:"
    || !baseUrl.hostname
    || Boolean(baseUrl.username)
    || Boolean(baseUrl.password)
  ) {
    throw new MengantarConfigurationError();
  }
  return value;
}

export async function resolveMengantarCredentials(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
): Promise<{ credentials: MengantarCredentials; source: "private" | "platform_default" }> {
  const outlet = await tx
    .select({
      defaultOriginAreaId: schema.outlets.defaultOriginAreaId,
      defaultPickupAddressId: schema.outlets.defaultPickupAddressId,
      id: schema.outlets.id,
    })
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
    const expectedReference = mengantarSecretReference(context.tenantId, outlet[0].id);
    if (connection[0].secretReference !== expectedReference) {
      throw new MengantarConfigurationError();
    }

    try {
      return {
        credentials: requireCompleteCredentials({
          apiKey: await loadManagedMengantarApiKey(
            tx,
            context,
            outlet[0].id,
            expectedReference,
          ),
          baseUrl: platformBaseUrl(),
          originAreaId: outlet[0].defaultOriginAreaId ?? "",
          pickupAddressId: outlet[0].defaultPickupAddressId ?? "",
        }),
        source: "private",
      };
    } catch (error) {
      if (error instanceof ManagedMengantarSecretUnavailableError) {
        throw new MengantarConfigurationError();
      }
      throw error;
    }
  }

  return { credentials: platformCredentials(), source: "platform_default" };
}
