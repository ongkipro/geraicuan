import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  handleMengantarWebhook,
  MENGANTAR_WEBHOOK_MAX_BODY_BYTES,
  MENGANTAR_WEBHOOK_TOLERANCE_MS,
  mengantarWebhookConfig,
  mengantarWebhookSignature,
  parseMengantarWebhookBody,
  verifyMengantarWebhook,
  type MengantarWebhookEvent,
} from "@/lib/mengantar-webhook";

// T-238 / D-30. The contract is Mengantar's own documentation
// (https://api-public.mengantar.com/docs/, "Webhook", read 2026-09-26); the
// test vector below is copied from it verbatim.
const DOC_SECRET = "testsecret";
const DOC_TIMESTAMP = "1787548800000";
const DOC_BODY = '{"cnote_no":"JNE1234567890","order_id":"ORD-000123","courier":"JNE","status_category":"DELIVERED"}';
const DOC_SIGNATURE = "05826dec707ea7164801d952cb7eaf7ce9adc0c8aa0b93366480434164a1a111";
const DOC_NOW = Number(DOC_TIMESTAMP) + 60_000;
const encode = (text: string) => new TextEncoder().encode(text);

function signedRequest(body: string, input: { secret?: string; timestamp?: string; signature?: string } = {}) {
  const timestamp = input.timestamp ?? DOC_TIMESTAMP;
  const signature = input.signature ?? mengantarWebhookSignature(input.secret ?? DOC_SECRET, timestamp, encode(body));
  return new Request("https://app.geraicuan.test/api/webhooks/mengantar", {
    body,
    headers: { "content-type": "application/json", "x-signature": signature, "x-timestamp": timestamp },
    method: "POST",
  });
}

function handle(request: Request, record = vi.fn<(event: MengantarWebhookEvent) => Promise<string>>(async () => "APPLIED")) {
  return handleMengantarWebhook(request, { config: { secret: DOC_SECRET }, now: () => DOC_NOW, record });
}

describe("Mengantar webhook signature (documented contract)", () => {
  it("reproduces the documentation's test vector", () => {
    expect(mengantarWebhookSignature(DOC_SECRET, DOC_TIMESTAMP, encode(DOC_BODY))).toBe(DOC_SIGNATURE);
  });

  it("accepts the documented delivery inside the 5-minute window", () => {
    expect(verifyMengantarWebhook({
      now: DOC_NOW, rawBody: encode(DOC_BODY), secret: DOC_SECRET, signature: DOC_SIGNATURE, timestamp: DOC_TIMESTAMP,
    })).toEqual({ ok: true, eventAt: new Date(Number(DOC_TIMESTAMP)) });
    // Hex case does not matter; the bytes do.
    expect(verifyMengantarWebhook({
      now: DOC_NOW, rawBody: encode(DOC_BODY), secret: DOC_SECRET, signature: DOC_SIGNATURE.toUpperCase(), timestamp: DOC_TIMESTAMP,
    }).ok).toBe(true);
  });

  it("refuses a changed body, timestamp, secret or signature", () => {
    const base = { now: DOC_NOW, rawBody: encode(DOC_BODY), secret: DOC_SECRET, signature: DOC_SIGNATURE, timestamp: DOC_TIMESTAMP };
    expect(verifyMengantarWebhook({ ...base, rawBody: encode(DOC_BODY.replace("DELIVERED", "RTS")) })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    // Re-serialised JSON is a different raw body: the signature covers bytes, not meaning.
    expect(verifyMengantarWebhook({ ...base, rawBody: encode(JSON.stringify(JSON.parse(DOC_BODY), null, 1)) }).ok).toBe(false);
    expect(verifyMengantarWebhook({ ...base, timestamp: "1787548800001" })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(verifyMengantarWebhook({ ...base, secret: "othersecret" })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(verifyMengantarWebhook({ ...base, signature: `${DOC_SIGNATURE.slice(0, 63)}0` })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("refuses a replay older than the window, a far-future clock, and missing or malformed headers", () => {
    const base = { rawBody: encode(DOC_BODY), secret: DOC_SECRET, signature: DOC_SIGNATURE, timestamp: DOC_TIMESTAMP };
    const at = Number(DOC_TIMESTAMP);
    expect(verifyMengantarWebhook({ ...base, now: at + MENGANTAR_WEBHOOK_TOLERANCE_MS }).ok).toBe(true);
    expect(verifyMengantarWebhook({ ...base, now: at + MENGANTAR_WEBHOOK_TOLERANCE_MS + 1 })).toEqual({ ok: false, reason: "STALE" });
    expect(verifyMengantarWebhook({ ...base, now: at - MENGANTAR_WEBHOOK_TOLERANCE_MS - 1 })).toEqual({ ok: false, reason: "STALE" });
    for (const [timestamp, signature] of [[null, DOC_SIGNATURE], [DOC_TIMESTAMP, null], ["17875488e5", DOC_SIGNATURE], [DOC_TIMESTAMP, "zz"], [DOC_TIMESTAMP, DOC_SIGNATURE.slice(2)]]) {
      expect(verifyMengantarWebhook({ ...base, now: DOC_NOW, signature, timestamp })).toEqual({ ok: false, reason: "MISSING_HEADERS" });
    }
  });

  it("uses a constant-time comparison", async () => {
    const source = await readFile(join(process.cwd(), "src/lib/mengantar-webhook.ts"), "utf8");
    expect(source).toContain("timingSafeEqual(expected, received)");
    expect(source).not.toMatch(/signature\s*[!=]==/);
  });
});

describe("Mengantar webhook body", () => {
  it("reads only cnote_no and status_category, mapped with the pull's vocabulary", () => {
    const at = new Date(Number(DOC_TIMESTAMP));
    expect(parseMengantarWebhookBody(encode(DOC_BODY), at)).toEqual({
      cnoteNo: "JNE1234567890", eventAt: at, mappedStatus: "DELIVERED", providerStatus: "DELIVERED", recognised: true,
    });
    expect(parseMengantarWebhookBody(encode('{"cnote_no":"A1","status_category":"PICKED UP"}'), at))
      .toMatchObject({ mappedStatus: "IN_TRANSIT", recognised: true });
    expect(parseMengantarWebhookBody(encode('{"cnote_no":"A1","status_category":"ACTIVE/WAITING NEXT PROCESS"}'), at))
      .toMatchObject({ mappedStatus: null, recognised: true });
    expect(parseMengantarWebhookBody(encode('{"cnote_no":"A1","status_category":"SOMETHING NEW"}'), at))
      .toMatchObject({ mappedStatus: null, recognised: false });
  });

  it("refuses a body without a usable AWB or status", () => {
    const at = new Date();
    for (const body of ["", "[]", "null", "{", '{"cnote_no":"","status_category":"DELIVERED"}', '{"cnote_no":"A 1","status_category":"DELIVERED"}',
      '{"cnote_no":"A1","status_category":"<script>"}', '{"cnote_no":"A1"}', '{"awb":"A1","status":"DELIVERED"}']) {
      expect(parseMengantarWebhookBody(encode(body), at), body).toBeNull();
    }
    expect(parseMengantarWebhookBody(new Uint8Array([0x7b, 0xff, 0x7d]), at)).toBeNull();
  });
});

describe("Mengantar webhook receiver", () => {
  it("is closed unless enabled with a secret", () => {
    expect(mengantarWebhookConfig({})).toBeNull();
    expect(mengantarWebhookConfig({ MENGANTAR_WEBHOOK_SECRET: "s3cret" })).toBeNull();
    expect(mengantarWebhookConfig({ MENGANTAR_WEBHOOK_ENABLED: "1" })).toBeNull();
    expect(mengantarWebhookConfig({ MENGANTAR_WEBHOOK_ENABLED: "1", MENGANTAR_WEBHOOK_SECRET: "   " })).toBeNull();
    expect(mengantarWebhookConfig({ MENGANTAR_WEBHOOK_ENABLED: "true", MENGANTAR_WEBHOOK_SECRET: "s3cret" })).toBeNull();
    expect(mengantarWebhookConfig({ MENGANTAR_WEBHOOK_ENABLED: "1", MENGANTAR_WEBHOOK_SECRET: "s3cret" })).toEqual({ secret: "s3cret" });
  });

  it("records a signed delivery once and answers 204 with no body", async () => {
    const record = vi.fn<(event: MengantarWebhookEvent) => Promise<string>>(async () => "APPLIED");
    const response = await handle(signedRequest(DOC_BODY), record);
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({ cnoteNo: "JNE1234567890", mappedStatus: "DELIVERED" });
  });

  it("acknowledges an AWB that is not ours so Mengantar does not retry it", async () => {
    expect((await handle(signedRequest(DOC_BODY), vi.fn(async () => "NOT_FOUND"))).status).toBe(204);
  });

  it("answers 401 unsigned or forged, 400 signed but unreadable, 413 too large, 500 when the write fails", async () => {
    const record = vi.fn(async () => "APPLIED");
    expect((await handle(signedRequest(DOC_BODY, { signature: "0".repeat(64) }), record)).status).toBe(401);
    expect((await handle(signedRequest(DOC_BODY, { secret: "wrong" }), record)).status).toBe(401);
    expect((await handle(signedRequest("{}"), record)).status).toBe(400);
    const large = JSON.stringify({ cnote_no: "A1", status_category: "DELIVERED", padding: "x".repeat(MENGANTAR_WEBHOOK_MAX_BODY_BYTES) });
    expect((await handle(signedRequest(large), record)).status).toBe(413);
    expect(record).not.toHaveBeenCalled();

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = vi.fn(async () => { throw new Error("duplicate key JNE1234567890"); });
    expect((await handle(signedRequest(DOC_BODY), failing)).status).toBe(500);
    // Logged without the payload or the database error that could echo it.
    expect(JSON.stringify(error.mock.calls)).not.toContain("JNE1234567890");
    error.mockRestore();
  });

  it("logs nothing from the payload anywhere in the receiver", async () => {
    for (const file of ["src/lib/mengantar-webhook.ts", "src/app/api/webhooks/mengantar/route.ts", "src/db/mengantar-webhook-repository.ts"]) {
      const source = await readFile(join(process.cwd(), file), "utf8");
      for (const call of source.matchAll(/console\.\w+\(([^)]*)\)/g)) {
        expect(call[1], file).toMatch(/^"[^"]*"$/);
      }
    }
  });
});
