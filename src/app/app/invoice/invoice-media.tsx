"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { INVOICE_MEDIA, type InvoiceMedium } from "@/app/app/invoice/invoice-sheet";

/** A4 is 186 mm wide inside its 12 mm page margins; CSS px are 96 per inch. */
const A4_SHEET_WIDTH_PX = (186 * 96) / 25.4;

/** Spec 17 `/app/invoice/[n]`: media option cards, 80 mm (default) and A4, chosen per print. */
export function InvoiceMediaCards({
  labelledBy,
  medium,
  onChange,
}: {
  labelledBy: string;
  medium: InvoiceMedium;
  onChange: (medium: InvoiceMedium) => void;
}) {
  return (
    <fieldset aria-labelledby={labelledBy} className="grid gap-3 sm:grid-cols-2">
      {(Object.keys(INVOICE_MEDIA) as InvoiceMedium[]).map((option) => (
        <label
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-4 has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring"
          key={option}
        >
          <span className="grid flex-1 gap-1">
            <span className="text-sm font-bold">{INVOICE_MEDIA[option].name}</span>
            <span className="text-xs text-muted-foreground">{INVOICE_MEDIA[option].description}</span>
          </span>
          <input
            checked={medium === option}
            className="mt-1 size-4 shrink-0 accent-primary"
            name={`${labelledBy}-medium`}
            onChange={() => onChange(option)}
            type="radio"
            value={option}
          />
        </label>
      ))}
    </fieldset>
  );
}

/**
 * The invoice preview region. The preview is the print: an 80 mm sheet fits every column
 * at 1:1; an A4 sheet is scaled to the column on screen only (print resets the zoom).
 */
export function InvoicePreview({ children, label }: { children: ReactNode; label: string }) {
  const region = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const element = region.current;
    if (!element) return;
    const fit = () => {
      const style = getComputedStyle(element);
      const available = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setZoom(Math.min(1, Math.max(available, 0) / A4_SHEET_WIDTH_PX));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-label={label}
      className="invoice-preview print-sequence"
      ref={region}
      role="region"
      style={{ "--invoice-preview-zoom": zoom } as CSSProperties}
    >
      {children}
    </div>
  );
}
