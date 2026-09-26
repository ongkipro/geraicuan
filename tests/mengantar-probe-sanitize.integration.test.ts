// T-247 (review L7): the live order probe's capture is committed under tests/fixtures, so its
// sanitizer is an allow-list — a value no rule names never reaches the file. No database.
import { describe, expect, it } from "vitest";

import { sanitizeProbeCapture } from "../scripts/mengantar-probe-sanitize.mjs";

describe("sanitizeProbeCapture", () => {
  const response = {
    success: true,
    message: "Order untuk Budi Santoso (081234567890) berhasil",
    batch: "26013014BBQFMM",
    batch_id: "697c58034fa61abe7c700da6",
    data: [{
      _id: "697c58034fa61abe7c700da7",
      ORDER_ID: "L2609ABCDEFG",
      isPaid: false,
      cnote_no: null,
      status: "PENDING PICKUP",
      customerName: "Budi Santoso",
      customerPhone: "081234567890",
      customerAddress: "Jl. Melati No. 7 RT 01/02, Kelapa Gading",
      pickup: { name: "Gerai Pemilik", phone: "+6281299998888", address: "Ruko Blok C3", address_id: "pickup-account-id" },
      notes: ["Titip di satpam", "Pagar hijau"],
      price: 18000,
    }, { _id: "2", customerName: "Kedua" }, { _id: "3" }, { _id: "4-dropped" }],
  };

  it("keeps every key name but no personal or free-text value", () => {
    const sanitized = sanitizeProbeCapture(response, [["pickup-account-id", "[PICKUP_ADDRESS_ID]"]]);
    const text = JSON.stringify(sanitized);
    for (const leaked of ["Budi", "Santoso", "081234567890", "6281299998888", "Melati", "Gerai Pemilik", "Ruko", "satpam", "Kedua", "pickup-account-id"]) {
      expect(text, leaked).not.toContain(leaked);
    }
    expect(sanitized).toMatchObject({
      success: true,
      message: "string(48)",
      batch: "26013014BBQFMM",
      batch_id: "697c58034fa61abe7c700da6",
    });
    expect(sanitized.data[0]).toEqual({
      _id: "697c58034fa61abe7c700da7",
      ORDER_ID: "L2609ABCDEFG",
      isPaid: false,
      cnote_no: null,
      // `status` is a code slot; a spaced value is kept only as a shape.
      status: "string(14)",
      customerName: "string(12)",
      customerPhone: "string(12)",
      customerAddress: "string(40)",
      pickup: { name: "string(13)", phone: "string(14)", address: "string(12)", address_id: "string(17)" },
      notes: ["string(15)", "string(11)"],
      price: "integer",
    });
    // At most three array items, so a list response cannot carry a whole order book.
    expect(sanitized.data).toHaveLength(3);
  });

  it("drops a kept-slot value that is not the expected safe shape", () => {
    expect(sanitizeProbeCapture({ cnote_no: "Budi Santoso", isPaid: "yes", code: "ok lah", batch_id: "x".repeat(200) }))
      .toEqual({ cnote_no: "string(12)", isPaid: "string(3)", code: "string(6)", batch_id: "string(200)" });
  });

  it("still removes a credential echoed in a kept identifier", () => {
    expect(sanitizeProbeCapture({ _id: "KEY123abc" }, [["KEY123abc", "[API_KEY]"]])).toEqual({ _id: "[API_KEY]" });
  });
});
