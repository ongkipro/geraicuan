import { ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { HashFocusTarget } from "@/components/cms/hash-focus-target";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const fieldClass = "grid min-w-0 gap-2 text-sm font-medium";
const controlClass = "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 xl:h-8";

type Option = { id: string; label: string };

export type FinanceFiltersProps = {
  range: {
    presetId: string;
    timezone: string;
    startDate: string;
    lastIncludedDate: string;
  };
  presets: readonly Option[];
  timezones: readonly Option[];
  outlets: readonly { id: string; name: string }[];
  outletId?: string;
  rawStatus?: string;
  todayLocalDate: string;
  isNotDefault: boolean;
  summary: string;
};

function FilterFields({
  props,
}: {
  props: FinanceFiltersProps;
}) {
  const hintId = "finance-custom-hint";
  return (
    <>
      <label className={fieldClass} htmlFor="finance-range">
        Periode
        <select className={controlClass} defaultValue={props.range.presetId} id="finance-range" name="rentang">
          {props.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
      </label>
      <label className={fieldClass} htmlFor="finance-start">
        Dari tanggal
        <input aria-describedby={hintId} className={controlClass} defaultValue={props.range.startDate} id="finance-start" max={props.todayLocalDate} name="dari" type="date" />
      </label>
      <label className={fieldClass} htmlFor="finance-end">
        Sampai tanggal
        <input aria-describedby={hintId} className={controlClass} defaultValue={props.range.lastIncludedDate} id="finance-end" max={props.todayLocalDate} name="sampai" type="date" />
        <span className="text-xs font-normal leading-5 text-muted-foreground" id={hintId}>Dipakai saat memilih Rentang khusus.</span>
      </label>
      <label className={fieldClass} htmlFor="finance-timezone">
        Zona waktu
        <select className={controlClass} defaultValue={props.range.timezone} id="finance-timezone" name="tz">
          {props.timezones.map((timezone) => <option key={timezone.id} value={timezone.id}>{timezone.label}</option>)}
        </select>
      </label>
      <label className={fieldClass} htmlFor="finance-outlet">
        Outlet
        <select className={controlClass} defaultValue={props.outletId ?? ""} id="finance-outlet" name="outlet">
          <option value="">Semua outlet</option>
          {props.outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
        </select>
      </label>
      <label className={fieldClass} htmlFor="finance-status">
        Status rekonsiliasi
        <select aria-invalid={Boolean(props.rawStatus && props.rawStatus !== "VARIANCE")} className={controlClass} defaultValue={props.rawStatus ?? ""} id="finance-status" name="status">
          <option value="">Semua status</option>
          <option value="VARIANCE">Ada selisih</option>
          {props.rawStatus && props.rawStatus !== "VARIANCE" ? <option value={props.rawStatus}>Status tidak valid</option> : null}
        </select>
      </label>
    </>
  );
}

function FilterActions({ isNotDefault }: { isNotDefault: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4 2xl:col-span-6">
      <Button className="min-h-11 xl:min-h-8 xl:h-8" type="submit">Terapkan filter</Button>
      <Button className="min-h-11 xl:min-h-8 xl:h-8" name="khusus" type="submit" value="1" variant="outline">Terapkan rentang khusus</Button>
      {isNotDefault ? <Button asChild className="min-h-11 xl:min-h-8 xl:h-8" variant="outline"><Link href="/app/keuangan#finance-filter-title">Setel ulang</Link></Button> : null}
    </div>
  );
}

export function FinanceFilters(props: FinanceFiltersProps) {
  return (
    <section aria-labelledby="finance-filter-title" className="grid gap-3">
      <HashFocusTarget targetId="finance-filter-title" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring" id="finance-filter-title" tabIndex={-1}>Filter workspace</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{props.summary}</p>
        </div>
      </div>
      <div>
        <details className="group/filter peer/filter md:hidden" data-filter-disclosure>
        <summary aria-controls="finance-filter-fields" className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border bg-background px-3 text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><SlidersHorizontal aria-hidden="true" className="size-4" />Ubah filter</span>
          <span className="flex items-center gap-2">{props.isNotDefault ? <Badge variant="secondary">Filter aktif</Badge> : null}<ChevronDown aria-hidden="true" className="size-4 transition-transform group-open/filter:rotate-180" /></span>
        </summary>
        </details>
        <div className="hidden pt-3 peer-open/filter:block md:block md:pt-0" id="finance-filter-fields">
          <form action="/app/keuangan#finance-filter-title" className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[1.05fr_1.05fr_1.05fr_1.35fr_1fr_1.25fr]" method="get">
            <FilterFields props={props} />
            <FilterActions isNotDefault={props.isNotDefault} />
          </form>
        </div>
      </div>
    </section>
  );
}
