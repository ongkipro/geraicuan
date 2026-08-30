import { describe, expect, it } from "vitest";

import { BULK_TEMPLATE_HEADERS } from "@/lib/bulk-shipment-intake-contract";
import { previewBulkShipmentCsv } from "@/lib/bulk-shipment-intake";

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
});
