"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { DateRangeFilter } from "@/components/cms/date-range-filter";
import { HashFocusTarget } from "@/components/cms/hash-focus-target";
import { Button } from "@/components/ui/button";
import type { AnalyticsFilterOptions } from "@/db/analytics-repository";
import type { AnalyticsFilters } from "@/lib/analytics-filters";
import type { AnalyticsPresetId } from "@/lib/analytics-range";
import { shipmentStatuses } from "@/lib/domain-enums";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import { cn } from "@/lib/utils";

/**
 * PR-55: the report's filter bar is the shared PR-53 range control plus the
 * outlet, courier and lifecycle dimensions Analitik already validates, in the
 * one GET form this route owns. No second period control, and no timezone
 * control — PR-35 keeps operational periods on WIB.
 */
export type ShipmentReportFilterValues = AnalyticsFilters & {
  endDate: string;
  presetId: AnalyticsPresetId;
  startDate: string;
};

type ShipmentReportFiltersProps = {
  activeCount: number;
  options: AnalyticsFilterOptions;
  rangeLabel: string;
  timezoneLabel: string;
  todayLocalDate: string;
  values: ShipmentReportFilterValues;
};

const HINT_ID = "shipment-report-filter-hint";
const selectClassName =
  "w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ShipmentReportFilters({
  activeCount,
  options,
  rangeLabel,
  timezoneLabel,
  todayLocalDate,
  values,
}: ShipmentReportFiltersProps) {
  const controlClassName = "h-11 md:h-9";
  const fieldClassName = "grid min-w-0 gap-1.5 text-xs font-medium text-foreground";

  return (
    <div className="grid min-w-0 gap-2">
      <HashFocusTarget targetId="shipment-report-heading" />
      <form action="/app/laporan/pengiriman#shipment-report-heading" className="cms-filter-bar" id="shipment-report-filter-fields" method="get">
        <div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,20rem)_minmax(0,14rem)]">
            <div aria-describedby={HINT_ID} className={fieldClassName}>
              <span id="shipment-report-range-label">Periode</span>
              <DateRangeFilter
                endDate={values.endDate}
                idPrefix="shipment-report"
                presetId={values.presetId}
                rangeLabel={rangeLabel}
                startDate={values.startDate}
                timezoneLabel={timezoneLabel}
                todayLocalDate={todayLocalDate}
              />
            </div>
            <label className={fieldClassName} htmlFor="shipment-report-outlet">
              Outlet
              <select className={cn(selectClassName, controlClassName)} defaultValue={values.outletId ?? ""} id="shipment-report-outlet" name="outlet">
                <option value="">Semua outlet</option>
                {options.outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
              </select>
            </label>
          </div>
          <details className="cms-filter-advanced" data-advanced data-filter-disclosure open={Boolean(values.courier || values.lifecycleStatus)}>
            <summary><SlidersHorizontal aria-hidden="true" className="size-4" />Filter lanjutan<ChevronDown aria-hidden="true" className="ml-auto size-4" /></summary>
            <div className="grid gap-3 pt-3 sm:grid-cols-2">
              <label className={fieldClassName} htmlFor="shipment-report-kurir">
                Kurir
                <select className={cn(selectClassName, controlClassName)} defaultValue={values.courier ?? ""} id="shipment-report-kurir" name="kurir">
                  <option value="">Semua kurir</option>
                  {options.couriers.map((courier) => <option key={courier} value={courier}>{courier}</option>)}
                </select>
              </label>
              <label className={fieldClassName} htmlFor="shipment-report-status">
                Lifecycle
                <select className={cn(selectClassName, controlClassName)} defaultValue={values.lifecycleStatus ?? ""} id="shipment-report-status" name="status">
                  <option value="">Semua lifecycle</option>
                  {shipmentStatuses.map((status) => <option key={status} value={status}>{SHIPMENT_STATUS_PRESENTATION[status].label}</option>)}
                </select>
              </label>
            </div>
          </details>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="min-h-11 md:min-h-9" type="submit">Terapkan</Button>
          {activeCount > 0 ? <Button asChild className="min-h-11 md:min-h-9" variant="ghost"><Link href="/app/laporan/pengiriman#shipment-report-heading">Reset semua</Link></Button> : null}
        </div>
      </form>
      <p className="max-w-2xl text-xs leading-5 text-muted-foreground" id={HINT_ID}>
        Periode memakai waktu kiriman dibuat. Menerapkan filter selalu kembali ke halaman pertama, dan ekspor CSV mengikuti filter yang sama.
      </p>
    </div>
  );
}
