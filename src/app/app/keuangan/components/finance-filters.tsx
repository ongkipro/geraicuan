"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { DateRangeFilter } from "@/components/cms/date-range-filter";
import { HashFocusTarget } from "@/components/cms/hash-focus-target";
import { Button } from "@/components/ui/button";
import type { AnalyticsPresetId } from "@/lib/analytics-range";

const fieldClass = "grid min-w-0 gap-1.5 text-xs font-medium text-foreground";
const controlClass = "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9";

export type FinanceFiltersProps = {
  range: {
    presetId: AnalyticsPresetId;
    startDate: string;
    lastIncludedDate: string;
  };
  /** Resolved range in words, e.g. "20 Agu 2026 – 16 Sep 2026". */
  rangeLabel: string;
  timezoneLabel: string;
  outlets: readonly { id: string; name: string }[];
  outletId?: string;
  rawStatus?: string;
  todayLocalDate: string;
  isNotDefault: boolean;
  summary: string;
};

function FilterFields({ props }: { props: FinanceFiltersProps }) {
  const hintId = "finance-status-hint";
  return (
    <div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,20rem)_minmax(0,14rem)]">
        {/* T-163: the one date-range control; the 62-day settlement ceiling and
            its fallback message are unchanged and still enforced server-side. */}
        <div className={fieldClass}>
          <span id="finance-range-label">Periode</span>
          <DateRangeFilter
            endDate={props.range.lastIncludedDate}
            idPrefix="finance"
            presetId={props.range.presetId}
            rangeLabel={props.rangeLabel}
            startDate={props.range.startDate}
            timezoneLabel={props.timezoneLabel}
            todayLocalDate={props.todayLocalDate}
          />
        </div>
        <label className={fieldClass} htmlFor="finance-outlet">
          Outlet
          <select className={controlClass} defaultValue={props.outletId ?? ""} id="finance-outlet" name="outlet">
            <option value="">Semua outlet</option>
            {props.outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
          </select>
        </label>
      </div>
      {/* Implicit submission (Enter in a field) clicks the first submit button in tree order.
          Without this, that would be "Terapkan rentang khusus" below and every Enter would
          send khusus=1 and force a custom range; hidden, it applies the plain filter instead. */}
      <button aria-hidden="true" hidden tabIndex={-1} type="submit" />
      <details className="cms-filter-advanced" data-advanced data-filter-disclosure open={Boolean(props.rawStatus)}>
        <summary><SlidersHorizontal aria-hidden="true" className="size-4" />Status rekonsiliasi<ChevronDown aria-hidden="true" className="ml-auto size-4" /></summary>
        <div className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className={fieldClass} htmlFor="finance-status">
            Status rekonsiliasi
            <select aria-describedby={hintId} aria-invalid={Boolean(props.rawStatus && props.rawStatus !== "VARIANCE")} className={controlClass} defaultValue={props.rawStatus ?? ""} id="finance-status" name="status">
              <option value="">Semua status</option>
              <option value="VARIANCE">Ada selisih</option>
              {props.rawStatus && props.rawStatus !== "VARIANCE" ? <option value={props.rawStatus}>Status tidak valid</option> : null}
            </select>
            <span className="text-xs font-normal leading-5 text-muted-foreground" id={hintId}>Hanya menampilkan rekonsiliasi dengan selisih.</span>
          </label>
        </div>
      </details>
    </div>
  );
}

function FilterActions({ isNotDefault }: { isNotDefault: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button className="min-h-11 md:h-9 md:min-h-9" type="submit">Terapkan filter</Button>
      {isNotDefault ? <Button asChild className="min-h-11 md:h-9 md:min-h-9" variant="outline"><Link href="/app/keuangan#finance-filter-title">Setel ulang</Link></Button> : null}
    </div>
  );
}

export function FinanceFilters(props: FinanceFiltersProps) {
  return (
    <section aria-labelledby="finance-filter-title" className="space-y-3">
      <HashFocusTarget targetId="finance-filter-title" />
      {/* Visible hash focus target: submit and reset land here, so focus is never on an invisible node. */}
      <h2 className="w-fit rounded-sm text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" id="finance-filter-title" tabIndex={-1}>Filter keuangan</h2>
      <form action="/app/keuangan#finance-filter-title" className="cms-filter-bar" id="finance-filter-fields" method="get">
        <FilterFields props={props} />
        <FilterActions isNotDefault={props.isNotDefault} />
      </form>
      <p className="max-w-2xl text-xs leading-5 text-muted-foreground">{props.summary}</p>
    </section>
  );
}
