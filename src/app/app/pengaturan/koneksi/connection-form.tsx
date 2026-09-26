"use client";

import { CircleAlert } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  savePrivateMengantarCredential,
  switchMengantarToPlatformDefault,
  type MengantarCredentialActionState,
} from "@/app/app/pengaturan/actions";
import type { SafeOutletReadiness } from "@/app/app/pengaturan/outlet-settings-types";
import { DataCard } from "@/components/app/data-card";
import { OptionCard } from "@/components/app/option-card";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Mode = "platform_default" | "private";

const KEY_FORM_ID = "mengantar-key-form";

/** "Digunakan" follows the persisted source, never the draft choice. */
const MODES: { description: string; title: string; value: Mode }[] = [
  {
    description: "Dikelola GeraiCUAN, tanpa API key. Tarif dan pencairan COD mengikuti akun GeraiCUAN.",
    title: "Koneksi bawaan GeraiCUAN",
    value: "platform_default",
  },
  {
    description: "Memakai API key dari akun Mengantar milik outlet. Pencairan COD masuk ke akun itu.",
    title: "Akun Mengantar sendiri",
    value: "private",
  },
];

const ISSUE_COPY = {
  authentication: {
    title: "API key ditolak Mengantar",
    body: "Mengantar menolak API key terakhir. Periksa akun Mengantar Anda, lalu masukkan API key baru.",
  },
  provider_unavailable: {
    title: "Mengantar belum dapat dijangkau",
    body: "Mengantar tidak dapat dijangkau saat pemeriksaan terakhir. API key tersimpan tidak diubah; coba lagi setelah layanan pulih.",
  },
  secret_unavailable: {
    title: "API key perlu diganti",
    body: "API key tersimpan tidak tersedia atau tidak dapat dibaca. Masukkan API key baru untuk memulihkan koneksi outlet.",
  },
} as const;

function Result({ failureTitle, state, successTitle }: {
  failureTitle: string;
  state: MengantarCredentialActionState;
  successTitle: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.resultToken && !state.errors?.apiKey) ref.current?.focus();
  }, [state.errors?.apiKey, state.resultToken]);
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
      <AlertDescription>
        {state.message}
        {state.errors?.confirmation ? ` ${state.errors.confirmation}` : null}
        {state.errors?.outletId ? ` ${state.errors.outletId}` : null}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Platform default versus the outlet's own Mengantar account. The API key field is always blank
 * and a stored key is never sent to the browser; "Digunakan" follows the persisted source, not
 * the radio's draft choice.
 */
export function ConnectionForm({ outlet }: { outlet: SafeOutletReadiness }) {
  const [saveState, saveAction, savePending] = useActionState(savePrivateMengantarCredential, {});
  const [switchState, switchAction, switchPending] = useActionState(switchMengantarToPlatformDefault, {});
  const privateOnly = Boolean(outlet.privateConnectionRequired);
  const [mode, setMode] = useState<Mode>(privateOnly ? "private" : outlet.connectionSource);
  const [confirming, setConfirming] = useState(false);
  const [seenSwitchToken, setSeenSwitchToken] = useState(switchState.resultToken);
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const apiKeyError = saveState.errors?.apiKey;
  const busy = savePending || switchPending;
  const issue = outlet.connectionStatus === "private_attention" ? ISSUE_COPY[outlet.connectionIssue ?? "secret_unavailable"] : null;

  // The confirmation stays open (showing progress) until the server answers, then closes.
  if (switchState.resultToken !== seenSwitchToken) {
    setSeenSwitchToken(switchState.resultToken);
    setConfirming(false);
  }

  useEffect(() => {
    if (saveState.resultToken && apiKeyError) apiKeyRef.current?.focus();
  }, [apiKeyError, saveState.resultToken]);

  const keyForm = (
    <form
      action={saveAction}
      aria-busy={savePending}
      className="flex flex-col gap-4"
      id={KEY_FORM_ID}
      key={saveState.resultToken ?? "credential"}
      noValidate
    >
      <input name="outletId" type="hidden" value={outlet.id} />
      {/* Lets a password manager file the key under the outlet; not read by the server. */}
      <input aria-hidden="true" autoComplete="username" className="sr-only" name="username" readOnly tabIndex={-1} type="text" value={outlet.name} />
      <Field data-invalid={Boolean(apiKeyError)}>
        <FieldLabel htmlFor="mengantar-api-key">
          {outlet.connectionSource === "private" ? "API key pengganti" : "API key Mengantar"}
        </FieldLabel>
        <Input
          aria-describedby={apiKeyError ? "mengantar-api-key-error" : "mengantar-api-key-help"}
          aria-invalid={Boolean(apiKeyError)}
          autoComplete="new-password"
          id="mengantar-api-key"
          maxLength={512}
          name="apiKey"
          ref={apiKeyRef}
          required
          spellCheck={false}
          type="password"
        />
        <FieldDescription id="mengantar-api-key-help">
          {outlet.connectionSource === "private"
            ? `API key tersimpan${outlet.connectionUpdatedAtLabel ? ` sejak ${outlet.connectionUpdatedAtLabel}` : ""} dan tidak ditampilkan.`
            : "Salin dari akun Mengantar Anda. Tidak ditampilkan lagi setelah disimpan."}
        </FieldDescription>
        <FieldError id="mengantar-api-key-error">{apiKeyError}</FieldError>
      </Field>
      <Result failureTitle="API key belum tersimpan" state={saveState} successTitle="API key tersimpan" />
    </form>
  );

  return (
    <DataCard
      description={`Akun Mengantar yang dipakai outlet ${outlet.name} untuk cek tarif, terbit resi, dan status kiriman.`}
      // The key's save sits in the card footer, as every other settings save does.
      footer={privateOnly || mode === "private" ? (
        <Button className="ml-auto" disabled={busy} form={KEY_FORM_ID} type="submit">
          {savePending ? "Menyimpan…" : outlet.connectionSource === "private" ? "Ganti API key" : "Simpan API key"}
        </Button>
      ) : undefined}
      title="Koneksi Mengantar"
    >
      {issue ? (
        <Alert role="alert" variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{issue.title}</AlertTitle>
          <AlertDescription>{issue.body}</AlertDescription>
        </Alert>
      ) : null}

      {privateOnly ? (
        <>
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertTitle>
              {outlet.connectionSource === "private" ? "Gerai ini memakai akun Mengantar sendiri" : "Hubungkan akun Mengantar milik gerai"}
            </AlertTitle>
            <AlertDescription>
              Gerai yang mendaftar sendiri mengirim dengan akun Mengantar miliknya. Salin API key dari akun Mengantar Anda, lalu simpan di bawah.
            </AlertDescription>
          </Alert>
          {keyForm}
        </>
      ) : (
        <>
          <fieldset className="grid gap-3">
            <legend className="sr-only">Sumber koneksi Mengantar untuk {outlet.name}</legend>
            {MODES.map((option) => (
              <OptionCard
                checked={mode === option.value}
                description={option.description}
                disabled={busy}
                key={option.value}
                name="connection-mode"
                onSelect={() => setMode(option.value)}
                value={option.value}
              >
                {option.title}
                {outlet.connectionSource === option.value ? <StatusBadge label="Digunakan" tone="success" /> : null}
              </OptionCard>
            ))}
          </fieldset>
          {mode === "platform_default" && outlet.connectionSource === "private" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                API key outlet dihapus setelah koneksi bawaan GeraiCUAN dipastikan siap.
              </p>
              <AlertDialog onOpenChange={setConfirming} open={confirming}>
                <AlertDialogTrigger asChild>
                  <Button className="self-start max-sm:w-full" disabled={busy} variant="outline">
                    Pakai koneksi bawaan
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Alihkan {outlet.name} ke koneksi bawaan GeraiCUAN?</AlertDialogTitle>
                    <AlertDialogDescription>
                      API key Mengantar milik outlet ini dihapus. Kiriman baru memakai akun GeraiCUAN; untuk kembali ke akun sendiri, API key harus dimasukkan lagi.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <form action={switchAction}>
                    <input name="outletId" type="hidden" value={outlet.id} />
                    <input name="confirmation" type="hidden" value="restore-platform-default" />
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={switchPending}>Batal</AlertDialogCancel>
                      <Button disabled={switchPending} type="submit" variant="destructive">
                        {switchPending ? "Mengalihkan…" : "Hapus API key dan pakai koneksi bawaan"}
                      </Button>
                    </AlertDialogFooter>
                  </form>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : null}
          {mode === "private" ? keyForm : null}
        </>
      )}
      <Result failureTitle="Koneksi tetap memakai akun sendiri" state={switchState} successTitle="Koneksi dialihkan" />
    </DataCard>
  );
}
