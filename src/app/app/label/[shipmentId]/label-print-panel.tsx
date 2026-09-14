"use client";

import { CheckCircle2, CircleAlert, History, Printer } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  recordLabelPrint,
  type LabelPrintActionState,
} from "@/app/app/label/[shipmentId]/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatWibDateTime } from "@/lib/label-format";

const initialState: LabelPrintActionState = {};

function PrintButton({ reprint }: { reprint: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      className="min-h-11 max-md:w-full md:min-h-8"
      disabled={pending}
      type="submit"
    >
      <Printer aria-hidden="true" />
      {pending
        ? "Menyiapkan cetak…"
        : reprint
          ? "Cetak ulang label"
          : "Cetak label"}
    </Button>
  );
}

export function LabelPrintPanel({
  shipmentId,
  initialAttemptId,
  printCount,
  lastPrintedAt,
}: {
  shipmentId: string;
  initialAttemptId: string;
  printCount: number;
  lastPrintedAt: string | null;
}) {
  const [state, action] = useActionState(recordLabelPrint, initialState);
  const lastPrintToken = useRef<string | null>(null);
  const resultRegion = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.printed || state.blocked || state.error) {
      resultRegion.current?.focus();
    }
  }, [state]);

  useEffect(() => {
    const token = state.printed?.token;
    if (!token || lastPrintToken.current === token) return;
    lastPrintToken.current = token;
    window.print();
  }, [state.printed?.token]);

  return (
    <div className="label-hide grid gap-3">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <form action={action} className="max-md:w-full">
          <input name="shipmentId" type="hidden" value={shipmentId} />
          <input
            name="attemptId"
            type="hidden"
            value={state.nextAttemptId ?? initialAttemptId}
          />
          <PrintButton reprint={printCount > 0} />
        </form>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <History aria-hidden="true" className="size-4 shrink-0" />
          {printCount === 0
            ? "Belum ada permintaan cetak yang tercatat."
            : `${printCount} permintaan cetak tercatat · terakhir ${lastPrintedAt ? formatWibDateTime(lastPrintedAt) : "waktu tidak tersedia"}.`}
        </p>
      </div>

      {state.printed ? (
        <Alert
          aria-live="polite"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          ref={resultRegion}
          role="status"
          tabIndex={-1}
        >
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Permintaan cetak ke-{state.printed.sequence} tercatat</AlertTitle>
          <AlertDescription>Tercatat {formatWibDateTime(state.printed.printedAt)}. Permintaan membuka dialog cetak sudah dikirim ke browser. Jika dialog tidak terbuka, tekan Ctrl+P (⌘P) dan pilih ukuran 100 × 150 mm.</AlertDescription>
        </Alert>
      ) : null}

      {state.blocked ? (
        <Alert
          aria-live="polite"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          ref={resultRegion}
          role="status"
          tabIndex={-1}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{state.blocked === "AWAITING_UPSTREAM_PAYMENT" ? "Menunggu pelunasan Mengantar" : "Label belum tersedia"}</AlertTitle>
          <AlertDescription>{state.blocked === "AWAITING_UPSTREAM_PAYMENT" ? "Kiriman ini belum memiliki nomor resi karena pembayaran Mengantar belum pulih." : "Label hanya dapat dicetak setelah Mengantar mengembalikan nomor resi."}</AlertDescription>
        </Alert>
      ) : null}

      {state.error ? (
        <Alert
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
          ref={resultRegion}
          role="alert"
          tabIndex={-1}
          variant="destructive"
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Permintaan cetak tidak dapat dicatat</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
