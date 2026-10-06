// T-275 (D-41): Uang gerai on screen — every figure carries its spec 19 OWN-* ID, the estimate is
// labelled as one, and the Pencairan variance never rounds a real shortfall to "Rp 0".
import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { formatPayoutVariance, parsePayoutTab, payoutHref } from "@/app/app/laporan/pencairan/payout-logic";
import { OwnerMoneyStrip } from "@/components/app/owner-money-strip";
import type { OwnerMoneySummary } from "@/db/owner-money-repository";

const summary: OwnerMoneySummary = {
  byCourier: [],
  margin: { estimateCount: 3, idr: 214_829, provenCount: 20, provenIdr: -38_188, unknownCount: 0 },
  needsReviewCount: 1,
  returned: { count: 2 },
  settled: { count: 23, payoutIdr: 4_366_362 },
  unsettled: { codIdr: 5_458_718, count: 21, estimatedPayoutIdr: 4_881_566 },
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Uang gerai strip (T-275)", () => {
  it("names each figure, its metric and its basis", () => {
    const html = renderToStaticMarkup(createElement(OwnerMoneyStrip, { summary }));
    for (const id of ["OWN-COD-UNSETTLED-IDR", "OWN-COD-SETTLED-IDR", "OWN-MARGIN-IDR"]) expect(html).toContain(`data-metric-id="${id}"`);
    const visible = text(html);
    expect(visible).toContain("COD belum cair Rp 5.458.718 21 kiriman · estimasi cair Rp 4.881.566");
    expect(visible).toContain("Sudah cair Rp 4.366.362 1 perlu dicek");
    expect(visible).toContain("Margin ongkir Rp 214.829 Estimasi");
    expect(visible).toContain("-Rp 38.188 terbukti dari pencairan · sisanya perkiraan");
    const proven = text(renderToStaticMarkup(createElement(OwnerMoneyStrip, { summary: { ...summary, margin: { ...summary.margin, estimateCount: 0 }, needsReviewCount: 0 } })));
    expect(proven).not.toContain("Estimasi");
    expect(proven).not.toContain("perlu dicek");
    expect(proven).toContain("Seluruhnya terbukti dari pencairan Mengantar");
  });

  it("keeps a sub-rupiah shortfall visible and the tolerance at half a sen", () => {
    expect(formatPayoutVariance(null)).toBe("—");
    expect(formatPayoutVariance(BigInt(50))).toBe("Sesuai");
    expect(formatPayoutVariance(BigInt(-50))).toBe("Sesuai");
    expect(formatPayoutVariance(BigInt(-51))).toMatch(/^−Rp\s0,01$/);
    expect(formatPayoutVariance(BigInt(-20_000_000))).toMatch(/^−Rp\s2\.000$/);
    // From one rupiah up the difference is shown whole: +1,5 → +Rp 2.
    expect(formatPayoutVariance(BigInt(15_000))).toMatch(/^\+Rp\s2$/);
  });

  it("keeps the tab in the URL only when it is not the default", () => {
    expect(parsePayoutTab(undefined)).toBe("belum");
    expect(parsePayoutTab("x")).toBe("belum");
    expect(parsePayoutTab("dicek")).toBe("dicek");
    expect(payoutHref("belum", 1, { rentang: "7-hari" })).toBe("/app/laporan/pencairan?rentang=7-hari");
    expect(payoutHref("retur", 2, {})).toBe("/app/laporan/pencairan?status=retur&halaman=2");
  });

  it("never loads owner money for an Operator on Dasbor", () => {
    // The loader refuses the role too (provider-settlement-repository T-275 block); this binds the page's own gate.
    const page = readFileSync("src/app/app/page.tsx", "utf8");
    expect(page).toMatch(/isAdmin && !invalidOutlet \? settle\(read\(\(tx, context\) => loadOwnerMoney\(/);
  });
});

describe("Pencairan: how long a delivered COD resi has waited (T-287)", () => {
  it("words the wait from the first delivery on the read's clock, a date past 60 days", async () => {
    const { deliveredAge } = await import("@/app/app/laporan/pencairan/payout-view");
    const now = new Date("2026-10-07T05:00:00Z"); // 12.00 WIB
    expect(deliveredAge(new Date("2026-10-07T03:00:00Z"), now)).toBe("2 jam lalu");
    expect(deliveredAge(new Date("2026-10-04T05:00:00Z"), now)).toBe("3 hari lalu");
    expect(deliveredAge(new Date("2026-08-08T05:00:00Z"), now)).toBe("60 hari lalu");
    expect(deliveredAge(new Date("2026-08-07T05:00:00Z"), now)).toMatch(/2026/);
  });
});
