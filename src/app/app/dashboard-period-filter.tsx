import { ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ANALYTICS_PRESETS,
  ANALYTICS_TIMEZONES,
  type AnalyticsPresetId,
} from "@/lib/analytics-range";
import { cn } from "@/lib/utils";

export type DashboardPeriodFilterValues = {
  endDate: string;
  outletId?: string;
  presetId: AnalyticsPresetId;
  startDate: string;
  timezone: string;
};

type DashboardPeriodFilterProps = {
  activeCount: number;
  outlets: Array<{ id: string; name: string }>;
  todayLocalDate: string;
  values: DashboardPeriodFilterValues;
};

const selectClassName =
  "w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function FilterFields({
  outlets,
  todayLocalDate,
  values,
}: Omit<DashboardPeriodFilterProps, "activeCount">) {
  const controlClassName = "h-11 xl:h-8";
  const fieldClassName = "grid min-w-0 gap-1.5 text-sm font-medium";

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <label className={fieldClassName} htmlFor="dashboard-rentang">
        Periode
        <select className={cn(selectClassName, controlClassName)} defaultValue={values.presetId} id="dashboard-rentang" name="rentang">
          {ANALYTICS_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
      </label>
      <label className={fieldClassName} htmlFor="dashboard-outlet">
        Outlet
        <select className={cn(selectClassName, controlClassName)} defaultValue={values.outletId ?? ""} id="dashboard-outlet" name="outlet">
          <option value="">Semua outlet</option>
          {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
        </select>
      </label>
      <label className={fieldClassName} htmlFor="dashboard-tz">
        Zona waktu
        <select className={cn(selectClassName, controlClassName)} defaultValue={values.timezone} id="dashboard-tz" name="tz">
          {ANALYTICS_TIMEZONES.map((timezone) => <option key={timezone.id} value={timezone.id}>{timezone.label}</option>)}
        </select>
      </label>
      <label className={fieldClassName} htmlFor="dashboard-dari">
        Dari tanggal
        <Input className={controlClassName} defaultValue={values.startDate} id="dashboard-dari" max={todayLocalDate} name="dari" type="date" />
      </label>
      <label className={fieldClassName} htmlFor="dashboard-sampai">
        Sampai tanggal
        <Input className={controlClassName} defaultValue={values.endDate} id="dashboard-sampai" max={todayLocalDate} name="sampai" type="date" />
      </label>
    </div>
  );
}

export function DashboardPeriodFilter({
  activeCount,
  outlets,
  todayLocalDate,
  values,
}: DashboardPeriodFilterProps) {
  const fields = { outlets, todayLocalDate, values };
  return (
    <div>
      <details className="group/filter peer/filter md:hidden" data-filter-disclosure>
      <summary aria-controls="dashboard-filter-fields" className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border bg-background px-3 text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><SlidersHorizontal aria-hidden="true" className="size-4" />Filter periode</span>
        <span className="flex items-center gap-2">{activeCount > 0 ? <Badge variant="secondary">{activeCount}</Badge> : null}<ChevronDown aria-hidden="true" className="size-4 transition-transform group-open/filter:rotate-180" /></span>
      </summary>
      </details>
      <div className="hidden pt-4 peer-open/filter:block md:block md:pt-0" id="dashboard-filter-fields">
        <form action="/app#dashboard-period-heading" className="space-y-4" method="get">
          <FilterFields {...fields} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button className="min-h-11 xl:min-h-8 xl:h-8" type="submit">Terapkan filter</Button>
            {activeCount > 0 ? <Button asChild className="min-h-11 xl:min-h-8 xl:h-8" variant="ghost"><Link href="/app#dashboard-period-heading">Reset</Link></Button> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
