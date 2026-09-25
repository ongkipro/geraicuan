"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  reviewRegistration,
  type RegistrationReviewState,
} from "@/app/platform/pendaftaran/actions";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CharacterClassTextarea } from "@/components/ui/character-class-input";
import { cn } from "@/lib/utils";

const initialState: RegistrationReviewState = {};

/**
 * PR-61: approve or reject one store awaiting approval. Approval asks for a
 * confirmation; rejection needs a reason, which the owner receives by email.
 */
export function RegistrationReviewControls({
  emailVerified,
  storeName,
  tenantId,
}: {
  emailVerified: boolean;
  storeName: string;
  tenantId: string;
}) {
  // One action state for both forms: whichever decision was submitted last is
  // the one on screen.
  const [outcome, action, busy] = useActionState(reviewRegistration, initialState);
  const resultRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT">();
  const approveFormId = `approve-${tenantId}`;
  const reasonError = outcome.errors?.reason;

  useEffect(() => {
    if (reasonError) reasonRef.current?.focus();
    else if (outcome.resultToken) resultRef.current?.focus();
  }, [outcome.resultToken, reasonError]);

  const approving = busy && decision === "APPROVE";
  const rejecting = busy && decision === "REJECT";
  const settled = outcome.outcome === "approved" || outcome.outcome === "rejected";

  return (
    <div className="grid gap-4">
      {outcome.message ? (
        <div className="outline-none" ref={resultRef} tabIndex={-1}>
          <Alert role={settled ? "status" : "alert"} variant={settled ? "default" : "destructive"}>
            <AlertTitle>
              {outcome.outcome === "approved"
                ? "Gerai disetujui"
                : outcome.outcome === "rejected"
                  ? "Pendaftaran ditolak"
                  : "Keputusan belum tersimpan"}
            </AlertTitle>
            <AlertDescription>{outcome.message}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {settled ? null : (
        <div className="flex flex-wrap items-start gap-3">
          <form action={action} id={approveFormId}>
            <input name="tenantId" type="hidden" value={tenantId} />
            <input name="decision" type="hidden" value="APPROVE" />
          </form>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="min-h-11 md:min-h-10 max-sm:w-full" disabled={busy || !emailVerified}>
                Setujui gerai
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Setujui {storeName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Gerai langsung dapat membuat, mengestimasi dan menerbitkan kiriman dengan akun
                  Mengantar miliknya sendiri. Pemilik menerima email dan keputusan ini tercatat di
                  jejak audit.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11 md:min-h-10">Batal</AlertDialogCancel>
                <AlertDialogAction
                  className="min-h-11 md:min-h-10"
                  form={approveFormId}
                  onClick={() => setDecision("APPROVE")}
                  type="submit"
                >
                  {approving ? "Menyetujui…" : "Ya, setujui"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* V-35: a compact outline trigger beside the one primary; opened, the
              unframed reason form takes the full row below both buttons. */}
          <details className="min-w-0 open:basis-full" open={Boolean(reasonError)}>
            <summary className={cn(buttonVariants({ variant: "outline" }), "min-h-11 md:min-h-10 w-fit cursor-pointer list-none max-sm:w-full [&::-webkit-details-marker]:hidden")}>
              Tolak pendaftaran
            </summary>
            <form action={action} aria-busy={rejecting} className="grid max-w-2xl gap-3 pt-4" noValidate>
              <input name="tenantId" type="hidden" value={tenantId} />
              <input name="decision" type="hidden" value="REJECT" />
              <Label htmlFor={`reason-${tenantId}`}>Alasan penolakan</Label>
              <p className="text-sm text-muted-foreground" id={`reason-hint-${tenantId}`}>
                Dikirim ke pemilik gerai melalui email. 5 sampai 500 karakter.
              </p>
              <CharacterClassTextarea
                aria-describedby={`reason-hint-${tenantId}${reasonError ? ` reason-error-${tenantId}` : ""}`}
                aria-invalid={Boolean(reasonError)}
                characterClass="FREE_TEXT"
                className="min-h-24"
                id={`reason-${tenantId}`}
                maxLength={500}
                name="reason"
                ref={reasonRef}
                required
              />
              {reasonError ? (
                <p className="text-sm font-medium text-destructive" id={`reason-error-${tenantId}`}>{reasonError}</p>
              ) : null}
              <Button
                className="min-h-11 md:min-h-10 max-sm:w-full sm:justify-self-start"
                disabled={busy}
                onClick={() => setDecision("REJECT")}
                type="submit"
                variant="destructive"
              >
                {rejecting ? "Menolak…" : "Tolak dan kirim alasan"}
              </Button>
            </form>
          </details>
        </div>
      )}
      {!emailVerified && !settled ? (
        <p className="text-sm text-muted-foreground">
          Persetujuan tersedia setelah pemilik memverifikasi emailnya. Penolakan tetap dapat dilakukan.
        </p>
      ) : null}
    </div>
  );
}
