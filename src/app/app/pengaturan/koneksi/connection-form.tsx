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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

type Mode = "platform_default" | "private";

const ISSUE_COPY = {
  authentication: {
    title: "Autentikasi Mengantar gagal",
    body: "Mengantar menolak autentikasi terakhir. Periksa akun di Mengantar, lalu masukkan API key pengganti.",
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

function OptionCard({ checked, description, id, inUse, title, value }: {
  checked: boolean;
  description: string;
  id: string;
  inUse: boolean;
  title: string;
  value: Mode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
        checked ? "border-primary bg-accent/40" : "border-input",
      )}
      htmlFor={id}
    >
      <RadioGroupItem className="mt-0.5" id={id} value={value} />
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold">{title}</span>
          {inUse ? <StatusBadge label="Digunakan" tone="success" /> : null}
        </span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
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
            : "Tidak ditampilkan kembali setelah disimpan."}
        </FieldDescription>
        <FieldError id="mengantar-api-key-error">{apiKeyError}</FieldError>
      </Field>
      <Result failureTitle="API key belum tersimpan" state={saveState} successTitle="API key tersimpan" />
      <Button className="self-end max-sm:w-full" disabled={busy} type="submit" variant="outline">
        {savePending ? "Menyimpan…" : outlet.connectionSource === "private" ? "Ganti API key" : "Simpan API key"}
      </Button>
    </form>
  );

  return (
    <DataCard
      description={`Sumber koneksi yang dipakai outlet ${outlet.name} untuk tarif, resi, dan status.`}
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
          <RadioGroup
            aria-label={`Sumber koneksi Mengantar untuk ${outlet.name}`}
            className="gap-4"
            disabled={busy}
            onValueChange={(value) => setMode(value as Mode)}
            value={mode}
          >
            <OptionCard
              checked={mode === "platform_default"}
              description="Dikelola GeraiCUAN, tanpa API key. Tarif dan pencairan COD mengikuti akun GeraiCUAN."
              id="connection-platform"
              inUse={outlet.connectionSource === "platform_default"}
              title="Koneksi bawaan GeraiCUAN"
              value="platform_default"
            />
            <OptionCard
              checked={mode === "private"}
              description="Pakai API key dari akun Mengantar milik outlet. Pencairan COD masuk ke akun itu."
              id="connection-private"
              inUse={outlet.connectionSource === "private"}
              title="Akun Mengantar sendiri"
              value="private"
            />
          </RadioGroup>
          {mode === "platform_default" && outlet.connectionSource === "private" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                API key outlet dihapus setelah server memastikan koneksi bawaan lengkap.
              </p>
              <AlertDialog onOpenChange={setConfirming} open={confirming}>
                <AlertDialogTrigger asChild>
                  <Button className="self-start max-sm:w-full" disabled={busy} variant="outline">
                    Gunakan koneksi bawaan
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Ganti {outlet.name} ke koneksi bawaan GeraiCUAN?</AlertDialogTitle>
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
                        {switchPending ? "Mengalihkan…" : "Hapus API key & gunakan bawaan"}
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
