"use client";

import { Lock } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { saveShipmentPrefix, type ShipmentPrefixActionState } from "@/app/app/pengaturan/actions";
import { DataCard } from "@/components/app/data-card";
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
import { DEFAULT_SHIPMENT_PREFIX, normalizeShipmentPrefixInput } from "@/lib/shipment-number";

const FORM_ID = "shipment-prefix-form";
const TITLE = "Awalan nomor kiriman";
const DESCRIPTION = "Tampil di depan setiap nomor kiriman: di layar, file ekspor, dan label.";

/**
 * The one-time prefix lock. Only the dialog's confirm button carries `confirmation=locked`, so
 * a submit before hydration (or by Enter) opens the dialog or is refused by the server.
 */
export function ShipmentPrefixCard({
  attemptId,
  lockedAtLabel,
  prefix,
  suggestedPrefix,
}: {
  attemptId: string;
  lockedAtLabel: string | null;
  prefix: string;
  suggestedPrefix: string;
}) {
  const [state, formAction, pending] = useActionState<ShipmentPrefixActionState, FormData>(saveShipmentPrefix, {});
  // After a Super Admin unlock the current prefix is the sensible starting point.
  const [value, setValue] = useState(prefix === DEFAULT_SHIPMENT_PREFIX ? suggestedPrefix : prefix);
  const [confirming, setConfirming] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const [seenToken, setSeenToken] = useState(state.resultToken);
  const normalized = normalizeShipmentPrefixInput(value);

  // The confirmation stays open (showing progress) until the server answers, then closes.
  if (state.resultToken !== seenToken) {
    setSeenToken(state.resultToken);
    setConfirming(false);
  }

  useEffect(() => {
    if (state.resultToken) resultRef.current?.focus();
  }, [state.resultToken]);

  if (lockedAtLabel || state.savedPrefix) {
    const lockedPrefix = state.savedPrefix ?? prefix;
    return (
      <DataCard
        action={<Badge variant="secondary"><Lock aria-hidden="true" data-icon="inline-start" />Terkunci</Badge>}
        description={DESCRIPTION}
        title={TITLE}
      >
        <div className="flex flex-col gap-4 outline-none sm:flex-row sm:items-center" ref={resultRef} role="status" tabIndex={-1}>
          <p
            aria-label={`Awalan terkunci: ${lockedPrefix}`}
            className="flex h-10 w-32 shrink-0 items-center rounded-lg border bg-muted px-3 font-mono text-sm font-bold"
          >
            {lockedPrefix}
          </p>
          <p className="text-sm text-muted-foreground">
            Contoh nomor: <span className="font-mono font-semibold text-foreground">{lockedPrefix}-10013</span>.{" "}
            {state.savedPrefix ? "Baru saja dikunci." : `Dikunci ${lockedAtLabel}.`}{" "}
            Hubungi admin platform bila awalan perlu diperbaiki.
          </p>
        </div>
      </DataCard>
    );
  }

  return (
    <DataCard
      description={`${DESCRIPTION} Hanya dapat diatur sekali.`}
      footer={(
        <Button className="ml-auto" disabled={!normalized || pending} form={FORM_ID} type="submit">
          {pending ? "Menyimpan…" : "Simpan dan kunci awalan"}
        </Button>
      )}
      title={TITLE}
    >
      <form
        action={formAction}
        className="flex flex-col gap-4"
        id={FORM_ID}
        onSubmit={(event) => {
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          if (submitter?.getAttribute("name") !== "confirmation") {
            event.preventDefault();
            if (normalized) setConfirming(true);
          }
        }}
      >
        <input name="attemptId" type="hidden" value={attemptId} />
        {state.error ? (
          <Alert className="outline-none" ref={resultRef} role="alert" tabIndex={-1} variant="destructive">
            <AlertTitle>Awalan belum tersimpan</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={value !== "" && !normalized}>
          <FieldLabel htmlFor="shipment-prefix">Awalan</FieldLabel>
          <Input
            aria-describedby="shipment-prefix-help"
            aria-invalid={value !== "" && !normalized}
            autoCapitalize="characters"
            autoComplete="off"
            className="w-32 font-mono uppercase"
            id="shipment-prefix"
            maxLength={3}
            name="prefix"
            onChange={(event) => setValue(event.target.value.toUpperCase())}
            spellCheck={false}
            value={value}
          />
          <FieldDescription id="shipment-prefix-help">
            2–3 huruf atau angka, misalnya PHI atau A29. Contoh nomor:{" "}
            <span className="font-mono font-semibold text-foreground">{normalized ?? "—"}-10013</span>
          </FieldDescription>
          {value !== "" && !normalized ? <FieldError>Isi 2–3 huruf atau angka, tanpa spasi.</FieldError> : null}
        </Field>
        <AlertDialog onOpenChange={setConfirming} open={confirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Kunci awalan {normalized}?</AlertDialogTitle>
              <AlertDialogDescription>
                Semua nomor kiriman gerai ini, termasuk yang sudah ada, akan tampil seperti {normalized}-10013.
                Setelah dikunci, awalan tidak dapat diubah lagi dari Pengaturan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <Button
                form={FORM_ID}
                name="confirmation"
                disabled={pending}
                type="submit"
                value="locked"
              >
                {pending ? "Menyimpan…" : "Ya, kunci awalan"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </form>
    </DataCard>
  );
}
