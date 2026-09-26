"use client";

import { ArrowLeft, Check, ChevronsUpDown, Loader2, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";

import {
  resolveWilayahDestinationArea,
  searchMengantarDestinationAreas,
  searchWilayahDestinationAreas,
  type WilayahResolveState,
} from "@/app/app/location-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WilayahSuggestion } from "@/db/wilayah-repository";
import { areaDisplayCase } from "@/lib/label-format";
import type { MengantarDestinationAreaOption } from "@/lib/mengantar-locations";
import { cn } from "@/lib/utils";
import {
  degradesAutoSearch,
  TYPEAHEAD_MIN_LENGTH,
  useTypeaheadSearch,
  type TypeaheadOutcome,
} from "@/lib/use-typeahead-search";

export type DestinationAreaOutlet = { id: string; name: string };

/** A picked area plus the outlet and query that found it: the server re-runs the search to validate it. */
export type DestinationAreaSelection = MengantarDestinationAreaOption & { outletId: string; query: string };

/** T-245: local suggestions cost one indexed read, so they answer faster than the provider search. */
const LOCAL_DEBOUNCE_MS = 150;

async function searchProviderAreas(outletId: string, query: string): Promise<TypeaheadOutcome<MengantarDestinationAreaOption>> {
  const result = await searchMengantarDestinationAreas(outletId, query);
  return {
    degrade: degradesAutoSearch(result.error),
    error: result.error,
    items: result.options,
    message: result.message,
    success: result.success,
  };
}

async function searchLocalAreas(query: string): Promise<TypeaheadOutcome<WilayahSuggestion>> {
  const result = await searchWilayahDestinationAreas(query);
  return {
    degrade: degradesAutoSearch(result.error),
    error: result.error,
    items: result.suggestions,
    message: result.message,
    success: result.success,
  };
}

function suggestionName(suggestion: WilayahSuggestion) {
  return suggestion.villageName ?? suggestion.districtName;
}

function suggestionContext(suggestion: WilayahSuggestion) {
  return [
    suggestion.villageName ? `Kec. ${suggestion.districtName}` : null,
    suggestion.regencyLabel,
    suggestion.provinceName,
  ].filter(Boolean).join(", ");
}

const KIND_GROUP: Record<WilayahSuggestion["kind"], string> = {
  DESA: "Kelurahan / desa",
  KECAMATAN: "Kecamatan",
  KELURAHAN: "Kelurahan / desa",
};

/** Suggestions grouped by level, groups in the order their best-ranked row appears. */
function groupSuggestions(items: WilayahSuggestion[]) {
  const groups = new Map<string, WilayahSuggestion[]>();
  for (const item of items) {
    const heading = KIND_GROUP[item.kind];
    groups.set(heading, [...(groups.get(heading) ?? []), item]);
  }
  return [...groups.entries()];
}

type View =
  | { kind: "suggest" }
  | { kind: "resolving"; suggestion: WilayahSuggestion }
  | { kind: "choose"; options: MengantarDestinationAreaOption[]; query: string; suggestion: WilayahSuggestion }
  | { kind: "resolve-error"; message: string; suggestion: WilayahSuggestion }
  | { kind: "provider"; notice?: string };

const itemClass = "min-h-11 items-start py-2 md:min-h-10";

/**
 * The one destination-area combobox (spec 17: Cek tarif, Kontak, Buat kiriman). T-245 (D-32):
 * typing suggests kecamatan, kelurahan/desa, kota or kode pos from the local Kemendagri reference;
 * picking one runs one guarded Mengantar lookup, which auto-selects a single strict match or lists
 * the Mengantar options; nothing found falls back to searching Mengantar directly. Only a Mengantar
 * option is ever selected. It posts the hidden fields every destination-area action already reads —
 * `areaId`, `areaLabel`, `areaQuery`, `areaOutletId`, `areaSelectionChanged` — and never trusts
 * itself: the action re-validates the pick against the outlet's Mengantar account
 * (`validateMengantarDestinationAreaSelection`).
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
  id: triggerIdProp,
  label = "Kecamatan tujuan",
  onSelectionChange,
  outlets,
  required = false,
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
  /** The trigger's id, for a form that scrolls to the field on a validation error. */
  id?: string;
  label?: string;
  onSelectionChange?: (selection: DestinationAreaSelection | null) => void;
  outlets: DestinationAreaOutlet[];
  required?: boolean;
  /** Post the searching outlet even before an area is picked (Cek tarif validates the pair). */
  submitOutletWithoutSelection?: boolean;
}) {
  const id = useId();
  const triggerId = triggerIdProp ?? `${id}-trigger`;
  const [open, setOpen] = useState(false);
  const [outletId, setOutletId] = useState(
    fixedOutletId ?? defaultSelection?.outletId ?? defaultQuery?.outletId ?? (outlets.length === 1 ? outlets[0].id : ""),
  );
  const activeOutletId = fixedOutletId ?? outletId;
  // T-247 (review L11): with several outlets and none chosen there is no Mengantar account to
  // search; the combobox says so and nothing reaches the server with an empty outlet id.
  const needsOutlet = !activeOutletId && outlets.length > 1;
  const [query, setQuery] = useState(defaultSelection?.query ?? defaultQuery?.query ?? "");
  const [view, setView] = useState<View>(defaultQuery ? { kind: "provider" } : { kind: "suggest" });
  const [selected, setSelected] = useState<DestinationAreaSelection | null>(defaultSelection);
  const [changed, setChanged] = useState(Boolean(defaultSelection));
  const resolveSequence = useRef(0);
  const shown = selected ?? (changed ? null : defaultArea);
  const local = useTypeaheadSearch<WilayahSuggestion>({
    cacheScope: "wilayah",
    debounceMs: LOCAL_DEBOUNCE_MS,
    query: open && view.kind === "suggest" ? query : "",
    search: searchLocalAreas,
  });
  const provider = useTypeaheadSearch<MengantarDestinationAreaOption>({
    cacheScope: activeOutletId,
    query: open && view.kind === "provider" && activeOutletId ? query : "",
    search: (normalized) => searchProviderAreas(activeOutletId, normalized),
  });

  function choose(next: DestinationAreaSelection | null) {
    setSelected(next);
    setChanged(true);
    onSelectionChange?.(next);
  }

  function finish(next: DestinationAreaSelection) {
    choose(next);
    setOpen(false);
    setView({ kind: "suggest" });
  }

  async function resolve(suggestion: WilayahSuggestion) {
    if (!activeOutletId) return;
    const sequence = ++resolveSequence.current;
    setView({ kind: "resolving", suggestion });
    let result: WilayahResolveState;
    try {
      result = await resolveWilayahDestinationArea(activeOutletId, suggestion.code);
    } catch {
      result = { error: "unavailable", message: "Lokasi Mengantar belum dapat dimuat. Coba lagi.", status: "error" };
    }
    if (sequence !== resolveSequence.current) return;
    if (result.status === "matched") {
      finish({ ...result.option, outletId: activeOutletId, query: result.query });
    } else if (result.status === "choose") {
      setView({ kind: "choose", options: result.options, query: result.query, suggestion });
    } else if (result.status === "not_found") {
      setQuery([suggestion.villageName, suggestion.districtName].filter(Boolean).join(" "));
      setView({ kind: "provider", notice: `${suggestionName(suggestion)} belum ditemukan di Mengantar. Cari langsung:` });
    } else {
      setView({ kind: "resolve-error", message: result.message, suggestion });
    }
  }

  function typed(next: string) {
    setQuery(next);
    if (view.kind !== "suggest" && view.kind !== "provider") {
      resolveSequence.current += 1;
      setView({ kind: "suggest" });
    }
  }

  function backToSuggestions() {
    resolveSequence.current += 1;
    setView({ kind: "suggest" });
  }

  const describedBy = [description ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const belowMinimum = query.trim().length < TYPEAHEAD_MIN_LENGTH;
  const providerOptionItem = (option: MengantarDestinationAreaOption, areaQuery: string) => (
    <CommandItem
      className={itemClass}
      key={option.areaId}
      onSelect={() => finish({ ...option, outletId: activeOutletId, query: areaQuery })}
      value={`area:${option.areaId}`}
    >
      <span className="min-w-0 flex-1 wrap-anywhere">{areaDisplayCase(option.areaLabel)}</span>
      {selected?.areaId === option.areaId ? <Check aria-hidden="true" /> : null}
    </CommandItem>
  );
  const directSearchItem = (
    <CommandItem className={itemClass} key="direct" onSelect={() => setView({ kind: "provider" })} value="action:direct">
      <Search aria-hidden="true" className="mt-0.5 text-muted-foreground" />
      <span>Cari langsung di Mengantar</span>
    </CommandItem>
  );
  const backItem = (
    <CommandItem className={itemClass} key="back" onSelect={backToSuggestions} value="action:back">
      <ArrowLeft aria-hidden="true" className="mt-0.5 text-muted-foreground" />
      <span>Kembali ke saran wilayah</span>
    </CommandItem>
  );

  function listContent() {
    if (view.kind === "resolving") {
      return (
        <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground" role="status">
          <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
          Mencocokkan {suggestionName(view.suggestion)} dengan Mengantar…
        </p>
      );
    }
    if (view.kind === "resolve-error") {
      const { suggestion } = view;
      return (
        <>
          <p className="px-3 pt-3 text-sm text-destructive" role="alert">{view.message}</p>
          <CommandGroup>
            <CommandItem className={itemClass} onSelect={() => void resolve(suggestion)} value="action:retry">
              <span>Coba lagi</span>
            </CommandItem>
            {directSearchItem}
            {backItem}
          </CommandGroup>
        </>
      );
    }
    if (view.kind === "choose") {
      const { options, query: areaQuery, suggestion } = view;
      return (
        <>
          <CommandGroup heading={`Pilih area Mengantar untuk ${suggestionName(suggestion)}, ${suggestion.regencyLabel}`}>
            {options.map((option) => providerOptionItem(option, areaQuery))}
          </CommandGroup>
          <CommandGroup>
            {directSearchItem}
            {backItem}
          </CommandGroup>
        </>
      );
    }
    if (belowMinimum) {
      return <p className="px-3 py-4 text-sm text-muted-foreground">Ketik minimal {TYPEAHEAD_MIN_LENGTH} huruf atau angka kode pos.</p>;
    }
    const search = view.kind === "provider" ? provider : local;
    const notice = view.kind === "provider" && view.notice
      ? <p className="px-3 pt-3 text-sm text-muted-foreground" role="status">{view.notice}</p>
      : null;
    if (search.loading) {
      return (
        <>
          {notice}
          <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground" role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {view.kind === "provider" ? "Mencari di Mengantar…" : "Mencari wilayah…"}
          </p>
        </>
      );
    }
    if (search.error) {
      return (
        <div className="grid gap-2 px-3 py-4" role="alert">
          <p className="text-sm text-destructive">{search.message ?? "Area belum dapat dimuat."}</p>
          <Button className="justify-self-start" onClick={search.retry} size="sm" type="button" variant="outline">Coba lagi</Button>
        </div>
      );
    }
    if (view.kind === "provider") {
      return (
        <>
          {notice}
          {provider.searched && provider.items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground" role="status">Area tidak ditemukan di Mengantar. Coba nama kecamatan lain.</p>
          ) : (
            <CommandGroup heading="Hasil Mengantar">
              {provider.items.map((option) => providerOptionItem(option, provider.query))}
            </CommandGroup>
          )}
          <CommandGroup>{backItem}</CommandGroup>
        </>
      );
    }
    if (local.searched && local.items.length === 0) {
      return (
        <>
          <p className="px-3 pt-4 pb-2 text-sm text-muted-foreground" role="status">Wilayah tidak ditemukan. Periksa ejaan, atau:</p>
          <CommandGroup>{directSearchItem}</CommandGroup>
        </>
      );
    }
    return (
      <>
        {groupSuggestions(local.items).map(([heading, items]) => (
          <CommandGroup heading={heading} key={heading}>
            {items.map((suggestion) => (
              <CommandItem
                className={itemClass}
                key={suggestion.code}
                onSelect={() => void resolve(suggestion)}
                value={`wilayah:${suggestion.code}`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="wrap-anywhere font-medium">{suggestionName(suggestion)}</span>
                  <span className="wrap-anywhere text-xs text-muted-foreground">{suggestionContext(suggestion)}</span>
                </span>
                {suggestion.postalCode ? (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{suggestion.postalCode}</span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {local.searched ? <CommandGroup>{directSearchItem}</CommandGroup> : null}
      </>
    );
  }

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={triggerId}>
        {label}
        {required ? <span className="-ml-1 text-destructive">*<span className="sr-only">wajib</span></span> : null}
      </FieldLabel>
      {outlets.length === 0 ? (
        <Alert role="status">
          <MapPin aria-hidden="true" />
          <AlertTitle>Outlet belum siap</AlertTitle>
          <AlertDescription>
            {canManageSettings
              ? <>Lengkapi titik pickup dan koneksi Mengantar di <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/app/pengaturan">Pengaturan</Link>.</>
              : "Minta pemilik gerai melengkapi titik pickup dan koneksi Mengantar outlet."}
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
          <Popover
            onOpenChange={(next) => {
              setOpen(next);
              if (!next && view.kind !== "provider") backToSuggestions();
            }}
            open={open}
          >
            <PopoverTrigger asChild>
              <Button
                aria-describedby={describedBy}
                aria-expanded={open}
                aria-invalid={Boolean(error)}
                className="w-full justify-between px-3 font-normal"
                disabled={disabled || !activeOutletId}
                id={triggerId}
                role="combobox"
                type="button"
                variant="outline"
              >
                <span className={cn("min-w-0 truncate", !shown && "text-muted-foreground")}>
                  {shown ? areaDisplayCase(shown.areaLabel) : needsOutlet ? "Pilih outlet dulu" : "Cari kecamatan, kelurahan atau kode pos"}
                </span>
                <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  aria-label={`Cari ${label.toLowerCase()}`}
                  onValueChange={typed}
                  placeholder={view.kind === "provider" ? "Contoh: Coblong Bandung" : "Contoh: Coblong, Dago atau 40135"}
                  value={query}
                />
                <CommandList aria-label={view.kind === "provider" ? "Area Mengantar" : "Saran wilayah"}>
                  {listContent()}
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
