"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { HelpHint } from "@/components/cms/help-hint";
import type { MengantarStatusPullState } from "@/app/app/pengiriman/status-sync-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type PullAction = (
  previousState: MengantarStatusPullState,
  formData: FormData,
) => Promise<MengantarStatusPullState>;

/**
 * T-204: Tenant Admin control on Histori kiriman and Retur. Read-only on the
 * Mengantar side (no order is created), so it submits without a confirmation;
 * the period is the page's own range filter and the account is the chosen
 * outlet's Mengantar connection.
 */
export function MengantarStatusPull({ action, attemptId: initialAttemptId, idPrefix, outlets, periodLabel, range }: {
  action: PullAction;
  attemptId: string;
  idPrefix: string;
  outlets: readonly { id: string; name: string }[];
  periodLabel: string;
  range: { presetId: string; timezone: string; startDate: string; lastIncludedDate: string };
}) {
  const [state, formAction, pending] = useActionState(action, { nextAttemptId: initialAttemptId });
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status) resultRef.current?.focus();
  }, [state]);
  if (outlets.length === 0) return null;
  const attemptId = state.nextAttemptId ?? initialAttemptId;
  const selectId = `${idPrefix}-status-pull-outlet`;
  const noteId = `${idPrefix}-status-pull-note`;
  return (
    <form action={formAction} className="grid gap-1">
      <input name="attemptId" type="hidden" value={attemptId} />
      <input name="rentang" type="hidden" value={range.presetId} />
      <input name="tz" type="hidden" value={range.timezone} />
      <input name="dari" type="hidden" value={range.startDate} />
      <input name="sampai" type="hidden" value={range.lastIncludedDate} />
      <input name="khusus" type="hidden" value="1" />
      {state.status && state.message ? (
        <Alert className="mb-2" ref={resultRef} role={state.status === "error" ? "alert" : "status"} tabIndex={-1} variant={state.status === "error" ? "destructive" : "default"}>
          <AlertTitle>{state.status === "error" ? "Status belum diperbarui" : "Status diperbarui"}</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {/* T-206: one compact row — outlet (sr-only name), the outline action and a "?" with
          the details; the visible note under it stays one short line. */}
      <div className="flex flex-wrap items-center gap-2">
        {outlets.length > 1 ? (
          <label className="min-w-0 max-md:flex-1 md:w-56" htmlFor={selectId}>
            <span className="sr-only">Outlet dan akun Mengantar</span>
            <select className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-11 max-md:text-base" disabled={pending} id={selectId} name="outletId" onChange={(event) => setOutletId(event.target.value)} value={outletId}>
              {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
            </select>
          </label>
        ) : <input name="outletId" type="hidden" value={outletId} />}
        <Button aria-describedby={noteId} className="max-md:min-h-11" disabled={pending || !outletId} type="submit" variant="outline">
          <RefreshCw aria-hidden="true" className={pending ? "animate-spin" : undefined} />
          {pending ? "Memperbarui status…" : "Perbarui status dari Mengantar"}
        </Button>
        <HelpHint label="Tentang pembaruan status dari Mengantar">
          Hanya membaca status order dari Mengantar untuk periode filter di atas; tidak membuat order. Bisa diulang setiap satu menit per outlet.
        </HelpHint>
      </div>
      <p className="max-w-2xl text-xs text-muted-foreground" id={noteId} role={pending ? "status" : undefined}>
        {pending
          ? "Mengambil status order dari Mengantar. Ini bisa memakan beberapa detik."
          : `Periode ${periodLabel}${outlets.length > 1 ? "" : ` · ${outlets[0]?.name}`} · hanya membaca, tidak membuat order.`}
      </p>
    </form>
  );
}
