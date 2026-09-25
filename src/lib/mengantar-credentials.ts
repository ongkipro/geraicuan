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

export type MengantarAccountCredentials = Pick<
  MengantarCredentials,
  "apiKey" | "baseUrl" | "pickupAddressId"
>;

export type MengantarAccountAuthority = {
  connectionUpdatedAt: Date | null;
  version: number;
  source: "private" | "platform_default";
};

export function sameMengantarAccountAuthority(
  first: MengantarAccountAuthority,
  second: MengantarAccountAuthority,
) {
  return first.source === second.source
    && first.version === second.version
    && (first.connectionUpdatedAt?.getTime() ?? null)
      === (second.connectionUpdatedAt?.getTime() ?? null);
}

export async function lockMengantarAccountAuthority(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
) {
  const [outlet] = await tx
    .select({ id: schema.outlets.id })
    .from(schema.outlets)
    .where(
      and(
        eq(schema.outlets.id, outletId),
        eq(schema.outlets.tenantId, context.tenantId),
      ),
    )
    .limit(1)
    .for("update");
  if (!outlet) throw new MengantarConfigurationError();
  return loadMengantarAccountAuthority(tx, context, outletId);
}

export async function loadMengantarAccountAuthority(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
): Promise<MengantarAccountAuthority> {
  const [outlet] = await tx
    .select({
      id: schema.outlets.id,
      version: schema.outlets.mengantarAuthorityVersion,
    })
    .from(schema.outlets)
    .where(
      and(
        eq(schema.outlets.id, outletId),
        eq(schema.outlets.tenantId, context.tenantId),
      ),
    )
    .limit(1);
  if (!outlet) throw new MengantarConfigurationError();

  const [connection] = await tx
    .select({
      secretReference: schema.mengantarConnections.secretReference,
      updatedAt: schema.mengantarConnections.updatedAt,
    })
    .from(schema.mengantarConnections)
    .where(
      and(
        eq(schema.mengantarConnections.tenantId, context.tenantId),
        eq(schema.mengantarConnections.outletId, outletId),
      ),
    )
    .limit(1);
  if (!connection) {
    await assertTenantMayUsePlatformDefaultMengantar(tx, context);
    return { connectionUpdatedAt: null, source: "platform_default", version: outlet.version };
  }
  if (
    connection.secretReference
    !== mengantarSecretReference(context.tenantId, outletId)
  ) {
    throw new MengantarConfigurationError();
  }
  return {
    connectionUpdatedAt: new Date(connection.updatedAt),
    source: "private",
    version: outlet.version,
  };
}

export class MengantarConfigurationError extends Error {
  constructor() {
    super("Mengantar configuration is unavailable.");
  }
}

/**
 * D-9: the tenant's credential policy forbids the platform-default account, and
 * the outlet has no private connection. A subclass, so every caller that already
 * treats an unconfigured outlet as "not ready" refuses without calling Mengantar.
 */
export class MengantarPlatformCredentialsRefusedError extends MengantarConfigurationError {}

/**
 * Refuses the platform-default Mengantar account for a `PRIVATE_ONLY` tenant.
 * Read inside the caller's tenant transaction, so the policy is the committed
 * value, never a cached or browser-supplied one. A missing row fails closed.
 */
export async function assertTenantMayUsePlatformDefaultMengantar(
  tx: TenantTransaction,
  context: TenantContext,
) {
  const [tenant] = await tx
    .select({ policy: schema.tenants.mengantarCredentialPolicy })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, context.tenantId))
    .limit(1);
  if (tenant?.policy !== "PLATFORM_DEFAULT_ALLOWED") {
    throw new MengantarPlatformCredentialsRefusedError();
  }
}

/** The platform default is complete and this tenant may use it. */
export async function assertPlatformDefaultMengantarCredentialsAvailable(
  tx: TenantTransaction,
  context: TenantContext,
) {
  await assertTenantMayUsePlatformDefaultMengantar(tx, context);
  platformCredentials();
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

function requireAccountCredentials(value: MengantarAccountCredentials) {
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
  const resolved = await resolveMengantarAccountCredentials(tx, context, outletId);
  return {
    credentials: requireCompleteCredentials({
      ...resolved.credentials,
      originAreaId: resolved.originAreaId,
      pickupAddressId: resolved.pickupAddressId,
    }),
    source: resolved.source,
  };
}

export async function resolveMengantarAccountCredentials(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
): Promise<{
  authority: MengantarAccountAuthority;
  credentials: MengantarAccountCredentials;
  originAreaId: string;
  pickupAddressId: string;
  source: "private" | "platform_default";
}> {
  const outlet = await tx
    .select({
      defaultOriginAreaId: schema.outlets.defaultOriginAreaId,
      defaultPickupAddressId: schema.outlets.defaultPickupAddressId,
      id: schema.outlets.id,
      mengantarAuthorityVersion: schema.outlets.mengantarAuthorityVersion,
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
    .select({
      secretReference: schema.mengantarConnections.secretReference,
      updatedAt: schema.mengantarConnections.updatedAt,
    })
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
        authority: {
          connectionUpdatedAt: new Date(connection[0].updatedAt),
          version: outlet[0].mengantarAuthorityVersion,
          source: "private" as const,
        },
        credentials: requireAccountCredentials({
          apiKey: await loadManagedMengantarApiKey(
            tx,
            context,
            outlet[0].id,
            expectedReference,
          ),
          baseUrl: platformBaseUrl(),
          pickupAddressId: outlet[0].defaultPickupAddressId ?? "",
        }),
        originAreaId: outlet[0].defaultOriginAreaId ?? "",
        pickupAddressId: outlet[0].defaultPickupAddressId ?? "",
        source: "private",
      };
    } catch (error) {
      if (error instanceof ManagedMengantarSecretUnavailableError) {
        throw new MengantarConfigurationError();
      }
      throw error;
    }
  }

  await assertTenantMayUsePlatformDefaultMengantar(tx, context);
  const credentials = platformCredentials();
  return {
    authority: {
      connectionUpdatedAt: null,
      version: outlet[0].mengantarAuthorityVersion,
      source: "platform_default",
    },
    credentials,
    originAreaId: credentials.originAreaId,
    pickupAddressId: credentials.pickupAddressId,
    source: "platform_default",
  };
}
