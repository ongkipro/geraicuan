"use client";

import { NotebookPen } from "lucide-react";
import { useActionState, useState } from "react";

import { savePickupPointNotes, type PickupNotesActionState } from "@/app/app/pengaturan/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PICKUP_NOTE_LIMITS, type PickupNotes } from "@/lib/gerai-settings";

export const INTERNAL_NOTE_LABEL = "Catatan internal, tidak dikirim ke Mengantar";

const ROWS: { key: keyof PickupNotes; label: string }[] = [
  { key: "picName", label: "Nama PIC" },
  { key: "picPhone", label: "WhatsApp PIC" },
  { key: "schedule", label: "Jadwal penjemputan" },
  { key: "accessNote", label: "Petunjuk untuk kurir" },
];

/**
 * T-243 Titik pickup: the gerai team's own notes on a pickup point (PIC, jadwal rutin,
 * instruksi akses driver). Stored on the point, shown on its card, never put in a
 * Mengantar request — the pickup itself is still Mengantar's own address.
 */
export function PickupNotesBlock({ busy, notes, outletId, pickupAddressId, pickupLabel }: {
  busy: boolean;
  notes: PickupNotes;
  outletId: string;
  pickupAddressId: string;
  pickupLabel: string;
}) {
  const [state, action, pending] = useActionState<PickupNotesActionState, FormData>(savePickupPointNotes, {});
  const [open, setOpen] = useState(false);
  // Controlled: React resets a form after its action, which would drop what was typed on a refusal.
  const [values, setValues] = useState(() => ({
    accessNote: notes.accessNote ?? "",
    picName: notes.picName ?? "",
    picPhone: notes.picPhone ?? "",
    schedule: notes.schedule ?? "",
  }));
  const bind = (key: keyof PickupNotes) => ({
    name: key,
    onChange: (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value })),
    value: values[key],
  });
  const [seen, setSeen] = useState(state.resultToken);
  if (state.resultToken !== seen) {
    setSeen(state.resultToken);
    if (state.success) setOpen(false);
  }
  const filled = ROWS.filter((row) => notes[row.key]);
  const errors = state.errors ?? {};

  return (
    <div className="mt-2 grid gap-2 rounded-xl bg-tile p-4">
      <p className="text-xs font-medium text-muted-foreground">{INTERNAL_NOTE_LABEL}</p>
      {filled.length > 0 ? (
        <dl className="grid gap-1 text-sm">
          {filled.map((row) => (
            <div className="grid gap-x-3 sm:grid-cols-[10rem_minmax(0,1fr)]" key={row.key}>
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className={row.key === "picPhone" ? "tabular-nums" : "wrap-anywhere"}>{notes[row.key]}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Belum ada PIC, jadwal, atau petunjuk untuk kurir.</p>
      )}
      {state.success && !open ? <p className="text-xs text-muted-foreground" role="status">{state.message}</p> : null}
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger asChild>
          <Button className="justify-self-start px-0" disabled={busy} type="button" variant="link">
            <NotebookPen aria-hidden="true" />
            {filled.length > 0 ? "Ubah catatan" : "Tambah catatan"}
          </Button>
        </DialogTrigger>
        <DialogContent className="gap-6 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Catatan titik pickup</DialogTitle>
            <DialogDescription>{pickupLabel} · {INTERNAL_NOTE_LABEL}.</DialogDescription>
          </DialogHeader>
          <form action={action} className="grid gap-4" noValidate>
            <input name="outletId" type="hidden" value={outletId} />
            <input name="pickupAddressId" type="hidden" value={pickupAddressId} />
            {state.message && !state.success ? (
              <Alert role="alert" variant="destructive"><AlertDescription>{state.message}</AlertDescription></Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.picName)}>
                <FieldLabel htmlFor={`pic-name-${pickupAddressId}`}>Nama PIC</FieldLabel>
                <Input aria-invalid={Boolean(errors.picName)} {...bind("picName")} id={`pic-name-${pickupAddressId}`} maxLength={PICKUP_NOTE_LIMITS.picName} />
                {errors.picName ? <FieldError>{errors.picName}</FieldError> : null}
              </Field>
              <Field data-invalid={Boolean(errors.picPhone)}>
                <FieldLabel htmlFor={`pic-phone-${pickupAddressId}`}>WhatsApp PIC</FieldLabel>
                <Input
                  aria-invalid={Boolean(errors.picPhone)}
                  autoComplete="off"
                  {...bind("picPhone")}
                  id={`pic-phone-${pickupAddressId}`}
                  inputMode="tel"
                  maxLength={PICKUP_NOTE_LIMITS.picPhone}
                  placeholder="0812 3456 7890"
                  type="tel"
                />
                {errors.picPhone ? <FieldError>{errors.picPhone}</FieldError> : null}
              </Field>
            </div>
            <Field data-invalid={Boolean(errors.schedule)}>
              <FieldLabel htmlFor={`pic-schedule-${pickupAddressId}`}>Jadwal penjemputan</FieldLabel>
              <Input
                aria-invalid={Boolean(errors.schedule)}
                {...bind("schedule")}
                id={`pic-schedule-${pickupAddressId}`}
                maxLength={PICKUP_NOTE_LIMITS.schedule}
                placeholder="Contoh: Senin–Sabtu 11.30 dan 17.00 WIB"
              />
              {errors.schedule ? <FieldError>{errors.schedule}</FieldError> : null}
            </Field>
            <Field data-invalid={Boolean(errors.accessNote)}>
              <FieldLabel htmlFor={`pic-access-${pickupAddressId}`}>Petunjuk untuk kurir</FieldLabel>
              <Textarea
                aria-invalid={Boolean(errors.accessNote)}
                {...bind("accessNote")}
                id={`pic-access-${pickupAddressId}`}
                maxLength={PICKUP_NOTE_LIMITS.accessNote}
                placeholder="Contoh: Masuk lewat pintu samping, hubungi PIC sebelum tiba."
                rows={3}
              />
              {errors.accessNote ? <FieldError>{errors.accessNote}</FieldError> : null}
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={pending} type="button" variant="outline">Batal</Button>
              </DialogClose>
              <Button disabled={pending} type="submit">{pending ? "Menyimpan…" : "Simpan catatan"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
