"use client";

import { Lock } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import type { ShipmentPrefixActionState } from "@/app/app/pengaturan/actions";
import { SettingsCard } from "@/components/cms/settings-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { normalizeShipmentPrefixInput } from "@/lib/shipment-number";

type ShipmentPrefixFormProps = {
  action: (previous: ShipmentPrefixActionState, formData: FormData) => Promise<ShipmentPrefixActionState>;
  attemptId: string;
  lockedAtLabel: string | null;
  prefix: string;
  suggestedPrefix: string;
};

export function ShipmentPrefixForm({ action, attemptId, lockedAtLabel, prefix, suggestedPrefix }: ShipmentPrefixFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  // After a Super Admin unlock the current prefix is the sensible starting point.
  const [value, setValue] = useState(prefix === "GC" ? suggestedPrefix : prefix);
  const [confirming, setConfirming] = useState(false);

  const resultRef = useRef<HTMLDivElement>(null);
  const normalized = normalizeShipmentPrefixInput(value);

  useEffect(() => {
    if (state.resultToken) resultRef.current?.focus();
  }, [state.resultToken]);

  const description = "Tampil di depan setiap nomor kiriman, di layar, ekspor, dan label resi. Hanya dapat diatur sekali.";

  if (lockedAtLabel || state.savedPrefix) {
    const lockedPrefix = state.savedPrefix ?? prefix;
    return (
      <SettingsCard
        badge={<Badge variant="secondary">Terkunci</Badge>}
        description={description}
        id="shipment-prefix-title"
        title="Awalan nomor kiriman"
      >
        <div className="grid gap-3" ref={resultRef} role="status" tabIndex={-1}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Lock aria-hidden="true" className="size-4 text-muted-foreground" />
            Awalan terkunci: <span className="font-mono text-base">{lockedPrefix}-</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Contoh nomor: <span className="font-mono">{lockedPrefix}-10013</span>.{" "}
            {lockedAtLabel && !state.savedPrefix ? `Dikunci ${lockedAtLabel}. ` : "Baru saja dikunci. "}
            Hubungi Super Admin bila awalan perlu diperbaiki.
          </p>
        </div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      description={description}
      footer={
        <Button
          className="min-h-11 md:min-h-9"
          disabled={!normalized || pending}
          form="shipment-prefix-form"
          type="submit"
        >
          {pending ? "Menyimpan…" : "Simpan dan kunci awalan"}
        </Button>
      }
      id="shipment-prefix-title"
      title="Awalan nomor kiriman"
    >
      <form
        action={formAction}
        className="grid gap-4"
        id="shipment-prefix-form"
        onSubmit={(event) => {
          // Only the dialog's confirm button carries confirmation=locked; any other submit opens the dialog.
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          if (submitter?.getAttribute("name") !== "confirmation") {
            event.preventDefault();
            if (normalized) setConfirming(true);
          }
        }}
      >
        <input name="attemptId" type="hidden" value={attemptId} />
        {state.error ? (
          <Alert ref={resultRef} role="alert" tabIndex={-1} variant="destructive">
            <AlertTitle>Awalan belum tersimpan</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={value !== "" && !normalized}>
          <FieldLabel htmlFor="shipment-prefix">Awalan</FieldLabel>
          <Input
            aria-describedby="shipment-prefix-help"
            autoCapitalize="characters"
            autoComplete="off"
            className="min-h-11 max-w-40 font-mono uppercase md:min-h-9"
            id="shipment-prefix"
            maxLength={5}
            name="prefix"
            onChange={(event) => setValue(event.target.value.toUpperCase())}
            spellCheck={false}
            value={value}
          />
          <FieldDescription id="shipment-prefix-help">
            2–5 huruf besar atau angka. Saran dari nama tenant: <span className="font-mono">{suggestedPrefix}</span>. Saat ini dipakai: <span className="font-mono">{prefix}-</span>.
          </FieldDescription>
          {value !== "" && !normalized ? <FieldError>Gunakan 2–5 huruf besar atau angka tanpa spasi.</FieldError> : null}
        </Field>
        <p className="text-sm">
          Pratinjau: <span className="font-mono font-semibold">{normalized ?? "—"}-10013</span>
        </p>
        <AlertDialog onOpenChange={setConfirming} open={confirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Kunci awalan {normalized}-?</AlertDialogTitle>
              <AlertDialogDescription>
                Semua nomor kiriman tenant ini, termasuk yang sudah ada, akan tampil sebagai {normalized}-nomor. Setelah disimpan awalan tidak dapat diubah lagi dari Pengaturan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11">Batal</AlertDialogCancel>
              <Button className="min-h-11" form="shipment-prefix-form" name="confirmation" onClick={() => setConfirming(false)} type="submit" value="locked">
                Ya, kunci awalan
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </form>
    </SettingsCard>
  );
}
