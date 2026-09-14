import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { shipmentReference } from "@/lib/shipment-reference";
import { formatShortId } from "@/lib/platform-monitoring-format";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("shipment reference", () => {
  it("distinguishes ids that share their leading groups", () => {
    // The local fixture ids all start `72000000-0000-4000-8000-`, which made
    // every row on Ringkasan, Kiriman, RTS, analytics, and Keuangan read the
    // same `72000000`.
    const ids = Array.from({ length: 20 }, (_, index) =>
      `72000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    const references = ids.map(shipmentReference);

    expect(new Set(references).size).toBe(ids.length);
    expect(references[9]).toBe("00000010");
    expect(shipmentReference("9f1c2b3a-4d5e-4f60-8a7b-0c1d2e3f4a5b")).toBe("2E3F4A5B");
  });

  it("is the only way the application shortens a record id", () => {
    // Bound to the defect: an id-prefix slice reintroduces the shared-prefix
    // collision wherever it lives, including platform batch references.
    const offenders = sourceFiles("src").filter((path) =>
      /\b(?:[A-Za-z]*Id|id)\s*\.slice\(\s*0\s*,\s*8\s*\)/.test(readFileSync(path, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("distinguishes platform batches sharing a prefix", () => {
    const ids = Array.from({ length: 20 }, (_, index) =>
      `76000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    const references = ids.map(formatShortId);
    expect(new Set(references).size).toBe(ids.length);
    expect(references).toEqual(ids.map(shipmentReference));
  });
});
