"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DateRangePicker } from "@/components/app/date-range-picker";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { AnalyticsPresetId } from "@/lib/analytics-range";

export type FilterSheetOption = { count?: number; label: string; value: string };

const number = new Intl.NumberFormat("id-ID");

function StatusRadios({ name, options, value }: { name: string; options: readonly FilterSheetOption[]; value: string }) {
  return options.map((option) => (
    <label
      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 has-checked:bg-accent has-checked:font-semibold has-focus-visible:ring-2 has-focus-visible:ring-ring"
      key={option.value}
    >
      <input className="size-4 shrink-0 accent-primary" defaultChecked={option.value === value} name={name} type="radio" value={option.value} />
      <span className="flex-1 text-sm">{option.label}</span>
      {option.count === undefined ? null : <span className="text-sm tabular-nums text-muted-foreground">{number.format(option.count)}</span>}
    </label>
  ));
}

/**
 * T-263 (critique 2026-09-29 #2): below 768px a shipment list opens with its search, then one
 * "Filter" button (with the count of active filters) that opens a bottom sheet holding the
 * period and the status — the filter row and the status tiles are desktop-only there, so the
 * first record sits in the first screen. The sheet is a plain GET form on the list's own URL
 * keys (the same ones the desktop row and tiles write), so every state stays a shareable link.
 * One line under the search names what is shown, with a one-tap way back to the whole list.
 */
export function ListFilterSheet({
  action,
  allHref,
  allLabel,
  clearHref,
  count,
  hidden,
  moreOptions,
  options,
  periodNote,
  range,
  search,
  statusLegend,
  statusName,
  summary,
  value,
}: {
  action: string;
  /** The list without its status filter; shown as a link while a status is selected. */
  allHref?: string;
  allLabel?: string;
  /** The list at its defaults; "Hapus filter" in the sheet while `count` > 0. */
  clearHref: string;
  count: number;
  /** URL keys the sheet carries unchanged, e.g. the search. */
  hidden?: Record<string, string | undefined>;
  /** Further statuses behind "Status lainnya" (same radio group). */
  moreOptions?: readonly FilterSheetOption[];
  options: readonly FilterSheetOption[];
  /** T-274: one quiet line under "Periode" when the selected status ignores it (Cetak resi's queues). */
  periodNote?: string;
  range: { endDate: string; presetId: AnalyticsPresetId; startDate: string };
  /** The list's search form, first on the screen. */
  search?: ReactNode;
  statusLegend: string;
  statusName: string;
  /** "Belum dicetak · 1–30 Sep 2026", the line under the search. */
  summary: string;
  value: string;
}) {
  const moreSelected = Boolean(moreOptions?.some((option) => option.value === value));
  const summaryLine = (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground" data-slot="filter-summary">
      <span>{summary}</span>
      {allHref ? (
        <Link className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline" href={allHref}>
          {allLabel ?? "Tampilkan semua"}
        </Link>
      ) : null}
    </p>
  );
  return (
    <div className="flex flex-col gap-2 md:hidden" data-slot="list-filter-sheet">
      <div className={search ? "flex items-start gap-2" : "flex items-center gap-2"}>
        <div className="min-w-0 flex-1">{search ?? summaryLine}</div>
        <Sheet>
          <SheetTrigger asChild>
            <Button aria-label={count > 0 ? `Filter, ${count} aktif` : "Filter"} className="h-11 shrink-0" type="button" variant="outline">
              <SlidersHorizontal aria-hidden="true" />
              Filter
              {count > 0 ? (
                <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums" data-slot="filter-count">
                  {count}
                </span>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent className="max-h-[85svh] gap-0" side="bottom">
            <SheetHeader className="border-b px-4 pt-4 pb-3">
              <SheetTitle className="text-base font-bold">Filter</SheetTitle>
              <SheetDescription className="text-xs">{summary}</SheetDescription>
            </SheetHeader>
            <form action={action} className="flex min-h-0 flex-col" method="get">
              {Object.entries(hidden ?? {}).map(([name, carried]) =>
                carried === undefined ? null : <input key={name} name={name} type="hidden" value={carried} />,
              )}
              <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-4 py-4">
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-semibold">Periode</legend>
                  {periodNote ? <p className="-mt-1 text-xs text-muted-foreground" data-slot="queue-period-note">{periodNote}</p> : null}
                  <DateRangePicker endDate={range.endDate} presetId={range.presetId} startDate={range.startDate} />
                </fieldset>
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-2 text-sm font-semibold">{statusLegend}</legend>
                  <StatusRadios name={statusName} options={options} value={value} />
                  {moreOptions?.length ? (
                    <details className="group" open={moreSelected}>
                      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                        Status lainnya
                        <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
                      </summary>
                      <div className="flex flex-col gap-1">
                        <StatusRadios name={statusName} options={moreOptions} value={value} />
                      </div>
                    </details>
                  ) : null}
                </fieldset>
              </div>
              <div className="flex items-center gap-3 border-t px-4 pt-3 pb-[max(--spacing(3),env(safe-area-inset-bottom))]">
                {count > 0 ? (
                  <Link className="inline-flex min-h-11 items-center px-1 text-sm text-muted-foreground underline underline-offset-4" href={clearHref}>
                    Hapus filter
                  </Link>
                ) : null}
                <Button className="h-11 flex-1 font-semibold" type="submit">Terapkan</Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>
      </div>
      {search ? summaryLine : null}
    </div>
  );
}
