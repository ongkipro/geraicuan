"use client";

import { ArrowLeftRight } from "lucide-react";
import { type ComponentProps, useEffect, useId, useImperativeHandle, useRef, useState } from "react";

/** Enhance native scrolling without moving table data or rendering to the client. */
export function TableScrollRegion({ children, ref, ...props }: ComponentProps<"div">) {
  const regionRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [overflow, setOverflow] = useState(false);
  useImperativeHandle(ref, () => regionRef.current!, []);

  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const measure = () => setOverflow(region.scrollWidth - region.clientWidth > 1);
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    const table = region.querySelector("table");
    if (table) observer.observe(table);
    measure();
    return () => observer.disconnect();
  }, [children]);

  return (
    <div className="min-w-0" data-slot="table-scroll-shell">
      <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground print:hidden" hidden={!overflow} id={hintId}>
        <ArrowLeftRight aria-hidden="true" className="size-3.5 shrink-0" />
        Geser tabel untuk melihat kolom lainnya.
      </p>
      <div
        {...props}
        aria-describedby={[props["aria-describedby"], overflow ? hintId : null].filter(Boolean).join(" ") || undefined}
        ref={regionRef}
      >
        {children}
      </div>
    </div>
  );
}
