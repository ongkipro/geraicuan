"use client";

import { useActionState, useState } from "react";

import { changeMemberRoleAction, deactivateMemberAction, type MemberActionState } from "@/app/app/anggota/actions";
import { ROLE_LABEL } from "@/app/app/pengaturan/_components/settings-logic";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

import { type MemberRole, RoleChoice } from "./role-choice";

type Role = MemberRole;

export function ActionMessage({ state }: { state: MemberActionState }) {
  if (!state.message) return null;
  const failed = state.status === "error";
  return (
    <Alert role={failed ? "alert" : "status"} variant={failed ? "destructive" : "default"}>
      <AlertTitle>{failed ? "Tindakan belum selesai" : "Perubahan tersimpan"}</AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

/**
 * "Kelola akses" for one member: change the role (the dialog's submit carries the confirmation
 * and states the consequence) and deactivate behind its own AlertDialog. The dialog stays
 * mounted after the row changes, so the outcome is still readable when it closes the access.
 */
export function MemberAccessDialog({
  deactivateAttemptId,
  email,
  manageable,
  membershipId,
  name,
  note,
  role,
  roleAttemptId,
}: {
  deactivateAttemptId: string;
  email: string;
  manageable: boolean;
  membershipId: string;
  name: string;
  /** Why the member cannot be managed from here (shown instead of the button). */
  note: string | null;
  role: Role;
  roleAttemptId: string;
}) {
  const [roleState, roleAction, rolePending] = useActionState(changeMemberRoleAction, { nextAttemptId: roleAttemptId });
  const [deactivateState, deactivateAction, deactivatePending] = useActionState(deactivateMemberAction, { nextAttemptId: deactivateAttemptId });
  const [open, setOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>(role);
  const suffix = membershipId.replaceAll("-", "");
  const roleFormId = `member-role-${suffix}`;
  const deactivateFormId = `member-deactivate-${suffix}`;
  const [seenDeactivateToken, setSeenDeactivateToken] = useState(deactivateState.resultToken);
  const changed = selectedRole !== role;

  // The confirmation stays open (showing progress) until the server answers, then closes.
  if (deactivateState.resultToken !== seenDeactivateToken) {
    setSeenDeactivateToken(deactivateState.resultToken);
    setConfirmDeactivate(false);
  }
  const busy = rolePending || deactivatePending;

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      {manageable ? (
        <DialogTrigger asChild>
          <Button aria-label={`Kelola akses ${name}`} className="px-0" type="button" variant="link">Kelola akses</Button>
        </DialogTrigger>
      ) : (
        <span className="text-xs text-muted-foreground">{note}</span>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kelola akses {name}</DialogTitle>
          <DialogDescription className="wrap-anywhere">{email}</DialogDescription>
        </DialogHeader>

        <form action={roleAction} aria-busy={rolePending} className="flex flex-col gap-4" id={roleFormId} noValidate>
          <input name="attemptId" type="hidden" value={roleState.nextAttemptId ?? roleAttemptId} />
          <input name="membershipId" type="hidden" value={membershipId} />
          <RoleChoice
            disabled={busy || !manageable}
            error={roleState.errors?.role}
            key={roleState.resultToken ?? "initial"}
            legend="Peran"
            onChange={setSelectedRole}
            value={selectedRole}
          />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {changed
              ? `${name} menjadi ${ROLE_LABEL[selectedRole]}. Izin baru berlaku pada permintaan berikutnya dan dicatat di jejak audit.`
              : "Pilih peran lain untuk mengubah akses."}
          </p>
          <ActionMessage state={roleState} />
        </form>
        <div className="flex justify-end">
          <Button
            disabled={busy || !changed || !manageable}
            form={roleFormId}
            name="confirmation"
            type="submit"
            value="CONFIRM_ROLE_CHANGE"
          >
            {rolePending ? "Menyimpan…" : `Ubah peran ke ${ROLE_LABEL[selectedRole]}`}
          </Button>
        </div>

        <Separator />

        <form action={deactivateAction} aria-busy={deactivatePending} className="flex flex-col gap-3" id={deactivateFormId} noValidate>
          <input name="attemptId" type="hidden" value={deactivateState.nextAttemptId ?? deactivateAttemptId} />
          <input name="membershipId" type="hidden" value={membershipId} />
          <p className="text-sm font-semibold">Nonaktifkan akses</p>
          <p className="text-sm text-muted-foreground">
            {role === "TENANT_ADMIN"
              ? "Pemilik gerai hanya dapat dinonaktifkan selama pemilik gerai aktif lain tetap ada."
              : "Anggota tidak dapat masuk ke gerai ini sampai diundang ulang."}
          </p>
          <AlertDialog onOpenChange={setConfirmDeactivate} open={confirmDeactivate}>
            <AlertDialogTrigger asChild>
              <Button className="self-start max-sm:w-full" disabled={busy || !manageable} type="button" variant="destructive">
                Nonaktifkan {name}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Nonaktifkan akses {name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {name} tidak dapat lagi masuk ke gerai ini. Akses dapat dipulihkan dengan undangan baru ke {email}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deactivatePending}>Batal</AlertDialogCancel>
                <Button
                  disabled={deactivatePending}
                  form={deactivateFormId}
                  name="confirmation"
                  type="submit"
                  value="CONFIRM_DEACTIVATE"
                  variant="destructive"
                >
                  {deactivatePending ? "Menonaktifkan…" : `Nonaktifkan ${name}`}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <ActionMessage state={deactivateState} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
