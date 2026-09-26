"use client";

import { useActionState, useEffect, useRef, useState, type CSSProperties } from "react";

import { LabelPrintContext } from "@/app/app/label/[shipmentId]/label-print-context";
import { LabelSheet } from "@/app/app/label/[shipmentId]/label-sheet";
import { saveLabelSettings, type LabelSettingsActionState } from "@/app/app/pengaturan/actions";
import { DataCard } from "@/components/app/data-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { PrintableLabel } from "@/db/label-print-repository";
import {
  LABEL_FIELD_COPY,
  LABEL_FIELD_KEYS,
  labelFieldInputName,
  type LabelFieldKey,
  type LabelFieldsBySize,
} from "@/lib/label-fields";
import { DEFAULT_LABEL_SIZE, LABEL_SIZES, type LabelSize } from "@/lib/label-size";

const FORM_ID = "label-info-form";

/** `.label-sheet` is 100 mm wide at every size (label.css, T-176); CSS px are 96 per inch. */
const LABEL_SHEET_WIDTH_PX = (100 * 96) / 25.4;

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
  geraiName,
  geraiWhatsapp,
  initial,
}: {
  geraiName: string;
  geraiWhatsapp: string | null;
  initial: LabelFieldsBySize;
}) {
  const [state, formAction, pending] = useActionState<LabelSettingsActionState, FormData>(saveLabelSettings, {});
  const [size, setSize] = useState<LabelSize>(DEFAULT_LABEL_SIZE);
  const [fields, setFields] = useState<LabelFieldsBySize>(initial);
  const resultRef = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [label] = useState(() => sampleLabel(geraiName, geraiWhatsapp));

  useEffect(() => {
    if (state.resultToken) resultRef.current?.focus();
  }, [state.resultToken]);

  useEffect(() => {
    const region = preview.current;
    if (!region) return;
    const fit = () => {
      const style = getComputedStyle(region);
      const available = region.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setZoom(Math.min(1, Math.max(available, 0) / LABEL_SHEET_WIDTH_PX));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(region);
    return () => observer.disconnect();
  }, []);

  const toggle = (key: LabelFieldKey, on: boolean) =>
    setFields((current) => ({ ...current, [size]: { ...current[size], [key]: on } }));

  return (
    <DataCard
      description="Pilih yang tercetak di label termal, per ukuran. Identitas pickup Mengantar tidak pernah tercetak."
      footer={(
        <Button className="ml-auto" disabled={pending} form={FORM_ID} type="submit">
          {pending ? "Menyimpan…" : "Simpan"}
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
            <AlertDescription>Setiap cetak label berikutnya memakai pilihan ini.</AlertDescription>
          </Alert>
        ) : null}

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Ukuran label</legend>
          {SIZE_OPTIONS.map((option) => (
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-4 has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring"
              key={option.size}
            >
              <span className="grid flex-1 gap-1">
                <span className="text-sm font-bold">Thermal {LABEL_SIZES[option.size].name}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </span>
              <input
                checked={size === option.size}
                className="mt-1 size-4 shrink-0 accent-primary"
                name="label-info-size"
                onChange={() => setSize(option.size)}
                type="radio"
                value={option.size}
              />
            </label>
          ))}
        </fieldset>

        <div className="grid gap-6 md:grid-cols-2 md:items-start">
          <ul aria-label={`Informasi tercetak di label ${LABEL_SIZES[size].name}`} className="divide-y">
            {LABEL_FIELD_KEYS.map((key) => {
              const id = `label-field-${key}`;
              return (
                <li className="py-3 first:pt-0 last:pb-0" key={key}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel htmlFor={id}>{LABEL_FIELD_COPY[key].label}</FieldLabel>
                      <FieldDescription>{LABEL_FIELD_COPY[key].description}</FieldDescription>
                    </FieldContent>
                    <Switch checked={fields[size][key]} className="relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']" id={id} onCheckedChange={(on) => toggle(key, on)} />
                  </Field>
                </li>
              );
            })}
          </ul>
          <div className="grid min-w-0 gap-2">
            <p aria-hidden="true" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Pratinjau {LABEL_SIZES[size].name}</p>
            <LabelPrintContext.Provider value={{ printedAt: null, size }}>
              <div
                aria-label={`Pratinjau label ${LABEL_SIZES[size].name} dengan contoh data`}
                className="label-preview [&>.label-sheet]:[zoom:var(--label-preview-zoom,1)]"
                ref={preview}
                role="region"
                style={{ "--label-preview-zoom": zoom } as CSSProperties}
              >
                <LabelSheet fields={fields} label={label} />
              </div>
            </LabelPrintContext.Provider>
          </div>
        </div>
      </div>
    </DataCard>
  );
}
