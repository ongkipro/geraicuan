import { Children, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Spec 10 §6 record list (T-203, V-9): below `md` a list page renders its rows as cards
 * instead of a sideways-scrolling table; the table stays for `md` and up. Anatomy, top to
 * bottom: title (the one link) + status → primary line → secondary line → footer (value
 * start, time end). Only what the operator needs to recognise and choose a row; the rest
 * lives on the detail page. Server component; the caller hides its table below `md`.
 */
const listClassName = "divide-y overflow-hidden rounded-xl bg-card border";

/**
 * `initial`: on a long page only the first rows show; the rest sit behind one native
 * "Tampilkan N lainnya" disclosure, so the phone page stays short and nothing is dropped.
 */
export function RecordList({ children, className, initial, label }: { children: ReactNode; className?: string; initial?: number; label: string }) {
  const rows = Children.toArray(children);
  if (!initial || rows.length <= initial) {
    return <ul aria-label={label} className={cn(listClassName, "md:hidden", className)}>{rows}</ul>;
  }
  const rest = rows.length - initial;
  return (
    <div className="grid gap-2 md:hidden">
      <ul aria-label={label} className={cn(listClassName, className)}>{rows.slice(0, initial)}</ul>
      <details className="group grid gap-2">
        <summary className="inline-flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-lg px-1 text-sm font-medium text-primary underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Tampilkan {rest} lainnya</span>
          <span className="hidden group-open:inline">Sembunyikan {rest} lainnya</span>
        </summary>
        <ul aria-label={`${label} (lanjutan)`} className={cn(listClassName, className)}>{rows.slice(initial)}</ul>
      </details>
    </div>
  );
}

export type RecordItemProps = Omit<ComponentProps<"li">, "title" | "value"> & {
  /** The row's identity, usually its one link (min 44px target). */
  title: ReactNode;
  /** Status badge (icon + text), top right. */
  status?: ReactNode;
  /** Most important descriptive line, e.g. recipient · area. */
  primary?: ReactNode;
  /** Supporting line, e.g. courier · AWB. Muted. */
  secondary?: ReactNode;
  /** Footer start: the value that matters (money, count). */
  value?: ReactNode;
  /** Footer end: time or a small action. */
  meta?: ReactNode;
};

export function RecordItem({ className, meta, primary, secondary, status, title, value, ...props }: RecordItemProps) {
  return (
    <li className={cn("grid gap-1.5 px-4 py-3", className)} {...props}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0 text-base font-semibold [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">{title}</div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      {primary ? <div className="min-w-0 text-sm wrap-anywhere text-foreground">{primary}</div> : null}
      {secondary ? <div className="min-w-0 text-sm wrap-anywhere text-muted-foreground">{secondary}</div> : null}
      {value || meta ? (
        <div className="flex min-w-0 items-baseline justify-between gap-3 pt-0.5">
          {/* The value never breaks (an amount split from its label misreads); the time wraps instead. */}
          <div className="shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums">{value}</div>
          <div className="min-w-0 text-right text-sm text-muted-foreground">{meta}</div>
        </div>
      ) : null}
    </li>
  );
}

/** Class for a list page's desktop table container once a `RecordList` covers mobile. */
export const desktopTableClassName = "max-md:hidden";
