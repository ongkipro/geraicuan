"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { DateRangeFilter } from "@/components/cms/date-range-filter";
import type { AnalyticsFilterOptions } from "@/db/analytics-repository";
import { shipmentStatuses } from "@/lib/domain-enums";
import type { AnalyticsEventBasis, AnalyticsFilters } from "@/lib/analytics-filters";
import type { AnalyticsPresetId } from "@/lib/analytics-range";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import { cn } from "@/lib/utils";

export type AnalyticsFilterValues = AnalyticsFilters & {
  eventBasis: AnalyticsEventBasis;
  endDate: string;
  presetId: AnalyticsPresetId;
  startDate: string;
};

type AnalyticsFilterFieldsProps = {
  /** The span this period is compared against, named in the range panel. */
  comparisonLabel: string;
  /** Id of the visible date/paging hint rendered beside the form. */
  hintId: string;
  options: AnalyticsFilterOptions;
  rangeLabel: string;
  timezoneLabel: string;
  todayLocalDate: string;
  values: AnalyticsFilterValues;
};

const selectClassName =
  "w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AnalyticsFilterFields({
  comparisonLabel,
  hintId,
  options,
  rangeLabel,
  timezoneLabel,
  todayLocalDate,
  values,
}: AnalyticsFilterFieldsProps) {
  const controlClassName = "h-11 md:h-9";
  const fieldClassName = "grid min-w-0 gap-1.5 text-xs font-medium text-foreground";
  // T-163: one date-range control carries the preset and both dates, so the
  // period select and the "Tanggal khusus" half of the advanced disclosure are
  // gone; the disclosure keeps the dimensions that are genuinely advanced.
  const period = (
    <div aria-describedby={hintId} className={fieldClassName}>
      <span id="analytics-range-label">Periode</span>
      <DateRangeFilter
        comparisonLabel={comparisonLabel}
        endDate={values.endDate}
        idPrefix="analytics"
        presetId={values.presetId}
        rangeLabel={rangeLabel}
        startDate={values.startDate}
        timezoneLabel={timezoneLabel}
        todayLocalDate={todayLocalDate}
      />
    </div>
  );
  const outlet = (
    <label className={fieldClassName} htmlFor="analytics-outlet">
      Outlet
      <select className={cn(selectClassName, controlClassName)} defaultValue={values.outletId ?? ""} id="analytics-outlet" name="outlet">
        <option value="">Semua outlet</option>
        {options.outlets.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
    </label>
  );
  const courier = (
    <label className={fieldClassName} htmlFor="analytics-kurir">
      Kurir
      <select className={cn(selectClassName, controlClassName)} defaultValue={values.courier ?? ""} id="analytics-kurir" name="kurir">
        <option value="">Semua kurir</option>
        {options.couriers.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
  const lifecycle = (
    <label className={fieldClassName} htmlFor="analytics-status">
      Status kiriman
      <select className={cn(selectClassName, controlClassName)} defaultValue={values.lifecycleStatus ?? ""} id="analytics-status" name="status">
        <option value="">Semua status</option>
        {shipmentStatuses.map((status) => <option key={status} value={status}>{SHIPMENT_STATUS_PRESENTATION[status].label}</option>)}
      </select>
    </label>
  );
  const eventBasis = (
    <label className={fieldClassName} htmlFor="analytics-basis">
      Basis tabel & ekspor
      <select className={cn(selectClassName, controlClassName)} defaultValue={values.eventBasis} id="analytics-basis" name="basis">
        <option value="created">Waktu kiriman dibuat</option>
        <option value="issued">Waktu resi terbit</option>
        <option value="outcome">Waktu outcome provider</option>
        <option value="exceptions">Pengecualian saat ini</option>
      </select>
    </label>
  );

  return <div>
    <div className="grid gap-3 md:grid-cols-[minmax(0,20rem)_minmax(0,14rem)]">{period}{outlet}</div>
    <details className="cms-filter-advanced" data-advanced data-filter-disclosure open={Boolean(values.courier || values.lifecycleStatus) || values.eventBasis !== "created"}>
      <summary><SlidersHorizontal aria-hidden="true" className="size-4" />Filter lanjutan<ChevronDown aria-hidden="true" className="ml-auto size-4" /></summary>
      <div className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-3">{courier}{lifecycle}{eventBasis}</div>
    </details>
  </div>;
}
