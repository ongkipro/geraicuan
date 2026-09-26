"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LABEL_SIZES, type LabelSize } from "@/lib/label-size";
import { cn } from "@/lib/utils";

/** `.label-sheet` is 100 mm wide at every size (label.css, T-176); CSS px are 96 per inch. */
const LABEL_SHEET_WIDTH_PX = (100 * 96) / 25.4;

type PreviewZoom = "fit" | "100" | "150";
const ZOOM_OPTIONS: { label: string; value: PreviewZoom }[] = [
  { label: "Pas layar", value: "fit" },
  { label: "100%", value: "100" },
  { label: "150%", value: "150" },
];

/**
 * T-243 label preview: the real sheet on the sunken "desk" (`.label-preview`) with a paper
 * shadow, the exact paper size caption and a zoom control (Pas layar / 100% / 150%). Only the
 * screen changes: the sheet keeps its geometry, print resets the zoom and drops the shadow,
 * and `label.css` is untouched. The region is focusable so a zoomed sheet scrolls by keyboard.
 */
export function LabelPreviewFrame({
  children,
  className,
  id,
  label,
  sample = false,
  size,
  title,
}: {
  children: ReactNode;
  /** Extra classes for the sheet region (e.g. `print-sequence` for a batch). */
  className?: string;
  id?: string;
  /** Accessible name of the sheet region. */
  label: string;
  /** Pengaturan: the sheet shows example data, never a real shipment. */
  sample?: boolean;
  size: LabelSize;
  title: string;
}) {
  const region = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
  const [mode, setMode] = useState<PreviewZoom>("fit");

  useEffect(() => {
    const element = region.current;
    if (!element) return;
    const fit = () => {
      const style = getComputedStyle(element);
      const available = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setFitZoom(Math.min(1, Math.max(available, 0) / LABEL_SHEET_WIDTH_PX));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const zoom = mode === "fit" ? fitZoom : mode === "100" ? 1 : 1.5;

  return (
    <div className="grid min-w-0 gap-2 print:block" id={id}>
      <div className="label-hide flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {sample ? <Badge variant="secondary">Data contoh</Badge> : null}
        </div>
        <ToggleGroup
          aria-label="Perbesaran pratinjau"
          onValueChange={(value) => { if (value) setMode(value as PreviewZoom); }}
          spacing={0}
          type="single"
          value={mode}
          variant="outline"
        >
          {ZOOM_OPTIONS.map((option) => (
            <ToggleGroupItem className="h-10 px-3 text-xs max-md:h-11" key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div
        aria-label={label}
        className={cn(
          "label-preview outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "[&>.label-sheet]:[zoom:var(--label-preview-zoom,1)] [&>.label-sheet]:shadow-lg",
          "print:[&>.label-sheet]:[zoom:1] print:[&>.label-sheet]:shadow-none",
          className,
        )}
        ref={region}
        role="region"
        style={{ "--label-preview-zoom": zoom } as CSSProperties}
        tabIndex={0}
      >
        {children}
      </div>
      <p className="label-hide text-xs text-muted-foreground tabular-nums">
        {LABEL_SIZES[size].name} · skala 1:1 saat dicetak · tampil {Math.round(zoom * 100)}%
      </p>
    </div>
  );
}
