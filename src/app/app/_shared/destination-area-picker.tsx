"use client";

import { Check, ChevronsUpDown, Loader2, MapPin } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { searchMengantarDestinationAreas } from "@/app/app/location-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { areaDisplayCase } from "@/lib/label-format";
import type { MengantarDestinationAreaOption } from "@/lib/mengantar-locations";
import { cn } from "@/lib/utils";
import { TYPEAHEAD_MIN_LENGTH, useTypeaheadSearch, type TypeaheadOutcome } from "@/lib/use-typeahead-search";

export type DestinationAreaOutlet = { id: string; name: string };

/** A picked area plus the outlet and query that found it: the server re-runs the search to validate it. */
export type DestinationAreaSelection = MengantarDestinationAreaOption & { outletId: string; query: string };

/** Rate limit and concurrency refusals stop the auto-search; the list then offers "Coba lagi". */
const DEGRADED_ERRORS = new Set(["rate_limited", "busy"]);

async function searchAreas(outletId: string, query: string): Promise<TypeaheadOutcome<MengantarDestinationAreaOption>> {
  const result = await searchMengantarDestinationAreas(outletId, query);
  return {
    degrade: Boolean(result.error && DEGRADED_ERRORS.has(result.error)),
    error: result.error,
    items: result.options,
    message: result.message,
    success: result.success,
  };
}

/**
 * The one kecamatan combobox (spec 17: Cek tarif, Kontak; Buat kiriman may adopt it). It posts the
 * hidden fields every destination-area action already reads — `areaId`, `areaLabel`, `areaQuery`,
 * `areaOutletId`, `areaSelectionChanged` — and never trusts itself: the action re-validates the pick
 * against the outlet's Mengantar account (`validateMengantarDestinationAreaSelection`).
 */
export function DestinationAreaPicker({
  canManageSettings = false,
  defaultArea = null,
  defaultQuery = null,
  defaultSelection = null,
  description,
  disabled = false,
  error,
  fixedOutletId,
  label = "Kecamatan tujuan",
  onSelectionChange,
  outlets,
  submitOutletWithoutSelection = false,
}: {
  /** Tenant Admins get a link to the outlet settings when no outlet is ready. */
  canManageSettings?: boolean;
  /** The area stored on a record being edited; shown until the user picks or clears. */
  defaultArea?: MengantarDestinationAreaOption | null;
  /** A search the server rejected, restored so the user sees what they typed. */
  defaultQuery?: { outletId: string; query: string } | null;
  defaultSelection?: DestinationAreaSelection | null;
  description?: string;
  disabled?: boolean;
  error?: string;
  /** The outlet whose Mengantar account searches; without it a select appears when there are several. */
  fixedOutletId?: string;
  label?: string;
  onSelectionChange?: (selection: DestinationAreaSelection | null) => void;
  outlets: DestinationAreaOutlet[];
  /** Post the searching outlet even before an area is picked (Cek tarif validates the pair). */
  submitOutletWithoutSelection?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [outletId, setOutletId] = useState(
    fixedOutletId ?? defaultSelection?.outletId ?? defaultQuery?.outletId ?? (outlets.length === 1 ? outlets[0].id : ""),
  );
  const activeOutletId = fixedOutletId ?? outletId;
  const [query, setQuery] = useState(defaultSelection?.query ?? defaultQuery?.query ?? "");
  const [selected, setSelected] = useState<DestinationAreaSelection | null>(defaultSelection);
  const [changed, setChanged] = useState(Boolean(defaultSelection));
  const shown = selected ?? (changed ? null : defaultArea);
  const search = useTypeaheadSearch<MengantarDestinationAreaOption>({
    cacheScope: activeOutletId,
    query: open ? query : "",
    search: (normalized) => searchAreas(activeOutletId, normalized),
  });

  function choose(next: DestinationAreaSelection | null) {
    setSelected(next);
    setChanged(true);
    onSelectionChange?.(next);
  }

  const describedBy = [description ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const belowMinimum = query.trim().length < TYPEAHEAD_MIN_LENGTH;

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`${id}-trigger`}>{label}</FieldLabel>
      {outlets.length === 0 ? (
        <Alert role="status">
          <MapPin aria-hidden="true" />
          <AlertTitle>Outlet belum siap</AlertTitle>
          <AlertDescription>
            {canManageSettings
              ? <>Lengkapi titik pickup dan koneksi Mengantar di <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/app/pengaturan">Pengaturan</Link>.</>
              : "Minta Tenant Admin melengkapi titik pickup dan koneksi Mengantar outlet."}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          {!fixedOutletId && outlets.length > 1 ? (
            <Select
              disabled={disabled}
              onValueChange={(value) => {
                setOutletId(value);
                choose(null);
              }}
              value={outletId}
            >
              <SelectTrigger aria-label="Outlet untuk mencari area" className="w-full">
                <SelectValue placeholder="Pilih outlet" />
              </SelectTrigger>
              <SelectContent>
                {outlets.map((outlet) => <SelectItem key={outlet.id} value={outlet.id}>{outlet.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : null}
          <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger asChild>
              <Button
                aria-describedby={describedBy}
                aria-expanded={open}
                aria-invalid={Boolean(error)}
                className="w-full justify-between px-3 font-normal"
                disabled={disabled || !activeOutletId}
                id={`${id}-trigger`}
                role="combobox"
                type="button"
                variant="outline"
              >
                <span className={cn("min-w-0 truncate", !shown && "text-muted-foreground")}>
                  {shown ? areaDisplayCase(shown.areaLabel) : "Cari kecamatan atau kelurahan"}
                </span>
                <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  aria-label={`Cari ${label.toLowerCase()}`}
                  onValueChange={setQuery}
                  placeholder="Contoh: Coblong Bandung"
                  value={query}
                />
                <CommandList aria-label="Area tujuan">
                  {belowMinimum ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">Ketik minimal {TYPEAHEAD_MIN_LENGTH} huruf.</p>
                  ) : search.loading ? (
                    <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground" role="status">
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />Mencari area…
                    </p>
                  ) : search.error ? (
                    <div className="grid gap-2 px-3 py-4" role="alert">
                      <p className="text-sm text-destructive">{search.message ?? "Area belum dapat dimuat."}</p>
                      <Button className="justify-self-start" onClick={search.retry} size="sm" type="button" variant="outline">Coba lagi</Button>
                    </div>
                  ) : search.searched && search.items.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground" role="status">Area tidak ditemukan. Coba nama kecamatan lain.</p>
                  ) : (
                    <CommandGroup>
                      {search.items.map((option) => (
                        <CommandItem
                          key={option.areaId}
                          onSelect={() => {
                            choose({ ...option, outletId: activeOutletId, query: search.query });
                            setOpen(false);
                          }}
                          value={option.areaId}
                        >
                          <span className="min-w-0 flex-1 wrap-anywhere">{areaDisplayCase(option.areaLabel)}</span>
                          {selected?.areaId === option.areaId ? <Check aria-hidden="true" /> : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {shown ? (
            <Button className="justify-self-start self-start px-0" onClick={() => choose(null)} size="sm" type="button" variant="link">
              Hapus pilihan
            </Button>
          ) : null}
        </div>
      )}
      <input name="areaId" type="hidden" value={selected?.areaId ?? ""} />
      <input name="areaLabel" type="hidden" value={selected?.areaLabel ?? ""} />
      <input name="areaQuery" type="hidden" value={selected?.query ?? ""} />
      <input name="areaOutletId" type="hidden" value={selected?.outletId ?? (submitOutletWithoutSelection ? activeOutletId : "")} />
      <input name="areaSelectionChanged" type="hidden" value={changed ? "1" : "0"} />
      {description ? <FieldDescription id={`${id}-help`}>{description}</FieldDescription> : null}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}
