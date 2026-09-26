"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { GeraiBrandProvider, type GeraiBrand } from "@/app/app/brand/gerai-brand";
import { LabelPreviewFrame } from "@/app/app/label/[shipmentId]/label-preview-frame";
import { LabelPrintContext } from "@/app/app/label/[shipmentId]/label-print-context";
import { LabelSheet } from "@/app/app/label/[shipmentId]/label-sheet";
import { saveLabelSettings, type LabelSettingsActionState } from "@/app/app/pengaturan/actions";
import { DataCard } from "@/components/app/data-card";
import { OptionCard } from "@/components/app/option-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import type { PrintableLabel } from "@/db/label-print-repository";
import {
  LABEL_FIELD_COPY,
  LABEL_FIELD_KEYS,
  labelFieldInputName,
  type LabelFieldKey,
  type LabelFieldsBySize,
} from "@/lib/label-fields";
import { LABEL_SIZES, type LabelSize } from "@/lib/label-size";

const FORM_ID = "label-info-form";

const SIZE_OPTIONS: { description: string; size: LabelSize }[] = [
  { description: "Label paket dan bukti pengirim.", size: "10x15" },
  { description: "Label paket saja.", size: "10x10" },
];

/** Preview data only: the gerai's own name and WhatsApp as the sender, the rest an example. */
function sampleLabel(geraiName: string, geraiWhatsapp: string | null): PrintableLabel {
  return {
    awb: "JX0012345678",
    codBreakdown: null,
    courier: "JNE",
    destinationAreaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
    insuranceAmountIdr: null,
    isCod: false,
    issuedAt: new Date("2026-09-26T03:00:00.000Z"),
    lastPrintedAt: null,
    outletName: geraiName,
    package: { content: "Contoh produk", declaredValueIdr: 150_000, heightCm: 10, lengthCm: 20, quantity: 1, weightGrams: 1_000, widthCm: 15 },
    paymentMethod: "NON_COD",
    printCount: 0,
    providerCodAmountIdr: null,
    providerService: "REG",
    publicReference: "GC-10013",
    recipient: { address: "Jl. Ir. H. Juanda No. 10, RT 02 RW 05", name: "Budi Santoso", phone: "081234567890" },
    sender: { address: "Alamat titik pickup gerai", name: geraiName, phone: geraiWhatsapp ?? "0812 0000 0000" },
    shipmentId: "00000000-0000-4000-8000-000000000000",
    shippingAmountIdr: 18_000,
  };
}

/**
 * Spec 17 Pengaturan → Informasi label (PR-86, Mengantar analysis §9.12): size cards, the
 * switches for the chosen size on the left, the real `LabelSheet` on the right as the live
 * preview, and one **Simpan** for both sizes. There is no switch for the Mengantar pickup
 * identity: it is never printable (PR-71).
 */
export function LabelInfoEditor({
  brand,
  geraiName,
  geraiWhatsapp,
  initial,
}: {
  /** T-243: the gerai's logo, catatan resi and default size; the preview shows them. */
  brand: GeraiBrand;
  geraiName: string;
  geraiWhatsapp: string | null;
  initial: LabelFieldsBySize;
}) {
  const [state, formAction, pending] = useActionState<LabelSettingsActionState, FormData>(saveLabelSettings, {});
  const [size, setSize] = useState<LabelSize>(brand.defaultLabelSize);
  const [defaultSize, setDefaultSize] = useState<LabelSize>(brand.defaultLabelSize);
  const [fields, setFields] = useState<LabelFieldsBySize>(initial);
  const resultRef = useRef<HTMLDivElement>(null);
  const [label] = useState(() => sampleLabel(geraiName, geraiWhatsapp));
  // A logo or catatan switch means nothing until the gerai has one (Profil gerai).
  const missing: Partial<Record<LabelFieldKey, string>> = {
    geraiLogo: brand.logoSrc ? undefined : "Belum ada logo.",
    labelNote: brand.note ? undefined : "Belum ada catatan resi.",
  };

  useEffect(() => {
    if (state.resultToken) resultRef.current?.focus();
  }, [state.resultToken]);

  const toggle = (key: LabelFieldKey, on: boolean) =>
    setFields((current) => ({ ...current, [size]: { ...current[size], [key]: on } }));

  return (
    <DataCard
      description="Pilih informasi yang tercetak di label, untuk tiap ukuran."
      footer={(
        <Button className="ml-auto" disabled={pending} form={FORM_ID} type="submit">
          {pending ? "Menyimpan…" : "Simpan informasi label"}
        </Button>
      )}
      title="Informasi label"
    >
      {/* Only the hidden values live in the form: React resets a form after its action, and a
          Radix switch inside one answers the reset by reverting to its first value. */}
      <form action={formAction} className="hidden" id={FORM_ID}>
        {(Object.keys(LABEL_SIZES) as LabelSize[]).flatMap((each) =>
          LABEL_FIELD_KEYS.map((key) => (
            <input key={`${each}-${key}`} name={labelFieldInputName(each, key)} type="hidden" value={fields[each][key] ? "1" : "0"} />
          )))}
        <input name="defaultSize" type="hidden" value={defaultSize} />
      </form>
      <div className="flex flex-col gap-6">
        {state.error ? (
          <Alert className="outline-none" ref={resultRef} role="alert" tabIndex={-1} variant="destructive">
            <AlertTitle>Informasi label belum tersimpan</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : state.saved ? (
          <Alert className="outline-none" ref={resultRef} role="status" tabIndex={-1}>
            <AlertTitle>Informasi label disimpan</AlertTitle>
            <AlertDescription>Label yang dicetak berikutnya memakai pilihan ini.</AlertDescription>
          </Alert>
        ) : null}

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-medium">Ukuran yang diatur</legend>
          {SIZE_OPTIONS.map((option) => (
            <OptionCard
              checked={size === option.size}
              description={option.description}
              key={option.size}
              name="label-info-size"
              onSelect={() => setSize(option.size)}
              value={option.size}
            >
              Thermal {LABEL_SIZES[option.size].name}
            </OptionCard>
          ))}
        </fieldset>

        <a
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline md:hidden"
          href="#pratinjau-label"
        >
          Lihat pratinjau
        </a>

        <div className="grid gap-6 md:grid-cols-2 md:items-start">
          <div className="grid gap-6">
            <ul aria-label={`Informasi tercetak di label ${LABEL_SIZES[size].name}`} className="divide-y">
              {LABEL_FIELD_KEYS.map((key) => {
                const id = `label-field-${key}`;
                const unavailable = missing[key];
                return (
                  // The switch's ::after covers the whole row (relative li, static switch), so the
                  // label and description toggle it too: a ≥ 44px target on touch, one tab stop.
                  <li className="relative py-3 first:pt-0 last:pb-0" data-row-target="" key={key}>
                    <Field data-disabled={unavailable ? true : undefined} orientation="horizontal">
                      <FieldContent>
                        <FieldLabel htmlFor={id}>{LABEL_FIELD_COPY[key].label}</FieldLabel>
                        <FieldDescription>
                          {unavailable ? (
                            <>{unavailable} <Link className="relative z-10 font-medium text-primary underline-offset-4 hover:underline" href="/app/pengaturan">{key === "geraiLogo" ? "Unggah di Profil gerai" : "Isi di Profil gerai"}</Link></>
                          ) : LABEL_FIELD_COPY[key].description}
                        </FieldDescription>
                      </FieldContent>
                      <Switch
                        checked={unavailable ? false : fields[size][key]}
                        className="static cursor-pointer after:inset-0 after:content-['']"
                        disabled={Boolean(unavailable)}
                        id={id}
                        onCheckedChange={(on) => toggle(key, on)}
                      />
                    </Field>
                  </li>
                );
              })}
            </ul>

            <Field>
              <FieldLabel id="label-default-size">Ukuran bawaan saat mencetak</FieldLabel>
              <RadioGroup
                aria-labelledby="label-default-size"
                className="flex flex-wrap gap-x-6 gap-y-2"
                onValueChange={(value) => setDefaultSize(value as LabelSize)}
                value={defaultSize}
              >
                {SIZE_OPTIONS.map((option) => (
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-8" key={option.size}>
                    <RadioGroupItem value={option.size} />
                    {LABEL_SIZES[option.size].name}
                  </label>
                ))}
              </RadioGroup>
              <FieldDescription>Langsung terpilih saat mencetak label, satuan maupun massal.</FieldDescription>
            </Field>
          </div>

          <div className="min-w-0 md:sticky md:top-20">
            <GeraiBrandProvider value={brand}>
              <LabelPrintContext.Provider value={{ printedAt: null, size }}>
                <LabelPreviewFrame
                  id="pratinjau-label"
                  label={`Pratinjau label ${LABEL_SIZES[size].name} dengan contoh data`}
                  sample
                  size={size}
                  title={`Pratinjau ${LABEL_SIZES[size].name}`}
                >
                  <LabelSheet fields={fields} label={label} />
                </LabelPreviewFrame>
              </LabelPrintContext.Provider>
            </GeraiBrandProvider>
          </div>
        </div>
      </div>
    </DataCard>
  );
}
