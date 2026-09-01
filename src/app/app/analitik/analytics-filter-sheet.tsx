"use client";

import { Filter, X } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { AnalyticsFilterOptions } from "@/db/analytics-repository";
import {
  AnalyticsFilterFields,
  type AnalyticsFilterValues,
} from "./analytics-filter-fields";

type AnalyticsFilterSheetProps = {
  activeCount: number;
  options: AnalyticsFilterOptions;
  todayLocalDate: string;
  values: AnalyticsFilterValues;
};

export function AnalyticsFilterSheet({
  activeCount,
  options,
  todayLocalDate,
  values,
}: AnalyticsFilterSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="min-h-11 md:hidden" type="button" variant="outline">
          <Filter aria-hidden="true" />
          Filter
          {activeCount > 0 ? <Badge variant="secondary">{activeCount}</Badge> : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[min(92vw,24rem)]" showCloseButton={false}>
        <form action="/app/analitik" className="flex min-h-0 flex-1 flex-col" method="get">
          <SheetHeader className="border-b pr-14">
            <SheetTitle>Filter analitik</SheetTitle>
            <SheetDescription>Semua ringkasan, tren, tabel, dan ekspor mengikuti pilihan ini.</SheetDescription>
          </SheetHeader>
          <SheetClose asChild>
            <Button aria-label="Tutup filter" className="absolute right-3 top-3 min-h-11 min-w-11" size="icon-sm" type="button" variant="ghost">
              <X aria-hidden="true" />
            </Button>
          </SheetClose>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
            <AnalyticsFilterFields layout="mobile" options={options} todayLocalDate={todayLocalDate} values={values} />
          </div>
          <SheetFooter className="sticky bottom-0 border-t bg-popover">
            <Button className="min-h-11" type="submit">Terapkan filter</Button>
            <Button asChild className="min-h-11" variant="outline"><Link href="/app/analitik">Reset semua</Link></Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
