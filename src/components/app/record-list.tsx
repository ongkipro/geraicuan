import Link from "next/link";
import { Children, type ReactNode } from "react";

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
    <li className="grid gap-1 px-4 py-3" data-slot="record-item">
      <div className="flex items-start justify-between gap-3">
        {href ? (
          <Link className="min-w-0 truncate text-base font-semibold text-primary hover:underline" href={href}>
            {title}
          </Link>
        ) : (
          <span className="min-w-0 truncate text-base font-semibold">{title}</span>
        )}
        {status ? <span className="shrink-0">{status}</span> : null}
      </div>
      {subtitle ? <p className="text-sm text-foreground">{subtitle}</p> : null}
      {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
      {detail}
      {value || time ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold tabular-nums">{value}</span>
          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
      ) : null}
    </li>
  );
}
