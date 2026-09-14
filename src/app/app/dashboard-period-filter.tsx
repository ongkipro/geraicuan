"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

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
  const controlClassName = "h-11 md:h-8";
  const fieldClassName = "grid min-w-0 gap-1.5 text-xs font-medium text-foreground";

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(2,minmax(0,14rem))]">      <label className={fieldClassName} htmlFor="dashboard-rentang">
        Periode
        <select className={cn(selectClassName, controlClassName)} defaultValue={values.presetId} id="dashboard-rentang" name="rentang" onChange={(event) => { if (event.target.value === "kustom") { const advanced = event.target.form?.querySelector<HTMLDetailsElement>("details[data-advanced]"); if (advanced) advanced.open = true; } }}>
          {ANALYTICS_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
      </label>      <label className={fieldClassName} htmlFor="dashboard-outlet">
        Outlet
        <select className={cn(selectClassName, controlClassName)} defaultValue={values.outletId ?? ""} id="dashboard-outlet" name="outlet">
          <option value="">Semua outlet</option>
          {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
        </select>
      </label></div>
      <details className="cms-filter-advanced" data-advanced data-filter-disclosure open={values.presetId === "kustom" || values.timezone !== "Asia/Jakarta"}>
        <summary><SlidersHorizontal aria-hidden="true" className="size-4" />Tanggal & zona waktu<ChevronDown aria-hidden="true" className="ml-auto size-4" /></summary>
        <div className="grid gap-3 pt-3 sm:grid-cols-3">      <label className={fieldClassName} htmlFor="dashboard-dari">
        Dari tanggal
        <Input className={controlClassName} defaultValue={values.startDate} id="dashboard-dari" max={todayLocalDate} name="dari" type="date" />
      </label>      <label className={fieldClassName} htmlFor="dashboard-sampai">
        Sampai tanggal
        <Input className={controlClassName} defaultValue={values.endDate} id="dashboard-sampai" max={todayLocalDate} name="sampai" type="date" />
      </label>      <label className={fieldClassName} htmlFor="dashboard-tz">
        Zona waktu
        <select className={cn(selectClassName, controlClassName)} defaultValue={values.timezone} id="dashboard-tz" name="tz">
          {ANALYTICS_TIMEZONES.map((timezone) => <option key={timezone.id} value={timezone.id}>{timezone.label}</option>)}
        </select>
      </label></div>
      </details>
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
    <form action="/app#dashboard-page-heading" className="cms-filter-bar" method="get" id="dashboard-filter-fields">
      <FilterFields {...fields} />
      <div className="flex flex-wrap items-center gap-2">
        <Button className="min-h-11 md:min-h-8" type="submit">Terapkan</Button>
        {activeCount > 0 ? <Button asChild className="min-h-11 md:min-h-8" variant="ghost"><Link href="/app#dashboard-page-heading">Reset</Link></Button> : null}
      </div>
    </form>
  );
}
