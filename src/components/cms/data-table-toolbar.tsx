import { Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DataTableFacetFilter, type DataTableFacet } from "@/components/cms/data-table-facet-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type { DataTableFacet, DataTableFacetOption } from "@/components/cms/data-table-facet-filter";

export type DataTableSearch = {
  /** Query parameter name, e.g. "q". */
  name: string;
  /** Accessible label (visually hidden), e.g. "Cari kiriman". */
  label: string;
  placeholder?: string;
  defaultValue?: string;
  /** Form action; defaults to the current URL. */
  action?: string;
  /** Other URL params to keep on submit (filters, sort). Omit `page` so a new search starts on page 1. */
  hiddenParams?: Readonly<Record<string, string | readonly string[] | null | undefined>>;
  /** Stable id for the input; defaults to `data-table-search-${name}`. */
  id?: string;
};

export type DataTableToolbarProps = {
  search?: DataTableSearch;
  facets?: readonly DataTableFacet[];
  /** URL with every filter cleared. Required for the Reset link to render. */
  resetHref?: string;
  /** Override the derived "any filter active" state (search value or a selected facet option). */
  isFiltered?: boolean;
  /** Extra left-side controls after the facets (e.g. a date range). */
  children?: ReactNode;
  /** Right-aligned slot, e.g. view options or an export button. */
  actions?: ReactNode;
  className?: string;
};

function hiddenInputs(params: DataTableSearch["hiddenParams"]) {
  if (!params) return null;
  return Object.entries(params).flatMap(([name, value]) => {
    if (value === null || value === undefined) return [];
    const values = typeof value === "string" ? [value] : value;
    return values.map((item, index) => <input key={`${name}-${index}`} name={name} type="hidden" value={item} />);
  });
}

/**
 * shadcn-admin table toolbar as URL navigation: a GET search form, faceted
 * filter links, a Reset link when filtered, and a right slot. Server component.
 * T-203: unframed row of 40px controls (44px below md), every trigger named in words.
 */
export function DataTableToolbar({ actions, children, className, facets, isFiltered, resetHref, search }: DataTableToolbarProps) {
  const filtered = isFiltered
    ?? (Boolean(search?.defaultValue?.trim()) || Boolean(facets?.some((facet) => facet.options.some((option) => option.selected))));
  const searchId = search ? (search.id ?? `data-table-search-${search.name}`) : undefined;

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {search ? (
          <form action={search.action} className="relative flex items-center" method="get" role="search">
            {hiddenInputs(search.hiddenParams)}
            <label className="sr-only" htmlFor={searchId}>{search.label}</label>
            <Search aria-hidden="true" className="pointer-events-none absolute left-2 size-4 text-muted-foreground" />
            <Input
              className="h-10 w-40 pl-8 max-md:min-h-11 lg:w-64"
              defaultValue={search.defaultValue}
              id={searchId}
              name={search.name}
              placeholder={search.placeholder}
              type="search"
            />
            {/* Enter in the search field submits; keep this fallback out of the tab order so focus never lands on an invisible control. */}
            <button className="sr-only" tabIndex={-1} type="submit">Cari</button>
          </form>
        ) : null}
        {facets?.map((facet) => <DataTableFacetFilter key={facet.title} {...facet} />)}
        {children}
        {filtered && resetHref ? (
          // T-204: the reference's plain "Hapus filter" link, the same one the range filter row uses.
          <Button asChild className="h-10 px-1 text-xs font-normal text-muted-foreground underline hover:text-foreground max-md:min-h-11" variant="link">
            <Link href={resetHref} prefetch={false}>Hapus filter</Link>
          </Button>
        ) : null}
      </div>
      {actions ? <div className="ms-auto flex items-center gap-2 [&>*]:max-md:min-h-11">{actions}</div> : null}
    </div>
  );
}
