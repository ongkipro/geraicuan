import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { auditEvents, mengantarConnections, outlets } from "@/db/schema";

export const outletConnectionModes = ["platform_default", "private"] as const;
export type OutletConnectionMode = (typeof outletConnectionModes)[number];

export type OutletReadiness = {
  id: string;
  name: string;
  defaultPickupAddressId: string | null;
  defaultPickupAddressLabel: string | null;
  defaultOriginAreaId: string | null;
  defaultOriginAreaLabel: string | null;
  connectionIssue: "authentication" | "provider_unavailable" | "secret_unavailable" | null;
  connectionSource: "platform_default" | "private";
  connectionStatus: "platform_default" | "private_ready" | "private_attention";
  connectionUpdatedAt: Date | null;
  readinessStatus: "ready" | "needs_attention";
  updatedAt: Date;
};

export type OutletReadinessSummary = {
  id: string;
  name: string;
  ready: boolean;
};

export type ReadyShipmentOutlet = {
  id: string;
  name: string;
};

export type OutletReadinessUpdate = {
  outletId: string;
  defaultPickupAddressId: string;
  defaultPickupAddressLabel: string;
  defaultOriginAreaId: string;
  defaultOriginAreaLabel: string;
  connectionMode: OutletConnectionMode;
  expectedConnectionUpdatedAt: Date | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_OPAQUE_IDENTIFIER_LENGTH = 160;
const MAX_LOCATION_LABEL_LENGTH = 320;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

export class OutletSettingsDeniedError extends Error {
  constructor() {
    super("Outlet settings are not authorized.");
  }
}

export class OutletSettingsInvalidError extends Error {
  constructor() {
    super("Outlet settings are invalid.");
  }
}

export class OutletConnectionModeUnavailableError extends Error {
  constructor() {
    super("The submitted connection mode does not match the managed connection state.");
  }
}

export function mengantarSecretReference(tenantId: string, outletId: string) {
  return `managed://mengantar/${tenantId}/${outletId}`;
}

function requireTenantAdmin(context: TenantContext) {
  if (context.role !== "TENANT_ADMIN") {
    throw new OutletSettingsDeniedError();
  }
}

function normalizeOpaqueIdentifier(value: string) {
  const normalized = value.trim();
  if (
    normalized.length === 0
    || normalized.length > MAX_OPAQUE_IDENTIFIER_LENGTH
    || CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    throw new OutletSettingsInvalidError();
  }
  return normalized;
}

function normalizeLocationLabel(value: string) {
  const normalized = value.trim();
  if (
    normalized.length === 0
    || normalized.length > MAX_LOCATION_LABEL_LENGTH
    || CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    throw new OutletSettingsInvalidError();
  }
  return normalized;
}

async function loadOutletReadiness(
  tx: TenantTransaction,
  context: TenantContext,
): Promise<OutletReadiness[]> {
  const rows = await tx
    .select({
      id: outlets.id,
      name: outlets.name,
      defaultPickupAddressId: outlets.defaultPickupAddressId,
      defaultPickupAddressLabel: outlets.defaultPickupAddressLabel,
      defaultOriginAreaId: outlets.defaultOriginAreaId,
      defaultOriginAreaLabel: outlets.defaultOriginAreaLabel,
      hasPrivateConnection: sql<boolean>`${mengantarConnections.id} is not null`,
      hasCanonicalPrivateConnection: sql<boolean>`coalesce(
        ${mengantarConnections.secretReference} = (
          'managed://mengantar/'
          || ${mengantarConnections.tenantId}::text
          || '/'
          || ${mengantarConnections.outletId}::text
        ),
        false
      )`,
      connectionUpdatedAt: mengantarConnections.updatedAt,
      updatedAt: sql<Date>`greatest(
        ${outlets.updatedAt},
        coalesce(${mengantarConnections.updatedAt}, ${outlets.updatedAt})
      )`,
    })
    .from(outlets)
    .leftJoin(
      mengantarConnections,
      and(
        eq(mengantarConnections.outletId, outlets.id),
        eq(mengantarConnections.tenantId, outlets.tenantId),
      ),
    )
    .where(eq(outlets.tenantId, context.tenantId))
    .orderBy(asc(outlets.name), asc(outlets.id));

  return rows.map((row) => {
    const connectionStatus = !row.hasPrivateConnection
      ? "platform_default" as const
      : row.hasCanonicalPrivateConnection
        ? "private_ready" as const
        : "private_attention" as const;
    return {
      id: row.id,
      name: row.name,
      defaultPickupAddressId: row.defaultPickupAddressId,
      defaultPickupAddressLabel: row.defaultPickupAddressLabel,
      defaultOriginAreaId: row.defaultOriginAreaId,
      defaultOriginAreaLabel: row.defaultOriginAreaLabel,
      connectionIssue:
        connectionStatus === "private_attention" ? "secret_unavailable" as const : null,
      connectionSource: row.hasPrivateConnection ? "private" : "platform_default",
      connectionStatus,
      connectionUpdatedAt: row.connectionUpdatedAt
        ? new Date(row.connectionUpdatedAt)
        : null,
      readinessStatus:
        row.defaultPickupAddressId
        && row.defaultOriginAreaId
        && connectionStatus !== "private_attention"
          ? "ready"
          : "needs_attention",
      updatedAt: new Date(row.updatedAt),
    };
  });
}

export async function listOutletReadiness(
  tx: TenantTransaction,
  context: TenantContext,
): Promise<OutletReadiness[]> {
  requireTenantAdmin(context);
  return loadOutletReadiness(tx, context);
}

export async function listOutletReadinessSummary(
  tx: TenantTransaction,
  context: TenantContext,
): Promise<OutletReadinessSummary[]> {
  const rows = await loadOutletReadiness(tx, context);
  return rows.map(({ id, name, readinessStatus }) => ({
    id,
    name,
    ready: readinessStatus === "ready",
  }));
}

export async function listReadyShipmentOutlets(
  tx: TenantTransaction,
  context: TenantContext,
): Promise<ReadyShipmentOutlet[]> {
  const rows = await loadOutletReadiness(tx, context);
  return rows
    .filter(({ readinessStatus }) => readinessStatus === "ready")
    .map(({ id, name }) => ({ id, name }));
}

export async function requireReadyShipmentOutlet(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
): Promise<string | null> {
  const outlets = await listReadyShipmentOutlets(tx, context);
  return outlets.some((outlet) => outlet.id === outletId) ? outletId : null;
}

export async function updateOutletReadiness(
  tx: TenantTransaction,
  context: TenantContext,
  input: OutletReadinessUpdate,
): Promise<void> {
  requireTenantAdmin(context);
  if (!UUID_PATTERN.test(input.outletId)) {
    throw new OutletSettingsInvalidError();
  }
  if (!outletConnectionModes.includes(input.connectionMode)) {
    throw new OutletSettingsInvalidError();
  }

  const defaultPickupAddressId = normalizeOpaqueIdentifier(
    input.defaultPickupAddressId,
  );
  const defaultOriginAreaId = normalizeOpaqueIdentifier(input.defaultOriginAreaId);
  const defaultPickupAddressLabel = normalizeLocationLabel(
    input.defaultPickupAddressLabel,
  );
  const defaultOriginAreaLabel = normalizeLocationLabel(input.defaultOriginAreaLabel);
  const [outlet] = await tx
    .select({
      defaultOriginAreaId: outlets.defaultOriginAreaId,
      defaultOriginAreaLabel: outlets.defaultOriginAreaLabel,
      defaultPickupAddressId: outlets.defaultPickupAddressId,
      defaultPickupAddressLabel: outlets.defaultPickupAddressLabel,
      id: outlets.id,
    })
    .from(outlets)
    .where(
      and(
        eq(outlets.id, input.outletId),
        eq(outlets.tenantId, context.tenantId),
      ),
    )
    .limit(1)
    .for("update");
  if (!outlet) {
    throw new OutletSettingsDeniedError();
  }

  const [existingConnection] = await tx
    .select({
      id: mengantarConnections.id,
      updatedAt: mengantarConnections.updatedAt,
    })
    .from(mengantarConnections)
    .where(
      and(
        eq(mengantarConnections.outletId, outlet.id),
        eq(mengantarConnections.tenantId, context.tenantId),
      ),
    )
    .limit(1);
  const authoritativeConnectionMode = existingConnection
    ? "private" as const
    : "platform_default" as const;
  if (input.connectionMode !== authoritativeConnectionMode) {
    throw new OutletConnectionModeUnavailableError();
  }
  const authoritativeConnectionUpdatedAt = existingConnection?.updatedAt
    ? new Date(existingConnection.updatedAt).getTime()
    : null;
  if (
    authoritativeConnectionUpdatedAt
    !== (input.expectedConnectionUpdatedAt?.getTime() ?? null)
  ) {
    throw new OutletConnectionModeUnavailableError();
  }

  if (
    outlet.defaultOriginAreaId === defaultOriginAreaId
    && outlet.defaultPickupAddressId === defaultPickupAddressId
    && outlet.defaultOriginAreaLabel === defaultOriginAreaLabel
    && outlet.defaultPickupAddressLabel === defaultPickupAddressLabel
  ) {
    return;
  }

  const updatedAt = new Date();
  const changedFields = [
    outlet.defaultPickupAddressId === defaultPickupAddressId ? null : "defaultPickupAddressId",
    outlet.defaultPickupAddressLabel === defaultPickupAddressLabel
      ? null
      : "defaultPickupAddressLabel",
    outlet.defaultOriginAreaId === defaultOriginAreaId ? null : "defaultOriginAreaId",
    outlet.defaultOriginAreaLabel === defaultOriginAreaLabel ? null : "defaultOriginAreaLabel",
  ].filter((field): field is string => field !== null);
  await tx
    .update(outlets)
    .set({
      defaultOriginAreaId,
      defaultOriginAreaLabel,
      defaultPickupAddressId,
      defaultPickupAddressLabel,
      mengantarAuthorityVersion: sql`${outlets.mengantarAuthorityVersion} + 1`,
      updatedAt,
    })
    .where(
      and(
        eq(outlets.id, outlet.id),
        eq(outlets.tenantId, context.tenantId),
      ),
    );

  await tx.insert(auditEvents).values({
    actorId: context.userId,
    actorRole: "TENANT_MEMBER",
    tenantId: context.tenantId,
    action: "OUTLET_SETTINGS_CHANGED",
    targetType: "OUTLET",
    targetId: outlet.id,
    outcome: "SUCCESS",
    metadata: {
      changedFields,
      connectionSource: authoritativeConnectionMode,
    },
  });

}
