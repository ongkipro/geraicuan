"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import type { FinanceActionState } from "@/app/app/keuangan/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type FinanceStateAction = (
  previousState: FinanceActionState,
  formData: FormData,
) => Promise<FinanceActionState>;

type CommonHiddenFields = {
  attemptId: string;
  range: { presetId: string; timezone: string; startDate: string; lastIncludedDate: string };
  outletFilter?: string;
};

function HiddenContext({ context, attemptId }: { context: CommonHiddenFields; attemptId: string }) {
  return <>
    <input name="attemptId" type="hidden" value={attemptId} />
    <input name="rentang" type="hidden" value={context.range.presetId} />
    <input name="tz" type="hidden" value={context.range.timezone} />
    <input name="dari" type="hidden" value={context.range.startDate} />
    <input name="sampai" type="hidden" value={context.range.lastIncludedDate} />
    <input name="khusus" type="hidden" value="1" />
    {context.outletFilter ? <input name="outletFilter" type="hidden" value={context.outletFilter} /> : null}
  </>;
}

function ActionResult({ state, resultRef }: { state: FinanceActionState; resultRef: React.RefObject<HTMLDivElement | null> }) {
  if (!state.status || !state.message) return null;
  return <Alert ref={resultRef} role={state.status === "error" ? "alert" : "status"} tabIndex={-1} variant={state.status === "error" ? "destructive" : "default"}>
    <AlertTitle>{state.status === "error" ? "Tindakan tidak selesai" : "Tindakan selesai"}</AlertTitle>
    <AlertDescription>{state.message}</AlertDescription>
  </Alert>;
}

function previousCalendarMonth(lastIncludedDate: string) {
  const boundary = new Date(`${lastIncludedDate.slice(0, 7)}-01T00:00:00.000Z`);
  boundary.setUTCMonth(boundary.getUTCMonth() - 1);
  return boundary.toISOString().slice(0, 7);
}

export function ReconciliationActionPanel({ action, context, outlets, periodLabel }: {
  action: FinanceStateAction;
  context: CommonHiddenFields;
  outlets: readonly { id: string; name: string }[];
  periodLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { nextAttemptId: context.attemptId });
  const [outletId, setOutletId] = useState(context.outletFilter ?? outlets[0]?.id ?? "");
  const [periodDate, setPeriodDate] = useState(context.range.lastIncludedDate);
  const latestCompleteMonth = previousCalendarMonth(context.range.lastIncludedDate);
  const [periodMonth, setPeriodMonth] = useState(latestCompleteMonth);
  const [cadence, setCadence] = useState<"DAILY" | "MONTHLY" | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const focusResultAfterCloseRef = useRef(false);
  useEffect(() => {
    if (!state.status) return;
    focusResultAfterCloseRef.current = true;
    const frame = window.requestAnimationFrame(() => setCadence(null));
    return () => window.cancelAnimationFrame(frame);
  }, [state]);
  const attemptId = state.nextAttemptId ?? context.attemptId;
  return <div className="grid gap-4">
    <ActionResult resultRef={resultRef} state={state} />
    <label className="grid max-w-lg gap-2 text-sm font-medium" htmlFor="reconciliation-outlet">
      Outlet yang ditutup
      <select className="min-h-11 rounded-lg border border-input bg-background px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" id="reconciliation-outlet" onChange={(event) => setOutletId(event.target.value)} value={outletId}>
        {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
      </select>
    </label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-medium" htmlFor="reconciliation-date">Tanggal penutupan harian<input className="min-h-11 rounded-lg border border-input bg-background px-3" id="reconciliation-date" max={context.range.lastIncludedDate} onChange={(event) => setPeriodDate(event.target.value)} type="date" value={periodDate} /></label>
      <label className="grid gap-2 text-sm font-medium" htmlFor="reconciliation-month">Bulan penutupan bulanan<input className="min-h-11 rounded-lg border border-input bg-background px-3" id="reconciliation-month" max={latestCompleteMonth} onChange={(event) => setPeriodMonth(event.target.value)} type="month" value={periodMonth} /></label>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button className="min-h-11" onClick={(event) => { triggerRef.current = event.currentTarget; setCadence("DAILY"); }} type="button">Rekonsiliasi harian</Button>
      <Button className="min-h-11" onClick={(event) => { triggerRef.current = event.currentTarget; setCadence("MONTHLY"); }} type="button" variant="outline">Rekonsiliasi bulanan</Button>
      <AlertDialog onOpenChange={(open) => { if (!open) setCadence(null); }} open={cadence !== null}>
        <AlertDialogContent onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = focusResultAfterCloseRef.current ? resultRef.current : triggerRef.current;
          focusResultAfterCloseRef.current = false;
          window.requestAnimationFrame(() => target?.focus());
        }}>
          <form action={formAction}>
            <HiddenContext attemptId={attemptId} context={context} />
            <input name="outletId" type="hidden" value={outletId} />
            <input name="cadence" type="hidden" value={cadence ?? ""} />
            <input name="periodDate" type="hidden" value={periodDate} />
            <input name="periodMonth" type="hidden" value={periodMonth} />
            <AlertDialogHeader><AlertDialogTitle>Konfirmasi rekonsiliasi {cadence === "DAILY" ? "harian" : "bulanan"}</AlertDialogTitle><AlertDialogDescription>Server akan menghitung ulang sumber dan ledger untuk {cadence === "DAILY" ? periodDate : periodMonth}. Outlet: {outlets.find((outlet) => outlet.id === outletId)?.name ?? "Tidak tersedia"}. Snapshot bersifat append-only; filter workspace saat ini adalah {periodLabel}.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter className="mt-4"><AlertDialogCancel className="min-h-11" disabled={pending}>Batal</AlertDialogCancel><Button className="min-h-11" disabled={pending} type="submit">{pending ? "Menyimpan…" : "Simpan rekonsiliasi"}</Button></AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </div>;
}

export function ReversalActionPanel({ action, amountLabel, context, entryId, entryType }: {
  action: FinanceStateAction;
  amountLabel: string;
  context: CommonHiddenFields;
  entryId: string;
  entryType: string;
}) {
  const [state, formAction, pending] = useActionState(action, { nextAttemptId: context.attemptId });
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const focusResultAfterCloseRef = useRef(false);
  useEffect(() => {
    if (!state.status) return;
    focusResultAfterCloseRef.current = true;
    const frame = window.requestAnimationFrame(() => setOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [state]);
  const attemptId = state.nextAttemptId ?? context.attemptId;
  return <div className="grid min-w-44 gap-2">
    <ActionResult resultRef={resultRef} state={state} />
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild><Button className="min-h-11" ref={triggerRef} variant="outline">Buat pembalik</Button></AlertDialogTrigger>
      <AlertDialogContent onCloseAutoFocus={(event) => {
        event.preventDefault();
        const target = focusResultAfterCloseRef.current ? resultRef.current : triggerRef.current;
        focusResultAfterCloseRef.current = false;
        window.requestAnimationFrame(() => target?.focus());
      }}>
        <form action={formAction}>
          <HiddenContext attemptId={attemptId} context={context} />
          <input name="entryId" type="hidden" value={entryId} />
          <AlertDialogHeader><AlertDialogTitle>Konfirmasi pembalikan penuh</AlertDialogTitle><AlertDialogDescription>Entri {entryType} senilai {amountLabel} akan diberi entri pembalik. Entri asal tetap utuh dan tindakan ini tidak dapat diulang.</AlertDialogDescription></AlertDialogHeader>
          <Label className="my-5 min-h-11 rounded-lg border p-3" htmlFor={`confirm-${entryId}`}>
            <input className="size-4 shrink-0 accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" type="checkbox" id={`confirm-${entryId}`} name="confirmation" required value="confirmed" />Saya memahami pembalikan penuh ini.
          </Label>
          <AlertDialogFooter><AlertDialogCancel className="min-h-11" disabled={pending}>Batal</AlertDialogCancel><Button className="min-h-11" disabled={pending} type="submit" variant="destructive">{pending ? "Menyimpan…" : "Buat entri pembalik"}</Button></AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
