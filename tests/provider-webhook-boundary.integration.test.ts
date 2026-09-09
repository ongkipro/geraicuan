import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/mengantar/route";

const ROUTE_SOURCE = join(process.cwd(), "src/app/api/webhooks/mengantar/route.ts");

describe("provider tracking ingestion boundary", () => {
  it("refuses with an empty 404 that discloses nothing", () => {
    const response = POST();
    expect(response.status).toBe(404);
    expect(response.body).toBeNull();
    // No provider name, no reason, no hint that the path is merely switched off.
    expect(response.headers.get("content-type")).toBeNull();
  });

  it("takes no request, so no payload shape can reach it", () => {
    // The handler used to branch on `cnote_no` / `awb` / `tracking_number` and
    // on `status` / `tracking_status`, in both object and array form. It now
    // accepts no argument at all, which is what makes every one of those
    // shapes unreachable rather than merely rejected.
    expect(POST.length).toBe(0);
  });

  it("reaches no database, provider, secret, or crypto module", async () => {
    const source = await readFile(ROUTE_SOURCE, "utf8");

    // Any import at all is the signal: a closed route needs none. Counting the
    // keyword rather than matching a line shape catches a multi-line
    // `import {\n  Pool,\n} from "pg"`, which a line-anchored pattern misses.
    const importKeywords = source.match(/\bimport\b/g) ?? [];
    const specifiers = [...source.matchAll(/\bimport\b[\s\S]*?["']([^"']+)["']/g)]
      .map((match) => match[1]);

    expect(specifiers).toEqual(["server-only"]);
    expect(importKeywords).toHaveLength(1);
  });

  it("exports no verb other than POST", async () => {
    const source = await readFile(ROUTE_SOURCE, "utf8");
    const exported = [...source.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)]
      .map((match) => match[1]);
    // A re-added GET or PUT would be a second unreviewed inbound surface.
    expect(exported).toEqual(["POST"]);
  });
});
