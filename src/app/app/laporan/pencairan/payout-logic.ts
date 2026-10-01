import type { OwnerPayoutState } from "@/db/owner-money-repository";
import { SETTLEMENT_MATCH_TOLERANCE_IDR } from "@/db/provider-settlement-repository";
import { serializeAnalyticsRange, type AnalyticsRange } from "@/lib/analytics-range";

export const PAYOUT_PATH = "/app/laporan/pencairan";
export const PAYOUT_PAGE_SIZE = 20;

/** T-275: the Pencairan COD views, in the order an owner works them; `?status=`. */
export const PAYOUT_TABS = [
  { key: "belum", label: "Belum cair", state: "BELUM_CAIR" },
  { key: "dicek", label: "Perlu dicek", state: "PERLU_DICEK" },
  { key: "cair", label: "Sudah cair", state: "SUDAH_CAIR" },
  { key: "retur", label: "Retur", state: "RETUR" },
] as const satisfies readonly { key: string; label: string; state: OwnerPayoutState }[];

export type PayoutTabKey = (typeof PAYOUT_TABS)[number]["key"];

export function parsePayoutTab(value: string | string[] | undefined): PayoutTabKey {
  const key = Array.isArray(value) ? value[0] : value;
  return PAYOUT_TABS.find((tab) => tab.key === key)?.key ?? "belum";
}

/** Range and outlet carried into tab and page links; never the page itself. */
export function payoutCarry(range: AnalyticsRange, outletId: string | null): Record<string, string> {
  const params = serializeAnalyticsRange(range);
  if (outletId) params.set("outlet", outletId);
  return Object.fromEntries(params);
}

export function payoutHref(tab: PayoutTabKey, page: number, carry: Readonly<Record<string, string>>) {
  const params = new URLSearchParams(carry);
  if (tab !== "belum") params.set("status", tab);
  if (page > 1) params.set("halaman", String(page));
  const query = params.toString();
  return query ? `${PAYOUT_PATH}?${query}` : PAYOUT_PATH;
}

const rupiah = new Intl.NumberFormat("id-ID", { currency: "IDR", maximumFractionDigits: 2, minimumFractionDigits: 0, style: "currency" });

/**
 * SETTLE-VARIANCE-IDR on screen: "Sesuai" within the proven half-sen tolerance (T-178), else the
 * signed difference — to the sen below one rupiah, so a real shortfall never reads "Rp 0".
 */
export function formatPayoutVariance(units: bigint | null): string {
  if (units === null) return "—";
  const idr = Number(units) / 10_000;
  if (Math.abs(idr) <= SETTLEMENT_MATCH_TOLERANCE_IDR) return "Sesuai";
  const amount = Math.abs(idr) < 1 ? rupiah.format(Math.abs(idr)) : rupiah.format(Math.round(Math.abs(idr)));
  return `${idr < 0 ? "−" : "+"}${amount}`;
}
