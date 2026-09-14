import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type DataTablePaginationProps = {
  /** 1-based current page, as the server resolved it. */
  page: number;
  totalPages: number;
  totalCount: number;
  hrefForPage: (page: number) => string;
  /** Current rows per page; with `pageSizeOptions` and `hrefForPageSize` renders the rows-per-page menu. */
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  hrefForPageSize?: (pageSize: number) => string;
  /** Left-side summary; defaults to "{totalCount} data". */
  summary?: ReactNode;
  /** Landmark name; defaults to "Navigasi halaman". */
  label?: string;
  className?: string;
};

const numberFormatter = new Intl.NumberFormat("id-ID");

/**
 * Page numbers with ellipses, shadcn-admin style: all pages up to five,
 * otherwise the first, the last, and the current page with its neighbours.
 */
export function getPageNumbers(page: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(page - 1, totalPages - 3));
  const end = Math.min(totalPages - 1, Math.max(page + 1, 4));
  const middle = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  return [
    1,
    ...(start > 2 ? (["ellipsis"] as const) : []),
    ...middle,
    ...(end < totalPages - 1 ? (["ellipsis"] as const) : []),
    totalPages,
  ];
}

const iconButton = "size-8 max-md:size-11";

function PageLink({
  children,
  disabled,
  href,
  label,
}: {
  children: ReactNode;
  disabled: boolean;
  /** Called only when enabled, so callers never build a URL for page 0 or pages + 1. */
  href: () => string;
  label: string;
}) {
  if (disabled) {
    return (
      <Button aria-label={label} className={iconButton} disabled size="icon" type="button" variant="outline">
        {children}
      </Button>
    );
  }
  return (
    <Button asChild className={iconButton} size="icon" variant="outline">
      <Link aria-label={label} href={href()} prefetch={false}>{children}</Link>
    </Button>
  );
}

/** Server-paginated table footer: rows per page, "Halaman X dari Y", and page links. Server component. */
export function DataTablePagination({
  className,
  hrefForPage,
  hrefForPageSize,
  label = "Navigasi halaman",
  page,
  pageSize,
  pageSizeOptions,
  summary,
  totalCount,
  totalPages,
}: DataTablePaginationProps) {
  const pages = Math.max(1, Math.floor(totalPages));
  const current = Math.min(Math.max(1, Math.floor(page)), pages);
  const first = current <= 1;
  const last = current >= pages;

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-3", className)}>
      <div className="text-sm text-muted-foreground">
        {summary ?? `${numberFormatter.format(totalCount)} data`}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {pageSize !== undefined && pageSizeOptions?.length && hrefForPageSize ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Baris per halaman</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`Baris per halaman: ${pageSize}`}
                  className="h-8 w-[4.5rem] justify-between max-md:min-h-11"
                  size="sm"
                  variant="outline"
                >
                  {pageSize}
                  <ChevronDown aria-hidden="true" className="opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[4.5rem]">
                {pageSizeOptions.map((size) => (
                  <DropdownMenuItem asChild className="max-md:min-h-11" key={size}>
                    <Link aria-current={size === pageSize ? "true" : undefined} href={hrefForPageSize(size)} prefetch={false}>
                      {size}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
        <nav aria-label={label} className="flex flex-wrap items-center gap-2">
          <span className="me-2 text-sm font-medium">
            Halaman {numberFormatter.format(current)} dari {numberFormatter.format(pages)}
          </span>
          <PageLink disabled={first} href={() => hrefForPage(1)} label="Halaman pertama">
            <ChevronsLeft aria-hidden="true" />
          </PageLink>
          <PageLink disabled={first} href={() => hrefForPage(current - 1)} label="Halaman sebelumnya">
            <ChevronLeft aria-hidden="true" />
          </PageLink>
          {/* Numbers are desktop-only: eleven 44px targets overflow a 390px screen. */}
          <ul className="hidden items-center gap-2 md:flex">
            {getPageNumbers(current, pages).map((item, index) => (
              <li key={item === "ellipsis" ? `ellipsis-${index}` : item}>
                {item === "ellipsis" ? (
                  <span aria-hidden="true" className="px-1 text-sm text-muted-foreground">…</span>
                ) : (
                  <Button asChild className="h-8 w-auto min-w-8 px-2" size="icon" variant={item === current ? "default" : "outline"}>
                    <Link
                      aria-current={item === current ? "page" : undefined}
                      aria-label={`Halaman ${item}`}
                      href={hrefForPage(item)}
                      prefetch={false}
                    >
                      {numberFormatter.format(item)}
                    </Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <PageLink disabled={last} href={() => hrefForPage(current + 1)} label="Halaman berikutnya">
            <ChevronRight aria-hidden="true" />
          </PageLink>
          <PageLink disabled={last} href={() => hrefForPage(pages)} label="Halaman terakhir">
            <ChevronsRight aria-hidden="true" />
          </PageLink>
        </nav>
      </div>
    </div>
  );
}
