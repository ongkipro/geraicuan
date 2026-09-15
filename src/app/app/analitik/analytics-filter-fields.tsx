"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { AnalyticsFilterOptions } from "@/db/analytics-repository";
import { shipmentStatuses } from "@/lib/domain-enums";
import type { AnalyticsEventBasis, AnalyticsFilters } from "@/lib/analytics-filters";
import {
  ANALYTICS_PRESETS,
  type AnalyticsPresetId,
} from "@/lib/analytics-range";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import { cn } from "@/lib/utils";

export type AnalyticsFilterValues = AnalyticsFilters & {
  eventBasis: AnalyticsEventBasis;
  endDate: string;
  presetId: AnalyticsPresetId;
  startDate: string;
};

type AnalyticsFilterFieldsProps = {
  /** Id of the visible date/paging hint rendered beside the form. */
  hintId: string;
  options: AnalyticsFilterOptions;
  todayLocalDate: string;
  values: AnalyticsFilterValues;
};

const selectClassName =
  "w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AnalyticsFilterFields({
  hintId,
  options,
  todayLocalDate,
  values,
}: AnalyticsFilterFieldsProps) {
  const controlClassName = "h-11 md:h-9";
  const fieldClassName = "grid min-w-0 gap-1.5 text-xs font-medium text-foreground";
  const period = (
    <label className={fieldClassName} htmlFor="analytics-rentang">
      Periode
      <select className={cn(selectClassName, controlClassName)} defaultValue={values.presetId} id="analytics-rentang" name="rentang" onChange={(event) => { if (event.target.value === "kustom") { const advanced = event.target.form?.querySelector<HTMLDetailsElement>("details[data-advanced]"); if (advanced) advanced.open = true; } }}>
        {ANALYTICS_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
      </select>
    </label>
  );
  const startDate = (
    <label className={fieldClassName} htmlFor="analytics-dari">
      Dari tanggal
      <Input aria-describedby={hintId} className={controlClassName} defaultValue={values.startDate} id="analytics-dari" max={todayLocalDate} name="dari" type="date" />
    </label>
  );
  const endDate = (
    <label className={fieldClassName} htmlFor="analytics-sampai">
      Sampai tanggal
      <Input aria-describedby={hintId} className={controlClassName} defaultValue={values.endDate} id="analytics-sampai" max={todayLocalDate} name="sampai" type="date" />
    </label>
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
    <div className="grid grid-cols-2 gap-3">{period}{outlet}</div>
    <details className="cms-filter-advanced" data-advanced data-filter-disclosure open={values.presetId === "kustom" || Boolean(values.courier || values.lifecycleStatus) || values.eventBasis !== "created"}>
      <summary><SlidersHorizontal aria-hidden="true" className="size-4" />Filter lanjutan<ChevronDown aria-hidden="true" className="ml-auto size-4" /></summary>
      <div className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-3">{startDate}{endDate}{courier}{lifecycle}{eventBasis}</div>
    </details>
  </div>;
}
