"use client";

import { Check, CirclePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type DataTableFacetOption = {
  label: string;
  /** Full URL that applies (or, when selected, removes) this option. Reset the page param in it. */
  href: string;
  count?: number;
  selected?: boolean;
};

export type DataTableFacet = {
  /** Button label, e.g. "Status". */
  title: string;
  options: readonly DataTableFacetOption[];
  /** Placeholder for the option search; omit to hide it (short lists). */
  searchPlaceholder?: string;
  /** Link that clears only this facet, shown under the options when something is selected. */
  clearHref?: string;
};

const countFormatter = new Intl.NumberFormat("id-ID");

/**
 * shadcn-admin faceted filter as URL navigation. Each option is one cmdk
 * `role="option"` element with no focusable descendant (axe
 * nested-interactive): Enter or click runs `onSelect`, which pushes the
 * option's URL. The chosen state is programmatic through `aria-checked` and
 * visible as a check glyph, never colour alone. The popover needs JS either
 * way; without JS the toolbar's GET search form and Reset link still work.
 * Props are plain data so a server page can pass them across the client
 * boundary.
 */
export function DataTableFacetFilter({ clearHref, options, searchPlaceholder, title }: DataTableFacet) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const selected = options.filter((option) => option.selected);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={selected.length ? `${title}: ${selected.map((option) => option.label).join(", ")}` : title}
          className="h-8 border-dashed max-md:min-h-11"
          size="sm"
          variant="outline"
        >
          <CirclePlus aria-hidden="true" />
          {title}
          {selected.length ? (
            <>
              <Separator className="mx-1 h-4" orientation="vertical" />
              <Badge className="rounded-sm px-1 font-normal lg:hidden" variant="secondary">
                {selected.length}
              </Badge>
              <span className="hidden gap-1 lg:flex">
                {selected.length > 2 ? (
                  <Badge className="rounded-sm px-1 font-normal" variant="secondary">
                    {selected.length} dipilih
                  </Badge>
                ) : (
                  selected.map((option) => (
                    <Badge className="rounded-sm px-1 font-normal" key={option.href} variant="secondary">
                      {option.label}
                    </Badge>
                  ))
                )}
              </span>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))] p-0" collisionPadding={16}>
        <Command>
          {searchPlaceholder ? <CommandInput aria-label={`Cari ${title}`} placeholder={searchPlaceholder} /> : null}
          <CommandList>
            <CommandEmpty>Tidak ada pilihan.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  aria-checked={option.selected ? "true" : "false"}
                  className="min-h-11 md:min-h-8"
                  key={option.href}
                  onSelect={() => go(option.href)}
                  value={option.label}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                      option.selected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                    )}
                  >
                    <Check className="size-3 text-current" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.count !== undefined ? (
                    <span className="ms-auto font-mono text-xs tabular-nums text-muted-foreground">
                      {countFormatter.format(option.count)}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
            {selected.length > 0 && clearHref ? (
              <CommandGroup className="border-t">
                <CommandItem className="min-h-11 justify-center md:min-h-8" onSelect={() => go(clearHref)} value={`__clear-${title}`}>
                  Hapus filter
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
