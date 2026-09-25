"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type RefObject } from "react";

import {
  submitPlatformTenantLifecycle,
  type PlatformTenantLifecycleState,
} from "@/app/platform/tenant/actions";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CharacterClassInput } from "@/components/ui/character-class-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: PlatformTenantLifecycleState = {};

function ActionOutcome({ resultRef, state }: { resultRef: RefObject<HTMLDivElement | null>; state: PlatformTenantLifecycleState }) {
  const entries = Object.entries(state.errors ?? {}).filter((entry): entry is [string, string] => Boolean(entry[1]));

  if (!state.message) return null;
  return (
    <Alert
      aria-live="polite"
      ref={resultRef}
      role={state.outcome === "success" ? "status" : "alert"}
      tabIndex={-1}
      variant={state.outcome === "success" ? "default" : "destructive"}
    >
      <AlertTitle>{state.outcome === "success" ? "Perubahan tersimpan" : "Perubahan belum tersimpan"}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{state.message}</p>
        {entries.length ? <ul className="list-disc space-y-1 pl-4">{entries.map(([key, message]) => {
          const href = key === "tenantName" ? "#tenant-name" : key === "confirmationName" ? "#tenant-confirmation-name" : null;
          return <li key={key}>{href ? <a className="underline underline-offset-4" href={href}>{message}</a> : message}</li>;
        })}</ul> : null}
        {state.outcome === "success" && state.tenant ? (
          <Button asChild className="min-h-11" variant="outline">
            <Link href={`/platform/tenant/${state.tenant.id}`} prefetch={false}>
              Buka detail {state.tenant.name}
            </Link>
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function ConfirmAction({
  children,
  description,
  disabled,
  fieldHasError,
  formId,
  focusAfterSubmitRef,
  resultRef,
  resultToken,
  title,
  variant = "default",
  error,
}: {
  children: string;
  description: string;
  disabled: boolean;
  fieldHasError: boolean;
  formId: string;
  focusAfterSubmitRef: RefObject<HTMLInputElement | null>;
  resultRef: RefObject<HTMLDivElement | null>;
  resultToken?: string;
  title: string;
  variant?: "default" | "destructive";
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusAfterCloseRef = useRef<"field" | "result" | "trigger" | null>(null);

  useEffect(() => {
    if (!resultToken) return;
    focusAfterCloseRef.current = fieldHasError ? "field" : "result";
    const frame = requestAnimationFrame(() => setOpen(false));
    return () => cancelAnimationFrame(frame);
  }, [fieldHasError, resultToken]);

  useEffect(() => {
    if (!disabled || !open) return;
    const frame = requestAnimationFrame(() => contentRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [disabled, open]);

  return (
    <div className="grid gap-2">
    <AlertDialog open={open} onOpenChange={(nextOpen) => {
      if (disabled && !nextOpen) return;
      if (!nextOpen && !focusAfterCloseRef.current) focusAfterCloseRef.current = "trigger";
      setOpen(nextOpen);
    }}>
      <AlertDialogTrigger asChild>
        <Button className="min-h-11 w-fit" disabled={disabled} ref={triggerRef} type="button" variant={variant}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent aria-busy={disabled} onCloseAutoFocus={(event) => {
        const target = focusAfterCloseRef.current;
        if (!target) return;
        event.preventDefault();
        focusAfterCloseRef.current = null;
        requestAnimationFrame(() => {
          if (target === "field") focusAfterSubmitRef.current?.focus();
          else if (target === "result") resultRef.current?.focus();
          else triggerRef.current?.focus();
        });
      }} ref={contentRef} tabIndex={-1}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" disabled={disabled}>Batal</AlertDialogCancel>
          <Button
            aria-busy={disabled}
            className="min-h-11"
            disabled={disabled}
            form={formId}
            name="confirmation"
            type="submit"
            value="confirmed"
            variant={variant}
          >
            {disabled ? "Memproses…" : children}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}

export function ProvisionTenantForm({ auditState = initialState, initialAttemptId }: { auditState?: PlatformTenantLifecycleState; initialAttemptId: string }) {
  const [state, action, pending] = useActionState(submitPlatformTenantLifecycle, auditState);
  const attemptId = state.nextAttemptId ?? initialAttemptId;
  const formId = "provision-tenant-form";
  const nameRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  return (
    <section aria-labelledby="provision-tenant-title" className="grid gap-3">
      <div>
        <h2 className="font-semibold" id="provision-tenant-title">Siklus tenant</h2>
        <p className="text-sm leading-6 text-muted-foreground">Provision tenant baru sebelum meninjau daftar operasional.</p>
      </div>
      <ActionOutcome resultRef={resultRef} state={state} />
      <details className="rounded-xl border bg-card" open={state.outcome === "invalid" || state.outcome === "error"}>
        <summary className="min-h-11 cursor-pointer content-center px-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          Provisioning tenant
        </summary>
        <form action={action} aria-busy={pending} className="grid gap-4 border-t p-4" id={formId} noValidate>
          <input name="attemptId" type="hidden" value={attemptId} />
          <input name="lifecycleAction" type="hidden" value="create" />
          <div className="grid max-w-2xl gap-2">
            <Label htmlFor="tenant-name">Nama tenant</Label>
            <CharacterClassInput
              aria-describedby={state.errors?.tenantName ? "tenant-name-error" : undefined}
              aria-invalid={Boolean(state.errors?.tenantName)}
              autoComplete="organization"
              characterClass="BUSINESS_NAME"
              className="min-h-11"
              defaultValue={state.values?.name ?? ""}
              id="tenant-name"
              maxLength={120}
              name="tenantName"
              ref={nameRef}
              required
            />
            {state.errors?.tenantName ? <p className="text-sm text-destructive" id="tenant-name-error">{state.errors.tenantName}</p> : null}
            <p className="text-sm text-muted-foreground">Tenant dibuat aktif dan hasilnya dicatat pada jejak audit.</p>
          </div>
          <ConfirmAction
            description="Tenant aktif baru akan dibuat dan langsung tersedia untuk konfigurasi. Tindakan ini tercatat pada jejak audit."
            disabled={pending}
            error={state.errors?.confirmation}
            fieldHasError={Boolean(state.errors?.tenantName)}
            formId={formId}
            focusAfterSubmitRef={nameRef}
            resultRef={resultRef}
            resultToken={state.resultToken}
            title="Provision tenant baru?"
          >
            Provisioning tenant
          </ConfirmAction>
        </form>
      </details>
    </section>
  );
}

export function TenantLifecycleControls({ auditState = initialState, initialAttemptId, tenantId, tenantName, status }: { auditState?: PlatformTenantLifecycleState; initialAttemptId: string; tenantId: string; tenantName: string; status: string }) {
  const [state, action, pending] = useActionState(submitPlatformTenantLifecycle, auditState);
  const attemptId = state.nextAttemptId ?? initialAttemptId;
  const confirmationRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  if (status !== "ACTIVE" && status !== "SUSPENDED") {
    return (
      <section aria-labelledby="tenant-lifecycle-title" className="grid gap-2 rounded-xl border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold" id="tenant-lifecycle-title">Siklus tenant</h2>
          <Badge variant="outline">{status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Tidak ada perubahan status yang tersedia untuk status tenant saat ini.</p>
      </section>
    );
  }

  const suspending = status === "ACTIVE";
  const actionName = suspending ? "suspend" : "reactivate";
  const actionLabel = suspending ? "Tangguhkan tenant" : "Aktifkan kembali tenant";
  const hintId = `confirmation-hint-${tenantId}`;
  const inputId = "tenant-confirmation-name";
  const formId = `tenant-lifecycle-form-${tenantId}`;

  return (
    <section aria-labelledby="tenant-lifecycle-title" className="grid gap-3">
      <div className="grid gap-1 rounded-xl border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold" id="tenant-lifecycle-title">Siklus tenant</h2>
          <Badge variant={suspending ? "secondary" : "destructive"}>{suspending ? "Aktif" : "Ditangguhkan"}</Badge>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          {suspending ? "Penangguhan memblokir operasi tenant sampai tenant diaktifkan kembali." : "Aktivasi kembali membuka otorisasi operasional tenant."}
        </p>
      </div>
      <ActionOutcome resultRef={resultRef} state={state} />
      <details className="rounded-xl border bg-card" open={state.outcome === "invalid" || state.outcome === "error"}>
        <summary className="min-h-11 cursor-pointer content-center px-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          {actionLabel}
        </summary>
        <form action={action} aria-busy={pending} className="grid gap-4 border-t p-4" id={formId} noValidate>
          <input name="attemptId" type="hidden" value={attemptId} />
          <input name="lifecycleAction" type="hidden" value={actionName} />
          <input name="tenantId" type="hidden" value={tenantId} />
          <div className="grid max-w-2xl gap-2">
            <Label htmlFor={inputId}>Ketik nama tenant untuk mengonfirmasi</Label>
            <Input
              aria-describedby={`${hintId}${state.errors?.confirmationName ? ` ${inputId}-error` : ""}`}
              aria-invalid={Boolean(state.errors?.confirmationName)}
              autoComplete="off"
              className="min-h-11"
              defaultValue={state.values?.expectedName ?? ""}
              id={inputId}
              maxLength={120}
              name="confirmationName"
              ref={confirmationRef}
              required
            />
            {state.errors?.confirmationName ? <p className="text-sm text-destructive" id={`${inputId}-error`}>{state.errors.confirmationName}</p> : null}
            <small className="text-sm text-muted-foreground" id={hintId}>Ketik persis: {tenantName}</small>
          </div>
          <ConfirmAction
            description={suspending ? `Semua operasi ${tenantName} akan diblokir sampai tenant diaktifkan kembali.` : `Otorisasi operasional ${tenantName} akan dibuka kembali.`}
            disabled={pending}
            error={state.errors?.confirmation}
            fieldHasError={Boolean(state.errors?.confirmationName)}
            formId={formId}
            focusAfterSubmitRef={confirmationRef}
            resultRef={resultRef}
            resultToken={state.resultToken}
            title={`${actionLabel}?`}
            variant={suspending ? "destructive" : "default"}
          >
            {actionLabel}
          </ConfirmAction>
        </form>
      </details>
    </section>
  );
}
