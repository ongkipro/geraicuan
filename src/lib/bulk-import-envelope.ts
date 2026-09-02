import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import type { ShipmentDraftInput } from "@/lib/shipment-draft";

const ENVELOPE_TTL_MS = 15 * 60 * 1000;
const MAX_TOKEN_LENGTH = 16_384;
const ENVELOPE_VERSION = "v3";
const ENVELOPE_PURPOSE = "geraicuan:bulk-import:v3";
const ENVELOPE_AAD = Buffer.from(ENVELOPE_PURPOSE, "utf8");
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BulkImportEnvelopePayload = {
  actorId: string;
  destinationQuery: string;
  expiresAt: number;
  input: ShipmentDraftInput;
  row: number;
  submissionId: string;
  tenantId: string;
  version: 3;
};

type EnvelopeContext = { actorId: string; tenantId: string };

export class BulkImportEnvelopeError extends Error {
  constructor() {
    super("Bulk import preview is unavailable.");
  }
}

function encryptionKey() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new BulkImportEnvelopeError();
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.alloc(0),
    ENVELOPE_PURPOSE,
    32,
  ));
}

export function createBulkImportEnvelope(
  context: EnvelopeContext,
  submissionId: string,
  row: number,
  input: ShipmentDraftInput,
  destinationQuery: string,
  now = Date.now(),
) {
  if (
    !UUID_V4_PATTERN.test(submissionId)
    || !Number.isInteger(row)
    || row < 2
    || row > 101
    || typeof destinationQuery !== "string"
    || destinationQuery.length < 3
    || destinationQuery.length > 100
  ) {
    throw new BulkImportEnvelopeError();
  }
  const payload: BulkImportEnvelopePayload = {
    actorId: context.actorId,
    destinationQuery,
    expiresAt: now + ENVELOPE_TTL_MS,
    input,
    row,
    submissionId,
    tenantId: context.tenantId,
    version: 3,
  };
  try {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
    cipher.setAAD(ENVELOPE_AAD);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    return [
      ENVELOPE_VERSION,
      nonce.toString("base64url"),
      ciphertext.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
    ].join(".");
  } catch (error) {
    if (error instanceof BulkImportEnvelopeError) throw error;
    throw new BulkImportEnvelopeError();
  }
}

export function verifyBulkImportEnvelope(
  token: string,
  context: EnvelopeContext,
  now = Date.now(),
) {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    throw new BulkImportEnvelopeError();
  }
  const parts = token.split(".");
  if (
    parts.length !== 4
    || parts[0] !== ENVELOPE_VERSION
    || parts.slice(1).some((part) => !part || !BASE64URL_PATTERN.test(part))
  ) {
    throw new BulkImportEnvelopeError();
  }
  const nonce = Buffer.from(parts[1]!, "base64url");
  const ciphertext = Buffer.from(parts[2]!, "base64url");
  const authTag = Buffer.from(parts[3]!, "base64url");
  if (nonce.length !== 12 || ciphertext.length === 0 || authTag.length !== 16) {
    throw new BulkImportEnvelopeError();
  }

  let payload: BulkImportEnvelopePayload;
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), nonce);
    decipher.setAAD(ENVELOPE_AAD);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    payload = JSON.parse(plaintext);
  } catch {
    throw new BulkImportEnvelopeError();
  }
  if (
    payload.version !== 3 ||
    payload.actorId !== context.actorId ||
    payload.tenantId !== context.tenantId ||
    !UUID_V4_PATTERN.test(payload.submissionId) ||
    !Number.isInteger(payload.row) ||
    payload.row < 2 ||
    payload.row > 101 ||
    typeof payload.destinationQuery !== "string" ||
    payload.destinationQuery.length < 3 ||
    payload.destinationQuery.length > 100 ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt < now ||
    !payload.input ||
    typeof payload.input !== "object"
  ) {
    throw new BulkImportEnvelopeError();
  }
  return payload;
}
