"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { HashFocusTarget } from "@/components/cms/hash-focus-target";
import { Button } from "@/components/ui/button";

const fieldClass = "grid min-w-0 gap-1.5 text-xs font-medium text-foreground";
const controlClass = "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9";

type Option = { id: string; label: string };

export type FinanceFiltersProps = {
  range: {
    presetId: string;
    startDate: string;
    lastIncludedDate: string;
  };
  presets: readonly Option[];
  outlets: readonly { id: string; name: string }[];
  outletId?: string;
  rawStatus?: string;
  todayLocalDate: string;
  isNotDefault: boolean;
  summary: string;
};

function FilterFields({ props }: { props: FinanceFiltersProps }) {
  const hintId = "finance-custom-hint";
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <label className={fieldClass} htmlFor="finance-range">
          Periode
          <select className={controlClass} defaultValue={props.range.presetId} id="finance-range" name="rentang" onChange={(event) => { if (event.target.value === "kustom") { const advanced = event.target.form?.querySelector<HTMLDetailsElement>("details[data-advanced]"); if (advanced) advanced.open = true; } }}>
            {props.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
        </label>
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
      <details className="cms-filter-advanced" data-advanced data-filter-disclosure open={props.range.presetId === "kustom" || Boolean(props.rawStatus)}>
        <summary><SlidersHorizontal aria-hidden="true" className="size-4" />Tanggal & status<ChevronDown aria-hidden="true" className="ml-auto size-4" /></summary>
        <div className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className={fieldClass} htmlFor="finance-start">
            Dari tanggal
            <input aria-describedby={hintId} className={controlClass} defaultValue={props.range.startDate} id="finance-start" max={props.todayLocalDate} name="dari" type="date" />
          </label>
          <label className={fieldClass} htmlFor="finance-end">
            Sampai tanggal
            <input aria-describedby={hintId} className={controlClass} defaultValue={props.range.lastIncludedDate} id="finance-end" max={props.todayLocalDate} name="sampai" type="date" />
            <span className="text-xs font-normal leading-5 text-muted-foreground" id={hintId}>Dipakai saat memilih Rentang khusus.</span>
          </label>
          <label className={fieldClass} htmlFor="finance-status">
            Status rekonsiliasi
            <select aria-invalid={Boolean(props.rawStatus && props.rawStatus !== "VARIANCE")} className={controlClass} defaultValue={props.rawStatus ?? ""} id="finance-status" name="status">
              <option value="">Semua status</option>
              <option value="VARIANCE">Ada selisih</option>
              {props.rawStatus && props.rawStatus !== "VARIANCE" ? <option value={props.rawStatus}>Status tidak valid</option> : null}
            </select>
          </label>
        </div>
        <div className="pt-3">
          <Button className="min-h-11 md:h-9 md:min-h-9" name="khusus" type="submit" value="1" variant="outline">Terapkan rentang khusus</Button>
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
      <p className="text-xs leading-5 text-muted-foreground">{props.summary}</p>
    </section>
  );
}
