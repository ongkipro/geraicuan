import type { ReactNode } from "react";
import { TableScrollRegion } from "@/components/ui/table-scroll-region";

import { cn } from "@/lib/utils";

/**
 * The same surface for a `<Table containerProps={{ role: "region" }}>` placed on the ground (spec 10 §1.6):
 * a white card without an outline. Inside a Card, pass only the focus classes instead.
 */
export const dataTableSurfaceClassName =
  "rounded-xl bg-card border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export type DataTableShellProps = {
  /** Names the scroll region, e.g. "Daftar kiriman". */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Keyboard-scrollable table surface (spec 10 v2: one frame level — a white card surface on the
 * ground, no outline; pass `className="rounded-none bg-transparent shadow-none"` inside a Card). Region for a semantic `<Table>`: the table may
 * be wider than a 390px screen, the document may not.
 */
export function DataTableShell({ children, className, label }: DataTableShellProps) {
  return (
    <TableScrollRegion
      aria-label={label}
      className={cn("min-w-0 overflow-x-auto rounded-xl bg-card border", className)}
      role="region"
      tabIndex={0}
    >
      {children}
    </TableScrollRegion>
  );
}
