"use client";

import { Check } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { reviewRegistration, type RegistrationReviewState } from "@/app/platform/pendaftaran/actions";
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
import { CharacterClassTextarea } from "@/components/ui/character-class-input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const initialState: RegistrationReviewState = {};

/**
 * PR-61: approve (confirmed in a dialog naming the gerai) or reject (a reason the owner receives
 * by email) one gerai awaiting approval. `reviewRegistration` re-checks the role, the state and
 * the owner's verification, and writes the audit event.
 */
export function RegistrationReview({ emailVerified, storeName, tenantId }: { emailVerified: boolean; storeName: string; tenantId: string }) {
  const [state, action, pending] = useActionState(reviewRegistration, initialState);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const approveRef = useRef<HTMLFormElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const reasonError = state.errors?.reason;
  const settled = state.outcome === "approved" || state.outcome === "rejected";

  useEffect(() => {
    if (!state.resultToken) return;
    if (reasonError) {
      reasonRef.current?.focus();
      return;
    }
    requestAnimationFrame(() => resultRef.current?.focus());
  }, [reasonError, state.resultToken]);

  return (
    <div className="flex flex-col gap-3">
      {state.message && !reasonError ? (
        <div className="outline-none" ref={resultRef} tabIndex={-1}>
          <Alert role={settled ? "status" : "alert"} variant={settled ? "default" : "destructive"}>
            <AlertTitle>{state.outcome === "approved" ? "Gerai disetujui" : state.outcome === "rejected" ? "Pendaftaran ditolak" : "Keputusan belum tersimpan"}</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      {settled ? null : (
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          {!emailVerified ? (
            <span className="text-xs text-muted-foreground sm:mr-auto">Persetujuan tersedia setelah pemilik memverifikasi email.</span>
          ) : null}
          <Dialog onOpenChange={(next) => { if (!pending) setRejectOpen(next); }} open={rejectOpen}>
            <DialogTrigger asChild>
              <Button disabled={pending} type="button" variant="outline">Tolak pendaftaran</Button>
            </DialogTrigger>
            <DialogContent onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
              <form action={action} aria-busy={pending} className="flex flex-col gap-4" noValidate>
                <DialogHeader>
                  <DialogTitle>Tolak pendaftaran {storeName}?</DialogTitle>
                  <DialogDescription>Gerai diarsipkan dan pemilik menerima alasan ini lewat email.</DialogDescription>
                </DialogHeader>
                <input name="tenantId" type="hidden" value={tenantId} />
                <input name="decision" type="hidden" value="REJECT" />
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`reason-${tenantId}`}>Alasan penolakan</Label>
                  <CharacterClassTextarea
                    aria-describedby={`reason-hint-${tenantId}${reasonError ? ` reason-error-${tenantId}` : ""}`}
                    aria-invalid={reasonError ? true : undefined}
                    characterClass="FREE_TEXT"
                    className="min-h-24"
                    id={`reason-${tenantId}`}
                    maxLength={500}
                    name="reason"
                    ref={reasonRef}
                    required
                  />
                  <p className="text-xs text-muted-foreground" id={`reason-hint-${tenantId}`}>5 sampai 500 karakter.</p>
                  {reasonError ? <p className="text-sm font-medium text-destructive" id={`reason-error-${tenantId}`}>{reasonError}</p> : null}
                </div>
                {state.message && !settled && !reasonError ? <p className="text-sm font-medium text-destructive" role="alert">{state.message}</p> : null}
                <DialogFooter>
                  <DialogClose asChild>
                    <Button disabled={pending} type="button" variant="outline">Batal</Button>
                  </DialogClose>
                  <Button disabled={pending} type="submit" variant="destructive">{pending ? "Menolak…" : "Tolak dan kirim alasan"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <form action={action} ref={approveRef}>
            <input name="tenantId" type="hidden" value={tenantId} />
            <input name="decision" type="hidden" value="APPROVE" />
          </form>
          <AlertDialog onOpenChange={(next) => { if (!pending) setApproveOpen(next); }} open={approveOpen}>
            <AlertDialogTrigger asChild>
              <Button disabled={pending || !emailVerified} type="button">
                <Check aria-hidden="true" data-icon="inline-start" />
                Setujui gerai
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
              <AlertDialogHeader>
                <AlertDialogTitle>Setujui {storeName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Gerai langsung dapat membuat dan menerbitkan kiriman dengan akun Mengantar miliknya. Pemilik menerima email dan
                  keputusan ini tercatat di jejak audit.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
                <Button disabled={pending} onClick={() => { setApproveOpen(false); approveRef.current?.requestSubmit(); }} type="button">
                  {pending ? "Menyetujui…" : "Ya, setujui"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
