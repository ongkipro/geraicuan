import { describe, expect, it } from "vitest";

import {
  parseFinanceExceptionFilter,
  reconciliationVarianceHref,
} from "@/lib/finance-exception-filter";

describe("finance reconciliation exception URL contract", () => {
  it("builds and parses the variance-only supporting link", () => {
    expect(reconciliationVarianceHref()).toBe(
      "/app/keuangan?status=VARIANCE#reconciliation-history-title",
    );
    expect(parseFinanceExceptionFilter("VARIANCE")).toBe("VARIANCE");
    expect(parseFinanceExceptionFilter("MATCHED")).toBeNull();
  });

  it("targets an exact validated reconciliation record without accepting an arbitrary fragment", () => {
    const id = "00000000-0000-4000-8000-000000000044";
    expect(reconciliationVarianceHref(id)).toBe(
      `/app/keuangan?status=VARIANCE&rekonsiliasiId=${id}#reconciliation-${id}`,
    );
    expect(reconciliationVarianceHref("not-a-uuid")).toBe(
      "/app/keuangan?status=VARIANCE#reconciliation-history-title",
    );
  });
});
