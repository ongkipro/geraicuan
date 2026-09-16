"use client";

import { Scissors } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { formatWibDateTime } from "@/lib/label-format";
import { DEFAULT_LABEL_SIZE, LABEL_SIZES, type LabelSize } from "@/lib/label-size";

export type LabelPrintContextValue = {
  size: LabelSize;
  /** The recorded print request's time; the stub's handover time once a print is recorded. */
  printedAt: string | null;
};

export const LabelPrintContext = createContext<LabelPrintContextValue>({
  printedAt: null,
  size: DEFAULT_LABEL_SIZE,
});

/**
 * The physical sheet. The package label always renders; the cut line and the sender
 * stub render only at 10 × 15 cm, so a 10 × 10 cm print cannot carry the stub at all.
 */
export function LabelSheetFrame({ children, stub }: { children: ReactNode; stub: ReactNode }) {
  const { size } = useContext(LabelPrintContext);
  const spec = LABEL_SIZES[size];
  return (
    <article
      aria-label={spec.withStub ? "Label 10 × 15 cm: label paket dan bukti pengirim" : "Label paket 10 × 10 cm"}
      className="label-sheet"
      data-label-size={size}
    >
      {children}
      {spec.withStub ? (
        <>
          <div aria-hidden="true" className="label-cut">
            <span className="label-cut-rule" />
            <span className="label-cut-mark">
              <Scissors className="label-cut-icon" />
              potong di sini
            </span>
            <span className="label-cut-rule" />
          </div>
          {stub}
        </>
      ) : null}
    </article>
  );
}

/**
 * Handover time on the stub: the recorded print request's time once one exists in
 * this view, otherwise the current WIB minute, so the preview always shows what a
 * print started now would carry.
 */
export function HandoverTime() {
  const { printedAt } = useContext(LabelPrintContext);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (printedAt) return;
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, [printedAt]);

  if (printedAt) return <>{formatWibDateTime(printedAt)}</>;
  return <>{now ? formatWibDateTime(now) : "Saat label dicetak"}</>;
}
