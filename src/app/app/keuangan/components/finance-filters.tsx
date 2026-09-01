"use client";

import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const fieldClass = "grid min-w-0 gap-2 text-sm font-medium";
const controlClass = "min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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
  idPrefix,
  props,
}: {
  idPrefix: string;
  props: FinanceFiltersProps;
}) {
  const hintId = `${idPrefix}-custom-hint`;
  return (
    <>
      <label className={fieldClass} htmlFor={`${idPrefix}-range`}>
        Periode
        <select className={controlClass} defaultValue={props.range.presetId} id={`${idPrefix}-range`} name="rentang">
          {props.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
      </label>
      <label className={fieldClass} htmlFor={`${idPrefix}-start`}>
        Dari tanggal
        <input aria-describedby={hintId} className={controlClass} defaultValue={props.range.startDate} id={`${idPrefix}-start`} max={props.todayLocalDate} name="dari" type="date" />
      </label>
      <label className={fieldClass} htmlFor={`${idPrefix}-end`}>
        Sampai tanggal
        <input aria-describedby={hintId} className={controlClass} defaultValue={props.range.lastIncludedDate} id={`${idPrefix}-end`} max={props.todayLocalDate} name="sampai" type="date" />
        <span className="text-xs font-normal leading-5 text-muted-foreground" id={hintId}>Dipakai saat memilih Rentang khusus.</span>
      </label>
      <label className={fieldClass} htmlFor={`${idPrefix}-timezone`}>
        Zona waktu
        <select className={controlClass} defaultValue={props.range.timezone} id={`${idPrefix}-timezone`} name="tz">
          {props.timezones.map((timezone) => <option key={timezone.id} value={timezone.id}>{timezone.label}</option>)}
        </select>
      </label>
      <label className={fieldClass} htmlFor={`${idPrefix}-outlet`}>
        Outlet
        <select className={controlClass} defaultValue={props.outletId ?? ""} id={`${idPrefix}-outlet`} name="outlet">
          <option value="">Semua outlet</option>
          {props.outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
        </select>
      </label>
      <label className={fieldClass} htmlFor={`${idPrefix}-status`}>
        Status rekonsiliasi
        <select aria-invalid={Boolean(props.rawStatus && props.rawStatus !== "VARIANCE")} className={controlClass} defaultValue={props.rawStatus ?? ""} id={`${idPrefix}-status`} name="status">
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
    <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-6">
      <Button className="min-h-11" type="submit">Terapkan filter</Button>
      <Button className="min-h-11" name="khusus" type="submit" value="1" variant="outline">Terapkan rentang khusus</Button>
      {isNotDefault ? <Button asChild className="min-h-11" variant="outline"><Link href="/app/keuangan">Setel ulang</Link></Button> : null}
    </div>
  );
}

export function FinanceFilters(props: FinanceFiltersProps) {
  return (
    <section aria-labelledby="finance-filter-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium" id="finance-filter-title">Filter workspace</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{props.summary}</p>
        </div>
        <div className="flex gap-2 md:hidden">
          <Sheet>
            <SheetTrigger asChild><Button className="min-h-11" variant="outline"><SlidersHorizontal aria-hidden="true" />Ubah filter</Button></SheetTrigger>
            <SheetContent className="w-[min(92vw,26rem)] overflow-y-auto" side="right">
              <SheetHeader><SheetTitle>Filter keuangan</SheetTitle><SheetDescription>Atur periode, outlet, dan status antrean rekonsiliasi.</SheetDescription></SheetHeader>
              <form className="grid gap-4 px-4 pb-6" method="get">
                <FilterFields idPrefix="mobile-finance" props={props} />
                <FilterActions isNotDefault={props.isNotDefault} />
              </form>
            </SheetContent>
          </Sheet>
          {props.isNotDefault ? <Button asChild className="min-h-11" variant="ghost"><Link href="/app/keuangan">Reset</Link></Button> : null}
        </div>
      </div>
      <form className="hidden gap-4 rounded-xl border bg-card p-4 md:grid md:grid-cols-2 xl:grid-cols-6" method="get">
        <FilterFields idPrefix="desktop-finance" props={props} />
        <FilterActions isNotDefault={props.isNotDefault} />
      </form>
    </section>
  );
}
