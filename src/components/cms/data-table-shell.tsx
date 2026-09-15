import type { ReactNode } from "react";
import { TableScrollRegion } from "@/components/ui/table-scroll-region";

import { cn } from "@/lib/utils";

export type DataTableShellProps = {
  /** Names the scroll region, e.g. "Daftar kiriman". */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Bordered, keyboard-scrollable region for a semantic `<Table>`: the table may
 * be wider than a 390px screen, the document may not.
 */
export function DataTableShell({ children, className, label }: DataTableShellProps) {
  return (
    <TableScrollRegion
      aria-label={label}
      className={cn("min-w-0 overflow-x-auto rounded-md border", className)}
      role="region"
      tabIndex={0}
    >
      {children}
    </TableScrollRegion>
  );
}
