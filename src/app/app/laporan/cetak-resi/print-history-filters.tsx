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

const HINT_ID = "print-history-filter-hint";
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
  const controlClassName = "h-11 md:h-9";
  const fieldClassName = "grid min-w-0 gap-1.5 text-xs font-medium text-foreground";

  return (
    <div className="grid min-w-0 gap-2">
      <HashFocusTarget targetId="print-history-heading" />
      <form action="/app/laporan/cetak-resi#print-history-heading" className="cms-filter-bar" id="print-history-filter-fields" method="get">
        <div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,20rem)_minmax(0,14rem)]">
            <div aria-describedby={HINT_ID} className={fieldClassName}>
              <span id="print-history-range-label">Periode</span>
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
              Outlet
              <select className={cn(selectClassName, controlClassName)} defaultValue={values.outletId ?? ""} id="print-history-outlet" name="outlet">
                <option value="">Semua outlet</option>
                {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="min-h-11 md:min-h-9" type="submit">Terapkan</Button>
          {activeCount > 0 ? <Button asChild className="min-h-11 md:min-h-9" variant="ghost"><Link href="/app/laporan/cetak-resi#print-history-heading">Reset</Link></Button> : null}
        </div>
      </form>
      <p className="max-w-2xl text-xs leading-5 text-muted-foreground" id={HINT_ID}>
        Periode memakai waktu permintaan cetak tercatat. Outlet diambil dari kiriman yang dicetak.
      </p>
    </div>
  );
}
