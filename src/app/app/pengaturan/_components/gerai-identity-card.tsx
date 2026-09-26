"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { saveTenantContact, type TenantContactActionState } from "@/app/app/pengaturan/actions";
import { DataCard } from "@/components/app/data-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CharacterClassInput } from "@/components/ui/character-class-input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

const FORM_ID = "gerai-contact-form";

/**
 * T-233: Profil gerai identity. The name stays read-only (Super Admin); the WhatsApp is the
 * owner's to change. One save; the server normalises it as registration does and refuses
 * anything else, so the field keeps what was typed until the answer arrives.
 */
export function GeraiIdentityCard({ name, whatsapp }: { name: string; whatsapp: string | null }) {
  const [state, formAction, pending] = useActionState<TenantContactActionState, FormData>(saveTenantContact, {});
  const resultRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(whatsapp ?? "");
  const [seenToken, setSeenToken] = useState(state.resultToken);

  // A saved number comes back normalised (0812…); show that form in the field.
  if (state.resultToken !== seenToken) {
    setSeenToken(state.resultToken);
    if (state.savedWhatsapp) setValue(state.savedWhatsapp);
  }

  useEffect(() => {
    if (state.resultToken) resultRef.current?.focus();
  }, [state.resultToken]);

  return (
    <DataCard
      description="Hubungi admin platform bila nama gerai perlu diubah."
      footer={(
        <Button className="ml-auto" disabled={pending} form={FORM_ID} type="submit">
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      )}
      title="Identitas gerai"
    >
      <dl className="grid gap-1">
        <dt className="text-sm text-muted-foreground">Nama gerai</dt>
        <dd className="text-base font-semibold wrap-anywhere">{name}</dd>
      </dl>
      <form action={formAction} className="flex flex-col gap-4" id={FORM_ID}>
        {state.error ? (
          <Alert className="outline-none" ref={resultRef} role="alert" tabIndex={-1} variant="destructive">
            <AlertTitle>WhatsApp gerai belum tersimpan</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : state.savedWhatsapp ? (
          <Alert className="outline-none" ref={resultRef} role="status" tabIndex={-1}>
            <AlertTitle>WhatsApp gerai disimpan</AlertTitle>
            <AlertDescription>Dipakai untuk invoice dan kiriman berikutnya.</AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={Boolean(state.error)}>
          <FieldLabel htmlFor="gerai-whatsapp">Nomor WhatsApp gerai</FieldLabel>
          <CharacterClassInput
            aria-describedby="gerai-whatsapp-help"
            aria-invalid={Boolean(state.error)}
            autoComplete="tel"
            characterClass="PHONE"
            className="sm:max-w-xs"
            id="gerai-whatsapp"
            inputMode="tel"
            maxLength={20}
            name="whatsapp"
            onChange={(event) => setValue(event.target.value)}
            placeholder="0812 3456 7890"
            required
            type="tel"
            value={value}
          />
          <FieldDescription id="gerai-whatsapp-help">
            Tercetak di invoice dan terisi sebagai pengirim label (Alamat gerai). Invoice dan kiriman yang sudah dibuat tidak berubah.
          </FieldDescription>
        </Field>
      </form>
    </DataCard>
  );
}
