import { describe, expect, it } from "vitest";

import { BULK_TEMPLATE_HEADERS } from "@/lib/bulk-shipment-intake-contract";
import { deriveBulkRowSubmissionId, previewBulkShipmentCsv } from "@/lib/bulk-shipment-intake";

const outletId = "00000000-0000-0000-0000-000000000111";
const validRow = [
  "Pengirim", "081212345678", "Jl. Asia Afrika 8", "Penerima", "081234567890",
  "Jl. Medan Merdeka Barat 1", "3171010", "\"Gambir, Jakarta Pusat\"", "Pakaian", "500",
  "1", "", "", "", "150000", "NON_COD",
];

function csv(rows: string[][]) {
  return [BULK_TEMPLATE_HEADERS.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

function upload(contents: string, name = "kiriman.csv") {
  return new File([contents], name, { type: "text/csv" });
}

describe("bulk shipment CSV preview", () => {
  it("retains valid rows, isolates invalid rows, and never includes invalid PII in errors", async () => {
    const invalid = [...validRow];
    invalid[4] = "invalid-phone";
    invalid[5] = "Alamat penerima rahasia";

    const result = await previewBulkShipmentCsv(upload(csv([validRow, invalid])), outletId);

    expect("code" in result).toBe(false);
    if ("code" in result) return;
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]).toMatchObject({ row: 2, input: { recipientName: "Penerima" } });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "telepon_penerima", row: 3 }),
    ]));
    expect(JSON.stringify(result.errors)).not.toContain("Alamat penerima rahasia");
    expect(JSON.stringify(result.errors)).not.toContain("invalid-phone");
  });

  it("rejects malformed files before any row preview", async () => {
    const wrongHeader = await previewBulkShipmentCsv(upload(`wrong\n${validRow.join(",")}`), outletId);
    const malformedQuote = await previewBulkShipmentCsv(
      upload(`${BULK_TEMPLATE_HEADERS.join(",")}\n"unterminated`),
      outletId,
    );
    const tooManyRows = await previewBulkShipmentCsv(upload(csv(Array.from({ length: 101 }, () => validRow))), outletId);

    expect(wrongHeader).toMatchObject({ code: "header" });
    expect(malformedQuote).toMatchObject({ code: "syntax" });
    expect(tooManyRows).toMatchObject({ code: "row_limit" });
  });

  it("accepts quoted commas and a UTF-8 BOM", async () => {
    const quoted = [...validRow];
    quoted[5] = '"Jl. Medan, Merdeka Barat 1"';
    const result = await previewBulkShipmentCsv(upload(`\uFEFF${csv([quoted])}`), outletId);

    expect(result).toMatchObject({ totalRows: 1, validRows: [{ row: 2 }] });
  });

  it("rejects missing data, unsafe encoding, NUL bytes, and an oversized record", async () => {
    const noRows = await previewBulkShipmentCsv(upload(BULK_TEMPLATE_HEADERS.join(",")), outletId);
    const invalidUtf8 = await previewBulkShipmentCsv(
      new File([new Uint8Array([0xff, 0xfe])], "kiriman.csv", { type: "text/csv" }),
      outletId,
    );
    const nul = await previewBulkShipmentCsv(upload(`${csv([validRow])}\0`), outletId);
    const oversized = [...validRow];
    oversized[5] = "x".repeat(8 * 1024 + 1);
    const largeRecord = await previewBulkShipmentCsv(upload(csv([oversized])), outletId);

    expect(noRows).toMatchObject({ code: "file" });
    expect(invalidUtf8).toMatchObject({ code: "syntax" });
    expect(nul).toMatchObject({ code: "syntax" });
    expect(largeRecord).toMatchObject({ code: "syntax" });
  });

  it("rejects invalid file metadata and keeps deterministic row replay IDs distinct", async () => {
    const wrongExtension = await previewBulkShipmentCsv(upload(csv([validRow]), "kiriman.txt"), outletId);
    const wrongMime = await previewBulkShipmentCsv(
      new File([csv([validRow])], "kiriman.csv", { type: "application/json" }),
      outletId,
    );
    const first = deriveBulkRowSubmissionId("00000000-0000-4000-8000-000000000141", 2);

    expect(wrongExtension).toMatchObject({ code: "file" });
    expect(wrongMime).toMatchObject({ code: "file" });
    expect(first).toBe(deriveBulkRowSubmissionId("00000000-0000-4000-8000-000000000141", 2));
    expect(first).not.toBe(deriveBulkRowSubmissionId("00000000-0000-4000-8000-000000000141", 3));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("rejects a file above the 256 KB boundary before parsing", async () => {
    const oversized = new File([new Uint8Array(256 * 1024 + 1)], "kiriman.csv", { type: "text/csv" });
    await expect(previewBulkShipmentCsv(oversized, outletId)).resolves.toMatchObject({
      code: "file",
      field: "csv",
      message: "Ukuran berkas maksimal 256 KB.",
    });
  });
});
