"use client";

import { ImageUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { removeGeraiLogo, uploadGeraiLogo, type GeraiLogoActionState } from "@/app/app/pengaturan/actions";
import { DataCard } from "@/components/app/data-card";
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
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES, LOGO_REJECTION_COPY } from "@/lib/gerai-settings";

import { initials } from "./settings-logic";

/**
 * T-243 Profil gerai → Logo gerai. The file is sent as soon as it is chosen; the server
 * sniffs the bytes (PNG/JPEG/WebP, never SVG), the size and the dimensions. Shown as
 * uploaded and as the thermal label prints it (grayscale), with a link to the preview.
 */
export function GeraiLogoCard({ geraiName, logoSrc, updatedAtLabel }: {
  geraiName: string;
  logoSrc: string | null;
  updatedAtLabel: string | null;
}) {
  const [uploadState, uploadAction, uploading] = useActionState<GeraiLogoActionState, FormData>(uploadGeraiLogo, {});
  const [removeState, removeAction, removing] = useActionState<GeraiLogoActionState, FormData>(removeGeraiLogo, {});
  const [clientError, setClientError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [seen, setSeen] = useState<{ upload?: string; remove?: string; last: "upload" | "remove" | null }>({
    last: null,
    remove: removeState.resultToken,
    upload: uploadState.resultToken,
  });
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Whichever answer arrived last is the one shown; the remove dialog closes on its answer.
  if (uploadState.resultToken !== seen.upload) {
    setSeen({ ...seen, last: "upload", upload: uploadState.resultToken });
    setClientError(null);
  } else if (removeState.resultToken !== seen.remove) {
    setSeen({ ...seen, last: "remove", remove: removeState.resultToken });
    setClientError(null);
    setConfirming(false);
  }
  const latest = seen.last === "upload" ? uploadState : seen.last === "remove" ? removeState : null;
  const error = clientError ?? latest?.error ?? null;
  const busy = uploading || removing;

  useEffect(() => {
    if (uploadState.resultToken || removeState.resultToken) resultRef.current?.focus();
  }, [uploadState.resultToken, removeState.resultToken]);

  return (
    <DataCard
      description="Tercetak hitam-putih di label dan di bagian atas invoice."
      title="Logo gerai"
    >
      <div aria-live="polite" className="empty:hidden" ref={resultRef} tabIndex={-1}>
        {error ? (
          <Alert role="alert" variant="destructive">
            <AlertTitle>Logo belum tersimpan</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : latest?.saved ? (
          <Alert role="status">
            <AlertTitle>{latest.saved === "uploaded" ? "Logo disimpan" : "Logo dihapus"}</AlertTitle>
            <AlertDescription>
              {latest.saved === "uploaded" ? "Label dan invoice berikutnya memakai logo ini." : "Label dan invoice berikutnya tanpa logo."}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex gap-3">
          <figure className="grid justify-items-center gap-1.5">
            <div className="flex size-24 items-center justify-center overflow-hidden rounded-xl border bg-card p-2">
              {logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin bytes
                <img alt={`Logo ${geraiName}`} className="max-h-full max-w-full object-contain" src={logoSrc} />
              ) : (
                <span aria-hidden="true" className="text-2xl font-bold text-muted-foreground">{initials(geraiName)}</span>
              )}
            </div>
            <figcaption className="text-xs text-muted-foreground">{logoSrc ? "Asli" : "Belum ada logo"}</figcaption>
          </figure>
          {logoSrc ? (
            <figure className="grid justify-items-center gap-1.5">
              <div className="flex size-24 items-center justify-center overflow-hidden rounded-xl border bg-card p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- as the thermal head prints it */}
                <img alt="" className="max-h-full max-w-full object-contain grayscale contrast-125" src={logoSrc} />
              </div>
              <figcaption className="text-xs text-muted-foreground">Hasil cetak label</figcaption>
            </figure>
          ) : null}
        </div>

        <div className="grid min-w-0 flex-1 gap-3">
          <p className="text-sm text-muted-foreground">
            PNG, JPEG, atau WebP, maksimal 200 KB dan 1000 × 1000 piksel. SVG tidak diterima.
            {updatedAtLabel ? <> Diperbarui {updatedAtLabel}.</> : null}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <form action={uploadAction} ref={form}>
              <input
                accept={LOGO_MIME_TYPES.join(",")}
                aria-label={logoSrc ? "Pilih berkas logo pengganti" : "Pilih berkas logo"}
                className="sr-only"
                disabled={busy}
                id="gerai-logo-file"
                name="logo"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > LOGO_MAX_BYTES) {
                    setClientError(LOGO_REJECTION_COPY.TOO_LARGE);
                    event.target.value = "";
                    return;
                  }
                  setClientError(null);
                  form.current?.requestSubmit();
                }}
                ref={input}
                type="file"
              />
              <Button disabled={busy} onClick={() => input.current?.click()} type="button" variant="outline">
                <ImageUp aria-hidden="true" />
                {uploading ? "Mengunggah…" : logoSrc ? "Ganti logo" : "Unggah logo"}
              </Button>
            </form>
            {logoSrc ? (
              <AlertDialog onOpenChange={setConfirming} open={confirming}>
                <AlertDialogTrigger asChild>
                  <Button className="text-destructive" disabled={busy} type="button" variant="ghost">
                    <Trash2 aria-hidden="true" />
                    Hapus logo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus logo gerai?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Label dan invoice berikutnya dicetak tanpa logo. Anda dapat mengunggah logo lagi kapan saja.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <form action={removeAction}>
                    <input name="confirmation" type="hidden" value="remove-logo" />
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={removing}>Batal</AlertDialogCancel>
                      <Button disabled={removing} type="submit" variant="destructive">
                        {removing ? "Menghapus…" : "Hapus logo"}
                      </Button>
                    </AlertDialogFooter>
                  </form>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            <Button asChild className="px-0" variant="link">
              <Link href="/app/pengaturan/label">Lihat pratinjau label</Link>
            </Button>
          </div>
        </div>
      </div>
    </DataCard>
  );
}
