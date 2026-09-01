"use client";

import { ChevronDown, ChevronsUpDown, CircleAlert, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import {
  loadMengantarPickupOptions,
  saveOutletSettings,
  savePrivateMengantarCredential,
  switchMengantarToPlatformDefault,
  type MengantarCredentialActionState,
  type MengantarPickupOptionsActionState,
  type OutletSettingsActionState,
} from "@/app/app/pengaturan/actions";
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
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import type { MengantarPickupOption } from "@/lib/mengantar-locations";

type ConnectionIssue =
  | "authentication"
  | "provider_unavailable"
  | "secret_unavailable"
  | null;

type SafeOutletReadiness = {
  id: string;
  name: string;
  defaultPickupAddressId: string | null;
  defaultPickupAddressLabel: string | null;
  defaultOriginAreaId: string | null;
  defaultOriginAreaLabel: string | null;
  connectionIssue: ConnectionIssue;
  connectionSource: "platform_default" | "private";
  connectionStatus: "platform_default" | "private_ready" | "private_attention";
  connectionUpdatedAtLabel: string | null;
  readinessStatus: "ready" | "needs_attention";
  updatedAtLabel: string;
};

type OutletSettingsFormProps = {
  defaultExpanded: boolean;
  outlet: SafeOutletReadiness;
  pickupOptionsFixture?: MengantarPickupOptionsActionState;
};

const initialOutletState: OutletSettingsActionState = {};
const initialCredentialState: MengantarCredentialActionState = {};

type ReturnedOutletSettingsState = OutletSettingsActionState & {
  resultToken?: string;
  values?: {
    connectionMode?: "platform_default" | "private";
    defaultOriginAreaId?: string;
    defaultOriginAreaLabel?: string;
    defaultPickupAddressId?: string;
    defaultPickupAddressLabel?: string;
  };
};

type PickupSelectorProps = {
  disabled: boolean;
  error?: string;
  onSelectionChange: (selection: MengantarPickupOption | null) => void;
  outletId: string;
  optionsFixture?: MengantarPickupOptionsActionState;
  selection: MengantarPickupOption | null;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

function PickupSelector({
  disabled,
  error,
  onSelectionChange,
  outletId,
  optionsFixture,
  selection,
  triggerRef,
}: PickupSelectorProps) {
  const [open, setOpen] = useState(false);
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
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = `pickup-options-${outletId}`;

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
    setOpen(nextOpen);
    if (nextOpen && options === null && !loadState.message && !loading) loadOptions();
  }

  useEffect(() => {
    if (!open || loading) return;
    const frame = requestAnimationFrame(() => {
      if (loadState.success && options && options.length > 0) {
        searchRef.current?.focus();
      } else if (loadState.success && options?.length === 0) {
        emptyRef.current?.focus();
      } else if (loadState.message) {
        retryRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [loadState.message, loadState.success, loading, open, options]);

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`pickup-${outletId}`}>Alamat pickup Mengantar</FieldLabel>
      <input
        name="defaultPickupAddressId"
        type="hidden"
        value={selection?.pickupAddressId ?? ""}
      />
      <Popover onOpenChange={handleOpenChange} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-controls={listId}
            aria-describedby={error ? `pickup-error-${outletId}` : `pickup-help-${outletId}`}
            aria-expanded={open}
            aria-invalid={Boolean(error)}
            className="min-h-11 w-full justify-between whitespace-normal px-3 py-2 text-left font-normal"
            disabled={disabled}
            id={`pickup-${outletId}`}
            ref={triggerRef}
            role="combobox"
            type="button"
            variant="outline"
          >
            <span className="min-w-0 leading-5">
              {selection ? selection.pickupLabel : "Pilih alamat pickup"}
            </span>
            <ChevronsUpDown aria-hidden="true" className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) max-w-[calc(100vw-2rem)] p-0"
        >
          {loading ? (
            <div aria-live="polite" className="space-y-2 p-3">
              <p className="text-sm text-muted-foreground">Memuat pickup Mengantar…</p>
              {[0, 1, 2].map((item) => (
                <Skeleton className="h-11 w-full" key={item} />
              ))}
            </div>
          ) : loadState.message ? (
            <div className="space-y-3 p-3">
              <p className="text-sm leading-6 text-destructive" role="alert">
                {loadState.message}
              </p>
              <Button
                className="min-h-11"
                onClick={loadOptions}
                ref={retryRef}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw aria-hidden="true" />
                Coba lagi
              </Button>
            </div>
          ) : loadState.success && options?.length === 0 ? (
            <div className="space-y-3 p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Belum ada alamat pickup</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Tambahkan pickup di akun Mengantar aktif, lalu muat ulang daftar ini.
                </p>
              </div>
              <Button
                className="min-h-11"
                onClick={loadOptions}
                ref={emptyRef}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw aria-hidden="true" />
                Muat ulang
              </Button>
            </div>
          ) : (
            <Command>
              <CommandInput placeholder="Cari nama pickup atau lokasi…" ref={searchRef} />
              <CommandList id={listId}>
                <CommandEmpty>
                  Tidak ada pickup yang cocok. Hapus atau ubah kata pencarian.
                </CommandEmpty>
                <CommandGroup heading="Alamat pickup">
                  {(options ?? []).map((option) => (
                    <CommandItem
                      data-checked={selection?.pickupAddressId === option.pickupAddressId}
                      key={option.pickupAddressId}
                      onSelect={() => {
                        onSelectionChange(option);
                        setOpen(false);
                      }}
                      value={`${option.pickupLabel} ${option.originLabel}`}
                    >
                      <span className="sr-only">
                        {selection?.pickupAddressId === option.pickupAddressId
                          ? "Terpilih."
                          : ""}
                      </span>
                      <span className="grid min-w-0 gap-1 py-1">
                        <span className="whitespace-normal font-medium leading-5">
                          {option.pickupLabel}
                        </span>
                        <span className="whitespace-normal text-xs leading-5 text-muted-foreground">
                          Area asal: {option.originLabel}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>
      <FieldDescription id={`pickup-help-${outletId}`}>
        Daftar diambil dari akun Mengantar yang aktif. Area asal mengikuti pickup terpilih.
      </FieldDescription>
      <FieldError id={`pickup-error-${outletId}`}>{error}</FieldError>
    </Field>
  );
}

function ConnectionStatus({ outlet }: { outlet: SafeOutletReadiness }) {
  if (outlet.connectionStatus === "private_ready") {
    return (
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm">API key tersimpan</strong>
          <Badge variant="secondary">Tersimpan, belum diverifikasi</Badge>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          {outlet.connectionUpdatedAtLabel
            ? `Diperbarui ${outlet.connectionUpdatedAtLabel}. `
            : ""}
          Nilai API key tetap di server dan tidak ditampilkan kembali.
        </p>
      </div>
    );
  }

  if (outlet.connectionStatus === "private_attention") {
    const issue = outlet.connectionIssue ?? "secret_unavailable";
    const copy = issue === "authentication"
      ? {
          description:
            "Mengantar menolak autentikasi terakhir. Periksa akun di Mengantar, lalu masukkan API key pengganti.",
          title: "Autentikasi Mengantar gagal",
        }
      : issue === "provider_unavailable"
        ? {
            description:
              "Mengantar tidak dapat dijangkau saat pemeriksaan terakhir. API key tersimpan tidak diubah; coba lagi setelah layanan pulih.",
            title: "Mengantar belum dapat dijangkau",
          }
        : {
            description:
              "API key privat tidak tersedia atau tidak dapat dibaca. Masukkan API key baru untuk memulihkan koneksi outlet.",
            title: "API key privat perlu diganti",
          };

    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{copy.title}</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>{copy.description}</p>
          {outlet.connectionUpdatedAtLabel ? (
            <p>Terakhir diperbarui {outlet.connectionUpdatedAtLabel}.</p>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-sm leading-6 text-muted-foreground">
        Kredensial dikelola oleh GeraiCUAN untuk outlet ini.
      </p>
      <Badge variant="outline">Default GeraiCUAN</Badge>
    </div>
  );
}

export function OutletSettingsForm({
  defaultExpanded,
  outlet,
  pickupOptionsFixture,
}: OutletSettingsFormProps) {
  const [locationState, locationAction, locationPending] = useActionState(
    saveOutletSettings,
    initialOutletState,
  );
  const [credentialState, credentialAction, credentialPending] = useActionState(
    savePrivateMengantarCredential,
    initialCredentialState,
  );
  const [fallbackState, fallbackAction, fallbackPending] = useActionState(
    switchMengantarToPlatformDefault,
    initialCredentialState,
  );
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [connectionMode, setConnectionMode] = useState(outlet.connectionSource);
  const [selectedPickup, setSelectedPickup] = useState<MengantarPickupOption | null>(() =>
    outlet.defaultPickupAddressId
    && outlet.defaultPickupAddressLabel
    && outlet.defaultOriginAreaId
    && outlet.defaultOriginAreaLabel
      ? {
          originAreaId: outlet.defaultOriginAreaId,
          originLabel: outlet.defaultOriginAreaLabel,
          pickupAddressId: outlet.defaultPickupAddressId,
          pickupLabel: outlet.defaultPickupAddressLabel,
        }
      : null,
  );
  const returnedLocationState = locationState as ReturnedOutletSettingsState;
  const pickupRef = useRef<HTMLButtonElement>(null);
  const locationResultRef = useRef<HTMLDivElement>(null);
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const privateConnectionRef = useRef<HTMLButtonElement>(null);
  const credentialResultRef = useRef<HTMLDivElement>(null);
  const fallbackResultRef = useRef<HTMLDivElement>(null);
  const pickupError = locationState.errors?.defaultPickupAddressId;
  const apiKeyError = credentialState.errors?.apiKey;
  const hasLegacyLocation = Boolean(
    (outlet.defaultPickupAddressId || outlet.defaultOriginAreaId)
    && (
      !outlet.defaultPickupAddressId
      || !outlet.defaultPickupAddressLabel
      || !outlet.defaultOriginAreaId
      || !outlet.defaultOriginAreaLabel
    ),
  );
  const missing: string[] = [];
  if (!outlet.defaultPickupAddressId) missing.push("alamat pickup");
  if (!outlet.defaultOriginAreaId) missing.push("area asal");
  if (hasLegacyLocation) missing.push("label lokasi Mengantar");
  if (outlet.connectionStatus === "private_attention") missing.push("koneksi Mengantar");

  useEffect(() => {
    if (!returnedLocationState.resultToken) return;
    if (pickupError) pickupRef.current?.focus();
    else locationResultRef.current?.focus();
  }, [pickupError, returnedLocationState.resultToken]);

  useEffect(() => {
    if (!credentialState.resultToken) return;
    if (apiKeyError) apiKeyRef.current?.focus();
    else credentialResultRef.current?.focus();
  }, [apiKeyError, credentialState.resultToken]);

  useEffect(() => {
    if (fallbackState.resultToken) fallbackResultRef.current?.focus();
  }, [fallbackState.resultToken]);

  const isBusy = locationPending || credentialPending || fallbackPending;

  return (
    <Card className="rounded-lg shadow-none">
      <details
        className="group/details"
        onToggle={(event) => setExpanded(event.currentTarget.open)}
        open={
          expanded
          || Boolean(returnedLocationState.resultToken)
          || Boolean(credentialState.resultToken)
          || Boolean(fallbackState.resultToken)
        }
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 rounded-lg px-4 py-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <CardTitle>{outlet.name}</CardTitle>
            <CardDescription className="mt-1">
              {missing.length > 0
                ? `Periksa ${missing.join(", ")}.`
                : "Dapat dipakai untuk membuat kiriman."}
            </CardDescription>
            <p className="mt-1 text-xs text-muted-foreground">
              Terakhir diperbarui {outlet.updatedAtLabel}.
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-2">
            <Badge variant={outlet.readinessStatus === "ready" ? "secondary" : "destructive"}>
              {outlet.readinessStatus === "ready" ? "Siap" : "Perlu dilengkapi"}
            </Badge>
            <ChevronDown
              aria-hidden="true"
              className="size-4 text-muted-foreground transition-transform group-open/details:rotate-180"
            />
          </span>
        </summary>

        <CardContent className="space-y-6 border-t pt-5">
          <form
            action={locationAction}
            aria-busy={locationPending}
            className="space-y-4"
            noValidate
          >
            <input name="outletId" type="hidden" value={outlet.id} />
            <input name="connectionMode" type="hidden" value={outlet.connectionSource} />
            <FieldError>{locationState.errors?.outletId}</FieldError>

            <FieldSet className="rounded-lg border p-4 sm:p-5">
              <FieldLegend>Lokasi pengiriman</FieldLegend>
              <FieldDescription>
                Pilih pickup dari akun Mengantar aktif. Area asal ditentukan otomatis oleh
                Mengantar dan disimpan sebagai satu pasangan.
              </FieldDescription>
              {hasLegacyLocation ? (
                <Alert>
                  <CircleAlert aria-hidden="true" />
                  <AlertTitle>Lokasi lama perlu dipilih ulang</AlertTitle>
                  <AlertDescription>
                    Data lama belum memiliki label Mengantar. Cari dan pilih pickup agar nama
                    lokasi serta area asal dapat ditampilkan dengan jelas.
                  </AlertDescription>
                </Alert>
              ) : null}
              <FieldGroup>
                <PickupSelector
                  disabled={isBusy}
                  error={pickupError}
                  onSelectionChange={setSelectedPickup}
                  outletId={outlet.id}
                  optionsFixture={pickupOptionsFixture}
                  selection={selectedPickup}
                  triggerRef={pickupRef}
                />

                <Field>
                  <FieldLabel>Area asal</FieldLabel>
                  <div
                    aria-live="polite"
                    className="flex min-h-11 items-center rounded-md border bg-muted/40 px-3 py-2 text-sm leading-5"
                  >
                    {selectedPickup?.originLabel ?? (
                      <span className="text-muted-foreground">
                        Akan terisi setelah pickup dipilih
                      </span>
                    )}
                  </div>
                  <FieldDescription>
                    Mengikuti area yang terhubung ke pickup di Mengantar; tidak dapat diedit
                    terpisah.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </FieldSet>

            {locationState.message ? (
              <Alert
                variant={locationState.success ? "default" : "destructive"}
                role={locationState.success ? "status" : "alert"}
              >
                <AlertTitle ref={locationResultRef} tabIndex={-1}>
                  {locationState.success ? "Lokasi tersimpan" : "Lokasi belum tersimpan"}
                </AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{locationState.message}</p>
                  {locationState.success && outlet.connectionStatus !== "private_attention" ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href="/app/pengiriman/baru">Buat kiriman</Link>
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            <Button
              className="min-h-11 max-sm:w-full"
              disabled={isBusy || !selectedPickup}
              type="submit"
            >
              {locationPending ? "Menyimpan lokasi…" : "Simpan lokasi"}
            </Button>
          </form>

          <FieldSet className="rounded-lg border p-4 sm:p-5">
            <FieldLegend>Koneksi Mengantar</FieldLegend>
            <ConnectionStatus outlet={outlet} />

            <Field>
              <FieldTitle>Sumber koneksi</FieldTitle>
              <RadioGroup
                aria-label={`Sumber koneksi Mengantar untuk ${outlet.name}`}
                disabled={isBusy}
                onValueChange={(value) => {
                  if (value === "platform_default" || value === "private") {
                    setConnectionMode(value);
                  }
                }}
                value={connectionMode}
              >
                <FieldLabel
                  className="min-h-11 cursor-pointer"
                  htmlFor={`connection-platform-${outlet.id}`}
                >
                  <Field orientation="horizontal">
                    <RadioGroupItem
                      id={`connection-platform-${outlet.id}`}
                      value="platform_default"
                    />
                    <FieldContent>
                      <FieldTitle>Default GeraiCUAN</FieldTitle>
                      <FieldDescription>Kredensial disediakan dan dikelola platform.</FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldLabel>
                <FieldLabel
                  className="min-h-11 cursor-pointer"
                  htmlFor={`connection-private-${outlet.id}`}
                >
                  <Field orientation="horizontal">
                    <RadioGroupItem
                      id={`connection-private-${outlet.id}`}
                      ref={privateConnectionRef}
                      value="private"
                    />
                    <FieldContent>
                      <FieldTitle>Akun Mengantar sendiri</FieldTitle>
                      <FieldDescription>
                        Masukkan API key milik outlet untuk membuat atau menggantinya.
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              </RadioGroup>
            </Field>

            {connectionMode === "private" ? (
              <form
                action={credentialAction}
                aria-busy={credentialPending}
                className="space-y-4"
                key={credentialState.resultToken ?? `credential-${outlet.id}`}
                noValidate
              >
                <input name="outletId" type="hidden" value={outlet.id} />
                <Field data-invalid={Boolean(apiKeyError)}>
                  <FieldLabel htmlFor={`api-key-${outlet.id}`}>API key baru</FieldLabel>
                  <Input
                    aria-describedby={apiKeyError ? `api-key-error-${outlet.id}` : `api-key-help-${outlet.id}`}
                    aria-invalid={Boolean(apiKeyError)}
                    autoComplete="new-password"
                    className="min-h-11"
                    id={`api-key-${outlet.id}`}
                    maxLength={512}
                    name="apiKey"
                    ref={apiKeyRef}
                    required
                    spellCheck={false}
                    type="password"
                  />
                  <FieldDescription id={`api-key-help-${outlet.id}`}>
                    Kolom selalu kosong. API key tidak ditampilkan kembali setelah disimpan.
                  </FieldDescription>
                  <FieldError id={`api-key-error-${outlet.id}`}>{apiKeyError}</FieldError>
                </Field>
                <FieldError>{credentialState.errors?.outletId}</FieldError>

                {credentialState.message ? (
                  <Alert
                    variant={credentialState.success ? "default" : "destructive"}
                    role={credentialState.success ? "status" : "alert"}
                  >
                    <AlertTitle ref={credentialResultRef} tabIndex={-1}>
                      {credentialState.success ? "API key tersimpan" : "API key belum tersimpan"}
                    </AlertTitle>
                    <AlertDescription>
                      {credentialState.message}{" "}
                      {credentialState.success ? "Tersimpan, belum diverifikasi." : null}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <Button className="min-h-11 max-sm:w-full" disabled={isBusy} type="submit">
                  {credentialPending
                    ? "Menyimpan API key…"
                    : outlet.connectionSource === "private"
                      ? "Ganti API key"
                      : "Simpan API key"}
                </Button>
              </form>
            ) : outlet.connectionSource === "private" ? (
              <div className="space-y-4">
                <Alert>
                  <CircleAlert aria-hidden="true" />
                  <AlertTitle>Konfirmasi diperlukan</AlertTitle>
                  <AlertDescription>
                    API key privat tetap dipertahankan sampai Default GeraiCUAN terbukti lengkap.
                  </AlertDescription>
                </Alert>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="min-h-11 max-sm:w-full" disabled={isBusy} variant="outline">
                      Gunakan Default GeraiCUAN
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Gunakan Default GeraiCUAN untuk {outlet.name}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        API key privat baru dihapus setelah server memastikan Default GeraiCUAN
                        lengkap. Untuk kembali ke akun sendiri, Anda harus memasukkan API key lagi.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <form action={fallbackAction} aria-busy={fallbackPending}>
                      <input name="outletId" type="hidden" value={outlet.id} />
                      <input name="confirmation" type="hidden" value="restore-platform-default" />
                      <AlertDialogFooter>
                        <AlertDialogCancel
                          className="h-12"
                          disabled={fallbackPending}
                          onClick={() => {
                            setConnectionMode("private");
                            requestAnimationFrame(() => privateConnectionRef.current?.focus());
                          }}
                        >
                          Batal
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="h-12"
                          disabled={fallbackPending}
                          type="submit"
                          variant="destructive"
                        >
                          {fallbackPending
                            ? "Menghapus API key…"
                            : "Hapus API key & gunakan default"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </form>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                Default GeraiCUAN sedang digunakan. Pilih akun sendiri untuk memasukkan API key.
              </p>
            )}

            {fallbackState.message ? (
              <Alert
                variant={fallbackState.success ? "default" : "destructive"}
                role={fallbackState.success ? "status" : "alert"}
              >
                <AlertTitle ref={fallbackResultRef} tabIndex={-1}>
                  {fallbackState.success ? "Sumber koneksi dialihkan" : "Sumber koneksi tetap privat"}
                </AlertTitle>
                <AlertDescription>{fallbackState.message}</AlertDescription>
              </Alert>
            ) : null}
            <FieldError>{fallbackState.errors?.confirmation}</FieldError>
            <FieldError>{fallbackState.errors?.outletId}</FieldError>
          </FieldSet>
        </CardContent>
      </details>
    </Card>
  );
}
