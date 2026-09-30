"use client";

import { Scissors } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_LABEL_SIZE, LABEL_SIZES, type LabelSize } from "@/lib/label-size";

export type LabelPrintContextValue = {
  size: LabelSize;
};

export const LabelPrintContext = createContext<LabelPrintContextValue>({ size: DEFAULT_LABEL_SIZE });

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
