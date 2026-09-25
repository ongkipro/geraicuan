"use client";

import Link from "next/link";

import { DateRangeFilter } from "@/components/cms/date-range-filter";
import { Button } from "@/components/ui/button";
import type { AnalyticsPresetId } from "@/lib/analytics-range";
import { cn } from "@/lib/utils";

export type DashboardPeriodFilterValues = {
  endDate: string;
  outletId?: string;
  presetId: AnalyticsPresetId;
  startDate: string;
};

type DashboardPeriodFilterProps = {
  activeCount: number;
  /** The span this period is compared against, named in the range panel. */
  comparisonLabel: string;
  outlets: Array<{ id: string; name: string }>;
  rangeLabel: string;
  timezoneLabel: string;
  todayLocalDate: string;
  values: DashboardPeriodFilterValues;
};

const selectClassName =
  "w-full rounded-lg border border-input bg-background px-2.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * T-206 reference one-line filter row (spec 10 §3 "Filter row"): range trigger · outlet
 * select · outline "Terapkan" · plain "Hapus filter" link. The controls keep "Periode" and
 * "Outlet" as sr-only accessible names instead of visible labels above them, as
 * `RangeFilterForm` does on the list pages.
 */
function FilterFields({
  comparisonLabel,
  outlets,
  rangeLabel,
  timezoneLabel,
  todayLocalDate,
  values,
}: Omit<DashboardPeriodFilterProps, "activeCount">) {
  return (
    <div>
      {/* T-163: one date-range control replaces the period select and the
          "Tanggal khusus" disclosure that used to sit beside it. */}
      <div>
        <div aria-labelledby="dashboard-range-label" role="group">
          <span className="sr-only" id="dashboard-range-label">Periode</span>
          <DateRangeFilter
            comparisonLabel={comparisonLabel}
            endDate={values.endDate}
            idPrefix="dashboard"
            presetId={values.presetId}
            rangeLabel={rangeLabel}
            startDate={values.startDate}
            timezoneLabel={timezoneLabel}
            todayLocalDate={todayLocalDate}
          />
        </div>
        <label className="min-w-0 md:w-56" htmlFor="dashboard-outlet">
          <span className="sr-only">Outlet</span>
          <select className={cn(selectClassName, "h-11 text-base md:h-10 md:text-sm")} defaultValue={values.outletId ?? ""} id="dashboard-outlet" name="outlet">
            <option value="">Semua outlet</option>
            {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

export function DashboardPeriodFilter({
  activeCount,
  ...fields
}: DashboardPeriodFilterProps) {
  return (
    <form action="/app#dashboard-page-heading" className="cms-filter-bar" method="get" id="dashboard-filter-fields">
      <FilterFields {...fields} />
      <div className="flex items-center gap-3">
        <Button className="max-md:min-h-11" type="submit" variant="outline">Terapkan</Button>
        {activeCount > 0 ? (
          // The same plain link RangeFilterForm and DataTableToolbar use for "Hapus filter".
          <Button asChild className="h-10 px-1 text-xs font-normal text-muted-foreground underline hover:text-foreground max-md:min-h-11" variant="link">
            <Link href="/app#dashboard-page-heading" prefetch={false}>Hapus filter</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
