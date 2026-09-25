"use client";

import { CircleAlert } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  savePrivateMengantarCredential,
  switchMengantarToPlatformDefault,
  type MengantarCredentialActionState,
} from "@/app/app/pengaturan/actions";
import {
  missingOutletConfiguration,
  type SafeOutletReadiness,
} from "@/app/app/pengaturan/outlet-settings-types";
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
import { ToneBadge } from "@/components/cms/shipment-status-badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const initialCredentialState: MengantarCredentialActionState = {};

function ConnectionStatus({ outlet }: { outlet: SafeOutletReadiness }) {
  if (outlet.connectionStatus === "private_ready") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm">API key tersimpan</strong>
          <ToneBadge label="Tersimpan, belum diverifikasi" tone="warn" />
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

  return null;
}

/**
 * T-158: the Koneksi Mengantar page's own half — the credential actions, split
 * from the outlet's location facts so each page owns one Server Action set.
 */
export function MengantarConnectionForm({ outlet }: { outlet: SafeOutletReadiness }) {
  const [credentialState, credentialAction, credentialPending] = useActionState(
    savePrivateMengantarCredential,
    initialCredentialState,
  );
  const [fallbackState, fallbackAction, fallbackPending] = useActionState(
    switchMengantarToPlatformDefault,
    initialCredentialState,
  );
  const privateOnly = Boolean(outlet.privateConnectionRequired);
  const [connectionMode, setConnectionMode] = useState(
    privateOnly ? "private" as const : outlet.connectionSource,
  );
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const privateConnectionRef = useRef<HTMLButtonElement>(null);
  const credentialResultRef = useRef<HTMLDivElement>(null);
  const fallbackResultRef = useRef<HTMLDivElement>(null);
  const apiKeyError = credentialState.errors?.apiKey;
  const missing = missingOutletConfiguration(outlet);

  useEffect(() => {
    if (!credentialState.resultToken) return;
    if (apiKeyError) apiKeyRef.current?.focus();
    else credentialResultRef.current?.focus();
  }, [apiKeyError, credentialState.resultToken]);

  useEffect(() => {
    if (fallbackState.resultToken) fallbackResultRef.current?.focus();
  }, [fallbackState.resultToken]);

  const isBusy = credentialPending || fallbackPending;

  return (
    <section aria-labelledby="outlet-detail-title" className="grid min-w-0 gap-8">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Outlet aktif</p>
          <h2
            className="mt-1 rounded-sm text-xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="outlet-detail-title"
            tabIndex={-1}
          >
            {outlet.name}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {missing.length > 0
              ? `Periksa ${missing.join(", ")}.`
              : "Dapat dipakai untuk membuat kiriman."}
            {" "}<span className="text-xs">Diperbarui {outlet.updatedAtLabel}.</span>
          </p>
        </div>
        <ToneBadge label={outlet.readinessStatus === "ready" ? "Siap" : "Perlu dilengkapi"} tone={outlet.readinessStatus === "ready" ? "ok" : "warn"} />
      </header>

      <SettingsCard
        description="Pilih koneksi bawaan GeraiCUAN atau akun Mengantar milik outlet."
        id="outlet-connection-title"
        title="Koneksi Mengantar"
      >
          <FieldSet aria-labelledby="outlet-connection-title">
            <ConnectionStatus outlet={outlet} />

            {privateOnly ? (
              <Alert>
                <CircleAlert aria-hidden="true" />
                <AlertTitle>
                  {outlet.connectionSource === "private"
                    ? "Gerai ini memakai akun Mengantar sendiri"
                    : "Hubungkan akun Mengantar milik gerai"}
                </AlertTitle>
                <AlertDescription>
                  Gerai yang mendaftar sendiri mengirim dengan akun Mengantar miliknya. Salin API
                  key dari akun Mengantar Anda, lalu simpan di bawah.
                </AlertDescription>
              </Alert>
            ) : null}

            {privateOnly ? null : (
            <Field>
              <FieldTitle>Sumber koneksi</FieldTitle>
              <RadioGroup
                aria-label={`Sumber koneksi Mengantar untuk ${outlet.name}`}
                className="gap-3"
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
                      <FieldTitle className="flex-wrap">
                        Koneksi bawaan GeraiCUAN
                        {outlet.connectionSource === "platform_default" ? <ToneBadge label="Digunakan" tone="ok" /> : null}
                      </FieldTitle>
                      <FieldDescription>Dikelola GeraiCUAN, tanpa memasukkan API key.</FieldDescription>
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
                      <FieldTitle className="flex-wrap">
                        Akun Mengantar sendiri
                        {outlet.connectionSource === "private" ? <ToneBadge label="Digunakan" tone="ok" /> : null}
                      </FieldTitle>
                      <FieldDescription>
                        Gunakan API key dari akun Mengantar milik outlet.
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              </RadioGroup>
            </Field>
            )}

            {connectionMode === "private" ? (
              <form
                action={credentialAction}
                aria-busy={credentialPending}
                className="space-y-4"
                key={credentialState.resultToken ?? `credential-${outlet.id}`}
                noValidate
              >
                <input name="outletId" type="hidden" value={outlet.id} />
                <input
                  aria-hidden="true"
                  autoComplete="username"
                  className="sr-only"
                  name="username"
                  readOnly
                  tabIndex={-1}
                  type="text"
                  value={outlet.name}
                />
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

                <Button className="min-h-11 max-sm:w-full sm:ml-auto sm:flex" disabled={isBusy} type="submit">
                  {credentialPending
                    ? "Menyimpan API key…"
                    : outlet.connectionSource === "private"
                      ? "Ganti API key"
                      : "Simpan API key"}
                </Button>
              </form>
            ) : outlet.connectionSource === "private" && !privateOnly ? (
              <div className="space-y-4">
                <Alert>
                  <CircleAlert aria-hidden="true" />
                  <AlertTitle>Konfirmasi diperlukan</AlertTitle>
                  <AlertDescription>
                    API key privat tetap dipertahankan sampai koneksi bawaan GeraiCUAN terbukti lengkap.
                  </AlertDescription>
                </Alert>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="min-h-11 max-sm:w-full sm:ml-auto sm:flex" disabled={isBusy} variant="outline">
                      Gunakan koneksi bawaan GeraiCUAN
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Gunakan koneksi bawaan GeraiCUAN untuk {outlet.name}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        API key privat baru dihapus setelah server memastikan koneksi bawaan GeraiCUAN
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
            ) : null}

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
      </SettingsCard>
    </section>
  );
}
