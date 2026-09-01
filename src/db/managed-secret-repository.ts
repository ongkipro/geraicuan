import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { mengantarSecretReference } from "@/db/outlet-readiness-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import {
  auditEvents,
  managedSecretPayloads,
  mengantarConnections,
  outlets,
} from "@/db/schema";

const MANAGED_SECRET_PURPOSE = "MENGANTAR_API_KEY" as const;
const ENCRYPTION_KEY_VERSION = 1;
const NONCE_BYTES = 12;
const AUTHENTICATION_TAG_BYTES = 16;
const MAX_API_KEY_CHARACTERS = 512;
const MAX_CREDENTIAL_ATTEMPTS = 5;
const CREDENTIAL_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class ManagedMengantarSecretDeniedError extends Error {
  constructor() {
    super("Mengantar credential mutation is not authorized.");
  }
}

export class ManagedMengantarSecretInvalidError extends Error {
  constructor() {
    super("Mengantar credential input is invalid.");
  }
}

export class ManagedMengantarSecretUnavailableError extends Error {
  constructor() {
    super("Mengantar credential is unavailable.");
  }
}

export class ManagedMengantarSecretRateLimitedError extends Error {
  constructor() {
    super("Mengantar credential mutation rate limit exceeded.");
  }
}

type EncryptionEnvelope = {
  authenticationTag: string;
  ciphertext: string;
  keyVersion: number;
  nonce: string;
};

function requireTenantAdmin(context: TenantContext) {
  if (context.role !== "TENANT_ADMIN") {
    throw new ManagedMengantarSecretDeniedError();
  }
}

function requireOutletId(outletId: string) {
  if (!UUID_PATTERN.test(outletId)) {
    throw new ManagedMengantarSecretInvalidError();
  }
}

function canonicalBase64(value: string, expectedBytes?: number) {
  if (!value || !BASE64_PATTERN.test(value)) {
    throw new ManagedMengantarSecretUnavailableError();
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.length === 0
    || (expectedBytes !== undefined && decoded.length !== expectedBytes)
    || decoded.toString("base64") !== value
  ) {
    decoded.fill(0);
    throw new ManagedMengantarSecretUnavailableError();
  }
  return decoded;
}

function runtimeEncryptionKey() {
  const encoded = process.env.MENGANTAR_CREDENTIAL_ENCRYPTION_KEY?.trim() ?? "";
  return canonicalBase64(encoded, 32);
}

function additionalAuthenticatedData(
  tenantId: string,
  outletId: string,
  reference: string,
) {
  return Buffer.from(
    [
      `version:${ENCRYPTION_KEY_VERSION}`,
      `purpose:${MANAGED_SECRET_PURPOSE}`,
      `tenant:${tenantId}`,
      `outlet:${outletId}`,
      `reference:${reference}`,
    ].join("\n"),
    "utf8",
  );
}

function normalizeApiKey(apiKey: string) {
  const normalized = apiKey.trim();
  if (
    normalized.length === 0
    || normalized.length > MAX_API_KEY_CHARACTERS
    || CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    throw new ManagedMengantarSecretInvalidError();
  }
  return normalized;
}

function encryptApiKey(
  apiKey: string,
  tenantId: string,
  outletId: string,
  reference: string,
): EncryptionEnvelope {
  const key = runtimeEncryptionKey();
  const nonce = randomBytes(NONCE_BYTES);
  const plaintext = Buffer.from(apiKey, "utf8");
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce, {
      authTagLength: AUTHENTICATION_TAG_BYTES,
    });
    cipher.setAAD(additionalAuthenticatedData(tenantId, outletId, reference));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();
    return {
      authenticationTag: authenticationTag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      keyVersion: ENCRYPTION_KEY_VERSION,
      nonce: nonce.toString("base64"),
    };
  } catch {
    throw new ManagedMengantarSecretUnavailableError();
  } finally {
    key.fill(0);
    plaintext.fill(0);
  }
}

function decryptApiKey(
  envelope: EncryptionEnvelope,
  tenantId: string,
  outletId: string,
  reference: string,
) {
  if (envelope.keyVersion !== ENCRYPTION_KEY_VERSION) {
    throw new ManagedMengantarSecretUnavailableError();
  }

  const key = runtimeEncryptionKey();
  let nonce: Buffer | undefined;
  let authenticationTag: Buffer | undefined;
  let ciphertext: Buffer | undefined;
  try {
    nonce = canonicalBase64(envelope.nonce, NONCE_BYTES);
    authenticationTag = canonicalBase64(
      envelope.authenticationTag,
      AUTHENTICATION_TAG_BYTES,
    );
    ciphertext = canonicalBase64(envelope.ciphertext);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, {
      authTagLength: AUTHENTICATION_TAG_BYTES,
    });
    decipher.setAAD(additionalAuthenticatedData(tenantId, outletId, reference));
    decipher.setAuthTag(authenticationTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    try {
      return normalizeApiKey(plaintext.toString("utf8"));
    } finally {
      plaintext.fill(0);
    }
  } catch {
    throw new ManagedMengantarSecretUnavailableError();
  } finally {
    key.fill(0);
    nonce?.fill(0);
    authenticationTag?.fill(0);
    ciphertext?.fill(0);
  }
}

async function lockOwnedOutlet(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
) {
  const [outlet] = await tx
    .select({ id: outlets.id })
    .from(outlets)
    .where(
      and(
        eq(outlets.id, outletId),
        eq(outlets.tenantId, context.tenantId),
      ),
    )
    .limit(1)
    .for("update");
  if (!outlet) {
    throw new ManagedMengantarSecretDeniedError();
  }
  return outlet;
}

async function consumeCredentialMutationRateLimit(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
) {
  const now = Date.now();
  const windowStart = now - CREDENTIAL_ATTEMPT_WINDOW_MS;
  const result = await tx.execute<{ count: number }>(sql`
    INSERT INTO mengantar_credential_rate_limits (
      tenant_id,
      outlet_id,
      actor_id,
      count,
      last_request
    )
    VALUES (${context.tenantId}, ${outletId}, ${context.userId}, 1, ${now})
    ON CONFLICT (tenant_id, outlet_id, actor_id) DO UPDATE
    SET count = CASE
          WHEN mengantar_credential_rate_limits.last_request <= ${windowStart} THEN 1
          ELSE mengantar_credential_rate_limits.count + 1
        END,
        last_request = ${now}
    WHERE mengantar_credential_rate_limits.last_request <= ${windowStart}
       OR mengantar_credential_rate_limits.count < ${MAX_CREDENTIAL_ATTEMPTS}
    RETURNING count
  `);
  if (result.rows.length !== 1) {
    throw new ManagedMengantarSecretRateLimitedError();
  }
}

export async function replaceManagedMengantarApiKey(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
  readApiKey: () => string,
) {
  requireTenantAdmin(context);
  requireOutletId(outletId);
  await lockOwnedOutlet(tx, context, outletId);

  // The callback is deliberately invoked only after role and object authorization.
  const apiKey = normalizeApiKey(readApiKey());
  const reference = mengantarSecretReference(context.tenantId, outletId);
  const envelope = encryptApiKey(apiKey, context.tenantId, outletId, reference);
  const [existingConnection] = await tx
    .select({ id: mengantarConnections.id })
    .from(mengantarConnections)
    .where(
      and(
        eq(mengantarConnections.tenantId, context.tenantId),
        eq(mengantarConnections.outletId, outletId),
      ),
    )
    .limit(1);
  const updatedAt = new Date();

  await tx
    .insert(managedSecretPayloads)
    .values({
      ...envelope,
      outletId,
      purpose: MANAGED_SECRET_PURPOSE,
      reference,
      tenantId: context.tenantId,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [
        managedSecretPayloads.tenantId,
        managedSecretPayloads.outletId,
        managedSecretPayloads.purpose,
      ],
      set: {
        ...envelope,
        reference,
        updatedAt,
      },
    });

  await tx
    .insert(mengantarConnections)
    .values({
      outletId,
      secretReference: reference,
      tenantId: context.tenantId,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: mengantarConnections.outletId,
      set: { secretReference: reference, updatedAt },
    });

  await tx.insert(auditEvents).values({
    action: existingConnection
      ? "MENGANTAR_CREDENTIAL_REPLACED"
      : "MENGANTAR_CREDENTIAL_CREATED",
    actorId: context.userId,
    actorRole: "TENANT_MEMBER",
    metadata: {
      connectionSource: "private",
      credentialChange: existingConnection ? "replaced" : "created",
    },
    outcome: "SUCCESS",
    targetId: outletId,
    targetType: "OUTLET",
    tenantId: context.tenantId,
  });
}

export async function restorePlatformDefaultMengantarConnection(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
  assertPlatformDefaultComplete: () => void,
) {
  requireTenantAdmin(context);
  requireOutletId(outletId);
  await lockOwnedOutlet(tx, context, outletId);
  assertPlatformDefaultComplete();

  const connection = await tx
    .delete(mengantarConnections)
    .where(
      and(
        eq(mengantarConnections.tenantId, context.tenantId),
        eq(mengantarConnections.outletId, outletId),
      ),
    )
    .returning({ id: mengantarConnections.id });
  if (connection.length === 0) {
    return false;
  }

  await tx
    .delete(managedSecretPayloads)
    .where(
      and(
        eq(managedSecretPayloads.tenantId, context.tenantId),
        eq(managedSecretPayloads.outletId, outletId),
        eq(managedSecretPayloads.purpose, MANAGED_SECRET_PURPOSE),
      ),
    );
  await tx.insert(auditEvents).values({
    action: "MENGANTAR_PLATFORM_DEFAULT_RESTORED",
    actorId: context.userId,
    actorRole: "TENANT_MEMBER",
    metadata: {
      connectionSource: "platform_default",
      credentialChange: "removed",
    },
    outcome: "SUCCESS",
    targetId: outletId,
    targetType: "OUTLET",
    tenantId: context.tenantId,
  });
  return true;
}

export async function authorizeManagedMengantarCredentialMutation(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
) {
  requireTenantAdmin(context);
  requireOutletId(outletId);
  await lockOwnedOutlet(tx, context, outletId);
  await consumeCredentialMutationRateLimit(tx, context, outletId);
}

export async function loadManagedMengantarApiKey(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
  reference: string,
) {
  requireOutletId(outletId);
  const canonicalReference = mengantarSecretReference(context.tenantId, outletId);
  if (reference !== canonicalReference) {
    throw new ManagedMengantarSecretUnavailableError();
  }

  const [payload] = await tx
    .select({
      authenticationTag: managedSecretPayloads.authenticationTag,
      ciphertext: managedSecretPayloads.ciphertext,
      keyVersion: managedSecretPayloads.keyVersion,
      nonce: managedSecretPayloads.nonce,
    })
    .from(managedSecretPayloads)
    .where(
      and(
        eq(managedSecretPayloads.reference, canonicalReference),
        eq(managedSecretPayloads.tenantId, context.tenantId),
        eq(managedSecretPayloads.outletId, outletId),
        eq(managedSecretPayloads.purpose, MANAGED_SECRET_PURPOSE),
      ),
    )
    .limit(1);
  if (!payload) {
    throw new ManagedMengantarSecretUnavailableError();
  }

  return decryptApiKey(
    payload,
    context.tenantId,
    outletId,
    canonicalReference,
  );
}
