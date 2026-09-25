import { firstValue, type SearchValue } from "@/app/app/pengiriman/_list/search-params";
import type { RtsFilterStatus } from "@/db/rts-repository";

export const RTS_PAGE_SIZE = 20;

/** The pre-v3 URL contract: `status` (one RTS state or PROBLEM) and `page`. */
export function parseRtsQuery(input: { page?: SearchValue; status?: SearchValue }) {
  const issues: string[] = [];
  const requestedStatus = firstValue(input.status);
  let status: RtsFilterStatus = "ALL";
  if (requestedStatus && requestedStatus !== "ALL") {
    if (requestedStatus === "RTS_QUEUED" || requestedStatus === "RTS_IN_TRANSIT" || requestedStatus === "RTS_RECEIVED" || requestedStatus === "PROBLEM") {
      status = requestedStatus;
    } else {
      issues.push("Status tidak dikenali; semua retur ditampilkan.");
    }
  }
  const requestedPage = firstValue(input.page);
  let page = 1;
  if (requestedPage) {
    const parsed = Number(requestedPage);
    if (Number.isSafeInteger(parsed) && parsed >= 1) page = parsed;
    else issues.push("Nomor halaman tidak valid; halaman pertama ditampilkan.");
  }
  return { issues, page, status };
}

/** Every link keeps the PR-53 period (`carry`). */
export function rtsHref(status: RtsFilterStatus, page = 1, carry?: Readonly<Record<string, string>>) {
  const params = new URLSearchParams(carry ?? {});
  params.delete("status");
  params.delete("page");
  if (status !== "ALL") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/app/pengiriman/rts${query ? `?${query}` : ""}`;
}
