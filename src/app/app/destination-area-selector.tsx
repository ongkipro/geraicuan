"use client";

import { useId, useState } from "react";

import { searchMengantarDestinationAreas } from "@/app/app/location-actions";
import { SearchCombobox, type TypeaheadOutcome } from "@/components/cms/search-combobox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
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
  showSourceContext?: boolean;
};

const AREA_SEARCH_DEGRADED_ERRORS = new Set(["rate_limited", "busy"]);

async function searchAreas(
  outletId: string,
  query: string,
): Promise<TypeaheadOutcome<MengantarDestinationAreaOption>> {
  const result = await searchMengantarDestinationAreas(outletId, query);
  return {
    degrade: Boolean(result.error && AREA_SEARCH_DEGRADED_ERRORS.has(result.error)),
    error: result.error,
    items: result.options,
    message: result.message,
    success: result.success,
  };
}

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
  showSourceContext = true,
}: DestinationAreaSelectorProps) {
  const id = useId();
  const [outletId, setOutletId] = useState(fixedOutletId ?? defaultSelection?.outletId ?? defaultQuery?.outletId ?? (outlets.length === 1 ? outlets[0].id : ""));
  const [selected, setSelected] = useState<SelectedArea | null>(defaultSelection);
  const [selectionChanged, setSelectionChanged] = useState(Boolean(defaultSelection));
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

  function clearAuthority() {
    setSelected(null);
    setSelectionChanged(true);
    onSelectionChange?.(null);
  }

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`${id}-combobox`}>Area tujuan Mengantar</FieldLabel>
      {outlets.length === 0 ? (
        <Alert role="status">
          <AlertTitle>Outlet belum siap</AlertTitle>
          <AlertDescription>Lengkapi pickup dan koneksi Mengantar di Outlet &amp; koneksi sebelum memilih area.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid min-w-0 gap-3">
          {fixedOutletId || outlets.length === 1 ? (
            showSourceContext && <p className="max-w-2xl text-sm text-muted-foreground">Sumber pencarian: <span className="font-medium text-foreground">{fixedOutlet?.name ?? outlets[0]?.name}</span></p>
          ) : (
            <Select
              disabled={blocked}
              onValueChange={(value) => {
                setOutletId(value);
                clearAuthority();
              }}
              value={outletId}
            >
              <SelectTrigger aria-label="Outlet sumber pencarian area" className="min-h-11 w-full md:min-h-8">
                <SelectValue placeholder="Pilih outlet" />
              </SelectTrigger>
              <SelectContent>
                {outlets.map((outlet) => <SelectItem key={outlet.id} value={outlet.id}>{outlet.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <SearchCombobox<MengantarDestinationAreaOption>
            ariaDescribedBy={`${id}-help${error ? ` ${id}-error` : ""}`}
            cacheScope={outletId}
            checkedId={selected?.areaId ?? null}
            disabled={blocked || !outletId}
            id={`${id}-combobox`}
            initialQuery={defaultSelection?.query ?? defaultQuery?.query ?? ""}
            invalid={Boolean(error)}
            itemId={(option) => option.areaId}
            itemValue={(option) => option.areaLabel}
            key={outletId}
            listAriaLabel="Cari area tujuan"
            minLength={3}
            onSelect={(option, query) => {
              const nextSelection = { ...option, outletId, query };
              setSelected(nextSelection);
              setSelectionChanged(true);
              onSelectionChange?.(nextSelection);
            }}
            placeholder="Cari dan pilih area tujuan"
            renderItem={(option) => <span className="wrap-anywhere">{option.areaLabel}</span>}
            search={(query) => searchAreas(outletId, query)}
            searchPlaceholder="Contoh: Dago Bandung"
            triggerContent={displayedArea ? <><span className="sr-only">Area terpilih: </span>{displayedArea.areaLabel}</> : null}
          />

          {displayedArea ? (
            <Button
              className="min-h-11 justify-self-start md:min-h-8"
              onClick={() => {
                clearAuthority();
              }}
              type="button"
              variant="ghost"
            >
              Hapus pilihan
            </Button>
          ) : null}
        </div>
      )}
      <input name={names.areaId} type="hidden" value={selected?.areaId ?? ""} />
      <input name={names.areaLabel} type="hidden" value={selected?.areaLabel ?? ""} />
      <input name={names.areaQuery} type="hidden" value={selected?.query ?? ""} />
      <input name={names.areaOutletId} type="hidden" value={selected?.outletId ?? (submitOutletWithoutSelection ? outletId : "")} />
      <input name={names.areaSelectionChanged} type="hidden" value={selectionChanged ? "1" : "0"} />
      <FieldDescription className="max-w-2xl" id={`${id}-help`}>Cari kelurahan atau kecamatan, lalu pilih area tujuan yang sesuai.{required ? " Area wajib dipilih untuk melanjutkan." : ""}</FieldDescription>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}
