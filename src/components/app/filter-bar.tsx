import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * Spec 10 §4.2 filter row, on the ground (no card): the date range, outlet and other primary
 * filters, "Terapkan" (outline), and "Hapus filter" when the filters differ from the default.
 * A plain GET form, so the server loaders read the same URL parameters they always have and
 * the row works before hydration. Controls carry sr-only names, not visible labels.
 */
export function FilterBar({
  action,
  children,
  clearHref,
  hidden,
  label = "Filter",
  summary,
}: {
  /** Form action; defaults to the current URL. */
  action?: string;
  children: ReactNode;
  /** Shown as "Hapus filter" only when set (i.e. the filters are not the default). */
  clearHref?: string;
  /** Parameters to carry through a submit unchanged (e.g. a selected status tile). */
  hidden?: Record<string, string | undefined>;
  label?: string;
  /** The one 13px line under the row, e.g. the active period. */
  summary?: ReactNode;
}) {
  return (
    <form action={action} aria-label={label} className="flex flex-col gap-2" method="get" role="search">
      {Object.entries(hidden ?? {}).map(([name, value]) =>
        value === undefined ? null : <input key={name} name={name} type="hidden" value={value} />,
      )}
      <div className="flex flex-wrap items-center gap-3">
        {children}
        <Button className="font-semibold" type="submit" variant="outline">Terapkan</Button>
        {clearHref ? (
          <Link
            className="inline-flex min-h-11 items-center px-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground md:min-h-10"
            href={clearHref}
          >
            Hapus filter
          </Link>
        ) : null}
      </div>
      {summary ? <p className="text-xs text-muted-foreground">{summary}</p> : null}
    </form>
  );
}
