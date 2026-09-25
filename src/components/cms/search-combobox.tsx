"use client";

import { ChevronsUpDown, Loader2, Search } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type TypeaheadOutcome,
  useTypeaheadSearch,
} from "@/lib/use-typeahead-search";

/**
 * PR-48 (T-154): the one repo-owned combobox behind the destination-area,
 * pickup-point, and contact pickers. `role="combobox"` trigger with
 * `aria-controls`/`aria-expanded`, an in-popup `CommandInput`, arrow-key
 * navigation (native to cmdk), one check-glyph convention (`CommandItem`'s
 * built-in `data-checked` glyph), and one empty/loading/error vocabulary
 * below. Callers own the hidden inputs that carry the selected value's ids.
 */

export const TYPEAHEAD_VOCABULARY = {
  belowMinimum: (minLength: number) =>
    minLength <= 0
      ? "Ketik untuk mencari."
      : `Ketik minimal ${minLength} karakter untuk mencari.`,
  degraded: "Pencarian otomatis belum tersedia. Gunakan pencarian manual di bawah.",
  loading: "Mencari…",
  noResult: (query: string) => `Tidak ada hasil untuk “${query}”. Ubah kata kunci lalu coba lagi.`,
} as const;

export type { TypeaheadOutcome };

type SearchComboboxProps<T> = {
  ariaDescribedBy?: string;
  cacheScope: string;
  checkedId: string | null;
  disabled?: boolean;
  id: string;
  initialQuery?: string;
  invalid?: boolean;
  itemId: (item: T) => string;
  itemValue: (item: T) => string;
  listAriaLabel: string;
  minLength?: number;
  onOpenChange?: (open: boolean) => void;
  onSelect: (item: T, query: string) => void;
  placeholder: string;
  renderItem: (item: T) => ReactNode;
  search: (query: string) => Promise<TypeaheadOutcome<T>>;
  searchPlaceholder: string;
  triggerContent: ReactNode;
  triggerRef?: RefObject<HTMLButtonElement | null>;
};

export function SearchCombobox<T>({
  ariaDescribedBy,
  cacheScope,
  checkedId,
  disabled = false,
  id,
  initialQuery = "",
  invalid = false,
  itemId,
  itemValue,
  listAriaLabel,
  minLength,
  onOpenChange,
  onSelect,
  placeholder,
  renderItem,
  search,
  searchPlaceholder,
  triggerContent,
  triggerRef,
}: SearchComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [draftQuery, setDraftQuery] = useState(initialQuery);
  const listId = `${id}-list`;
  const retryRef = useRef<HTMLButtonElement>(null);
  const typeahead = useTypeaheadSearch<T>({
    cacheScope,
    minLength,
    query: open ? draftQuery : "",
    search,
  });

  useEffect(() => {
    if (typeahead.degraded) retryRef.current?.focus();
  }, [typeahead.degraded]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-controls={listId}
          aria-describedby={ariaDescribedBy}
          aria-expanded={open}
          aria-invalid={invalid}
          className="h-auto min-h-11 w-full min-w-0 items-start justify-between gap-3 whitespace-normal px-2.5 py-1 text-left font-normal md:min-h-10"
          disabled={disabled}
          id={id}
          ref={triggerRef}
          role="combobox"
          type="button"
          variant="outline"
        >
          <span className="min-w-0 flex-1 leading-5 wrap-anywhere">
            {checkedId ? triggerContent : placeholder}
          </span>
          <ChevronsUpDown aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            aria-label={listAriaLabel}
            onValueChange={setDraftQuery}
            placeholder={searchPlaceholder}
            value={draftQuery}
          />
          <CommandList id={listId}>
            {typeahead.degraded ? (
              <Alert className="m-2 w-auto" role="alert" variant="destructive">
                <AlertTitle>{TYPEAHEAD_VOCABULARY.degraded}</AlertTitle>
                <AlertDescription className="grid gap-2">
                  <p>{typeahead.message ?? "Pencarian belum dapat diproses."}</p>
                  <Button
                    className="justify-self-start max-md:min-h-11"
                    onClick={() => typeahead.retry()}
                    ref={retryRef}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Search aria-hidden="true" />
                    Cari sekarang
                  </Button>
                </AlertDescription>
              </Alert>
            ) : typeahead.loading ? (
              <div aria-busy="true" aria-live="polite" className="p-4 text-sm text-muted-foreground" role="status">
                <Loader2 aria-hidden="true" className="mr-2 inline size-4 animate-spin" />
                {TYPEAHEAD_VOCABULARY.loading}
              </div>
            ) : typeahead.error ? (
              <p className="p-4 text-sm text-destructive" role="alert">
                {typeahead.message ?? "Pencarian belum dapat diproses."}
              </p>
            ) : !typeahead.searched ? (
              <p className="p-4 text-sm text-muted-foreground" role="status">
                {TYPEAHEAD_VOCABULARY.belowMinimum(minLength ?? 3)}
              </p>
            ) : typeahead.items.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground" role="status">
                {typeahead.message ?? TYPEAHEAD_VOCABULARY.noResult(typeahead.query)}
              </p>
            ) : (
              <CommandGroup>
                {typeahead.items.map((item) => (
                  <CommandItem
                    data-checked={itemId(item) === checkedId}
                    key={itemId(item)}
                    onSelect={() => {
                      onSelect(item, typeahead.query);
                      handleOpenChange(false);
                    }}
                    value={itemValue(item)}
                  >
                    {renderItem(item)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
