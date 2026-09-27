"use client";

import { UserPlus } from "lucide-react";
import { type ReactNode, useActionState, useEffect, useRef, useState } from "react";

import { inviteMemberAction, type MemberActionState } from "@/app/app/anggota/actions";
import { Button } from "@/components/ui/button";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { ActionMessage } from "./member-access-dialog";
import { type MemberRole, RoleChoice } from "./role-choice";

export const INVITE_FORM_ID = "member-invite-form";

/** The invite's "Peran awal"; remounted per result so it restarts from the submitted role. */
function InviteRole({ disabled, error, initial }: { disabled: boolean; error?: string; initial: MemberRole }) {
  const [role, setRole] = useState<MemberRole>(initial);
  return <RoleChoice disabled={disabled} error={error} legend="Peran awal" onChange={setRole} value={role} />;
}

/**
 * The invite form's fields (email, "Peran awal" cards, a failed result). Its submit sits in the
 * dialog footer, tied to the form by `form=`.
 */
export function InviteMemberForm({
  attemptId,
  formAction,
  pending,
  state,
}: {
  attemptId: string;
  formAction: (form: FormData) => void;
  pending: boolean;
  state: MemberActionState;
}) {
  const emailRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const emailError = state.errors?.email;
  const failed = state.status === "error";

  useEffect(() => {
    if (!state.resultToken || !failed) return;
    if (emailError) emailRef.current?.focus();
    else resultRef.current?.focus();
  }, [emailError, failed, state.resultToken]);

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-4" id={INVITE_FORM_ID} noValidate>
      <input name="attemptId" type="hidden" value={state.nextAttemptId ?? attemptId} />
      <Field data-invalid={Boolean(emailError)}>
        <FieldLabel htmlFor="member-invite-email">Email akun GeraiCUAN</FieldLabel>
        <Input
          aria-describedby={emailError ? "member-invite-email-error" : "member-invite-email-help"}
          aria-invalid={Boolean(emailError)}
          autoComplete="email"
          defaultValue={state.values?.email ?? ""}
          disabled={pending}
          id="member-invite-email"
          key={`${state.resultToken ?? "initial"}-email`}
          maxLength={254}
          name="email"
          placeholder="nama@gerai.com"
          ref={emailRef}
          type="email"
        />
        <FieldDescription id="member-invite-email-help">Akun aktif yang belum menjadi anggota gerai lain.</FieldDescription>
        <FieldError id="member-invite-email-error">{emailError}</FieldError>
      </Field>
      <InviteRole
        disabled={pending}
        error={state.errors?.role}
        initial={state.values?.role === "TENANT_ADMIN" ? "TENANT_ADMIN" : "OPERATOR"}
        key={`${state.resultToken ?? "initial"}-role`}
      />
      <div className="outline-none" ref={resultRef} tabIndex={-1}>
        {failed ? <ActionMessage state={state} /> : null}
      </div>
    </form>
  );
}

/**
 * T-256: the Anggota & akses section header — `children` (title and the page's one-line
 * explanation) with "Undang anggota", the page's filled primary, at the right. The invite opens
 * in a dialog; a refused invite keeps the dialog open with its errors, a successful one closes
 * it (focus returns to the button) and its result shows under the header.
 */
export function InviteMemberDialog({ attemptId, children }: { attemptId: string; children?: ReactNode }) {
  const [state, formAction, pending] = useActionState(inviteMemberAction, { nextAttemptId: attemptId });
  const [open, setOpen] = useState(false);
  const [handled, setHandled] = useState(state.resultToken);

  if (state.resultToken !== handled) {
    setHandled(state.resultToken);
    if (state.status === "success") setOpen(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">{children}</div>
        <Dialog onOpenChange={(next) => { if (!pending) setOpen(next); }} open={open}>
          <DialogTrigger asChild>
            <Button className="shrink-0 max-sm:w-full" type="button">
              <UserPlus aria-hidden="true" data-icon="inline-start" />
              Undang anggota
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl" onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
            <DialogHeader>
              <DialogTitle>Undang anggota</DialogTitle>
              <DialogDescription>Beri akses gerai ini ke akun GeraiCUAN yang sudah aktif. Peran bisa diubah nanti.</DialogDescription>
            </DialogHeader>
            <InviteMemberForm attemptId={attemptId} formAction={formAction} pending={pending} state={state} />
            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <Button disabled={pending} type="button" variant="outline">Batal</Button>
              </DialogClose>
              <Button disabled={pending} form={INVITE_FORM_ID} type="submit">
                {pending ? "Mengundang…" : "Undang anggota"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {state.status === "success" ? <ActionMessage state={state} /> : null}
    </div>
  );
}
