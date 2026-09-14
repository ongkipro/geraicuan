import Link from "next/link";

import { AnalyticsFilterFields, type AnalyticsFilterValues } from "@/app/app/analitik/analytics-filter-fields";
import { HashFocusTarget } from "@/components/cms/hash-focus-target";
import { Button } from "@/components/ui/button";
import type { AnalyticsFilterOptions } from "@/db/analytics-repository";

type AnalyticsFiltersProps = {
  activeCount: number;
  options: AnalyticsFilterOptions;
  todayLocalDate: string;
  values: AnalyticsFilterValues;
};

const ANALYTICS_FILTER_HINT_ID = "analytics-filter-hint";

export function AnalyticsFilters({ activeCount, options, todayLocalDate, values }: AnalyticsFiltersProps) {
  return (
    <div className="grid min-w-0 gap-2">
      {/* Submit and reset return to the visible page heading (PageHeader focusTargetId). */}
      <HashFocusTarget targetId="analytics-page-heading" />
      <form action="/app/analitik#analytics-page-heading" className="cms-filter-bar" id="analytics-filter-fields" method="get">
        <AnalyticsFilterFields hintId={ANALYTICS_FILTER_HINT_ID} options={options} todayLocalDate={todayLocalDate} values={values} />
        <div className="flex flex-wrap items-center gap-2">
          <Button className="min-h-11 md:min-h-9" type="submit">Terapkan</Button>
          {activeCount > 0 ? <Button asChild className="min-h-11 md:min-h-9" variant="ghost"><Link href="/app/analitik#analytics-page-heading">Reset semua</Link></Button> : null}
        </div>
      </form>
      <p className="max-w-2xl text-xs leading-5 text-muted-foreground" id={ANALYTICS_FILTER_HINT_ID}>Tanggal awal dan akhir dipakai saat memilih Rentang khusus. Menerapkan filter selalu kembali ke halaman pertama.</p>
    </div>
  );
}
