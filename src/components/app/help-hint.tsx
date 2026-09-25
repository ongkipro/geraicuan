import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Spec 10 §1.5: the one "?" that holds a long explanation instead of a sentence under every
 * heading. A Popover, not a Tooltip, so it opens by tap and keyboard and stays open while read.
 */
export function HelpHint({ children, label }: {
  children: ReactNode;
  /** Accessible name of the "?" button, e.g. "Cara menghitung KPI". */
  label: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button aria-label={label} className="text-muted-foreground" size="icon" type="button" variant="ghost">
          <CircleHelp aria-hidden="true" className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-2 text-sm">
        {children}
      </PopoverContent>
    </Popover>
  );
}
