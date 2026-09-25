import { firstValue, type SearchValue } from "@/app/app/pengiriman/_list/search-params";
import type { LabelPrintStateFilter } from "@/db/label-print-repository";

export const LABEL_PAGE_SIZE = 20;

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

/** The pre-v3 URL contract: `q` (AWB suffix, never recipient data), `cetak`, and `page`. */
export function parseLabelQuery(params: Record<string, SearchValue>): LabelQuery {
  const awbSuffix = (firstValue(params.q) ?? "").trim();
  const cetak = firstValue(params.cetak);
  const requestedPage = Number(firstValue(params.page) ?? "1");
  return {
    awbSuffix,
    awbSuffixError: awbSuffix && !AWB_SUFFIX_PATTERN.test(awbSuffix) ? AWB_SUFFIX_ERROR : null,
    page: Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1,
    printState: cetak === "belum" || cetak === "sudah" ? cetak : "semua",
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
  if (input.printState && input.printState !== "semua") params.set("cetak", input.printState);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return `/app/label${query ? `?${query}` : ""}`;
}
