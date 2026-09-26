import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/webhooks/mengantar/route";

const ROUTE_SOURCE = join(process.cwd(), "src/app/api/webhooks/mengantar/route.ts");

// T-238 / D-30: the receiver now implements the documented contract
// (tests/mengantar-webhook.integration.test.ts) but stays closed by default.
// While closed it must look exactly like the pre-T-238 route: an empty 404.
afterEach(() => vi.unstubAllEnvs());

function anyRequest() {
  return new Request("https://app.geraicuan.test/api/webhooks/mengantar", {
    body: JSON.stringify({ cnote_no: "AWB1", status_category: "DELIVERED" }),
    headers: { "content-type": "application/json", "x-signature": "0".repeat(64), "x-timestamp": String(Date.now()) },
    method: "POST",
  });
}

describe("provider tracking ingestion boundary", () => {
  it.each([
    ["unset", undefined, undefined],
    ["enabled without a secret", "1", ""],
    ["a secret without the switch", "", "configured-secret"],
    ["a switch other than 1", "true", "configured-secret"],
  ])("refuses with an empty 404 that discloses nothing when %s", async (_case, enabled, secret) => {
    vi.stubEnv("MENGANTAR_WEBHOOK_ENABLED", enabled ?? "");
    vi.stubEnv("MENGANTAR_WEBHOOK_SECRET", secret ?? "");
    const response = await POST(anyRequest());
    expect(response.status).toBe(404);
    expect(response.body).toBeNull();
    // No provider name, no reason, no hint that the path is merely switched off.
    expect(response.headers.get("content-type")).toBeNull();
  });

  it("exports no verb other than POST", async () => {
    const source = await readFile(ROUTE_SOURCE, "utf8");
    const exported = [...source.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)]
      .map((match) => match[1]);
    // A re-added GET or PUT would be a second unreviewed inbound surface.
    expect(exported).toEqual(["POST"]);
  });
});
