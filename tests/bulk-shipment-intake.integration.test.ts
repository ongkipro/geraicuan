import { describe, expect, it } from "vitest";

import { BULK_TEMPLATE_HEADERS } from "@/lib/bulk-shipment-intake-contract";
import { deriveBulkRowSubmissionId, previewBulkShipmentCsv as previewCsv } from "@/lib/bulk-shipment-intake";

const outletId = "00000000-0000-0000-0000-000000000111";
const validRow = [
  "Pengirim", "081212345678", "Jl. Asia Afrika 8", "Penerima", "081234567890",
  "Jl. Medan Merdeka Barat 1", "Gambir Jakarta Pusat", "Pakaian", "500",
  "1", "", "", "", "150000", "NON_COD",
];

function csv(rows: string[][]) {
  return [BULK_TEMPLATE_HEADERS.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

function upload(contents: string, name = "kiriman.csv") {
  return new File([contents], name, { type: "text/csv" });
}

function previewBulkShipmentCsv(file: File, selectedOutletId: string) {
  return previewCsv(file, selectedOutletId, async (query) => ({
    option: { areaId: "3171010", areaLabel: `${query}, DKI Jakarta, 10110` },
    status: "resolved",
  }));
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

  it("reports each character-class breach as a per-row error and never strips the cell (T-196)", async () => {
    const digitName = [...validRow];
    digitName[3] = "Penerima 2";
    const letterWeight = [...validRow];
    letterWeight[8] = "500g";
    const letterPrice = [...validRow];
    letterPrice[13] = "Rp150000";
    const letterPhone = [...validRow];
    letterPhone[1] = "08121234567O";
    const emojiAddress = [...validRow];
    emojiAddress[5] = "Jl. Medan Merdeka 🏠";
    const storeSender = [...validRow];
    storeSender[0] = "Toko 88";

    const result = await previewBulkShipmentCsv(
      upload(csv([validRow, digitName, letterWeight, letterPrice, letterPhone, emojiAddress, storeSender])),
      outletId,
    );

    expect("code" in result).toBe(false);
    if ("code" in result) return;
    // A store as sender (row 8) keeps its digits.
    expect(result.validRows.map((row) => row.row)).toEqual([2, 8]);
    expect(result.errors).toEqual(expect.arrayContaining([
      { field: "nama_penerima", message: "Nama penerima hanya boleh berisi huruf, spasi, titik, koma, apostrof, dan tanda hubung.", row: 3 },
      { field: "berat_gram", message: "Berat paket hanya boleh berisi angka.", row: 4 },
      { field: "nilai_barang", message: "Nilai barang hanya boleh berisi angka.", row: 5 },
      { field: "telepon_pengirim", message: "Nomor telepon pengirim hanya boleh berisi angka, boleh diawali +.", row: 6 },
      { field: "alamat_penerima", message: "Alamat penerima hanya boleh berisi huruf, angka, spasi, dan tanda baca, tanpa emoji.", row: 7 },
    ]));
    expect(JSON.stringify(result.errors)).not.toContain("Penerima 2");
  });

  it("accepts a CSV row holding non-breaking spaces and everyday address punctuation (T-199)", async () => {
    const row = [...validRow];
    row[3] = "Siti\u00A0Aminah";
    row[5] = "Jl. Ma\u2019ruf Blok C&D; km 5+200";
    const result = await previewBulkShipmentCsv(upload(csv([row])), outletId);

    expect("code" in result).toBe(false);
    if ("code" in result) return;
    expect(result.errors).toEqual([]);
    expect(result.validRows).toEqual([
      expect.objectContaining({
        input: expect.objectContaining({ recipientAddress: "Jl. Ma\u2019ruf Blok C&D; km 5+200", recipientName: "Siti Aminah" }),
        row: 2,
      }),
    ]);
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

  it("normalizes and deduplicates destination queries before bounded resolution", async () => {
    const second = [...validRow];
    second[6] = "  Gambir   Jakarta Pusat  ";
    const calls: string[] = [];
    const result = await previewCsv(upload(csv([validRow, second])), outletId, async (query) => {
      calls.push(query);
      return {
        option: { areaId: "3171010", areaLabel: "Gambir, Jakarta Pusat" },
        status: "resolved",
      };
    });

    expect(calls).toEqual(["Gambir Jakarta Pusat"]);
    expect(result).toMatchObject({
      totalRows: 2,
      uniqueDestinationQueries: 1,
      validRows: [
        { destinationQuery: "Gambir Jakarta Pusat", row: 2 },
        { destinationQuery: "Gambir Jakarta Pusat", row: 3 },
      ],
    });
  });

  it("keeps malformed, ambiguous, no-result, and unavailable destinations out of valid rows", async () => {
    const rows = ["x", "Ambiguous Jakarta", "Tidak Ada Jakarta", "Gangguan Jakarta"].map((query) => {
      const row = [...validRow];
      row[6] = query;
      return row;
    });
    const result = await previewCsv(upload(csv(rows)), outletId, async (query) => {
      if (query.startsWith("Ambiguous")) {
        return {
          candidateLabels: ["Pilihan A", "Pilihan B"],
          message: "Lokasi masih ambigu.",
          status: "ambiguous",
        };
      }
      if (query.startsWith("Tidak Ada")) {
        return { message: "Lokasi tidak ditemukan.", status: "no_result" };
      }
      throw new Error("sanitized provider failure");
    });

    expect("code" in result).toBe(false);
    if ("code" in result) return;
    expect(result.validRows).toEqual([]);
    expect(result.errors.map((error) => error.code)).toEqual([
      "invalid_query",
      "ambiguous",
      "no_result",
      "unavailable",
    ]);
    expect(result.errors[1]).toMatchObject({
      candidateLabels: ["Pilihan A", "Pilihan B"],
      field: "lokasi_tujuan",
    });
  });

  it("rejects more than ten unique destination queries before provider resolution", async () => {
    const rows = Array.from({ length: 11 }, (_, index) => {
      const row = [...validRow];
      row[6] = `Lokasi tujuan unik ${index}`;
      return row;
    });
    let calls = 0;
    const result = await previewCsv(upload(csv(rows)), outletId, async () => {
      calls += 1;
      return {
        option: { areaId: "unused", areaLabel: "Unused" },
        status: "resolved",
      };
    });

    expect(result).toMatchObject({
      code: "row_limit",
      message: "Maksimal 10 lokasi tujuan unik per unggahan.",
    });
    expect(calls).toBe(0);
  });
});
