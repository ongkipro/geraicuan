"use client";

import { TriangleAlert } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: PlatformTenantLifecycleState = {};

/**
 * The last region of a tenant's page (spec 17 §UX-v3.7). Suspending an active tenant is the danger
 * zone: type the tenant's name, then confirm in a dialog that names the tenant and the consequence.
 * A suspended tenant gets the same place to reactivate. `submitPlatformTenantLifecycle` re-checks
 * the role, the name and the current status.
 */
export function TenantLifecycle({
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
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const attemptId = state.nextAttemptId ?? initialAttemptId;
  const nameError = state.errors?.confirmationName;

  useEffect(() => {
    if (!state.resultToken) return;
    requestAnimationFrame(() => (nameError ? inputRef.current : resultRef.current)?.focus());
  }, [nameError, state.resultToken]);

  if (status !== "ACTIVE" && status !== "SUSPENDED") return null;

  const suspending = status === "ACTIVE";
  const label = suspending ? "Tangguhkan tenant" : "Aktifkan kembali tenant";
  const matches = typed.trim() === tenantName;
  const consequence = suspending
    ? `Semua anggota ${tenantName} tidak dapat membuat, menerbitkan, atau mencetak kiriman sampai tenant diaktifkan kembali.`
    : `Anggota ${tenantName} dapat kembali membuat dan menerbitkan kiriman.`;

  return (
    <section aria-labelledby="siklus-tenant">
      <Card className={cn("gap-4", suspending && "border-destructive/40")}>
        <CardHeader>
          <CardTitle className={cn("flex items-center gap-2", suspending && "text-destructive")}>
            {suspending ? <TriangleAlert aria-hidden="true" className="size-5" /> : null}
            <h2 id="siklus-tenant">{suspending ? "Zona berbahaya" : "Siklus tenant"}</h2>
          </CardTitle>
          <CardDescription>{consequence}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state.message ? (
            <div className="outline-none" ref={resultRef} tabIndex={-1}>
              <Alert role={state.outcome === "success" ? "status" : "alert"} variant={state.outcome === "success" ? "default" : "destructive"}>
                <AlertTitle>{state.outcome === "success" ? "Status tenant diperbarui" : "Status tenant belum berubah"}</AlertTitle>
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            </div>
          ) : null}
          <form action={action} aria-busy={pending} className="flex flex-col gap-4" noValidate ref={formRef}>
            <input name="attemptId" type="hidden" value={attemptId} />
            <input name="lifecycleAction" type="hidden" value={suspending ? "suspend" : "reactivate"} />
            <input name="tenantId" type="hidden" value={tenantId} />
            <input name="confirmation" type="hidden" value="confirmed" />
            <div className="flex max-w-md flex-col gap-2">
              <Label className="block leading-normal" htmlFor="tenant-confirmation-name">Ketik <strong className="font-semibold">{tenantName}</strong> untuk mengonfirmasi</Label>
              <Input
                aria-describedby={nameError ? "tenant-confirmation-name-error" : undefined}
                aria-invalid={nameError ? true : undefined}
                autoComplete="off"
                defaultValue={state.values?.expectedName ?? ""}
                id="tenant-confirmation-name"
                maxLength={120}
                name="confirmationName"
                onChange={(event) => setTyped(event.target.value)}
                ref={inputRef}
                required
              />
              {nameError ? <p className="text-sm font-medium text-destructive" id="tenant-confirmation-name-error">{nameError}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <AlertDialog onOpenChange={(next) => { if (!pending) setOpen(next); }} open={open}>
                <AlertDialogTrigger asChild>
                  <Button
                    className={cn(suspending && "border-destructive text-destructive hover:bg-danger-surface hover:text-destructive")}
                    disabled={pending || !matches}
                    type="button"
                    variant="outline"
                  >
                    {pending ? "Memproses…" : label}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{label} {tenantName}?</AlertDialogTitle>
                    <AlertDialogDescription>{consequence} Tindakan ini tercatat di jejak audit.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
                    <Button
                      disabled={pending}
                      onClick={() => { setOpen(false); formRef.current?.requestSubmit(); }}
                      type="button"
                      variant={suspending ? "destructive" : "default"}
                    >
                      {pending ? "Memproses…" : label}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {!matches ? <span className="text-xs text-muted-foreground">Ketik nama tenant persis untuk mengaktifkan tombol.</span> : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
