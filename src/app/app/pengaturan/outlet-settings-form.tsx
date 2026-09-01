"use client";

import { ChevronDown, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  saveOutletSettings,
  savePrivateMengantarCredential,
  switchMengantarToPlatformDefault,
  type MengantarCredentialActionState,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type ConnectionIssue =
  | "authentication"
  | "provider_unavailable"
  | "secret_unavailable"
  | null;

type SafeOutletReadiness = {
  id: string;
  name: string;
  defaultPickupAddressId: string | null;
  defaultOriginAreaId: string | null;
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
};

const initialOutletState: OutletSettingsActionState = {};
const initialCredentialState: MengantarCredentialActionState = {};

type ReturnedOutletSettingsState = OutletSettingsActionState & {
  resultToken?: string;
  values?: {
    connectionMode?: "platform_default" | "private";
    defaultOriginAreaId?: string;
    defaultPickupAddressId?: string;
  };
};

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

export function OutletSettingsForm({ defaultExpanded, outlet }: OutletSettingsFormProps) {
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
  const returnedLocationState = locationState as ReturnedOutletSettingsState;
  const pickupRef = useRef<HTMLInputElement>(null);
  const originRef = useRef<HTMLInputElement>(null);
  const locationResultRef = useRef<HTMLDivElement>(null);
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const privateConnectionRef = useRef<HTMLButtonElement>(null);
  const credentialResultRef = useRef<HTMLDivElement>(null);
  const fallbackResultRef = useRef<HTMLDivElement>(null);
  const pickupError = locationState.errors?.defaultPickupAddressId;
  const originError = locationState.errors?.defaultOriginAreaId;
  const apiKeyError = credentialState.errors?.apiKey;
  const missing: string[] = [];
  if (!outlet.defaultPickupAddressId) missing.push("alamat pickup");
  if (!outlet.defaultOriginAreaId) missing.push("area asal");
  if (outlet.connectionStatus === "private_attention") missing.push("koneksi Mengantar");

  useEffect(() => {
    if (!returnedLocationState.resultToken) return;
    if (pickupError) pickupRef.current?.focus();
    else if (originError) originRef.current?.focus();
    else locationResultRef.current?.focus();
  }, [originError, pickupError, returnedLocationState.resultToken]);

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
            key={returnedLocationState.resultToken ?? "location-initial"}
            noValidate
          >
            <input name="outletId" type="hidden" value={outlet.id} />
            <input name="connectionMode" type="hidden" value={outlet.connectionSource} />
            <FieldError>{locationState.errors?.outletId}</FieldError>

            <FieldSet className="rounded-lg border p-4 sm:p-5">
              <FieldLegend>Lokasi pengiriman</FieldLegend>
              <FieldDescription>
                Nilai lokasi tetap tersimpan saat pengaturan koneksi diubah.
              </FieldDescription>
              <FieldGroup className="md:grid md:grid-cols-2">
                <Field data-invalid={Boolean(pickupError)}>
                  <FieldLabel htmlFor={`pickup-${outlet.id}`}>ID alamat pickup</FieldLabel>
                  <Input
                    aria-describedby={pickupError ? `pickup-error-${outlet.id}` : undefined}
                    aria-invalid={Boolean(pickupError)}
                    className="min-h-11"
                    defaultValue={
                      returnedLocationState.values?.defaultPickupAddressId
                      ?? outlet.defaultPickupAddressId
                      ?? ""
                    }
                    id={`pickup-${outlet.id}`}
                    maxLength={160}
                    name="defaultPickupAddressId"
                    ref={pickupRef}
                    required
                  />
                  <FieldDescription>
                    Gunakan ID alamat pickup Mengantar, bukan alamat atau nomor telepon.
                  </FieldDescription>
                  <FieldError id={`pickup-error-${outlet.id}`}>{pickupError}</FieldError>
                </Field>

                <Field data-invalid={Boolean(originError)}>
                  <FieldLabel htmlFor={`origin-${outlet.id}`}>ID area asal</FieldLabel>
                  <Input
                    aria-describedby={originError ? `origin-error-${outlet.id}` : undefined}
                    aria-invalid={Boolean(originError)}
                    className="min-h-11"
                    defaultValue={
                      returnedLocationState.values?.defaultOriginAreaId
                      ?? outlet.defaultOriginAreaId
                      ?? ""
                    }
                    id={`origin-${outlet.id}`}
                    maxLength={160}
                    name="defaultOriginAreaId"
                    ref={originRef}
                    required
                  />
                  <FieldDescription>
                    Gunakan ID area asal yang sesuai dengan lokasi pickup.
                  </FieldDescription>
                  <FieldError id={`origin-error-${outlet.id}`}>{originError}</FieldError>
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

            <Button className="min-h-11 max-sm:w-full" disabled={isBusy} type="submit">
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
