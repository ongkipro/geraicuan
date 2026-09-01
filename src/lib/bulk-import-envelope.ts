import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { ShipmentDraftInput } from "@/lib/shipment-draft";

const ENVELOPE_TTL_MS = 15 * 60 * 1000;
const MAX_TOKEN_LENGTH = 16_384;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BulkImportEnvelopePayload = {
  actorId: string;
  expiresAt: number;
  input: ShipmentDraftInput;
  row: number;
  submissionId: string;
  tenantId: string;
  version: 1;
};

type EnvelopeContext = { actorId: string; tenantId: string };

export class BulkImportEnvelopeError extends Error {
  constructor() {
    super("Bulk import preview is unavailable.");
  }
}

function signingSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new BulkImportEnvelopeError();
  return secret;
}

function signature(value: string) {
  return createHmac("sha256", signingSecret())
    .update("geraicuan:bulk-import:v1:")
    .update(value)
    .digest("base64url");
}

export function createBulkImportEnvelope(
  context: EnvelopeContext,
  submissionId: string,
  row: number,
  input: ShipmentDraftInput,
  now = Date.now(),
) {
  if (!UUID_V4_PATTERN.test(submissionId) || !Number.isInteger(row) || row < 2 || row > 101) {
    throw new BulkImportEnvelopeError();
  }
  const payload: BulkImportEnvelopePayload = {
    actorId: context.actorId,
    expiresAt: now + ENVELOPE_TTL_MS,
    input,
    row,
    submissionId,
    tenantId: context.tenantId,
    version: 1,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyBulkImportEnvelope(
  token: string,
  context: EnvelopeContext,
  now = Date.now(),
) {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    throw new BulkImportEnvelopeError();
  }
  const parts = token.split(".");
  if (parts.length !== 2) throw new BulkImportEnvelopeError();
  const [encoded, suppliedSignature] = parts;
  const expectedSignature = signature(encoded!);
  const supplied = Buffer.from(suppliedSignature!, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new BulkImportEnvelopeError();
  }

  let payload: BulkImportEnvelopePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded!, "base64url").toString("utf8"));
  } catch {
    throw new BulkImportEnvelopeError();
  }
  if (
    payload.version !== 1 ||
    payload.actorId !== context.actorId ||
    payload.tenantId !== context.tenantId ||
    !UUID_V4_PATTERN.test(payload.submissionId) ||
    !Number.isInteger(payload.row) ||
    payload.row < 2 ||
    payload.row > 101 ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt < now ||
    !payload.input ||
    typeof payload.input !== "object"
  ) {
    throw new BulkImportEnvelopeError();
  }
  return payload;
}
