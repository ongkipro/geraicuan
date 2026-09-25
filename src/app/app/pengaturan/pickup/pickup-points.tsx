"use client";

import { Check, ChevronsUpDown, MapPin, RefreshCw, Star } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import {
  addOutletPickupPoint,
  loadMengantarPickupOptions,
  removeOutletPickupPoint,
  setDefaultOutletPickupPoint,
  type MengantarPickupOptionsActionState,
  type PickupPointActionState,
} from "@/app/app/pengaturan/actions";
import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import type { MengantarPickupOption } from "@/lib/mengantar-locations";
import { cn } from "@/lib/utils";

export type SafePickupPoint = {
  pickupAddressId: string;
  pickupAddressLabel: string;
  originAreaLabel: string;
  isDefault: boolean;
};

const initialState: PickupPointActionState = {};
const ADD_FORM_ID = "add-pickup-point-form";

function ActionResult({ failureTitle, state, successTitle }: {
  failureTitle: string;
  state: PickupPointActionState;
  successTitle: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.resultToken) ref.current?.focus();
  }, [state.resultToken]);
  if (!state.message) return null;
  return (
    <Alert
      className="outline-none"
      ref={ref}
      role={state.success ? "status" : "alert"}
      tabIndex={-1}
      variant={state.success ? "default" : "destructive"}
    >
      <AlertTitle>{state.success ? successTitle : failureTitle}</AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

function PickupRow({ busy, outletId, point, onlyPoint, defaultAction, removeAction, removePending, removeToken }: {
  busy: boolean;
  defaultAction: (formData: FormData) => void;
  onlyPoint: boolean;
  outletId: string;
  point: SafePickupPoint;
  removeAction: (formData: FormData) => void;
  removePending: boolean;
  removeToken: string | undefined;
}) {
  const [confirming, setConfirming] = useState(false);
  const [seenToken, setSeenToken] = useState(removeToken);
  // The confirmation stays open (showing progress) until the server answers, then closes.
  if (removeToken !== seenToken) {
    setSeenToken(removeToken);
    setConfirming(false);
  }
  return (
    <li className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold wrap-anywhere">{point.pickupAddressLabel}</p>
        {point.isDefault ? <StatusBadge icon={Star} label="Utama" tone="success" /> : null}
      </div>
      <p className="text-sm text-muted-foreground wrap-anywhere">Area asal: {point.originAreaLabel}</p>
      <div className="flex flex-wrap items-center gap-x-4">
        {point.isDefault ? null : (
          <form action={defaultAction}>
            <input name="outletId" type="hidden" value={outletId} />
            <input name="pickupAddressId" type="hidden" value={point.pickupAddressId} />
            <Button className="px-0" disabled={busy} type="submit" variant="link">Jadikan utama</Button>
          </form>
        )}
        <AlertDialog onOpenChange={setConfirming} open={confirming}>
          <AlertDialogTrigger asChild>
            <Button className="px-0 text-destructive" disabled={busy} variant="link">Hapus</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus titik pickup {point.pickupAddressLabel}?</AlertDialogTitle>
              <AlertDialogDescription>
                {onlyPoint
                  ? "Ini titik pickup terakhir: outlet ini tidak dapat membuat kiriman sampai titik baru ditambahkan."
                  : point.isDefault
                    ? "Ini titik utama. Jadikan titik lain utama dulu; penghapusan titik utama ditolak selama titik lain masih ada."
                    : "Titik ini tidak lagi dapat dipilih saat membuat kiriman. Alamatnya tetap ada di akun Mengantar dan dapat ditambahkan lagi."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form action={removeAction}>
              <input name="outletId" type="hidden" value={outletId} />
              <input name="pickupAddressId" type="hidden" value={point.pickupAddressId} />
              <input name="confirmation" type="hidden" value="remove-pickup-point" />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={removePending}>Batal</AlertDialogCancel>
                <Button disabled={removePending} type="submit" variant="destructive">
                  {removePending ? "Menghapus…" : "Hapus titik pickup"}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

/** The provider's own pickup list, fetched on first open; retry on failure; never typed by hand. */
function PickupOptionPicker({ disabled, error, onSelect, optionsFixture, outletId, selection, sourceHelp }: {
  disabled: boolean;
  error?: string;
  onSelect: (option: MengantarPickupOption) => void;
  optionsFixture?: MengantarPickupOptionsActionState;
  outletId: string;
  selection: MengantarPickupOption | null;
  sourceHelp: string;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<MengantarPickupOptionsActionState | null>(optionsFixture ?? null);
  const [loading, startLoading] = useTransition();
  const sequence = useRef(0);

  function load() {
    const request = ++sequence.current;
    startLoading(async () => {
      const next = await loadMengantarPickupOptions(outletId);
      if (request === sequence.current) setResult(next);
    });
  }

  const options = result?.success ? result.options ?? [] : [];
  const describedBy = error ? "pickup-address-error" : "pickup-address-help";

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="pickup-address">Alamat pickup Mengantar</FieldLabel>
      <input name="pickupAddressId" type="hidden" value={selection?.pickupAddressId ?? ""} />
      <Popover
        onOpenChange={(next) => {
          setOpen(next);
          if (next && !result && !loading) load();
        }}
        open={open}
      >
        <PopoverTrigger asChild>
          <Button
            aria-describedby={describedBy}
            aria-invalid={Boolean(error)}
            className="h-auto min-h-10 w-full justify-between gap-3 py-2 text-left font-normal whitespace-normal"
            disabled={disabled}
            id="pickup-address"
            role="combobox"
            type="button"
            variant="outline"
          >
            <span className={cn("min-w-0 flex-1 wrap-anywhere", !selection && "text-muted-foreground")}>
              {selection?.pickupLabel ?? "Pilih alamat pickup"}
            </span>
            <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
          {loading ? (
            <div aria-live="polite" className="flex flex-col gap-2 p-3">
              <p className="text-sm text-muted-foreground">Memuat alamat pickup Mengantar…</p>
              {[0, 1, 2].map((item) => <Skeleton className="h-10 w-full" key={item} />)}
            </div>
          ) : result && !result.success ? (
            <div className="flex flex-col items-start gap-3 p-3">
              <p className="text-sm text-destructive" role="alert">{result.message}</p>
              <Button onClick={load} size="sm" type="button" variant="outline">
                <RefreshCw aria-hidden="true" data-icon="inline-start" />Coba lagi
              </Button>
            </div>
          ) : (
            <Command>
              <CommandInput placeholder="Cari nama pickup atau lokasi…" />
              <CommandList>
                <CommandEmpty>
                  {options.length === 0 ? "Belum ada alamat pickup di akun Mengantar ini." : "Tidak ada alamat yang cocok."}
                </CommandEmpty>
                {options.map((option) => (
                  <CommandItem
                    key={option.pickupAddressId}
                    onSelect={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                    value={`${option.pickupLabel} ${option.originLabel} ${option.pickupAddressId}`}
                  >
                    <MapPin aria-hidden="true" className="mt-0.5 self-start text-muted-foreground" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="font-medium wrap-anywhere">{option.pickupLabel}</span>
                      <span className="text-xs text-muted-foreground wrap-anywhere">Area asal: {option.originLabel}</span>
                    </span>
                    {selection?.pickupAddressId === option.pickupAddressId ? <Check aria-hidden="true" /> : null}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>
      <FieldDescription id="pickup-address-help">{sourceHelp}</FieldDescription>
      <FieldError id="pickup-address-error">{error}</FieldError>
    </Field>
  );
}

export function PickupPoints({ connectionSource, optionsFixture, outletId, outletName, points }: {
  connectionSource: "platform_default" | "private";
  /** Development browser-audit fixture: the provider list without a Mengantar call. */
  optionsFixture?: MengantarPickupOptionsActionState;
  outletId: string;
  outletName: string;
  points: readonly SafePickupPoint[];
}) {
  const [addState, addAction, addPending] = useActionState(addOutletPickupPoint, initialState);
  const [defaultState, defaultAction, defaultPending] = useActionState(setDefaultOutletPickupPoint, initialState);
  const [removeState, removeAction, removePending] = useActionState(removeOutletPickupPoint, initialState);
  const [selection, setSelection] = useState<MengantarPickupOption | null>(null);
  const [consumedToken, setConsumedToken] = useState<string | undefined>(undefined);
  const busy = addPending || defaultPending || removePending;

  // A successful add consumes the picked option once (adjusting state during render).
  if (addState.success && addState.resultToken && addState.resultToken !== consumedToken) {
    setConsumedToken(addState.resultToken);
    setSelection(null);
  }

  return (
    <>
      <DataCard count={points.length} description={`Lokasi kurir mengambil paket outlet ${outletName}.`} title="Daftar titik pickup">
        {points.length === 0 ? (
          <EmptyState
            description="Outlet ini belum dapat membuat kiriman. Tambahkan minimal satu alamat pickup di bawah."
            icon={MapPin}
            title="Belum ada titik pickup"
          />
        ) : (
          <ul aria-label={`Titik pickup ${outletName}`} className="divide-y">
            {points.map((point) => (
              <PickupRow
                busy={busy}
                defaultAction={defaultAction}
                key={point.pickupAddressId}
                onlyPoint={points.length === 1}
                outletId={outletId}
                point={point}
                removeAction={removeAction}
                removePending={removePending}
                removeToken={removeState.resultToken}
              />
            ))}
          </ul>
        )}
        <ActionResult failureTitle="Titik utama belum berubah" state={defaultState} successTitle="Titik utama diperbarui" />
        <ActionResult failureTitle="Titik pickup belum dihapus" state={removeState} successTitle="Titik pickup dihapus" />
      </DataCard>

      <DataCard
        description="Pilih dari daftar pickup akun Mengantar; area asal terisi otomatis."
        footer={(
          <div className="ml-auto flex flex-col items-end gap-1">
            <Button disabled={busy || !selection} form={ADD_FORM_ID} type="submit" variant="outline">
              {addPending ? "Menambahkan…" : "Tambah titik pickup"}
            </Button>
            {!selection && !busy ? <p className="text-xs text-muted-foreground">Pilih alamat pickup dulu.</p> : null}
          </div>
        )}
        title="Tambah titik pickup"
      >
        <form action={addAction} aria-busy={addPending} className="flex flex-col gap-4" id={ADD_FORM_ID} noValidate>
          <input name="outletId" type="hidden" value={outletId} />
          <PickupOptionPicker
            disabled={busy}
            error={addState.errors?.pickupAddressId ?? addState.errors?.outletId}
            onSelect={setSelection}
            optionsFixture={optionsFixture}
            outletId={outletId}
            selection={selection}
            sourceHelp={connectionSource === "private" ? "Dari akun Mengantar milik outlet." : "Dari koneksi bawaan GeraiCUAN."}
          />
          <Field>
            <FieldLabel htmlFor="pickup-origin">Area asal (otomatis)</FieldLabel>
            <output aria-live="polite" className="min-h-6 text-sm wrap-anywhere" htmlFor="pickup-address" id="pickup-origin">
              {selection?.originLabel ?? <span className="text-muted-foreground">Terisi setelah alamat dipilih</span>}
            </output>
          </Field>
          <ActionResult failureTitle="Titik pickup belum ditambahkan" state={addState} successTitle="Titik pickup ditambahkan" />
        </form>
      </DataCard>
    </>
  );
}
