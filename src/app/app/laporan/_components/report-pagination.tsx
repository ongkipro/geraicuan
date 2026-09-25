import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const number = new Intl.NumberFormat("id-ID");

/** The rows a page shows, 1-based and inclusive; `{ from: 0, to: 0 }` for an empty list. */
export function pageWindow(page: number, pageSize: number, total: number) {
  if (total <= 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(total, page * pageSize) };
}

/**
 * The card footer of a report list (spec 10 §4.4): "Menampilkan 1–50 dari 134 kiriman" and
 * Sebelumnya / Selanjutnya as outline links. An edge that does not exist is a disabled button,
 * never a dead link.
 */
export function ReportPagination({
  hrefForPage,
  label,
  noun,
  page,
  pageSize,
  total,
  totalPages,
}: {
  hrefForPage: (page: number) => string;
  label: string;
  /** "kiriman", "catatan". */
  noun: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}) {
  const { from, to } = pageWindow(page, pageSize, total);
  return (
    <nav aria-label={label} className="flex w-full flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        Menampilkan {number.format(from)}–{number.format(to)} dari {number.format(total)} {noun}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link href={hrefForPage(page - 1)} rel="prev"><ChevronLeft aria-hidden="true" />Sebelumnya</Link>
            </Button>
          ) : (
            <Button disabled type="button" variant="outline"><ChevronLeft aria-hidden="true" />Sebelumnya</Button>
          )}
          <span className="px-1 text-sm text-muted-foreground tabular-nums">
            <span className="sr-only">Halaman </span>{number.format(page)}/{number.format(totalPages)}
          </span>
          {page < totalPages ? (
            <Button asChild variant="outline">
              <Link href={hrefForPage(page + 1)} rel="next">Selanjutnya<ChevronRight aria-hidden="true" /></Link>
            </Button>
          ) : (
            <Button disabled type="button" variant="outline">Selanjutnya<ChevronRight aria-hidden="true" /></Button>
          )}
        </div>
      ) : null}
    </nav>
  );
}
