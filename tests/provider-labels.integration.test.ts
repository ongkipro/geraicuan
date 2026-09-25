import { describe, expect, it } from "vitest";

import { providerBatchStatuses, providerOrderStatuses } from "@/db/schema";
import {
  PROVIDER_BATCH_STATUS_LABELS,
  PROVIDER_ORDER_STATUS_LABELS,
  providerResponseLabel,
} from "@/lib/labels/provider";

describe("T-202 provider status and response labels (spec 10 §8, V-6)", () => {
  it("labels every stored order and batch status in Indonesian", () => {
    for (const status of providerOrderStatuses) expect(PROVIDER_ORDER_STATUS_LABELS[status]).not.toMatch(/[A-Z]{2,}_?/);
    for (const status of providerBatchStatuses) expect(PROVIDER_BATCH_STATUS_LABELS[status]).not.toMatch(/[A-Z]{2,}_?/);
    expect(PROVIDER_ORDER_STATUS_LABELS.ISSUED).toBe("Resi terbit");
    expect(PROVIDER_BATCH_STATUS_LABELS.COMPLETED).toBe("Selesai");
  });

  it("turns known response codes into sentences and keeps an unknown code only for support", () => {
    expect(providerResponseLabel("ORDER_ACCEPTED")).toBe("Pesanan diterima Mengantar");
    expect(providerResponseLabel("ORDER_SUBMISSION_INTERRUPTED")).toBe("Pengiriman ke Mengantar terputus");
    expect(providerResponseLabel("RECONCILED_FAILED")).toBe("Rekonsiliasi: pesanan gagal");
    expect(providerResponseLabel("PAY_UNPAID_ACCEPTED")).toBe("Pelunasan diterima Mengantar");
    expect(providerResponseLabel("UPSTREAM_UNKNOWN")).toBe("Respons lain dari Mengantar (kode UPSTREAM_UNKNOWN)");
    expect(providerResponseLabel(null)).toBe("Tidak ada");
    expect(providerResponseLabel("  ")).toBe("Tidak ada");
  });
});
