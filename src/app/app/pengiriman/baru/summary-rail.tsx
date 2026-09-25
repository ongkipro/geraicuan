import type { ReactNode } from "react";

import { formatIdr } from "@/components/app/money";
import { cn } from "@/lib/utils";

/**
 * T-211 "Ringkasan tagihan" (reference rail, 360px, sticky from 1024px): source badge, route
 * asal → tujuan, the shipment rows, "Rincian komponen biaya", the big total and the actions.
 * The source badge separates an estimate from Mengantar's quote (spec 10 §4.11).
 */
export type RailRow = { label: string; tone?: "accent"; value: ReactNode };
export type RailMoneyRow = { amountIdr: number | null; label: string };

export function SummaryRail({
  actions,
  destination,
  freshness,
  moneyRows,
  origin,
  rows,
  source,
  total,
}: {
  actions: ReactNode;
  destination: string | null;
  /** One freshness line, e.g. "Tarif dimuat 26 Sep 2026, 10.13 WIB". */
  freshness?: string;
  moneyRows: RailMoneyRow[];
  origin: { detail?: string; title: string } | null;
  rows: RailRow[];
  source: "Estimasi" | "Tarif resmi";
  total: { amountIdr: number | null; label: string; note: string };
}) {
  return (
    <aside aria-labelledby="ringkasan-tagihan" className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3 border-b pb-3">
        <div className="flex flex-col">
          <h2 className="text-base font-bold" id="ringkasan-tagihan">Ringkasan tagihan</h2>
          {freshness ? <p className="text-xs text-muted-foreground">{freshness}</p> : null}
        </div>
        <span
          className={cn(
            "rounded-sm border px-2 py-0.5 text-xs font-bold tracking-wide uppercase",
            source === "Tarif resmi" ? "border-primary/30 bg-accent text-accent-foreground" : "border-border bg-muted text-muted-foreground",
          )}
        >
          {source}
        </span>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-muted/60 p-3 text-xs">
        <p className="font-bold tracking-wide text-muted-foreground uppercase">Rute kiriman</p>
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className="mt-1 size-2.5 shrink-0 rounded-full bg-ok" />
          <div className="flex min-w-0 flex-col">
            <span className="text-muted-foreground">Asal</span>
            <span className="text-sm font-semibold wrap-anywhere">{origin?.title ?? "—"}</span>
            {origin?.detail ? <span className="text-muted-foreground wrap-anywhere">{origin.detail}</span> : null}
          </div>
        </div>
        <span aria-hidden="true" className="ml-1 h-2.5 w-0.5 bg-input" />
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" />
          <div className="flex min-w-0 flex-col">
            <span className="text-muted-foreground">Tujuan</span>
            <span className="text-sm font-semibold wrap-anywhere">{destination ?? "—"}</span>
          </div>
        </div>
      </div>

      <dl className="flex flex-col gap-2 border-b pb-3 text-xs">
        {rows.map((row) => (
          <div className="flex items-center justify-between gap-3" key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className={cn("min-w-0 truncate text-right font-semibold", row.tone === "accent" ? "text-accent-foreground" : "text-foreground")}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2 text-xs">
        <p className="font-bold tracking-wide text-muted-foreground uppercase">Rincian komponen biaya</p>
        <dl className="flex flex-col gap-2">
          {moneyRows.map((row) => (
            <div className="flex justify-between gap-3" key={row.label}>
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-medium tabular-nums">{row.amountIdr === null ? "—" : formatIdr(row.amountIdr)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div aria-live="polite" className="flex items-baseline justify-between gap-3 border-t-2 pt-3">
        <div className="flex flex-col">
          <span className="text-sm font-bold">{total.label}</span>
          <span className="text-xs text-muted-foreground">{total.note}</span>
        </div>
        <span className="text-2xl font-bold whitespace-nowrap text-primary tabular-nums">
          {total.amountIdr === null ? "—" : formatIdr(total.amountIdr)}
        </span>
      </div>

      <div className="flex flex-col gap-2.5 pt-1">{actions}</div>
    </aside>
  );
}

/** Below 1024px the rail is hidden; this bar carries the total and the one primary (spec 10 §4.8). */
export function MobileActionBar({ actions, caption, total }: { actions: ReactNode; caption: string; total: number | null }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 border-t bg-card px-4 pt-3 pb-[max(--spacing(3),env(safe-area-inset-bottom))] shadow-lg lg:hidden">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-xs text-muted-foreground">{caption}</span>
        <span className="shrink-0 text-base font-bold text-primary tabular-nums">{total === null ? "—" : formatIdr(total)}</span>
      </div>
      <div className="flex gap-2 *:flex-1 [&>*:first-child:not(:only-child)]:flex-none">{actions}</div>
    </div>
  );
}
