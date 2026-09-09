import { ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { AnalyticsFilterFields, type AnalyticsFilterValues } from "@/app/app/analitik/analytics-filter-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsFilterOptions } from "@/db/analytics-repository";

type AnalyticsFiltersProps = {
  activeCount: number;
  options: AnalyticsFilterOptions;
  todayLocalDate: string;
  values: AnalyticsFilterValues;
};

export function AnalyticsFilters({ activeCount, options, todayLocalDate, values }: AnalyticsFiltersProps) {
  return (
    <Card size="sm">
      <div>
        <details className="group/filter peer/filter md:hidden" data-filter-disclosure>
        <summary aria-controls="analytics-filter-fields" className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><SlidersHorizontal aria-hidden="true" className="size-4" />Filter analitik</span>
          <span className="flex items-center gap-2">{activeCount > 0 ? <Badge variant="secondary">{activeCount}</Badge> : null}<ChevronDown aria-hidden="true" className="size-4 transition-transform group-open/filter:rotate-180" /></span>
        </summary>
        </details>
        <div className="hidden peer-open/filter:block md:block" id="analytics-filter-fields">
          <CardHeader className="hidden border-b md:flex"><CardTitle>Filter analitik</CardTitle><CardDescription>Satu filter untuk KPI, tren, tabel, dan ekspor.</CardDescription></CardHeader>
          <CardContent className="border-t pt-4 md:border-t-0">
            <form action="/app/analitik#analytics-page-heading" className="space-y-4" method="get">
              <AnalyticsFilterFields options={options} todayLocalDate={todayLocalDate} values={values} />
              <p className="max-w-2xl text-xs leading-5 text-muted-foreground">Tanggal awal dan akhir dipakai saat memilih Rentang khusus. Menerapkan filter selalu kembali ke halaman pertama.</p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button className="min-h-11 xl:min-h-8 xl:h-8" type="submit">Terapkan filter</Button>
                {activeCount > 0 ? <Button asChild className="min-h-11 xl:min-h-8 xl:h-8" variant="ghost"><Link href="/app/analitik#analytics-page-heading">Reset semua</Link></Button> : null}
              </div>
            </form>
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
