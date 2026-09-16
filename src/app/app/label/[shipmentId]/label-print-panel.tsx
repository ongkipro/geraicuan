"use client";

import { CheckCircle2, CircleAlert, History, Printer } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  recordLabelPrint,
  type LabelPrintActionState,
} from "@/app/app/label/[shipmentId]/actions";
import { LabelPrintContext } from "@/app/app/label/[shipmentId]/label-print-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatWibDateTime } from "@/lib/label-format";
import {
  DEFAULT_LABEL_SIZE,
  LABEL_SIZES,
  readStoredLabelSize,
  writeStoredLabelSize,
  type LabelSize,
} from "@/lib/label-size";

const initialState: LabelPrintActionState = {};

const browserStorage = () => (typeof window === "undefined" ? undefined : window.localStorage);
const subscribeToStorage = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

const SIZE_OPTIONS: Array<{ size: LabelSize; description: string }> = [
  { description: "Label paket 10 × 10 cm dan bukti pengirim 10 × 5 cm, dipotong di garis putus-putus. Bawaan.", size: "10x15" },
  { description: "Label paket saja, tanpa bukti pengirim.", size: "10x10" },
];

function PrintButton({ reprint, size }: { reprint: boolean; size: LabelSize }) {
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
        : `${reprint ? "Cetak ulang label" : "Cetak label"} ${LABEL_SIZES[size].name}`}
    </Button>
  );
}

export function LabelPrintPanel({
  children,
  shipmentId,
  initialAttemptId,
  operatorId,
  printCount,
  lastPrintedAt,
}: {
  /** The server-rendered LabelSheet; it reads the size and handover time from context. */
  children: ReactNode;
  shipmentId: string;
  initialAttemptId: string;
  operatorId: string;
  printCount: number;
  lastPrintedAt: string | null;
}) {
  const [state, action] = useActionState(recordLabelPrint, initialState);
  // The server renders the default; the client reads the remembered choice after
  // hydration. A choice made here wins even when storage refuses to keep it.
  const remembered = useSyncExternalStore(
    subscribeToStorage,
    () => readStoredLabelSize(browserStorage, operatorId),
    () => DEFAULT_LABEL_SIZE,
  );
  const [chosen, setChosen] = useState<LabelSize | null>(null);
  const size = chosen ?? remembered;
  const chooseSize = (next: LabelSize) => {
    setChosen(next);
    writeStoredLabelSize(browserStorage, operatorId, next);
  };
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
    <div className="grid gap-3 print:block">
    <div className="label-hide grid gap-3">
      <fieldset className="grid gap-2 rounded-lg border bg-card p-3">
        <legend className="px-1 text-sm font-medium">Ukuran label termal</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SIZE_OPTIONS.map((option) => (
            <label
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary"
              key={option.size}
            >
              <input
                checked={size === option.size}
                className="mt-0.5 size-4 shrink-0 accent-primary"
                name="label-size"
                onChange={() => chooseSize(option.size)}
                type="radio"
                value={option.size}
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-semibold">{LABEL_SIZES[option.size].name}</span>
                <span className="text-sm text-muted-foreground">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <form action={action} className="max-md:w-full">
          <input name="shipmentId" type="hidden" value={shipmentId} />
          <input
            name="attemptId"
            type="hidden"
            value={state.nextAttemptId ?? initialAttemptId}
          />
          <PrintButton reprint={printCount > 0} size={size} />
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
          <AlertDescription>Tercatat {formatWibDateTime(state.printed.printedAt)}. Permintaan membuka dialog cetak sudah dikirim ke browser. Jika dialog tidak terbuka, tekan Ctrl+P (⌘P); ukuran kertas mengikuti pilihan {LABEL_SIZES[size].name}.</AlertDescription>
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
      <LabelPrintContext.Provider value={{ printedAt: state.printed?.printedAt ?? null, size }}>
        <div
          aria-label={`Pratinjau label ${LABEL_SIZES[size].name}, sama dengan hasil cetak`}
          className="label-preview"
          id="pratinjau-label"
          role="region"
          tabIndex={0}
        >
          {children}
        </div>
      </LabelPrintContext.Provider>
    </div>
  );
}
