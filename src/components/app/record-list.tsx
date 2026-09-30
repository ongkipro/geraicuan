import Link from "next/link";
import { Children, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const INITIAL_VISIBLE = 10;

/**
 * Spec 10 §4.5: below 768px a list becomes record cards. The first ten rows show; the rest sit
 * behind one native "Tampilkan N lainnya" disclosure (no client script).
 */
export function RecordList({ children, label }: { children: ReactNode; label: string }) {
  const items = Children.toArray(children);
  const shown = items.slice(0, INITIAL_VISIBLE);
  const rest = items.slice(INITIAL_VISIBLE);
  return (
    <div data-slot="record-list">
      <ul aria-label={label} className="divide-y">
        {shown}
      </ul>
      {rest.length ? (
        <details className="group border-t [&[open]>summary]:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center px-4 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
            Tampilkan {rest.length} lainnya
          </summary>
          <ul aria-label={`${label} (lanjutan)`} className="divide-y">
            {rest}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/**
 * One record card: identity link (16/600) + status right · who/where (15px) · courier and resi
 * (13px muted) · value left + time right.
 *
 * T-263: with `href`, the whole card is the tap target — the identity link stretches over the
 * card (its `::after`), so the link stays one named link for assistive technology and the
 * keyboard, and its focus ring draws around the card. `detail` (e.g. a selection checkbox) sits
 * above the stretched link and keeps its own tap.
 */
export function RecordItem({
  detail,
  href,
  meta,
  status,
  subtitle,
  time,
  title,
  value,
}: {
  detail?: ReactNode;
  href?: string;
  meta?: ReactNode;
  status?: ReactNode;
  subtitle?: ReactNode;
  time?: ReactNode;
  title: ReactNode;
  value?: ReactNode;
}) {
  return (
    <li
      className={cn(
        "grid gap-1 px-4 py-3",
        href && "relative transition-colors active:bg-accent has-[a[data-slot=record-link]:focus-visible]:ring-3 has-[a[data-slot=record-link]:focus-visible]:ring-ring/50 has-[a[data-slot=record-link]:focus-visible]:ring-inset",
      )}
      data-slot="record-item"
    >
      <div className="flex items-start justify-between gap-3">
        {href ? (
          <Link
            className="min-w-0 truncate text-base font-semibold text-primary outline-none after:absolute after:inset-0 after:content-[''] hover:underline"
            data-slot="record-link"
            href={href}
          >
            {title}
          </Link>
        ) : (
          <span className="min-w-0 truncate text-base font-semibold">{title}</span>
        )}
        {status ? <span className="shrink-0">{status}</span> : null}
      </div>
      {subtitle ? <p className="text-sm text-foreground">{subtitle}</p> : null}
      {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
      {detail ? <div className="relative z-10" data-slot="record-detail">{detail}</div> : null}
      {value || time ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold tabular-nums">{value}</span>
          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
      ) : null}
    </li>
  );
}
