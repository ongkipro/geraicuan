import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("id-ID");

/** Up to five page numbers around the current one. */
export function pageWindow(page: number, totalPages: number, size = 5) {
  const start = Math.max(1, Math.min(page - Math.floor(size / 2), totalPages - size + 1));
  return Array.from({ length: Math.min(size, totalPages) }, (_, index) => start + index);
}

/**
 * Spec 10 §4.4 card footer: "Menampilkan 1–20 dari 48 kiriman" and page links. Plain links, so
 * paging works before hydration and keeps the rest of the URL state (`hrefForPage`).
 */
export function ListPagination({
  hrefForPage,
  label,
  noun,
  page,
  pageSize,
  totalCount,
  totalPages,
}: {
  hrefForPage: (page: number) => string;
  label: string;
  noun: string;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}) {
  const first = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalCount);
  return (
    <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between" data-slot="list-pagination">
      <p className="text-xs text-muted-foreground tabular-nums">
        Menampilkan <strong className="font-semibold text-foreground">{number.format(first)}–{number.format(last)}</strong> dari{" "}
        <strong className="font-semibold text-foreground">{number.format(totalCount)}</strong> {noun}
      </p>
      {totalPages > 1 ? (
        <nav aria-label={label}>
          <ul className="flex flex-wrap items-center gap-1">
            <li>
              <PageLink disabled={page <= 1} href={hrefForPage(page - 1)} label="Halaman sebelumnya">
                <ChevronLeft aria-hidden="true" />
                <span className="max-sm:sr-only">Sebelumnya</span>
              </PageLink>
            </li>
            {pageWindow(page, totalPages).map((item) => (
              <li key={item}>
                <Button
                  asChild
                  className={cn("min-w-10 px-2 tabular-nums", item === page && "border-primary bg-accent font-bold text-accent-foreground hover:bg-accent")}
                  variant="outline"
                >
                  <Link aria-current={item === page ? "page" : undefined} aria-label={`Halaman ${item}`} href={hrefForPage(item)}>
                    {item}
                  </Link>
                </Button>
              </li>
            ))}
            <li>
              <PageLink disabled={page >= totalPages} href={hrefForPage(page + 1)} label="Halaman berikutnya">
                <span className="max-sm:sr-only">Berikutnya</span>
                <ChevronRight aria-hidden="true" />
              </PageLink>
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({ children, disabled, href, label }: { children: ReactNode; disabled: boolean; href: string; label: string }) {
  if (disabled) {
    return (
      <Button aria-label={label} className="px-3" disabled type="button" variant="outline">
        {children}
      </Button>
    );
  }
  return (
    <Button asChild className="px-3" variant="outline">
      <Link aria-label={label} href={href}>{children}</Link>
    </Button>
  );
}
