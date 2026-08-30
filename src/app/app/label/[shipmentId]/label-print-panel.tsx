"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  recordLabelPrint,
  type LabelPrintActionState,
} from "@/app/app/label/[shipmentId]/actions";
import { formatWibDateTime } from "@/lib/label-format";

const initialState: LabelPrintActionState = {};

function PrintButton({ reprint }: { reprint: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="sales-primary ship-submit"
      disabled={pending}
      type="submit"
    >
      {pending
        ? "Menyiapkan cetak…"
        : reprint
          ? "Cetak ulang label"
          : "Cetak label"}
    </button>
  );
}

export function LabelPrintPanel({
  shipmentId,
  printCount,
  lastPrintedAt,
}: {
  shipmentId: string;
  printCount: number;
  lastPrintedAt: string | null;
}) {
  const [state, action] = useActionState(recordLabelPrint, initialState);
  const lastPrintToken = useRef<string | null>(null);
  const resultRegion = useRef<HTMLElement>(null);

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
    <div className="label-hide">
      <div className="label-actions">
        <form action={action}>
          <input name="shipmentId" type="hidden" value={shipmentId} />
          <PrintButton reprint={printCount > 0} />
        </form>
      </div>
      <p className="label-summary">
        {printCount === 0
          ? "Belum pernah dicetak."
          : `Sudah dicetak ${printCount}× · terakhir ${
              lastPrintedAt
                ? formatWibDateTime(lastPrintedAt)
                : "waktu tidak tersedia"
            }.`}
      </p>

      {state.printed ? (
        <section
          aria-live="polite"
          className="ship-success label-print-result"
          ref={resultRegion}
          role="status"
          tabIndex={-1}
        >
          <h2>Cetak ke-{state.printed.sequence} tercatat.</h2>
          <p>
            Tercatat {formatWibDateTime(state.printed.printedAt)}. Dialog cetak
            browser terbuka.
          </p>
          <p className="bulk-hint">
            Jika dialog tidak terbuka, tekan Ctrl+P (⌘P) dan pilih ukuran 100 ×
            150 mm.
          </p>
        </section>
      ) : null}

      {state.blocked ? (
        <section
          aria-live="polite"
          className="ship-blocked label-print-result"
          ref={resultRegion}
          role="status"
          tabIndex={-1}
        >
          <h2>
            {state.blocked === "AWAITING_UPSTREAM_PAYMENT"
              ? "Menunggu pelunasan Mengantar."
              : "Label belum tersedia."}
          </h2>
          <p>
            {state.blocked === "AWAITING_UPSTREAM_PAYMENT"
              ? "Kiriman ini belum memiliki nomor resi karena pembayaran Mengantar belum pulih."
              : "Label hanya dapat dicetak setelah Mengantar mengembalikan nomor resi."}
          </p>
        </section>
      ) : null}

      {state.error ? (
        <section
          className="ship-error-summary label-print-result"
          ref={resultRegion}
          role="alert"
          tabIndex={-1}
        >
          <p>{state.error}</p>
        </section>
      ) : null}
    </div>
  );
}
