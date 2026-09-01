"use client";

import { Filter, X } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  layout,
  outlets,
  todayLocalDate,
  values,
}: Omit<DashboardPeriodFilterProps, "activeCount"> & {
  layout: "desktop" | "mobile";
}) {
  const controlClassName = layout === "mobile" ? "min-h-11" : "h-9";
  const fieldClassName = "grid min-w-0 gap-1.5 text-sm font-medium";

  return (
    <div className={cn("grid gap-4", layout === "desktop" && "md:grid-cols-2 xl:grid-cols-5")}>
      <label className={fieldClassName} htmlFor={`${layout}-dashboard-rentang`}>
        Periode
        <select className={cn(selectClassName, controlClassName)} defaultValue={values.presetId} id={`${layout}-dashboard-rentang`} name="rentang">
          {ANALYTICS_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
      </label>
      <label className={fieldClassName} htmlFor={`${layout}-dashboard-outlet`}>
        Outlet
        <select className={cn(selectClassName, controlClassName)} defaultValue={values.outletId ?? ""} id={`${layout}-dashboard-outlet`} name="outlet">
          <option value="">Semua outlet</option>
          {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
        </select>
      </label>
      <label className={fieldClassName} htmlFor={`${layout}-dashboard-tz`}>
        Zona waktu
        <select className={cn(selectClassName, controlClassName)} defaultValue={values.timezone} id={`${layout}-dashboard-tz`} name="tz">
          {ANALYTICS_TIMEZONES.map((timezone) => <option key={timezone.id} value={timezone.id}>{timezone.label}</option>)}
        </select>
      </label>
      <label className={fieldClassName} htmlFor={`${layout}-dashboard-dari`}>
        Dari tanggal
        <Input className={controlClassName} defaultValue={values.startDate} id={`${layout}-dashboard-dari`} max={todayLocalDate} name="dari" type="date" />
      </label>
      <label className={fieldClassName} htmlFor={`${layout}-dashboard-sampai`}>
        Sampai tanggal
        <Input className={controlClassName} defaultValue={values.endDate} id={`${layout}-dashboard-sampai`} max={todayLocalDate} name="sampai" type="date" />
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
    <>
      <form action="/app" className="hidden space-y-4 md:block" method="get">
        <FilterFields {...fields} layout="desktop" />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="submit">Terapkan filter</Button>
          {activeCount > 0 ? <Button asChild variant="ghost"><Link href="/app">Reset</Link></Button> : null}
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-2 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button className="min-h-11" type="button" variant="outline">
              <Filter aria-hidden="true" />
              Filter periode
              {activeCount > 0 ? <Badge variant="secondary">{activeCount}</Badge> : null}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[min(92vw,24rem)]" showCloseButton={false}>
            <form action="/app" className="flex min-h-0 flex-1 flex-col" method="get">
              <SheetHeader className="border-b pr-14">
                <SheetTitle>Filter ringkasan</SheetTitle>
                <SheetDescription>Jumlah input, COD/non-COD, dan resi mengikuti periode ini.</SheetDescription>
              </SheetHeader>
              <SheetClose asChild>
                <Button aria-label="Tutup filter" className="absolute right-3 top-3 min-h-11 min-w-11" size="icon-sm" type="button" variant="ghost"><X aria-hidden="true" /></Button>
              </SheetClose>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3"><FilterFields {...fields} layout="mobile" /></div>
              <SheetFooter className="sticky bottom-0 border-t bg-popover">
                <Button className="min-h-11" type="submit">Terapkan filter</Button>
                <Button asChild className="min-h-11" variant="outline"><Link href="/app">Reset</Link></Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
        {activeCount > 0 ? <Button asChild className="min-h-11" variant="ghost"><Link href="/app">Reset</Link></Button> : null}
      </div>
    </>
  );
}
