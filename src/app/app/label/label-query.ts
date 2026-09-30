import { firstValue, type SearchValue } from "@/app/app/pengiriman/_list/search-params";
import type { LabelPrintStateFilter } from "@/db/label-print-repository";

export const LABEL_PAGE_SIZE = 20;

/**
 * Spec 19 LBL-SHARE: the base the queue tiles' shares are taken of. T-270 (owner 2026-10-01): the
 * three queues (Belum dicetak, Siap diserahkan, Diserahkan) ignore the period and partition every
 * printable resi, so their sum is the base; Semua resi and Dibatalkan follow the period and carry
 * no share (was T-247: LBL-ALL + LBL-CANCELLED, when every tile shared one period).
 */
export function labelTileShareBase(summary: { "LBL-UNPRINTED": number; "LBL-PRINTED": number; "LBL-HANDED-OVER": number }) {
  return summary["LBL-UNPRINTED"] + summary["LBL-PRINTED"] + summary["LBL-HANDED-OVER"];
}

/** The repository's own rule for an AWB suffix; a value outside it lists nothing. */
export const AWB_SUFFIX_PATTERN = /^[a-z0-9]{3,24}$/i;

export const AWB_SUFFIX_ERROR = "Masukkan 3–24 huruf atau angka terakhir dari nomor resi.";

export type LabelQuery = {
  awbSuffix: string;
  /** Set when `awbSuffix` breaks the pattern; the list is then empty, not a guess. */
  awbSuffixError: string | null;
  page: number;
  printState: LabelPrintStateFilter;
};

/**
 * T-263: Cetak resi is the counter's queue and opens on "Belum dicetak"; "Semua" is `cetak=semua`.
 * The default is the one state the URL leaves out, so a shared link always means the same list.
 */
export const DEFAULT_PRINT_STATE: LabelPrintStateFilter = "belum";

/** The pre-v3 URL contract: `q` (AWB suffix, never recipient data), `cetak`, and `page`. */
export function parseLabelQuery(params: Record<string, SearchValue>): LabelQuery {
  const awbSuffix = (firstValue(params.q) ?? "").trim();
  const cetak = firstValue(params.cetak);
  const requestedPage = Number(firstValue(params.page) ?? "1");
  return {
    awbSuffix,
    awbSuffixError: awbSuffix && !AWB_SUFFIX_PATTERN.test(awbSuffix) ? AWB_SUFFIX_ERROR : null,
    page: Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1,
    printState: cetak === "semua" || cetak === "belum" || cetak === "sudah" || cetak === "diserahkan" || cetak === "batal" ? cetak : DEFAULT_PRINT_STATE,
  };
}

/** Every link keeps the PR-53 period (`carry`) and the suffix. */
export function labelIndexHref(
  input: { awbSuffix?: string; page?: number; printState?: LabelPrintStateFilter },
  carry?: Readonly<Record<string, string>>,
) {
  const params = new URLSearchParams(carry ?? {});
  for (const key of ["q", "cetak", "page"]) params.delete(key);
  if (input.awbSuffix) params.set("q", input.awbSuffix);
  if (input.printState && input.printState !== DEFAULT_PRINT_STATE) params.set("cetak", input.printState);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return `/app/label${query ? `?${query}` : ""}`;
}
