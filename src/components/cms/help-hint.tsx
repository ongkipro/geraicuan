import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * T-206 "?" help: the long explanation a page used to print under a heading or line now
 * sits behind one labelled button (spec 10 §1.8 — one idea per line). A Popover,
 * not a Tooltip, so it opens by tap and keyboard and stays open while read.
 * Server-renderable: only the Radix parts are client components.
 */
export function HelpHint({ children, className, label }: {
  children: ReactNode;
  className?: string;
  /** Accessible name of the "?" button, e.g. "Penjelasan ringkasan periode". */
  label: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={label}
          className={cn("size-11 shrink-0 text-muted-foreground md:size-10", className)}
          data-help-hint=""
          size="icon"
          type="button"
          variant="ghost"
        >
          <CircleHelp aria-hidden="true" className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid gap-2 p-3 text-sm leading-6">
        {children}
      </PopoverContent>
    </Popover>
  );
}
