import { describe, expect, it } from "vitest";

import { providerOrderStatusLabel } from "@/lib/labels/finance";
import { PROVIDER_DELIVERY_STATUS_MAP } from "@/lib/provider-delivery-status";

describe("T-202 finance labels (spec 10 §8, V-6)", () => {
  it("names every observed Mengantar order status in Indonesian, from the lifecycle vocabulary where one applies", () => {
    for (const status of Object.keys(PROVIDER_DELIVERY_STATUS_MAP)) {
      const label = providerOrderStatusLabel(status);
      expect(label, status).not.toMatch(/tidak dikenal/);
      expect(label, status).not.toBe(status);
    }
    expect(providerOrderStatusLabel("DELIVERED")).toBe("Terkirim");
    expect(providerOrderStatusLabel(" delivery  problem ")).toBe("Bermasalah");
    expect(providerOrderStatusLabel("RTS")).toBe("Retur");
    expect(providerOrderStatusLabel("PENDING PICKUP")).toBe("Menunggu dijemput kurir");
  });

  it("keeps an unobserved status visible instead of guessing, and an absent one as a dash", () => {
    expect(providerOrderStatusLabel("ON PROCESS")).toBe("Status tidak dikenal (ON PROCESS)");
    expect(providerOrderStatusLabel(null)).toBe("—");
    expect(providerOrderStatusLabel("  ")).toBe("—");
  });
});
