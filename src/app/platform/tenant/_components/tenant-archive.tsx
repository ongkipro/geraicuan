"use client";

import { Archive } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { submitPlatformTenantLifecycle, type PlatformTenantLifecycleState } from "@/app/platform/tenant/actions";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const initialState: PlatformTenantLifecycleState = {};

/**
 * T-279 (spec 17 UX-v3.1, UX-v3.3): archive an ACTIVE or SUSPENDED gerai. Irreversible here (no
 * unarchive), so the typed name lives inside the dialog and the confirm button stays disabled until
 * it matches. `submitPlatformTenantLifecycle` re-checks the role, the name and the current status.
 * After success the page re-renders with status ARCHIVED; the outcome stays visible.
 */
export function TenantArchive({
  initialAttemptId,
  status,
  tenantId,
  tenantName,
}: {
  initialAttemptId: string;
  status: string;
  tenantId: string;
  tenantName: string;
}) {
  const [state, action, pending] = useActionState(submitPlatformTenantLifecycle, initialState);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  const attemptId = state.nextAttemptId ?? initialAttemptId;
  const succeeded = state.outcome === "success";

  // The dialog stays open while the request runs; each new result closes it and the outcome is
  // shown (and focused) on the card. State is adjusted during render, not in an effect.
  const [handledToken, setHandledToken] = useState(state.resultToken);
  if (state.resultToken !== handledToken) {
    setHandledToken(state.resultToken);
    setOpen(false);
    setTyped("");
  }
  useEffect(() => {
    if (!state.resultToken) return;
    requestAnimationFrame(() => resultRef.current?.focus());
  }, [state.resultToken]);

  const archivable = status === "ACTIVE" || status === "SUSPENDED";
  if (!archivable && !succeeded) return null;

  const matches = typed.trim() === tenantName;
  const outcome = state.message ? (
    <div className="outline-none" ref={resultRef} tabIndex={-1}>
      <Alert role={succeeded ? "status" : "alert"} variant={succeeded ? "default" : "destructive"}>
        <AlertTitle>{succeeded ? "Gerai diarsipkan" : "Gerai belum diarsipkan"}</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    </div>
  ) : null;

  return (
    <section aria-labelledby="arsip-tenant">
      <Card className="gap-4 border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Archive aria-hidden="true" className="size-5" />
            <h2 id="arsip-tenant">Arsipkan gerai</h2>
          </CardTitle>
          <CardDescription>
            Gerai yang diarsipkan ditutup permanen: semua anggotanya langsung keluar dan tidak dapat masuk lagi. Riwayat kiriman dan jejak audit tetap tersimpan.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {outcome}
          {archivable ? (
            <AlertDialog
              onOpenChange={(next) => {
                if (pending) return;
                setOpen(next);
                if (!next) setTyped("");
              }}
              open={open}
            >
              <AlertDialogTrigger asChild>
                <Button
                  className="self-start border-destructive text-destructive hover:bg-danger-surface hover:text-destructive"
                  disabled={pending}
                  type="button"
                  variant="outline"
                >
                  {pending ? "Memproses…" : "Arsipkan gerai"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
                <form
                  action={action}
                  aria-busy={pending}
                  className="flex flex-col gap-4"
                  noValidate
                  onSubmit={(event) => { if (!matches) event.preventDefault(); }}
                >
                  <AlertDialogHeader>
                    <AlertDialogTitle>Arsipkan {tenantName}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Semua anggota {tenantName} langsung keluar dan tidak dapat masuk atau membuat kiriman lagi. Kiriman yang masih di jalan tidak lagi menerima pembaruan status dari Mengantar, jadi selesaikan dulu kiriman dan COD yang terbuka. Tindakan ini tidak dapat dibatalkan dari panel admin dan tercatat di jejak audit.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <input name="attemptId" type="hidden" value={attemptId} />
                  <input name="lifecycleAction" type="hidden" value="archive" />
                  <input name="tenantId" type="hidden" value={tenantId} />
                  <input name="confirmation" type="hidden" value="confirmed" />
                  <Field>
                    <FieldLabel className="block leading-normal" htmlFor="tenant-archive-name">
                      Ketik nama gerai untuk konfirmasi: <strong className="font-semibold">{tenantName}</strong>
                    </FieldLabel>
                    <Input
                      aria-describedby="tenant-archive-name-hint"
                      autoComplete="off"
                      id="tenant-archive-name"
                      maxLength={120}
                      name="confirmationName"
                      onChange={(event) => setTyped(event.target.value)}
                      required
                      value={typed}
                    />
                    <FieldDescription id="tenant-archive-name-hint">
                      {matches ? "Nama cocok." : "Tombol arsipkan aktif setelah nama gerai diketik persis."}
                    </FieldDescription>
                  </Field>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
                    <Button disabled={pending || !matches} type="submit" variant="destructive">
                      {pending ? "Memproses…" : "Arsipkan gerai"}
                    </Button>
                  </AlertDialogFooter>
                </form>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
