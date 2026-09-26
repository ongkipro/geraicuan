"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { saveGeraiProfile, type GeraiProfileActionState } from "@/app/app/pengaturan/actions";
import { DataCard } from "@/components/app/data-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BUSINESS_CATEGORIES, LABEL_NOTE_MAX, type BusinessCategory } from "@/lib/gerai-settings";

const FORM_ID = "gerai-brand-form";

export type GeraiProfileValues = {
  businessCategory: BusinessCategory | null;
  csEmail: string | null;
  labelNote: string | null;
  website: string | null;
};

/**
 * T-243 Profil gerai → Brand gerai: catatan resi (printed under the sender on the label),
 * kategori usaha, email CS and website. All optional; an emptied field is cleared.
 */
export function GeraiProfileCard({ initial }: { initial: GeraiProfileValues }) {
  const [state, formAction, pending] = useActionState<GeraiProfileActionState, FormData>(saveGeraiProfile, {});
  const [category, setCategory] = useState(initial.businessCategory ?? "");
  const [note, setNote] = useState(initial.labelNote ?? "");
  const [email, setEmail] = useState(initial.csEmail ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const resultRef = useRef<HTMLDivElement>(null);
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.resultToken) resultRef.current?.focus();
  }, [state.resultToken]);

  return (
    <DataCard
      description="Catatan resi tercetak di label; kategori, email, dan situs melengkapi profil gerai."
      footer={(
        <Button className="ml-auto" disabled={pending} form={FORM_ID} type="submit">
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      )}
      title="Brand gerai"
    >
      <form action={formAction} className="flex flex-col gap-4" id={FORM_ID} noValidate>
        {state.error ? (
          <Alert className="outline-none" ref={resultRef} role="alert" tabIndex={-1} variant="destructive">
            <AlertTitle>Brand gerai belum tersimpan</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : state.saved ? (
          <Alert className="outline-none" ref={resultRef} role="status" tabIndex={-1}>
            <AlertTitle>Brand gerai disimpan</AlertTitle>
            <AlertDescription>Label berikutnya memakai catatan resi ini.</AlertDescription>
          </Alert>
        ) : null}

        <Field data-invalid={Boolean(errors.labelNote)}>
          <FieldLabel htmlFor="gerai-label-note">Catatan resi</FieldLabel>
          <Input
            aria-describedby="gerai-label-note-help"
            aria-invalid={Boolean(errors.labelNote)}
            id="gerai-label-note"
            maxLength={LABEL_NOTE_MAX}
            name="labelNote"
            onChange={(event) => setNote(event.target.value)}
            placeholder="Contoh: Terima kasih sudah belanja batik tulis kami"
            value={note}
          />
          <FieldDescription className="flex justify-between gap-3" id="gerai-label-note-help">
            <span>Satu baris di bawah nama pengirim pada label. Atur tampil/tidaknya di Informasi label.</span>
            <span className="shrink-0 tabular-nums">{note.length}/{LABEL_NOTE_MAX}</span>
          </FieldDescription>
          {errors.labelNote ? <FieldError>{errors.labelNote}</FieldError> : null}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.businessCategory)}>
          <FieldLabel htmlFor="gerai-category">Kategori usaha</FieldLabel>
          <input name="businessCategory" type="hidden" value={category} />
          <Select onValueChange={(value) => setCategory(value as BusinessCategory)} value={category || undefined}>
            <SelectTrigger aria-invalid={Boolean(errors.businessCategory)} className="w-full" id="gerai-category">
              <SelectValue placeholder="Pilih kategori" />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(BUSINESS_CATEGORIES) as [BusinessCategory, string][]).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.businessCategory ? <FieldError>{errors.businessCategory}</FieldError> : null}
        </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.csEmail)}>
            <FieldLabel htmlFor="gerai-cs-email">Email CS <span className="font-normal text-muted-foreground">(opsional)</span></FieldLabel>
            <Input
              aria-invalid={Boolean(errors.csEmail)}
              autoComplete="email"
              id="gerai-cs-email"
              inputMode="email"
              maxLength={254}
              name="csEmail"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="cs@gerai.id"
              type="email"
              value={email}
            />
            {errors.csEmail ? <FieldError>{errors.csEmail}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.website)}>
            <FieldLabel htmlFor="gerai-website">Website <span className="font-normal text-muted-foreground">(opsional)</span></FieldLabel>
            <Input
              aria-describedby="gerai-website-help"
              aria-invalid={Boolean(errors.website)}
              autoComplete="url"
              id="gerai-website"
              inputMode="url"
              maxLength={200}
              name="website"
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://gerai.id"
              type="url"
              value={website}
            />
            <FieldDescription id="gerai-website-help">Hanya alamat https.</FieldDescription>
            {errors.website ? <FieldError>{errors.website}</FieldError> : null}
          </Field>
        </div>
      </form>
    </DataCard>
  );
}
