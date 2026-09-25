"use client";

import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTypeaheadSearch, type TypeaheadOutcome } from "@/lib/use-typeahead-search";

/**
 * T-211: one search-and-pick popover (spec 10 §5.1 picker states: searching, no match, several
 * matches, selected, provider error) on the shared typeahead contract (PR-48: debounce, session
 * cache, degraded explicit retry). The trigger is the caller's; results never filter locally.
 */
export function SearchPicker<T>({
  cacheScope,
  disabled = false,
  itemKey,
  label,
  minLength = 3,
  onSelect,
  placeholder,
  renderItem,
  search,
  trigger,
}: {
  cacheScope: string;
  disabled?: boolean;
  itemKey: (item: T) => string;
  /** Accessible name of the search field. */
  label: string;
  minLength?: number;
  onSelect: (item: T, query: string) => void;
  placeholder: string;
  renderItem: (item: T) => ReactNode;
  search: (query: string) => Promise<TypeaheadOutcome<T>>;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const result = useTypeaheadSearch<T>({ cacheScope, minLength, query, search });
  const tooShort = query.trim().length < minLength;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild disabled={disabled}>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput aria-label={label} onValueChange={setQuery} placeholder={placeholder} value={query} />
          <CommandList>
            {tooShort ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">Ketik minimal {minLength} karakter.</p>
            ) : result.loading ? (
              <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground" role="status">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />Mencari…
              </p>
            ) : result.error ? (
              <div className="flex flex-col gap-2 px-3 py-3 text-xs" role="alert">
                <span className="text-destructive">{result.message ?? "Pencarian belum dapat diproses."}</span>
                {result.degraded ? (
                  <Button onClick={result.retry} size="sm" type="button" variant="outline">Cari lagi</Button>
                ) : null}
              </div>
            ) : (
              <>
                <CommandEmpty className="px-3 py-4 text-xs text-muted-foreground">{result.message ?? "Tidak ada hasil."}</CommandEmpty>
                {result.items.map((item) => (
                  <CommandItem
                    className="items-start py-2"
                    key={itemKey(item)}
                    onSelect={() => {
                      onSelect(item, result.query);
                      setOpen(false);
                    }}
                    value={itemKey(item)}
                  >
                    {renderItem(item)}
                  </CommandItem>
                ))}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
