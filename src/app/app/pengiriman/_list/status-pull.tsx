"use client";

import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import type { MengantarStatusPullState } from "@/app/app/pengiriman/status-sync-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type PullAction = (previous: MengantarStatusPullState, formData: FormData) => Promise<MengantarStatusPullState>;

/**
 * PR-73: "Perbarui status dari Mengantar" in the list card's toolbar (Tenant Admin only; the
 * page renders it only for that role and the action re-checks). It pulls for the page's own
 * period and the chosen outlet. Nothing but the control shows until it is pressed; the result
 * (status) or failure (alert) appears under the toolbar afterwards.
 *
 * Renders as `display: contents` so the outlet select and the button sit in the toolbar row
 * and the result takes a full row of its own (`basis-full`).
 */
export function StatusPull({
  action,
  attemptId: initialAttemptId,
  outlets,
  range,
}: {
  action: PullAction;
  attemptId: string;
  outlets: readonly { id: string; name: string }[];
  range: { presetId: string; timezone: string; startDate: string; lastIncludedDate: string };
}) {
  const [state, formAction, pending] = useActionState(action, { nextAttemptId: initialAttemptId });
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status) resultRef.current?.focus();
  }, [state]);

  if (outlets.length === 0) return null;
  const failed = state.status === "error";

  return (
    <form action={formAction} aria-label="Perbarui status dari Mengantar" className="contents">
      <input name="attemptId" type="hidden" value={state.nextAttemptId ?? initialAttemptId} />
      <input name="rentang" type="hidden" value={range.presetId} />
      <input name="tz" type="hidden" value={range.timezone} />
      <input name="dari" type="hidden" value={range.startDate} />
      <input name="sampai" type="hidden" value={range.lastIncludedDate} />
      <input name="khusus" type="hidden" value="1" />
      {outlets.length > 1 ? (
        <label className="max-md:w-full">
          <span className="sr-only">Outlet untuk perbarui status</span>
          <select
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-11 md:w-48"
            disabled={pending}
            name="outletId"
            onChange={(event) => setOutletId(event.target.value)}
            value={outletId}
          >
            {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
          </select>
        </label>
      ) : <input name="outletId" type="hidden" value={outletId} />}
      <Button className="max-md:w-full" disabled={pending || !outletId} type="submit" variant="outline">
        <RefreshCw aria-hidden="true" className={pending ? "animate-spin" : undefined} />
        {pending ? "Memperbarui status…" : "Perbarui status dari Mengantar"}
      </Button>
      {state.status && state.message ? (
        <div className="order-last basis-full" ref={resultRef} tabIndex={-1}>
          <Alert role={failed ? "alert" : "status"} variant={failed ? "destructive" : "default"}>
            {failed ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
            <AlertTitle>{failed ? "Status belum diperbarui" : "Status diperbarui"}</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        </div>
      ) : null}
    </form>
  );
}
