"use client";

import Link from "next/link";

import { DateRangeFilter } from "@/components/cms/date-range-filter";
import { HashFocusTarget } from "@/components/cms/hash-focus-target";
import { Button } from "@/components/ui/button";
import type { AnalyticsPresetId } from "@/lib/analytics-range";
import { cn } from "@/lib/utils";

/**
 * PR-55: the print history shares the PR-53 range control and the outlet scope
 * with Laporan pengiriman. There is nothing advanced to disclose here — the
 * record has no courier or lifecycle dimension of its own — so this form has no
 * disclosure rather than an empty one.
 */
export type PrintHistoryFilterValues = {
  endDate: string;
  outletId: string | null;
  presetId: AnalyticsPresetId;
  startDate: string;
};

type PrintHistoryFiltersProps = {
  activeCount: number;
  outlets: Array<{ id: string; name: string }>;
  rangeLabel: string;
  timezoneLabel: string;
  todayLocalDate: string;
  values: PrintHistoryFilterValues;
};

const selectClassName =
  "w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PrintHistoryFilters({
  activeCount,
  outlets,
  rangeLabel,
  timezoneLabel,
  todayLocalDate,
  values,
}: PrintHistoryFiltersProps) {
  const controlClassName = "h-11 md:h-10";
  const fieldClassName = "grid min-w-0 text-sm font-medium text-foreground";

  return (
    <div className="grid min-w-0 gap-2">
      <HashFocusTarget targetId="print-history-heading" />
      <form action="/app/laporan/cetak-resi#print-history-heading" className="cms-filter-bar" id="print-history-filter-fields" method="get">
        <div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,20rem)_minmax(0,14rem)]">
            {/* T-206: the reference's one-line row — controls carry sr-only names, no stacked labels. */}
            <div aria-labelledby="print-history-range-label" className={fieldClassName} role="group">
              <span className="sr-only" id="print-history-range-label">Periode</span>
              <DateRangeFilter
                endDate={values.endDate}
                idPrefix="print-history"
                presetId={values.presetId}
                rangeLabel={rangeLabel}
                startDate={values.startDate}
                timezoneLabel={timezoneLabel}
                todayLocalDate={todayLocalDate}
              />
            </div>
            <label className={fieldClassName} htmlFor="print-history-outlet">
              <span className="sr-only">Outlet</span>
              <select className={cn(selectClassName, controlClassName)} defaultValue={values.outletId ?? ""} id="print-history-outlet" name="outlet">
                <option value="">Semua outlet</option>
                {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button className="max-md:min-h-11" type="submit" variant="outline">Terapkan</Button>
          {activeCount > 0 ? (
            <Button asChild className="h-10 px-1 text-xs font-normal text-muted-foreground underline hover:text-foreground max-md:min-h-11" variant="link">
              <Link href="/app/laporan/cetak-resi#print-history-heading" prefetch={false}>Hapus filter</Link>
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
