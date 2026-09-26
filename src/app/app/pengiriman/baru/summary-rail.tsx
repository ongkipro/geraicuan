"use client";

import { ChevronUp } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { formatIdr } from "@/components/app/money";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { SectionMarker, STATE_WORDS, type SectionState } from "./flow-parts";

/**
 * T-211 "Ringkasan tagihan" (reference rail, 360px, sticky from 1024px). T-249 (owner
 * 2026-09-26: "biar dinamis 1 layar … soalnya penting"): the rail never outgrows the window —
 * a compact header (title, source badge, the five-marker progress row), a body that scrolls on
 * its own (route in two lines, the shipment rows, "Rincian komponen biaya"), and a pinned
 * footer (the total, the primary action and its guard). The source badge separates an estimate
 * from Mengantar's quote (spec 10 §4.11).
 */
export type RailRow = { label: string; tone?: "accent"; value: ReactNode };
export type RailMoneyRow = { amountIdr: number | null; label: string };
export type RailTotal = { amountIdr: number | null; label: string; note: string };

export type RailData = {
  destination: string | null;
  /** One freshness line, e.g. "Tarif Mengantar 26 Sep 2026, 10.13 WIB". */
  freshness?: string;
  moneyRows: RailMoneyRow[];
  /** The origin area; the sender on the label is its own row. */
  origin: string | null;
  rows: RailRow[];
  source: "Estimasi" | "Tarif resmi";
  total: RailTotal;
};

/**
 * The sticky rail column (≥ 1024px). It rises beside the H1 (-64px = the 40px H1 line + the 24px
 * gap), so its top is 96px before and after sticking, and its height stops 16px above the
 * window's bottom edge: the footer is always on screen.
 */
export function RailColumn({ children }: { children: ReactNode }) {
  return (
    <div
      className="hidden w-90 shrink-0 flex-col lg:sticky lg:top-24 lg:-mt-16 lg:flex lg:max-h-[calc(100svh-7rem)]"
      data-slot="rail-column"
    >
      {children}
    </div>
  );
}

function SourceBadge({ source }: { source: RailData["source"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-sm border px-2 py-0.5 text-xs font-bold tracking-wide uppercase",
        source === "Tarif resmi" ? "border-primary/30 bg-accent text-accent-foreground" : "border-border bg-muted text-muted-foreground",
      )}
    >
      {source}
    </span>
  );
}

/** Route (two one-line rows), shipment rows and cost components: the part that may scroll. */
export function RailDetails({ destination, moneyRows, origin, rows }: Pick<RailData, "destination" | "moneyRows" | "origin" | "rows">) {
  return (
    <>
      <dl aria-label="Rute kiriman" className="flex flex-col gap-1.5 rounded-lg border bg-muted/60 px-3 py-2 text-xs">
        {([["Asal", origin, "bg-ok"], ["Tujuan", destination, "bg-primary"]] as const).map(([label, value, dot]) => (
          <div className="flex min-w-0 items-center gap-2" key={label}>
            <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", dot)} />
            <dt className="w-12 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate text-sm font-semibold" title={value ?? undefined}>{value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      <dl className="flex flex-col gap-2 text-xs">
        {rows.map((row) => (
          <div className="flex items-center justify-between gap-3" key={row.label}>
            <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
            <dd
              className={cn("min-w-0 truncate text-right font-semibold", row.tone === "accent" ? "text-accent-foreground" : "text-foreground")}
              title={typeof row.value === "string" ? row.value : undefined}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2 border-t pt-3 text-xs">
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
    </>
  );
}

function RailTotalLine({ total }: { total: RailTotal }) {
  return (
    <div aria-live="polite" className="flex items-baseline justify-between gap-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-bold">{total.label}</span>
        <span className="text-xs text-muted-foreground">{total.note}</span>
      </div>
      <span className="text-2xl font-bold whitespace-nowrap text-primary tabular-nums">
        {total.amountIdr === null ? "—" : formatIdr(total.amountIdr)}
      </span>
    </div>
  );
}

/** Tracks whether the body hides content above or below, for the fade hints and its tab stop. */
function useScrollHints() {
  const ref = useRef<HTMLDivElement>(null);
  const [hints, setHints] = useState({ above: false, below: false, scrollable: false });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const scrollable = element.scrollHeight > element.clientHeight + 1;
      const next = {
        above: scrollable && element.scrollTop > 1,
        below: scrollable && element.scrollTop + element.clientHeight < element.scrollHeight - 1,
        scrollable,
      };
      setHints((current) => (current.above === next.above && current.below === next.below && current.scrollable === next.scrollable ? current : next));
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);
  return { hints, ref };
}

export function SummaryRail({
  actions,
  progress,
  ...data
}: RailData & {
  actions: ReactNode;
  /** The five-marker "Langkah pengisian" row (T-249). */
  progress?: ReactNode;
}) {
  const { hints, ref } = useScrollHints();
  return (
    <aside
      aria-labelledby="ringkasan-tagihan"
      className="flex max-h-full min-h-0 flex-col rounded-2xl bg-card shadow-card"
      data-slot="summary-rail"
    >
      <div className="flex shrink-0 flex-col gap-1 border-b px-5 pt-4 pb-2" data-rail-region="header">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h2 className="text-base font-bold" id="ringkasan-tagihan">Ringkasan tagihan</h2>
            {data.freshness ? <p className="text-xs text-muted-foreground">{data.freshness}</p> : null}
          </div>
          <SourceBadge source={data.source} />
        </div>
        {progress}
      </div>

      <div className="relative flex min-h-0 flex-col">
        <div
          aria-label={hints.scrollable ? "Rincian ringkasan tagihan (dapat digulir)" : undefined}
          className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-5 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
          data-rail-region="body"
          ref={ref}
          role={hints.scrollable ? "region" : undefined}
          tabIndex={hints.scrollable ? 0 : undefined}
        >
          <RailDetails destination={data.destination} moneyRows={data.moneyRows} origin={data.origin} rows={data.rows} />
        </div>
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-4 bg-linear-to-b from-card to-transparent transition-opacity duration-150 motion-reduce:transition-none",
            hints.above ? "opacity-100" : "opacity-0",
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-card to-transparent transition-opacity duration-150 motion-reduce:transition-none",
            hints.below ? "opacity-100" : "opacity-0",
          )}
        />
      </div>

      <div
        className="flex shrink-0 flex-col gap-3 border-t-2 px-5 pt-3 pb-4"
        data-rail-region="footer"
      >
        <RailTotalLine total={data.total} />
        <div className="flex flex-col gap-2">{actions}</div>
      </div>
    </aside>
  );
}

/**
 * Below 1024px the rail is hidden; this bar carries the progress, the total and the one primary
 * (spec 10 §4.8). "Rincian" opens the whole summary in a bottom Sheet; closing it returns focus
 * to the button.
 */
export function MobileActionBar({
  actions,
  caption,
  progress,
  summary,
  total,
}: {
  actions: ReactNode;
  caption: string;
  /** T-249: "n/4 bagian lengkap" while the form is being filled; announced on change. */
  progress?: string;
  /** T-249: the rail's content, opened from "Rincian". */
  summary?: RailData;
  total: number | null;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 border-t bg-card px-4 pt-3 pb-[max(--spacing(3),env(safe-area-inset-bottom))] shadow-lg lg:hidden"
      data-slot="mobile-action-bar"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-xs text-muted-foreground">
          {progress ? <span aria-live="polite" className="font-semibold text-foreground tabular-nums" data-slot="mobile-progress">{progress}</span> : null}
          {progress ? " · " : null}
          {caption}
        </span>
        <span className="shrink-0 text-base font-bold text-primary tabular-nums">{total === null ? "—" : formatIdr(total)}</span>
      </div>
      <div className="flex gap-2 *:flex-none [&>*:last-child]:flex-1">
        {summary ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button size="lg" type="button" variant="outline">
                <ChevronUp aria-hidden="true" />Rincian
              </Button>
            </SheetTrigger>
            <SheetContent className="max-h-[85svh] gap-0" showCloseButton={false} side="bottom">
              <SheetHeader className="flex-row items-start justify-between gap-3 border-b px-4 pt-4 pb-3">
                <div className="flex min-w-0 flex-col">
                  <SheetTitle className="text-base font-bold">Ringkasan tagihan</SheetTitle>
                  <SheetDescription className="text-xs">{summary.freshness ?? caption}</SheetDescription>
                </div>
                <SourceBadge source={summary.source} />
              </SheetHeader>
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 py-3" data-slot="sheet-body">
                <RailDetails destination={summary.destination} moneyRows={summary.moneyRows} origin={summary.origin} rows={summary.rows} />
              </div>
              <div className="flex flex-col gap-3 border-t-2 px-4 pt-3 pb-[max(--spacing(4),env(safe-area-inset-bottom))]">
                <RailTotalLine total={summary.total} />
                <SheetClose asChild>
                  <Button size="lg" type="button" variant="outline">Tutup</Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        ) : null}
        {actions}
      </div>
    </div>
  );
}

/** Jump to a section from the rail checklist: scroll its card in and focus its first control (else its heading). */
export function jumpToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const heading = document.getElementById(id);
  const section = heading?.closest("section");
  if (!heading || !section) return;
  event.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  section.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  const control = section.querySelector<HTMLElement>(
    "input:not([type=hidden]):not(:disabled), textarea:not(:disabled), button:not(:disabled)",
  );
  (control ?? heading).focus({ preventScroll: true });
}

/**
 * T-249 "Langkah pengisian": the five sections as one 40px row of in-page links in the rail
 * header, same markers as the cards, current highlighted, "n/4 lengkap" announced on change.
 */
export function FillChecklist({ items }: { items: { id: string; missing: number; state: SectionState; title: string }[] }) {
  const fillable = items.filter((item) => item.state !== "locked" && item.id !== "section-service");
  const complete = fillable.filter((item) => item.missing === 0).length;
  return (
    <nav aria-label="Langkah pengisian" className="flex items-center gap-3" data-slot="fill-checklist">
      <ol className="flex min-w-0 flex-1 items-center">
        {items.map((item, index) => (
          <li className="flex flex-1 items-center last:flex-none" key={item.id}>
            <a
              aria-current={item.state === "current" ? "step" : undefined}
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                item.state === "current" ? "bg-accent" : "hover:bg-accent/60",
              )}
              data-state={item.state}
              href={`#${item.id}`}
              onClick={(event) => jumpToSection(event, item.id)}
              title={item.title}
            >
              <SectionMarker className="size-7" number={index + 1} state={item.state} />
              <span className="sr-only">
                {`Bagian ${index + 1}: ${item.title} — `}
                {item.state === "locked" ? "terbuka setelah cek tarif" : item.missing === 0 ? STATE_WORDS[item.state === "current" ? "current" : "complete"] : `${item.missing} isian belum diisi`}
              </span>
            </a>
            {index < items.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "h-0.5 min-w-1 flex-1 transition-colors duration-150 motion-reduce:transition-none",
                  item.state === "complete" && items[index + 1].state === "complete" ? "bg-ok" : "bg-border",
                )}
              />
            ) : null}
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        <span className="font-semibold text-foreground">{complete}/{fillable.length}</span> lengkap
      </p>
    </nav>
  );
}
