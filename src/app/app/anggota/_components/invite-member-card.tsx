"use client";

import { Send } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { inviteMemberAction } from "@/app/app/anggota/actions";
import { DataCard } from "@/components/app/data-card";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ActionMessage } from "./member-access-dialog";

const FORM_ID = "member-invite-form";

/** Undang anggota: its submit sits in the card footer, tied to the form by `form=`. */
export function InviteMemberCard({ attemptId }: { attemptId: string }) {
  const [state, formAction, pending] = useActionState(inviteMemberAction, { nextAttemptId: attemptId });
  const emailRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const emailError = state.errors?.email;
  const roleError = state.errors?.role;

  useEffect(() => {
    if (!state.resultToken) return;
    if (emailError) emailRef.current?.focus();
    else resultRef.current?.focus();
  }, [emailError, state.resultToken]);

  return (
    <DataCard
      description="Beri akses gerai kepada akun GeraiCUAN yang sudah aktif."
      footer={(
        <Button disabled={pending} form={FORM_ID} type="submit">
          <Send aria-hidden="true" data-icon="inline-start" />
          {pending ? "Mengundang…" : "Undang anggota"}
        </Button>
      )}
      title="Undang anggota"
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4" id={FORM_ID} noValidate>
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
        <Field data-invalid={Boolean(roleError)}>
          <FieldLabel htmlFor="member-invite-role">Peran awal</FieldLabel>
          <Select
            defaultValue={state.values?.role ?? "OPERATOR"}
            disabled={pending}
            key={`${state.resultToken ?? "initial"}-role`}
            name="role"
          >
            <SelectTrigger aria-invalid={Boolean(roleError)} className="w-full" id="member-invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPERATOR">Operator — buat kiriman dan cetak resi</SelectItem>
              <SelectItem value="TENANT_ADMIN">Pemilik gerai — juga laporan, pengaturan, dan anggota</SelectItem>
            </SelectContent>
          </Select>
          <FieldError>{roleError}</FieldError>
        </Field>
        <div className="outline-none" ref={resultRef} tabIndex={-1}>
          <ActionMessage state={state} />
        </div>
      </form>
    </DataCard>
  );
}
