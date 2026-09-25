import Link from "next/link";

import { AnalyticsFilterFields, type AnalyticsFilterValues } from "@/app/app/analitik/analytics-filter-fields";
import { HashFocusTarget } from "@/components/cms/hash-focus-target";
import { Button } from "@/components/ui/button";
import type { AnalyticsFilterOptions } from "@/db/analytics-repository";

type AnalyticsFiltersProps = {
  activeCount: number;
  comparisonLabel: string;
  options: AnalyticsFilterOptions;
  rangeLabel: string;
  timezoneLabel: string;
  todayLocalDate: string;
  values: AnalyticsFilterValues;
};

const ANALYTICS_FILTER_HINT_ID = "analytics-filter-hint";

export function AnalyticsFilters({ activeCount, comparisonLabel, options, rangeLabel, timezoneLabel, todayLocalDate, values }: AnalyticsFiltersProps) {
  return (
    <div className="grid min-w-0 gap-2">
      {/* Submit and reset return to the visible page heading (PageHeader focusTargetId). */}
      <HashFocusTarget targetId="analytics-page-heading" />
      <form action="/app/analitik#analytics-page-heading" className="cms-filter-bar" id="analytics-filter-fields" method="get">
        <AnalyticsFilterFields comparisonLabel={comparisonLabel} hintId={ANALYTICS_FILTER_HINT_ID} options={options} rangeLabel={rangeLabel} timezoneLabel={timezoneLabel} todayLocalDate={todayLocalDate} values={values} />
        <div className="flex flex-wrap items-center gap-2">
          <Button className="min-h-11 md:min-h-9" type="submit">Terapkan</Button>
          {activeCount > 0 ? <Button asChild className="min-h-11 md:min-h-9" variant="ghost"><Link href="/app/analitik#analytics-page-heading">Reset semua</Link></Button> : null}
        </div>
      </form>
      <p className="sr-only" id={ANALYTICS_FILTER_HINT_ID}>Rentang tanggal dipilih di panel Periode; memilih tanggal sendiri otomatis memakai Rentang khusus. Menerapkan filter selalu kembali ke halaman pertama.</p>
    </div>
  );
}
