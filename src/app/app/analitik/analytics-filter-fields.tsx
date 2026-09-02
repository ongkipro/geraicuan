import { Input } from "@/components/ui/input";
import type { AnalyticsFilterOptions } from "@/db/analytics-repository";
import { shipmentStatuses } from "@/db/schema";
import type { AnalyticsEventBasis, AnalyticsFilters } from "@/lib/analytics-filters";
import {
  ANALYTICS_PRESETS,
  ANALYTICS_TIMEZONES,
  type AnalyticsPresetId,
} from "@/lib/analytics-range";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import { cn } from "@/lib/utils";

export type AnalyticsFilterValues = AnalyticsFilters & {
  eventBasis: AnalyticsEventBasis;
  endDate: string;
  presetId: AnalyticsPresetId;
  startDate: string;
  timezone: string;
};

type AnalyticsFilterFieldsProps = {
  options: AnalyticsFilterOptions;
  todayLocalDate: string;
  values: AnalyticsFilterValues;
};

const selectClassName =
  "w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function AnalyticsFilterFields({
  options,
  todayLocalDate,
  values,
}: AnalyticsFilterFieldsProps) {
  const controlClassName = "h-11 xl:h-8";
  const fieldClassName = "grid min-w-0 gap-1.5 text-sm font-medium";
  const period = (
    <label className={cn(fieldClassName, "xl:col-span-3")} htmlFor="analytics-rentang">
      Periode
      <select className={cn(selectClassName, controlClassName)} defaultValue={values.presetId} id="analytics-rentang" name="rentang">
        {ANALYTICS_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
      </select>
    </label>
  );
  const startDate = (
    <label className={cn(fieldClassName, "xl:col-span-3")} htmlFor="analytics-dari">
      Dari tanggal
      <Input className={controlClassName} defaultValue={values.startDate} id="analytics-dari" max={todayLocalDate} name="dari" type="date" />
    </label>
  );
  const endDate = (
    <label className={cn(fieldClassName, "xl:col-span-3")} htmlFor="analytics-sampai">
      Sampai tanggal
      <Input className={controlClassName} defaultValue={values.endDate} id="analytics-sampai" max={todayLocalDate} name="sampai" type="date" />
    </label>
  );
  const outlet = (
    <label className={cn(fieldClassName, "xl:col-span-3")} htmlFor="analytics-outlet">
      Outlet
      <select className={cn(selectClassName, controlClassName)} defaultValue={values.outletId ?? ""} id="analytics-outlet" name="outlet">
        <option value="">Semua outlet</option>
        {options.outlets.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
    </label>
  );
  const courier = (
    <label className={cn(fieldClassName, "xl:col-span-2")} htmlFor="analytics-kurir">
      Kurir
      <select className={cn(selectClassName, controlClassName)} defaultValue={values.courier ?? ""} id="analytics-kurir" name="kurir">
        <option value="">Semua kurir</option>
        {options.couriers.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
  const lifecycle = (
    <label className={cn(fieldClassName, "xl:col-span-3")} htmlFor="analytics-status">
      Lifecycle
      <select className={cn(selectClassName, controlClassName)} defaultValue={values.lifecycleStatus ?? ""} id="analytics-status" name="status">
        <option value="">Semua lifecycle</option>
        {shipmentStatuses.map((status) => <option key={status} value={status}>{SHIPMENT_STATUS_PRESENTATION[status].label}</option>)}
      </select>
    </label>
  );
  const timezone = (
    <label className={cn(fieldClassName, "xl:col-span-3")} htmlFor="analytics-tz">
      Zona waktu
      <select className={cn(selectClassName, controlClassName)} defaultValue={values.timezone} id="analytics-tz" name="tz">
        {ANALYTICS_TIMEZONES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
  const eventBasis = (
    <label className={cn(fieldClassName, "xl:col-span-4")} htmlFor="analytics-basis">
      Basis tabel & ekspor
      <select className={cn(selectClassName, controlClassName)} defaultValue={values.eventBasis} id="analytics-basis" name="basis">
        <option value="created">Waktu kiriman dibuat</option>
        <option value="issued">Waktu resi terbit</option>
        <option value="outcome">Waktu outcome provider</option>
        <option value="exceptions">Pengecualian saat ini</option>
      </select>
    </label>
  );

  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">{period}{startDate}{endDate}{outlet}{courier}{lifecycle}{timezone}{eventBasis}</div>;
}
