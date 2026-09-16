"use client";

import { CircleAlert, MapPin, RefreshCw, Star } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import {
  addOutletPickupPoint,
  loadMengantarPickupOptions,
  removeOutletPickupPoint,
  setDefaultOutletPickupPoint,
  type MengantarPickupOptionsActionState,
  type PickupPointActionState,
} from "@/app/app/pengaturan/actions";
import { SearchCombobox } from "@/components/cms/search-combobox";
import { SettingsCard } from "@/components/cms/settings-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { MengantarPickupOption } from "@/lib/mengantar-locations";

export type SafePickupPoint = {
  pickupAddressId: string;
  pickupAddressLabel: string;
  originAreaLabel: string;
  isDefault: boolean;
};

type PickupPointsManagerProps = {
  connectionSource: "platform_default" | "private";
  outletId: string;
  outletName: string;
  points: readonly SafePickupPoint[];
  optionsFixture?: MengantarPickupOptionsActionState;
};

const initialState: PickupPointActionState = {};

function matchesPickupQuery(option: MengantarPickupOption, query: string) {
  if (!query) return true;
  const haystack = `${option.pickupLabel} ${option.originLabel}`.toLocaleLowerCase("id-ID");
  return haystack.includes(query.toLocaleLowerCase("id-ID"));
}

/**
 * The provider's own pickup list, fetched once per open. Distinct from the
 * combobox's per-keystroke filtering below it, so it keeps its own
 * loading/retry/empty affordances.
 */
function PickupOptionPicker({
  connectionSource,
  disabled,
  error,
  onSelectionChange,
  optionsFixture,
  outletId,
  selection,
  triggerRef,
}: {
  connectionSource: "platform_default" | "private";
  disabled: boolean;
  error?: string;
  onSelectionChange: (selection: MengantarPickupOption | null) => void;
  optionsFixture?: MengantarPickupOptionsActionState;
  outletId: string;
  selection: MengantarPickupOption | null;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [options, setOptions] = useState<MengantarPickupOption[] | null>(
    optionsFixture?.success ? optionsFixture.options ?? [] : null,
  );
  const [loadState, setLoadState] = useState<MengantarPickupOptionsActionState>(
    optionsFixture ?? {},
  );
  const [loading, startLoading] = useTransition();
  const emptyRef = useRef<HTMLButtonElement>(null);
  const requestSequence = useRef(0);
  const retryRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  function loadOptions() {
    const request = ++requestSequence.current;
    setLoadState({});
    startLoading(async () => {
      const result = await loadMengantarPickupOptions(outletId);
      if (request !== requestSequence.current) return;
      setLoadState(result);
      setOptions(result.success ? result.options ?? [] : null);
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !opened.current) {
      opened.current = true;
      if (options === null && !loadState.message && !loading) loadOptions();
    }
  }

  useEffect(() => {
    if (!opened.current || loading) return;
    const frame = requestAnimationFrame(() => {
      if (loadState.success && options?.length === 0) {
        emptyRef.current?.focus();
      } else if (loadState.message) {
        retryRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [loadState.message, loadState.success, loading, options]);

  const helpId = `pickup-help-${outletId}`;
  const errorId = `pickup-error-${outletId}`;
  const sourceHelp = connectionSource === "platform_default"
    ? "Daftar pickup dari Default GeraiCUAN."
    : "Daftar pickup dari akun Mengantar outlet.";

  if (loading || loadState.message || (loadState.success && options?.length === 0)) {
    return (
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={`pickup-${outletId}`}>Alamat pickup Mengantar</FieldLabel>
        <input name="pickupAddressId" type="hidden" value={selection?.pickupAddressId ?? ""} />
        <Button
          aria-disabled="true"
          className="h-auto min-h-11 w-full items-start justify-between gap-3 whitespace-normal px-3 py-3 text-left font-normal"
          disabled
          id={`pickup-${outletId}`}
          ref={triggerRef}
          type="button"
          variant="outline"
        >
          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 leading-5 [overflow-wrap:anywhere]">
            {selection ? selection.pickupLabel : "Memuat alamat pickup…"}
          </span>
        </Button>
        {loading ? (
          <div aria-live="polite" className="space-y-2 rounded-lg border p-3">
            <p className="text-sm text-muted-foreground">Memuat pickup Mengantar…</p>
            {[0, 1, 2].map((item) => <Skeleton className="h-11 w-full" key={item} />)}
          </div>
        ) : loadState.message ? (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm leading-6 text-destructive" role="alert">{loadState.message}</p>
            <Button className="min-h-11" onClick={loadOptions} ref={retryRef} size="sm" type="button" variant="outline">
              <RefreshCw aria-hidden="true" />
              Coba lagi
            </Button>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Belum ada alamat pickup</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Tambahkan pickup di akun Mengantar aktif, lalu muat ulang daftar ini.
              </p>
            </div>
            <Button className="min-h-11" onClick={loadOptions} ref={emptyRef} size="sm" type="button" variant="outline">
              <RefreshCw aria-hidden="true" />
              Muat ulang
            </Button>
          </div>
        )}
        <FieldDescription id={helpId}>{sourceHelp}</FieldDescription>
        <FieldError id={errorId}>{error}</FieldError>
      </Field>
    );
  }

  const loadedOptions = options ?? [];

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`pickup-${outletId}`}>Alamat pickup Mengantar</FieldLabel>
      <input name="pickupAddressId" type="hidden" value={selection?.pickupAddressId ?? ""} />
      <SearchCombobox<MengantarPickupOption>
        ariaDescribedBy={error ? errorId : helpId}
        cacheScope={outletId}
        checkedId={selection?.pickupAddressId ?? null}
        disabled={disabled}
        id={`pickup-${outletId}`}
        invalid={Boolean(error)}
        itemId={(option) => option.pickupAddressId}
        itemValue={(option) => `${option.pickupLabel} ${option.originLabel}`}
        listAriaLabel="Cari alamat pickup"
        minLength={0}
        onOpenChange={handleOpenChange}
        onSelect={(option) => onSelectionChange(option)}
        placeholder="Pilih alamat pickup"
        renderItem={(option) => (
          <span className="grid min-w-0 flex-1 gap-1">
            <span className="whitespace-normal font-medium leading-5 [overflow-wrap:anywhere]">{option.pickupLabel}</span>
            <span className="whitespace-normal text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">Area asal: {option.originLabel}</span>
          </span>
        )}
        search={async (query) => ({
          items: loadedOptions.filter((option) => matchesPickupQuery(option, query)),
          success: true,
        })}
        searchPlaceholder="Cari nama pickup atau lokasi…"
        triggerContent={selection ? selection.pickupLabel : null}
        triggerRef={triggerRef}
      />
      <FieldDescription id={helpId}>{sourceHelp}</FieldDescription>
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
}

function ActionResult({
  state,
  successTitle,
  failureTitle,
}: {
  state: PickupPointActionState;
  successTitle: string;
  failureTitle: string;
}) {
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.resultToken) resultRef.current?.focus();
  }, [state.resultToken]);
  if (!state.message) return null;
  return (
    <Alert
      role={state.success ? "status" : "alert"}
      variant={state.success ? "default" : "destructive"}
    >
      <AlertTitle ref={resultRef} tabIndex={-1}>
        {state.success ? successTitle : failureTitle}
      </AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

export function PickupPointsManager({
  connectionSource,
  optionsFixture,
  outletId,
  outletName,
  points,
}: PickupPointsManagerProps) {
  const [addState, addAction, addPending] = useActionState(addOutletPickupPoint, initialState);
  const [defaultState, defaultAction, defaultPending] = useActionState(
    setDefaultOutletPickupPoint,
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeOutletPickupPoint,
    initialState,
  );
  const [selection, setSelection] = useState<MengantarPickupOption | null>(null);
  const [clearedToken, setClearedToken] = useState<string | undefined>(undefined);
  const pickupRef = useRef<HTMLButtonElement>(null);
  const busy = addPending || defaultPending || removePending;
  const addError = addState.errors?.pickupAddressId;

  // Adjusting state during render rather than in an effect: a successful add
  // consumes the picked option exactly once, without a cascading re-render.
  if (addState.success && addState.resultToken && addState.resultToken !== clearedToken) {
    setClearedToken(addState.resultToken);
    setSelection(null);
  }

  return (
    <div className="grid min-w-0 gap-6">
      <SettingsCard
        badge={<Badge variant="secondary">{points.length} titik</Badge>}
        description={`Alamat penjemputan Mengantar yang dapat dipakai outlet ${outletName}. Satu titik menjadi utama dan dipakai secara default saat membuat kiriman.`}
        id="pickup-points-title"
        title="Titik pickup"
      >
        {points.length === 0 ? (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Belum ada titik pickup</AlertTitle>
            <AlertDescription>
              Outlet ini belum dapat mengirim. Tambahkan minimal satu alamat pickup dari akun
              Mengantar aktif.
            </AlertDescription>
          </Alert>
        ) : (
          <ul aria-label="Daftar titik pickup" className="grid gap-3">
            {points.map((point) => (
              <li
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                key={point.pickupAddressId}
              >
                <div className="grid min-w-0 gap-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium [overflow-wrap:anywhere]">
                    {point.pickupAddressLabel}
                    {point.isDefault ? (
                      <Badge variant="secondary">
                        <Star aria-hidden="true" className="size-3" />
                        Utama
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                    Area asal: {point.originAreaLabel}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {point.isDefault ? null : (
                    <form action={defaultAction}>
                      <input name="outletId" type="hidden" value={outletId} />
                      <input name="pickupAddressId" type="hidden" value={point.pickupAddressId} />
                      <Button className="min-h-11 md:min-h-9" disabled={busy} size="sm" type="submit" variant="outline">
                        Jadikan utama
                      </Button>
                    </form>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        className="min-h-11 md:min-h-9"
                        disabled={busy}
                        size="sm"
                        variant="ghost"
                      >
                        Hapus
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Hapus titik pickup ini?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {point.pickupAddressLabel} tidak lagi dapat dipilih saat membuat kiriman.
                          Alamat tetap ada di akun Mengantar dan dapat ditambahkan lagi.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <form action={removeAction}>
                        <input name="outletId" type="hidden" value={outletId} />
                        <input name="pickupAddressId" type="hidden" value={point.pickupAddressId} />
                        <input name="confirmation" type="hidden" value="remove-pickup-point" />
                        <AlertDialogFooter>
                          <AlertDialogCancel className="h-12" disabled={removePending}>
                            Batal
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="h-12"
                            disabled={removePending}
                            type="submit"
                            variant="destructive"
                          >
                            {removePending ? "Menghapus…" : "Hapus titik pickup"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </form>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-3">
          <ActionResult
            failureTitle="Titik utama belum berubah"
            state={defaultState}
            successTitle="Titik utama diperbarui"
          />
          <ActionResult
            failureTitle="Titik pickup belum dihapus"
            state={removeState}
            successTitle="Titik pickup dihapus"
          />
        </div>
      </SettingsCard>

      <SettingsCard
        description="Pilih alamat dari daftar pickup akun Mengantar yang aktif untuk outlet ini. Area asal terisi otomatis dari alamat yang dipilih."
        footer={
          <Button
            className="min-h-11 md:min-h-9"
            disabled={busy || !selection}
            form="add-pickup-point-form"
            type="submit"
          >
            {addPending ? "Menambahkan…" : "Tambah titik pickup"}
          </Button>
        }
        id="add-pickup-point-title"
        title="Tambah titik pickup"
      >
        <form action={addAction} aria-busy={addPending} className="grid gap-4" id="add-pickup-point-form" noValidate>
          <input name="outletId" type="hidden" value={outletId} />
          <FieldError>{addState.errors?.outletId}</FieldError>
          <PickupOptionPicker
            connectionSource={connectionSource}
            disabled={busy}
            error={addError}
            onSelectionChange={setSelection}
            optionsFixture={optionsFixture}
            outletId={outletId}
            selection={selection}
            triggerRef={pickupRef}
          />
          <Field className="rounded-md bg-muted/50 px-3 py-3">
            <FieldLabel htmlFor={`origin-${outletId}`}>
              Area asal <span className="font-normal text-muted-foreground">(otomatis)</span>
            </FieldLabel>
            <output
              aria-live="polite"
              className="block text-sm leading-6 [overflow-wrap:anywhere]"
              htmlFor={`pickup-${outletId}`}
              id={`origin-${outletId}`}
            >
              {selection?.originLabel ?? (
                <span className="text-muted-foreground">Akan terisi setelah pickup dipilih</span>
              )}
            </output>
          </Field>
          <ActionResult
            failureTitle="Titik pickup belum ditambahkan"
            state={addState}
            successTitle="Titik pickup ditambahkan"
          />
        </form>
      </SettingsCard>
    </div>
  );
}
