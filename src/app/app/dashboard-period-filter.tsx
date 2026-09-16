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
  "w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FilterFields({
  comparisonLabel,
  outlets,
  rangeLabel,
  timezoneLabel,
  todayLocalDate,
  values,
}: Omit<DashboardPeriodFilterProps, "activeCount">) {
  const controlClassName = "h-11 md:h-8";
  const fieldClassName = "grid min-w-0 gap-1.5 text-xs font-medium text-foreground";

  return (
    <div>
      {/* T-163: one date-range control replaces the period select and the
          "Tanggal khusus" disclosure that used to sit beside it. */}
      <div className="grid gap-3 md:grid-cols-[minmax(0,20rem)_minmax(0,14rem)]">
        <div className={fieldClassName}>
          <span id="dashboard-range-label">Periode</span>
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
        <label className={fieldClassName} htmlFor="dashboard-outlet">
          Outlet
          <select className={cn(selectClassName, controlClassName)} defaultValue={values.outletId ?? ""} id="dashboard-outlet" name="outlet">
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
      <div className="flex flex-wrap items-center gap-2">
        <Button className="min-h-11 md:min-h-8" type="submit">Terapkan</Button>
        {activeCount > 0 ? <Button asChild className="min-h-11 md:min-h-8" variant="ghost"><Link href="/app#dashboard-page-heading">Reset</Link></Button> : null}
      </div>
    </form>
  );
}
