"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronDown, UserPlus } from "lucide-react";

import { changeMemberRoleAction, deactivateMemberAction, inviteMemberAction, type MemberActionState } from "@/app/app/anggota/actions";
import { SettingsCard } from "@/components/cms/settings-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { TenantMemberRole } from "@/db/member-governance-repository";

/** The invite card's footer button submits this form from outside it (PR-46 footer actions). */
const INVITE_FORM_ID = "member-invite-form";

const selectClassName = "min-h-11 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive";

function ActionMessage({ resultRef, state }: { resultRef: React.RefObject<HTMLDivElement | null>; state: MemberActionState }) {
  if (!state.message) return null;
  const isError = state.status === "error";
  return (
    <Alert aria-live={isError ? "assertive" : "polite"} ref={resultRef} role={isError ? "alert" : "status"} tabIndex={-1} variant={isError ? "destructive" : "default"}>
      <AlertTitle>{isError ? "Tindakan belum selesai" : "Perubahan tersimpan"}</AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

export function InviteMemberHeaderAction() {
  return (
    <Button
      className="min-h-11 md:min-h-8"
      onClick={() => {
        // The invite form is an always-visible settings section: bring its heading into
        // view, then move keyboard focus to the first field so the action is not scroll-only.
        document.getElementById("invite-member-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
        document.getElementById("member-invite-email")?.focus({ preventScroll: true });
      }}
      type="button"
      variant="outline"
    >
      <UserPlus aria-hidden="true" />
      Undang anggota
    </Button>
  );
}

export function InviteMemberForm({ attemptId }: { attemptId: string }) {
  const [state, formAction, pending] = useActionState(inviteMemberAction, { nextAttemptId: attemptId });
  const emailRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLSelectElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const emailError = state.errors?.email;
  const roleError = state.errors?.role;

  useEffect(() => {
    if (!state.resultToken) return;
    if (emailError) emailRef.current?.focus();
    else if (roleError) roleRef.current?.focus();
    else resultRef.current?.focus();
  }, [emailError, roleError, state.resultToken]);

  return (
    <SettingsCard
      description="Berikan akses tenant kepada akun GeraiCUAN yang sudah aktif."
      footer={
        <Button className="min-h-11 md:min-h-9" disabled={pending} form={INVITE_FORM_ID} type="submit">
          {pending ? "Memproses undangan…" : "Undang anggota"}
        </Button>
      }
      id="invite-member-title"
      title="Undang anggota"
    >
    <form action={formAction} aria-busy={pending} className="grid gap-4" id={INVITE_FORM_ID} noValidate>
      <input name="attemptId" type="hidden" value={state.nextAttemptId ?? attemptId} />
      <FieldSet disabled={pending}>
        <FieldGroup>
          <Field data-invalid={Boolean(emailError)}>
            <FieldLabel htmlFor="member-invite-email">Email akun GeraiCUAN</FieldLabel>
            <Input aria-describedby={emailError ? "member-invite-email-error" : "member-invite-email-help"} aria-invalid={Boolean(emailError)} autoComplete="email" className="max-w-2xl min-h-11" defaultValue={state.values?.email ?? ""} id="member-invite-email" key={`${state.resultToken ?? "initial"}-email`} maxLength={254} name="email" ref={emailRef} type="email" />
            <FieldDescription className="max-w-2xl" id="member-invite-email-help">Gunakan email akun aktif yang belum menjadi anggota tenant lain.</FieldDescription>
            <FieldError id="member-invite-email-error">{emailError}</FieldError>
          </Field>
          <Field data-invalid={Boolean(roleError)}>
            <FieldLabel htmlFor="member-invite-role">Peran awal</FieldLabel>
            <select aria-describedby={roleError ? "member-invite-role-error member-invite-role-help" : "member-invite-role-help"} aria-invalid={Boolean(roleError)} className={`${selectClassName} sm:max-w-xs`} defaultValue={state.values?.role ?? "OPERATOR"} id="member-invite-role" key={`${state.resultToken ?? "initial"}-role`} name="role" ref={roleRef}>
              <option value="OPERATOR">Operator</option>
              <option value="TENANT_ADMIN">Tenant Admin</option>
            </select>
            <FieldDescription id="member-invite-role-help">
              Operator mengelola kiriman. Tenant Admin juga mengelola outlet dan akses anggota.
            </FieldDescription>
            <FieldError id="member-invite-role-error">{roleError}</FieldError>
          </Field>
        </FieldGroup>
      </FieldSet>
      <ActionMessage resultRef={resultRef} state={state} />
    </form>
    </SettingsCard>
  );
}

type MemberControlsProps = {
  deactivateAttemptId: string;
  isCurrentUser: boolean;
  isLastActiveAdmin: boolean;
  membershipId: string;
  name: string;
  role: TenantMemberRole;
  roleAttemptId: string;
  status: "ACTIVE" | "SUSPENDED";
};

export function MemberControls({ deactivateAttemptId, isCurrentUser, isLastActiveAdmin, membershipId, name, role, roleAttemptId, status }: MemberControlsProps) {
  const [roleState, roleAction, rolePending] = useActionState(changeMemberRoleAction, { nextAttemptId: roleAttemptId });
  const [deactivateState, deactivateAction, deactivatePending] = useActionState(deactivateMemberAction, { nextAttemptId: deactivateAttemptId });
  const roleRef = useRef<HTMLSelectElement>(null);
  const roleTriggerRef = useRef<HTMLButtonElement>(null);
  const roleResultRef = useRef<HTMLDivElement>(null);
  const deactivateTriggerRef = useRef<HTMLButtonElement>(null);
  const deactivateResultRef = useRef<HTMLDivElement>(null);
  const roleFocusAfterCloseRef = useRef<"field" | "result" | null>(null);
  const deactivateResultAfterCloseRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<TenantMemberRole>(roleState.values?.role ?? role);
  const suffix = membershipId.replaceAll("-", "");
  const roleFormId = `member-role-form-${suffix}`;
  const deactivateFormId = `member-deactivate-form-${suffix}`;

  useEffect(() => {
    if (!roleState.resultToken) return;
    roleFocusAfterCloseRef.current = roleState.errors?.role ? "field" : "result";
    const frame = window.requestAnimationFrame(() => {
      setExpanded(true);
      setRoleDialogOpen(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [roleState.errors?.role, roleState.resultToken]);

  useEffect(() => {
    if (!deactivateState.resultToken) return;
    deactivateResultAfterCloseRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      setExpanded(true);
      setDeactivateDialogOpen(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [deactivateState.resultToken, status]);

  if (status === "SUSPENDED") {
    return (
      <div className="grid gap-3">
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground" role="status">Akses nonaktif. Undang ulang email ini untuk mengaktifkan kembali.</p>
        <ActionMessage resultRef={deactivateResultRef} state={deactivateState} />
      </div>
    );
  }
  if (isCurrentUser) {
    return <p className="text-sm leading-6 text-muted-foreground" role="status">{isLastActiveAdmin ? "Tenant Admin aktif terakhir. Peran dan akses akun ini dilindungi." : "Peran dan status akun Anda harus diubah oleh Tenant Admin aktif lain."}</p>;
  }

  return (
    <Collapsible className="grid gap-3" onOpenChange={setExpanded} open={expanded}>
      <CollapsibleTrigger asChild>
        <Button aria-label={`Kelola akses ${name}`} className="group min-h-11 justify-between max-sm:w-full sm:w-fit" size="sm" type="button" variant="outline">
          Kelola akses
          <ChevronDown aria-hidden="true" className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-5 rounded-md border bg-muted/30 p-4 lg:grid-cols-2">
        <form action={roleAction} aria-busy={rolePending} className="grid content-start gap-4" id={roleFormId} noValidate>
          <input name="attemptId" type="hidden" value={roleState.nextAttemptId ?? roleAttemptId} />
          <input name="membershipId" type="hidden" value={membershipId} />
          <FieldSet disabled={rolePending}>
            <FieldLegend>Ubah peran</FieldLegend>
            <FieldDescription>Pilih akses yang diperlukan anggota ini.</FieldDescription>
            <FieldGroup className="gap-4">
              <Field data-invalid={Boolean(roleState.errors?.role)}>
                <FieldLabel htmlFor={`member-role-${suffix}`}>Peran {name}</FieldLabel>
                <select aria-describedby={roleState.errors?.role ? `member-role-error-${suffix}` : undefined} aria-invalid={Boolean(roleState.errors?.role)} className={selectClassName} id={`member-role-${suffix}`} name="role" onChange={(event) => setSelectedRole(event.target.value as TenantMemberRole)} ref={roleRef} value={selectedRole}>
                  <option value="OPERATOR">Operator</option><option value="TENANT_ADMIN">Tenant Admin</option>
                </select>
                <FieldError id={`member-role-error-${suffix}`}>{roleState.errors?.role}</FieldError>
              </Field>
              <AlertDialog onOpenChange={setRoleDialogOpen} open={roleDialogOpen}>
                <AlertDialogTrigger asChild><Button className="min-h-11" disabled={rolePending || selectedRole === role} ref={roleTriggerRef} type="button" variant="outline">Tinjau perubahan</Button></AlertDialogTrigger>
                <AlertDialogContent onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  const target = roleFocusAfterCloseRef.current === "field"
                    ? roleRef.current
                    : roleFocusAfterCloseRef.current === "result"
                      ? roleResultRef.current
                      : roleTriggerRef.current;
                  roleFocusAfterCloseRef.current = null;
                  window.requestAnimationFrame(() => target?.focus());
                }}>
                  <AlertDialogHeader><AlertDialogTitle>Ubah peran {name} menjadi {selectedRole === "TENANT_ADMIN" ? "Tenant Admin" : "Operator"}?</AlertDialogTitle><AlertDialogDescription>Izin baru berlaku pada permintaan CMS berikutnya dan perubahan ini dicatat di jejak audit.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel className="min-h-11" disabled={rolePending}>Batalkan</AlertDialogCancel><Button className="min-h-11" disabled={rolePending} form={roleFormId} name="confirmation" type="submit" value="CONFIRM_ROLE_CHANGE">{rolePending ? "Menyimpan…" : "Ubah peran"}</Button></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </FieldGroup>
          </FieldSet>
          <ActionMessage resultRef={roleResultRef} state={roleState} />
        </form>
        <form action={deactivateAction} aria-busy={deactivatePending} className="grid content-start gap-4 lg:border-l lg:pl-5" id={deactivateFormId} noValidate>
          <input name="attemptId" type="hidden" value={deactivateState.nextAttemptId ?? deactivateAttemptId} /><input name="membershipId" type="hidden" value={membershipId} />
          <FieldSet disabled={deactivatePending}>
            <FieldLegend>Nonaktifkan akses</FieldLegend>
            <FieldDescription>{role === "TENANT_ADMIN" ? "Tenant Admin hanya dapat dinonaktifkan jika admin aktif lain tetap tersedia." : "Anggota tidak dapat memakai CMS tenant setelah tindakan ini selesai."}</FieldDescription>
            <AlertDialog onOpenChange={setDeactivateDialogOpen} open={deactivateDialogOpen}>
              <AlertDialogTrigger asChild><Button className="mt-4 min-h-11 w-full" disabled={deactivatePending} ref={deactivateTriggerRef} type="button" variant="destructive">Nonaktifkan anggota</Button></AlertDialogTrigger>
              <AlertDialogContent onCloseAutoFocus={(event) => {
                event.preventDefault();
                const target = deactivateResultAfterCloseRef.current ? deactivateResultRef.current : deactivateTriggerRef.current;
                deactivateResultAfterCloseRef.current = false;
                window.requestAnimationFrame(() => target?.focus());
              }}>
                <AlertDialogHeader><AlertDialogTitle>Nonaktifkan akses {name}?</AlertDialogTitle><AlertDialogDescription>{name} tidak akan dapat memakai CMS tenant. Keanggotaan dapat diaktifkan kembali melalui undangan baru.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel className="min-h-11" disabled={deactivatePending}>Batalkan</AlertDialogCancel><Button className="min-h-11" disabled={deactivatePending} form={deactivateFormId} name="confirmation" type="submit" value="CONFIRM_DEACTIVATE" variant="destructive">{deactivatePending ? "Menonaktifkan…" : `Nonaktifkan ${name}`}</Button></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </FieldSet>
          <ActionMessage resultRef={deactivateResultRef} state={deactivateState} />
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}
