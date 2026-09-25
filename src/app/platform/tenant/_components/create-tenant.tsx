"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type RefObject } from "react";

import { submitPlatformTenantLifecycle, type PlatformTenantLifecycleState } from "@/app/platform/tenant/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CharacterClassInput } from "@/components/ui/character-class-input";
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

const initialState: PlatformTenantLifecycleState = {};

/**
 * "Buat tenant" (the page's one primary): a dialog with the tenant name. Submitting it is the
 * explicit confirmation `submitPlatformTenantLifecycle` requires; the result is announced on the
 * page, with a link to the new tenant.
 */
export function CreateTenant({ initialAttemptId }: { initialAttemptId: string }) {
  const [state, action, pending] = useActionState(submitPlatformTenantLifecycle, initialState);
  const [open, setOpen] = useState(false);
  // The dialog closes itself once the attempt it was opened for succeeds.
  const [openedFor, setOpenedFor] = useState<string | undefined>();
  const nameRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const attemptId = state.nextAttemptId ?? initialAttemptId;
  const nameError = state.errors?.tenantName;
  const otherError = state.outcome && state.outcome !== "success" && !nameError ? state.message : undefined;

  useEffect(() => {
    if (!state.resultToken) return;
    if (state.outcome === "success") {
      requestAnimationFrame(() => resultRef.current?.focus());
    } else if (nameError) nameRef.current?.focus();
  }, [nameError, state.outcome, state.resultToken]);

  return (
    <>
      <Dialog
        onOpenChange={(next) => {
          if (pending) return;
          if (next) setOpenedFor(state.resultToken);
          setOpen(next);
        }}
        open={open && !(state.outcome === "success" && state.resultToken !== openedFor)}
      >
        <DialogTrigger asChild>
          <Button type="button">
            <Plus aria-hidden="true" data-icon="inline-start" />
            Buat tenant
          </Button>
        </DialogTrigger>
        <DialogContent onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
          <form action={action} aria-busy={pending} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Buat tenant baru</DialogTitle>
              <DialogDescription>Tenant dibuat aktif dan tercatat di jejak audit.</DialogDescription>
            </DialogHeader>
            <input name="attemptId" type="hidden" value={attemptId} />
            <input name="lifecycleAction" type="hidden" value="create" />
            <input name="confirmation" type="hidden" value="confirmed" />
            <div className="flex flex-col gap-2">
              <Label htmlFor="tenant-name">Nama tenant</Label>
              <CharacterClassInput
                aria-describedby={nameError ? "tenant-name-error" : undefined}
                aria-invalid={nameError ? true : undefined}
                autoComplete="organization"
                characterClass="BUSINESS_NAME"
                defaultValue={state.values?.name ?? ""}
                id="tenant-name"
                maxLength={120}
                name="tenantName"
                ref={nameRef}
                required
              />
              {nameError ? <p className="text-sm font-medium text-destructive" id="tenant-name-error">{nameError}</p> : null}
            </div>
            {otherError ? <p className="text-sm font-medium text-destructive" role="alert">{otherError}</p> : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={pending} type="button" variant="outline">Batal</Button>
              </DialogClose>
              <Button disabled={pending} type="submit">{pending ? "Membuat…" : "Buat tenant"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {state.outcome === "success" && state.tenant ? (
        <CreatedNotice id={state.tenant.id} message={state.message ?? ""} name={state.tenant.name} resultRef={resultRef} />
      ) : null}
    </>
  );
}

function CreatedNotice({ id, message, name, resultRef }: { id: string; message: string; name: string; resultRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="fixed right-4 bottom-4 z-50 w-full max-w-sm outline-none" ref={resultRef} tabIndex={-1}>
      <Alert className="shadow-md" role="status">
        <AlertTitle>Tenant dibuat</AlertTitle>
        <AlertDescription className="grid gap-2">
          <p>{message}</p>
          <Link className="font-semibold text-primary" href={`/platform/tenant/${id}`}>Buka {name}</Link>
        </AlertDescription>
      </Alert>
    </div>
  );
}
