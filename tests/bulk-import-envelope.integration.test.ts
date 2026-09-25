import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BulkImportEnvelopeError,
  createBulkImportEnvelope,
  verifyBulkImportEnvelope,
} from "@/lib/bulk-import-envelope";
import type { ShipmentDraftInput } from "@/lib/shipment-draft";

const previousSecret = process.env.BETTER_AUTH_SECRET;
const context = { actorId: "operator-a", tenantId: "00000000-0000-4000-8000-000000000101" };
const submissionId = "00000000-0000-4000-8000-000000000141";
const input: ShipmentDraftInput = {
  declaredValueIdr: 150_000,
  destinationAreaId: "3171010",
  destinationAreaLabel: "Gambir, Jakarta Pusat",
  isCod: false,
  outletId: "00000000-0000-4000-8000-000000000111",
  paymentMethod: "NON_COD",
  packageContent: "Paket fixture",
  packageHeightCm: null,
  packageLengthCm: null,
  packageQuantity: 1,
  packageWeightGrams: 500,
  packageWidthCm: null,
  pickupAddressId: null,
  destinationAreaVerified: true,
  isHazardous: false,
  recipientAddressLandmark: null,
  shippingInstruction: null,
  recipientAddress: "Alamat penerima fixture",
  recipientName: "Penerima fixture",
  recipientPhone: "081234567890",
  senderAddress: "Alamat pengirim fixture",
  senderName: "Pengirim fixture",
  senderPhone: "081212345678",
};

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = "t41-test-only-signing-secret-32-bytes";
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = previousSecret;
});

describe("bulk import confirmation envelope", () => {
  it("encrypts one canonical row and round-trips it only for its tenant and actor", () => {
    const token = createBulkImportEnvelope(context, submissionId, 2, input, "Gambir Jakarta Pusat", 1_000);
    expect(token.startsWith("v3.")).toBe(true);
    expect(createBulkImportEnvelope(context, submissionId, 2, input, "Gambir Jakarta Pusat", 1_000))
      .not.toBe(token);

    const browserObservableText = [
      token,
      ...token.split(".").slice(1).map((part) => Buffer.from(part, "base64url").toString("utf8")),
    ].join("\n");
    for (const sensitiveValue of [
      "recipientName",
      "recipientPhone",
      "recipientAddress",
      "senderName",
      "senderPhone",
      "senderAddress",
      "packageContent",
      input.recipientName,
      input.recipientPhone,
      input.recipientAddress,
      input.senderName,
      input.senderPhone,
      input.senderAddress,
      input.packageContent,
    ]) {
      expect(browserObservableText).not.toContain(sensitiveValue);
    }

    expect(verifyBulkImportEnvelope(token, context, 2_000)).toEqual(expect.objectContaining({
      input,
      destinationQuery: "Gambir Jakarta Pusat",
      row: 2,
      submissionId,
    }));
    expect(() => verifyBulkImportEnvelope(token, { ...context, actorId: "operator-b" }, 2_000))
      .toThrow(BulkImportEnvelopeError);
    expect(() => verifyBulkImportEnvelope(token, { ...context, tenantId: "00000000-0000-4000-8000-000000000102" }, 2_000))
      .toThrow(BulkImportEnvelopeError);
  });

  it("rejects tampering, expiry, and missing signing configuration", () => {
    const token = createBulkImportEnvelope(context, submissionId, 2, input, "Gambir Jakarta Pusat", 1_000);
    const parts = token.split(".");
    // The last base64url character of a 32-byte signature carries two padding
    // bits, so swapping it can decode to the same bytes and leave the envelope
    // valid — this guard passed by luck about fifteen runs in sixteen. Tamper
    // the first character instead, where every bit is significant.
    parts[2] = `${parts[2]!.startsWith("A") ? "B" : "A"}${parts[2]!.slice(1)}`;
    expect(() => verifyBulkImportEnvelope(parts.join("."), context, 2_000))
      .toThrow(BulkImportEnvelopeError);
    expect(() => verifyBulkImportEnvelope(token, context, 1_000 + 15 * 60 * 1_000 + 1))
      .toThrow(BulkImportEnvelopeError);
    delete process.env.BETTER_AUTH_SECRET;
    expect(() => createBulkImportEnvelope(context, submissionId, 2, input, "Gambir Jakarta Pusat", 1_000))
      .toThrow(BulkImportEnvelopeError);
    expect(() => verifyBulkImportEnvelope(token, context, 2_000))
      .toThrow(BulkImportEnvelopeError);
  });
});
