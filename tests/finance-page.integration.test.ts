import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "00000000-0000-4000-8000-000000000401";
const OUTLET_ID = "00000000-0000-4000-8000-000000000411";
const ENTRY_ID = "00000000-0000-4000-8000-000000000421";
const SHIPMENT_ID = "00000000-0000-4000-8000-000000000431";

const errors = vi.hoisted(() => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
}));

const mocks = vi.hoisted(() => ({
  authorizationDenied: false,
  contextCalls: 0,
  entries: {
    rows: [] as Array<Record<string, unknown>>,
    totalCount: 0,
  },
  entryCalls: [] as Array<{
    pagination: { limit: number; offset: number };
    range: { end: Date; outletId?: string; start: Date };
  }>,
  latestVarianceCalls: 0,
  outlets: [{ id: "00000000-0000-4000-8000-000000000411", name: "Outlet Jakarta" }],
  principal: {
    role: "TENANT_ADMIN" as "OPERATOR" | "TENANT_ADMIN",
    scope: "tenant" as "platform" | "tenant",
    tenantId: "00000000-0000-4000-8000-000000000401",
    userId: "finance-admin",
  },
  reconciliations: [] as Array<Record<string, unknown>>,
  regularReconciliationCalls: 0,
  settlement: { rows: [] as Array<Record<string, unknown>>, latestPull: null as Record<string, unknown> | null, limit: 100 },
  settlementCalls: [] as Array<{ outletId?: string }>,
  summary: {
    codPrincipalLiabilityIdr: 0,
    providerCostIdr: 0,
    revenueIdr: 0,
    upstreamRecoveryPaymentIdr: 0,
    legacyCodFeeVatIdr: 0,
  },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/db/client", () => ({ db: {} }));

vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (_db, userId, tenantId, callback) => {
    mocks.contextCalls += 1;
    return callback({}, { role: mocks.principal.role, tenantId, userId });
  }),
}));

vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: errors.CmsAuthorizationDeniedError,
  requireCmsScope: vi.fn(async () => {
    if (mocks.authorizationDenied) throw new errors.CmsAuthorizationDeniedError();
    return mocks.principal;
  }),
}));

vi.mock("@/db/tenant-repository", () => ({
  listTenantOutlets: vi.fn(async () => mocks.outlets),
}));

vi.mock("@/db/ledger-repository", () => ({
  listLatestReconciliationVariances: vi.fn(async () => {
    mocks.latestVarianceCalls += 1;
    return { rows: mocks.reconciliations, totalCount: mocks.reconciliations.length };
  }),
  listLedgerEntries: vi.fn(async (_tx, _context, range, pagination) => {
    mocks.entryCalls.push({ pagination, range });
    return mocks.entries;
  }),
  listLedgerReconciliations: vi.fn(async () => {
    mocks.regularReconciliationCalls += 1;
    return mocks.reconciliations;
  }),
  summarizeLedger: vi.fn(async () => mocks.summary),
}));

vi.mock("@/db/provider-settlement-repository", () => ({
  listProviderSettlementReview: vi.fn(async (_tx, _context, filter) => {
    mocks.settlementCalls.push(filter);
    return mocks.settlement;
  }),
}));

vi.mock("@/app/app/keuangan/actions", () => ({
  pullMengantarSettlement: vi.fn(async () => ({})),
  reverseLedgerEntry: vi.fn(async () => ({})),
  runLedgerReconciliation: vi.fn(async () => ({})),
}));

function customParams(
  overrides: Record<string, string | string[] | undefined> = {},
) {
  return {
    dari: "2026-08-01",
    khusus: "1",
    outlet: OUTLET_ID,
    rentang: "kustom",
    sampai: "2026-08-31",
    tz: "Asia/Jakarta",
    ...overrides,
  };
}

async function renderPage(
  params: Record<string, string | string[] | undefined> = customParams(),
) {
  const { default: FinancePage } = await import("@/app/app/keuangan/page");
  const element = await FinancePage({ searchParams: Promise.resolve(params) });
  return renderToStaticMarkup(element);
}

function populatedFixtures() {
  mocks.summary = {
    codPrincipalLiabilityIdr: 425_000,
    providerCostIdr: 17_000,
    revenueIdr: 12_500,
    upstreamRecoveryPaymentIdr: 8_000,
    legacyCodFeeVatIdr: 1_375,
  };
  mocks.entries = {
    totalCount: 101,
    rows: [{
      adjustmentState: "AVAILABLE",
      amountIdr: 425_000,
      effectiveAt: new Date("2026-08-20T05:00:00.000Z"),
      entryType: "COD_PRINCIPAL_COLLECTABLE",
      financialClass: "LIABILITY",
      id: ENTRY_ID,
      outletName: "Outlet Jakarta",
      reversesEntryId: null,
      shipmentId: SHIPMENT_ID,
      publicReference: "GC-10431",
      reversedEntryType: null,
      sourceEvent: "PROVIDER_ORDER_ISSUED",
      sourceEventId: "provider-order-fixture",
    }],
  };
  mocks.reconciliations = [{
    cadence: "DAILY",
    createdAt: new Date("2026-08-21T00:00:00.000Z"),
    id: "00000000-0000-4000-8000-000000000441",
    ledgerTotalIdr: 425_000,
    outletId: OUTLET_ID,
    outletName: "Outlet Jakarta",
    periodEnd: new Date("2026-08-21T00:00:00.000Z"),
    periodStart: new Date("2026-08-20T00:00:00.000Z"),
    reconciledEntryType: "COD_PRINCIPAL_COLLECTABLE",
    sourceTotalIdr: 424_500,
    status: "VARIANCE",
    varianceIdr: -500,
  }];
}

beforeEach(() => {
  mocks.authorizationDenied = false;
  mocks.contextCalls = 0;
  mocks.entries = { rows: [], totalCount: 0 };
  mocks.entryCalls.length = 0;
  mocks.latestVarianceCalls = 0;
  mocks.outlets = [{ id: OUTLET_ID, name: "Outlet Jakarta" }];
  mocks.principal = {
    role: "TENANT_ADMIN",
    scope: "tenant",
    tenantId: TENANT_ID,
    userId: "finance-admin",
  };
  mocks.reconciliations.length = 0;
  mocks.regularReconciliationCalls = 0;
  mocks.settlement = { rows: [], latestPull: null, limit: 100 };
  mocks.settlementCalls.length = 0;
  mocks.summary = {
    codPrincipalLiabilityIdr: 0,
    providerCostIdr: 0,
    revenueIdr: 0,
    upstreamRecoveryPaymentIdr: 0,
    legacyCodFeeVatIdr: 0,
  };
});

describe("Finance page acceptance", () => {
  it.each([
    ["OPERATOR", "tenant", "/app"],
    ["TENANT_ADMIN", "platform", "/login/tenant"],
  ] as const)(
    "redirects a %s/%s principal before search parameters or financial reads",
    async (role, scope, destination) => {
      mocks.principal.role = role;
      mocks.principal.scope = scope;
      const unreadableParams = {
        then: vi.fn(() => {
          throw new Error("SEARCH_PARAMS_READ_BEFORE_ROLE_CHECK");
        }),
      } as unknown as Promise<Record<string, string | string[] | undefined>>;
      const { default: FinancePage } = await import("@/app/app/keuangan/page");

      await expect(FinancePage({ searchParams: unreadableParams })).rejects.toThrow(
        `REDIRECT:${destination}`,
      );
      expect(unreadableParams.then).not.toHaveBeenCalled();
      expect(mocks.contextCalls).toBe(0);
    },
  );

  it("renders a truthful empty workspace with distinct financial classes", async () => {
    const html = await renderPage();

    expect(html).toContain("Pokok COD — liabilitas");
    expect(html).toContain("Bukan pendapatan GeraiCUAN");
    expect(html).toContain("Biaya provider");
    // T-178: new COD fees are Mengantar's cost; the revenue card holds only entries posted before the change, and says so.
    expect(html).toContain("Pendapatan jasa COD (entri lama)");
    expect(html).toContain("Biaya COD kini dicatat sebagai biaya provider karena dipotong Mengantar.");
    // T-193: historical VAT rows are part of Mengantar's COD fee, never a payable.
    expect(html).not.toMatch(/PPN terutang|PPN jasa COD terutang/);
    expect(html).toContain("PPN dalam biaya COD (dipotong Mengantar)");
    expect(html).toContain("bukan kewajiban GeraiCUAN, dan tidak dihitung sebagai utang");
    expect(html).toContain("Pemulihan non-COD");
    expect(html).toContain("Belum ada rekonsiliasi pada periode ini");
    expect(html).toContain("Tidak ada entri pada");
    // T-163: the `khusus=1` custom-range button is gone — the one date-range
    // control writes `rentang=kustom` with the dates directly, so no submit
    // button in this form may force a custom range any more. `khusus` stays
    // *parsed* for old links; the URL-contract test binds that.
    const filterForm = html.slice(html.indexOf('id="finance-filter-fields"'), html.indexOf("</form>"));
    const firstSubmit = filterForm.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "";
    expect(firstSubmit).not.toBe("");
    expect(filterForm).not.toContain('name="khusus"');
    // The range travels as the three canonical parameters, always present in
    // the form whether the panel is open or shut.
    expect(filterForm).toContain('name="rentang"');
    expect(filterForm).toContain('name="dari"');
    expect(filterForm).toContain('name="sampai"');
    expect(filterForm).not.toContain('name="tz"');
    expect(filterForm).not.toContain("Zona waktu");
    // Submit and reset return focus to this heading, so it must be visible, not sr-only.
    const filterHeading = html.match(/<h2[^>]*id="finance-filter-title"[^>]*>/)?.[0] ?? "";
    expect(filterHeading).toContain('tabindex="-1"');
    expect(filterHeading).not.toContain("sr-only");
    expect(mocks.entryCalls).toEqual([{
      pagination: { limit: 50, offset: 0 },
      range: {
        end: new Date("2026-08-31T17:00:00.000Z"),
        outletId: OUTLET_ID,
        start: new Date("2026-07-31T17:00:00.000Z"),
      },
    }]);
  });

  it("renders populated money and variance tables as local scrollers with sticky context", async () => {
    populatedFixtures();
    const html = await renderPage();
    expect(html.replace(/<[^>]+>/g, " ")).toContain("GC-10431");
    expect(html.replace(/<[^>]+>/g, " ")).not.toContain(SHIPMENT_ID);
    const scrollers = html.match(
      /<div[^>]*role="region"[^>]*tabindex="0"[^>]*>\s*<table/g,
    ) ?? [];

    expect(scrollers).toHaveLength(2);
    expect(scrollers.every((scroller) => scroller.includes("overflow-x-auto"))).toBe(true);
    expect((html.match(/sticky left-0/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(html).toContain("text-right tabular-nums");
    expect(html).toContain("Liabilitas");
    expect(html).toContain("Ada selisih");
    expect(html).toMatch(/(?:−|-).*500/);
    expect(html.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain("Rekonsiliasi harian");
    expect(html).toContain("Rekonsiliasi bulanan");
    expect(html).toContain("Buat pembalik");
    expect(html).toContain('id="reconciliation-history-title"');
    expect(html).toContain('tabindex="-1"');
  });

  it("presents a historical VAT row and its reversal as part of Mengantar's COD fee, not a liability (T-193)", async () => {
    const vatRow = {
      adjustmentState: "ADJUSTED", amountIdr: 363, effectiveAt: new Date("2026-08-20T05:00:00.000Z"),
      entryType: "COD_SERVICE_FEE_VAT_PAYABLE", financialClass: "LIABILITY", id: "00000000-0000-4000-8000-000000000451",
      outletName: "Outlet Jakarta", publicReference: "GC-10431", reversedEntryType: null, reversesEntryId: null,
      shipmentId: SHIPMENT_ID, sourceEvent: "PROVIDER_ORDER_ISSUED", sourceEventId: "provider-order-fixture",
    };
    const reversal = {
      ...vatRow, adjustmentState: "INELIGIBLE", amountIdr: -363, entryType: "ADJUSTMENT", id: "00000000-0000-4000-8000-000000000452",
      reversedEntryType: "COD_SERVICE_FEE_VAT_PAYABLE", reversesEntryId: vatRow.id, sourceEvent: "MANUAL_ADJUSTMENT", sourceEventId: vatRow.id,
    };
    mocks.entries = { rows: [vatRow, reversal], totalCount: 2 };
    mocks.summary = { ...mocks.summary, legacyCodFeeVatIdr: 363 };
    const html = await renderPage();
    const table = html.slice(html.indexOf('aria-label="Tabel entri ledger"'));
    const rows = table.match(/<tr\b[^>]*id=|<tr\b[\s\S]*?<\/tr>/g)?.filter((row) => row.includes("GC-10431")) ?? [];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toContain("Bagian biaya COD, bukan kewajiban");
      expect(row).not.toContain("Liabilitas");
    }
    expect(rows[0]).toContain("PPN dalam biaya COD (dipotong Mengantar) · entri lama");
    expect(html).not.toContain("PPN terutang");
  });

  it("preserves the visible variance filter through controls and pagination", async () => {
    populatedFixtures();
    const html = await renderPage(customParams({ halaman: "2", status: "VARIANCE" }));

    expect(mocks.latestVarianceCalls).toBe(1);
    expect(mocks.regularReconciliationCalls).toBe(0);
    expect(html).toContain("Antrean selisih rekonsiliasi");
    expect(html).toMatch(/name="status"[^>]*value="VARIANCE"|value="VARIANCE"[^>]*selected/);
    expect(html).toMatch(/href="[^"]*status=VARIANCE[^"]*halaman=3|href="[^"]*halaman=3[^"]*status=VARIANCE/);
    expect(html).toContain("Snapshot tenant-wide terbaru");
  });

  it("does not treat query parameters as a forgeable action result", async () => {
    const html = await renderPage(customParams({
      acceptedAttemptId: "00000000-0000-4000-8000-000000000499",
      message: "FORGED-FINANCE-SUCCESS",
      result: "success",
    }));

    expect(html).not.toContain("FORGED-FINANCE-SUCCESS");
    expect(html).not.toContain("Tindakan selesai");
  });

  it("fails an invalid status closed without rendering reconciliation rows", async () => {
    populatedFixtures();
    mocks.reconciliations[0] = {
      ...mocks.reconciliations[0],
      outletName: "SHOULD-NOT-RENDER-INVALID-STATUS",
    };

    const html = await renderPage(customParams({ status: "BAD" }));

    expect(html).toContain("Status filter tidak dikenal");
    expect(html).not.toContain("SHOULD-NOT-RENDER-INVALID-STATUS");
    expect(mocks.latestVarianceCalls).toBe(0);
    expect(mocks.regularReconciliationCalls).toBe(0);
  });
  it("offers a read-only Mengantar pull and explains an account that has never been pulled", async () => {
    const html = await renderPage();
    const text = html.replace(/<[^>]+>/g, " ");
    expect(mocks.settlementCalls).toEqual([{ outletId: OUTLET_ID }]);
    expect(text).toContain("Pencairan Mengantar");
    expect(text).toContain("Data Mengantar belum pernah ditarik.");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Tarik data Mengantar<\/button>/);
    expect(text).toContain("tidak membuat order dan tidak mengubah ledger");
    expect(html).toMatch(/<select[^>]*name="outletId"/);
  });

  it("renders per-AWB settlement evidence with signed variance and hides shared-account volume", async () => {
    mocks.settlement = {
      limit: 100,
      latestPull: {
        createdAt: new Date("2026-09-15T03:00:00.000Z"), credentialSource: "platform_default", invoiceCount: null,
        matchedItemCount: 2, matchedStatusCount: 1, orderCount: null, outletName: "Outlet Jakarta",
        periodEnd: new Date("2026-09-30T17:00:00.000Z"), periodStart: new Date("2026-08-31T17:00:00.000Z"), unmatchedAwbCount: null,
      },
      rows: [
        { shipmentId: SHIPMENT_ID, publicReference: "GC-10431", cnoteNo: "SANITIZED-CNOTE-0002", outletName: "Outlet Jakarta", isCod: true,
          settledIdr: 97_878.0221, providerCodAmountIdr: 113_663, providerShippingIdr: 15_784.9779, chargeIdr: 0, refundIdr: 0,
          latestProviderStatus: "DELIVERED", expectedPayoutIdr: 99_878.0221, varianceIdr: -2_000, settlementClass: "AMOUNT_MISMATCH" },
        { shipmentId: "00000000-0000-4000-8000-000000000432", publicReference: "GC-10432", cnoteNo: "SANITIZED-CNOTE-0005", outletName: "Outlet Jakarta", isCod: true,
          settledIdr: null, providerCodAmountIdr: null, providerShippingIdr: null, chargeIdr: 0, refundIdr: 0,
          latestProviderStatus: "DELIVERED", expectedPayoutIdr: 103_663, varianceIdr: null, settlementClass: "DELIVERED_UNPAID" },
      ],
    };
    const html = await renderPage();
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const table = html.slice(html.indexOf('aria-label="Tabel pencairan Mengantar"'));
    expect(table).toMatch(/<table/);
    expect(text).toContain("Nominal beda");
    expect(text).toContain("Terkirim, belum cair");
    expect(text).toMatch(/−Rp\s?2\.000|-Rp\s?2\.000/);
    // T-178: Mengantar settles in fractions of a rupiah; the table shows the sen instead of rounding them away.
    expect(text).toMatch(/Rp\s?97\.878,02/);
    expect(text).toMatch(/Rp\s?99\.878,02/);
    expect(text).toMatch(/Rp\s?15\.784,98/);
    expect(text).toContain("Potongan Mengantar (ongkir + biaya COD)");
    expect(text).toContain("COD − ongkir ledger − biaya COD Mengantar 3,33% dari COD");
    expect(text).toContain("SANITIZED-CNOTE-0002");
    expect(text).toContain("akun platform bersama: total dan resi di luar tenant ini tidak ditampilkan");
    expect(text).not.toMatch(/invoice, .* order diperiksa/);
    expect(text).not.toMatch(/resi bukan dari GeraiCUAN diabaikan/);
    expect(text).not.toContain(SHIPMENT_ID);
    expect(html).toContain('href="/app/pengiriman/10431"');
  });
  it("degrades only the settlement section when its read fails", async () => {
    populatedFixtures();
    const { listProviderSettlementReview } = await import("@/db/provider-settlement-repository");
    vi.mocked(listProviderSettlementReview).mockRejectedValueOnce(new Error("settlement read failed"));
    const html = await renderPage();
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).toContain("Pencairan Mengantar tidak dapat dimuat");
    expect(text).toContain("Buat pembalik");
    expect(text).not.toContain("Data Mengantar belum pernah ditarik.");
  });
});
