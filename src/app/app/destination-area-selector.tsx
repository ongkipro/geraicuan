"use client";

import { ChevronsUpDown, Loader2, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { searchMengantarDestinationAreas } from "@/app/app/location-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MengantarDestinationAreaOption } from "@/lib/mengantar-locations";

export type DestinationAreaOutlet = { id: string; name: string };

type SelectedArea = MengantarDestinationAreaOption & {
  outletId: string;
  query: string;
};

export type DestinationAreaSelection = SelectedArea;

type DestinationAreaSelectorProps = {
  defaultArea?: MengantarDestinationAreaOption | null;
  defaultQuery?: { outletId: string; query: string } | null;
  defaultSelection?: DestinationAreaSelection | null;
  disabled?: boolean;
  error?: string;
  fieldNames?: {
    areaId?: string;
    areaLabel?: string;
    areaOutletId?: string;
    areaQuery?: string;
    areaSelectionChanged?: string;
  };
  fixedOutletId?: string;
  onSelectionChange?: (selection: DestinationAreaSelection | null) => void;
  outlets: DestinationAreaOutlet[];
  required?: boolean;
  submitOutletWithoutSelection?: boolean;
};

export function DestinationAreaSelector({
  defaultArea = null,
  defaultQuery = null,
  defaultSelection = null,
  disabled = false,
  error,
  fieldNames,
  fixedOutletId,
  onSelectionChange,
  outlets,
  required = false,
  submitOutletWithoutSelection = false,
}: DestinationAreaSelectorProps) {
  const id = useId();
  const [outletId, setOutletId] = useState(fixedOutletId ?? defaultSelection?.outletId ?? defaultQuery?.outletId ?? (outlets.length === 1 ? outlets[0].id : ""));
  const [query, setQuery] = useState(defaultSelection?.query ?? defaultQuery?.query ?? "");
  const [options, setOptions] = useState<MengantarDestinationAreaOption[]>([]);
  const [selected, setSelected] = useState<SelectedArea | null>(defaultSelection);
  const [selectionChanged, setSelectionChanged] = useState(Boolean(defaultSelection));
  const [message, setMessage] = useState("");
  const [searchError, setSearchError] = useState<"busy" | "invalid_query" | "rate_limited" | "stale_authority" | "unavailable" | null>(null);
  const [open, setOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ sequence: number; target: "error" | "query" | "retry" | "status" } | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const queryRef = useRef<HTMLInputElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const displayedArea = selected ?? (!selectionChanged ? defaultArea : null);
  const blocked = disabled || outlets.length === 0;
  const fixedOutlet = fixedOutletId
    ? outlets.find((outlet) => outlet.id === fixedOutletId)
    : null;
  const names = {
    areaId: fieldNames?.areaId ?? "areaId",
    areaLabel: fieldNames?.areaLabel ?? "areaLabel",
    areaOutletId: fieldNames?.areaOutletId ?? "areaOutletId",
    areaQuery: fieldNames?.areaQuery ?? "areaQuery",
    areaSelectionChanged: fieldNames?.areaSelectionChanged ?? "areaSelectionChanged",
  };

  useEffect(() => {
    if (!focusRequest) return;
    const target = focusRequest.target === "error"
      ? errorRef.current
      : focusRequest.target === "query"
        ? queryRef.current
        : focusRequest.target === "retry"
          ? retryRef.current
          : statusRef.current;
    target?.focus();
  }, [focusRequest]);

  function clearAuthority() {
    setSelected(null);
    setOptions([]);
    setOpen(false);
    setSelectionChanged(true);
    onSelectionChange?.(null);
  }

  function search() {
    if (!outletId) {
      setMessage("Pilih outlet yang menjadi sumber pencarian.");
      setFocusRequest((request) => ({ sequence: (request?.sequence ?? 0) + 1, target: "status" }));
      return;
    }
    const normalizedQuery = query.trim().replace(/\s+/gu, " ");
    if (normalizedQuery.length < 3) {
      setMessage("Masukkan minimal 3 karakter untuk mencari area.");
      setOptions([]);
      setOpen(false);
      setFocusRequest((request) => ({ sequence: (request?.sequence ?? 0) + 1, target: "query" }));
      return;
    }
    queryRef.current?.focus();
    setSearchError(null);
    setMessage("");
    clearAuthority();
    startTransition(async () => {
      const result = await searchMengantarDestinationAreas(outletId, query);
      setOptions(result.options);
      setSearchError(result.error ?? null);
      setMessage(result.success
        ? result.options.length === 0
          ? `Tidak ada area untuk “${normalizedQuery}”. Ubah kata kunci lalu cari lagi.`
          : "Pilih satu area dari hasil Mengantar."
        : result.message ?? "Pencarian area belum dapat diproses.");
      setOpen(result.success && result.options.length > 0);
      if (!result.success) {
        setFocusRequest((request) => ({
          sequence: (request?.sequence ?? 0) + 1,
          target: result.error === "rate_limited" || result.error === "invalid_query"
            ? "error"
            : "retry",
        }));
      } else if (result.options.length === 0) {
        setFocusRequest((request) => ({ sequence: (request?.sequence ?? 0) + 1, target: "query" }));
      }
    });
  }

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`${id}-query`}>Area tujuan Mengantar</FieldLabel>
      {outlets.length === 0 ? (
        <Alert role="status">
          <AlertTitle>Outlet belum siap</AlertTitle>
          <AlertDescription>Lengkapi pickup dan koneksi Mengantar di Outlet &amp; koneksi sebelum memilih area.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid min-w-0 gap-3">
          {fixedOutletId || outlets.length === 1 ? (
            <p className="text-sm text-muted-foreground">Sumber pencarian: <span className="font-medium text-foreground">{fixedOutlet?.name ?? outlets[0]?.name}</span></p>
          ) : (
            <Select
              disabled={blocked || pending}
              onValueChange={(value) => {
                setOutletId(value);
                setQuery("");
                setMessage("");
                setSearchError(null);
                clearAuthority();
              }}
              value={outletId}
            >
              <SelectTrigger aria-label="Outlet sumber pencarian area" className="min-h-11 w-full">
                <SelectValue placeholder="Pilih outlet" />
              </SelectTrigger>
              <SelectContent>
                {outlets.map((outlet) => <SelectItem key={outlet.id} value={outlet.id}>{outlet.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              aria-describedby={`${id}-help ${id}-status`}
              className="min-h-11"
              disabled={blocked || pending || !outletId}
              id={`${id}-query`}
              maxLength={100}
              onChange={(event) => {
                setQuery(event.target.value);
                setMessage("");
                setSearchError(null);
                if (displayedArea) clearAuthority();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  search();
                }
              }}
              placeholder="Contoh: Dago Bandung"
              ref={queryRef}
              value={query}
            />
            <Button className="min-h-11 max-sm:w-full" disabled={blocked || pending || !outletId || searchError === "rate_limited"} onClick={search} type="button" variant="outline">
              {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Search aria-hidden="true" />}
              {pending ? "Mencari…" : "Cari area"}
            </Button>
          </div>

          <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger asChild>
              <Button
                aria-describedby={`${id}-help ${id}-status${error ? ` ${id}-error` : ""}`}
                aria-disabled={options.length === 0}
                aria-expanded={open}
                aria-invalid={Boolean(error)}
                className="min-h-11 w-full min-w-0 justify-between whitespace-normal text-left"
                id={names.areaLabel}
                onClick={(event) => {
                  if (options.length === 0) event.preventDefault();
                }}
                type="button"
                variant="outline"
              >
                <span className="min-w-0 wrap-anywhere">{displayedArea ? <><span className="sr-only">Area terpilih: </span>{displayedArea.areaLabel}</> : "Pilih hasil pencarian"}</span>
                <ChevronsUpDown aria-hidden="true" className="shrink-0 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] p-0">
              <Command shouldFilter={false}>
                <CommandList>
                  <CommandEmpty>Area tidak ditemukan.</CommandEmpty>
                  <CommandGroup heading="Hasil Mengantar">
                    {options.map((option) => (
                      <CommandItem
                        data-checked={selected?.areaId === option.areaId}
                        key={option.areaId}
                        onSelect={() => {
                          const nextSelection = { ...option, outletId, query: query.trim().replace(/\s+/gu, " ") };
                          setSelected(nextSelection);
                          setSelectionChanged(true);
                          onSelectionChange?.(nextSelection);
                          setMessage("Area dipilih dan akan divalidasi ulang saat disimpan.");
                          setOpen(false);
                        }}
                        value={option.areaId}
                      >
                        <span className="wrap-anywhere">{option.areaLabel}</span>
                        {selected?.areaId === option.areaId ? <span className="sr-only">Terpilih</span> : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {pending ? (
            <div aria-busy="true" aria-live="polite" className="grid min-h-20 content-center rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground" role="status">
              Memuat hasil area Mengantar…
            </div>
          ) : null}

          {searchError ? (
            <Alert ref={errorRef} role="alert" tabIndex={-1} variant="destructive">
              <AlertTitle>Pencarian area belum berhasil</AlertTitle>
              <AlertDescription className="grid gap-3">
                <p>{message}</p>
                {searchError !== "rate_limited" && searchError !== "invalid_query" ? (
                  <Button className="min-h-11 justify-self-start" onClick={search} ref={retryRef} type="button" variant="outline">Coba lagi pencarian area</Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          {displayedArea ? (
            <Button
              className="min-h-11 justify-self-start"
              onClick={() => {
                queryRef.current?.focus();
                clearAuthority();
                setQuery("");
                setMessage(required
                  ? "Pilihan area dihapus. Pilih area tujuan sebelum menyimpan draf."
                  : "Pilihan area dihapus. Alamat dapat disimpan tanpa area tujuan.");
              }}
              type="button"
              variant="ghost"
            >
              Hapus pilihan
            </Button>
          ) : null}

          <p aria-live={searchError ? undefined : "polite"} className="rounded-sm text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50" id={`${id}-status`} ref={statusRef} tabIndex={-1}>{searchError ? null : message}</p>
        </div>
      )}
      <input name={names.areaId} type="hidden" value={selected?.areaId ?? ""} />
      <input name={names.areaLabel} type="hidden" value={selected?.areaLabel ?? ""} />
      <input name={names.areaQuery} type="hidden" value={selected?.query ?? ""} />
      <input name={names.areaOutletId} type="hidden" value={selected?.outletId ?? (submitOutletWithoutSelection ? outletId : "")} />
      <input name={names.areaSelectionChanged} type="hidden" value={selectionChanged ? "1" : "0"} />
      <FieldDescription id={`${id}-help`}>Cari dengan nama kelurahan atau kecamatan, lalu pilih hierarki yang sesuai. ID provider tidak ditampilkan.{required ? " Area wajib dipilih untuk draf kiriman." : ""}</FieldDescription>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}
