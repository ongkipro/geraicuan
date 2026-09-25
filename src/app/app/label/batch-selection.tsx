"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";

import { BATCH_CONTENT_LABELS, batchPrintHref, type BatchPrintContent } from "@/app/app/label/cetak/batch-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DEFAULT_LABEL_SIZE, LABEL_SIZES, type LabelSize } from "@/lib/label-size";

type Selection = {
  numbers: readonly number[];
  selected: ReadonlySet<number>;
  toggle: (number: number, on: boolean) => void;
  setAll: (on: boolean) => void;
};

const SelectionContext = createContext<Selection | null>(null);

function useSelection() {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error("BatchSelectionProvider is missing.");
  return selection;
}

/** PR-87: the rows chosen on this page of Cetak resi, by shipment number. */
export function BatchSelectionProvider({ children, numbers }: { children: ReactNode; numbers: readonly number[] }) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const value: Selection = {
    numbers,
    selected,
    setAll: (on) => setSelected(new Set(on ? numbers : [])),
    toggle: (number, on) => setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(number);
      else next.delete(number);
      return next;
    }),
  };
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function SelectRowCheckbox({ awb, number, visibleLabel = false }: { awb: string; number: number; visibleLabel?: boolean }) {
  const { selected, toggle } = useSelection();
  const id = `pilih-${number}`;
  return (
    <span className="inline-flex min-h-11 items-center gap-3 md:min-h-6">
      <Checkbox
        className="relative after:absolute after:-inset-3.5 after:content-['']"
        aria-label={visibleLabel ? undefined : `Pilih resi ${awb}`}
        checked={selected.has(number)}
        id={id}
        onCheckedChange={(checked) => toggle(number, checked === true)}
      />
      {visibleLabel ? <label className="text-sm" htmlFor={id}>Pilih untuk cetak</label> : null}
    </span>
  );
}

export function SelectPageCheckbox({ visibleLabel = false }: { visibleLabel?: boolean }) {
  const { numbers, selected, setAll } = useSelection();
  const count = numbers.filter((number) => selected.has(number)).length;
  const box = (
    <Checkbox
      className="relative after:absolute after:-inset-3.5 after:content-['']"
      aria-label={visibleLabel ? undefined : "Pilih semua resi di halaman ini"}
      checked={count === 0 ? false : count === numbers.length ? true : "indeterminate"}
      id={visibleLabel ? "pilih-semua" : undefined}
      onCheckedChange={(checked) => setAll(checked === true)}
    />
  );
  if (!visibleLabel) return box;
  return (
    <span className="inline-flex min-h-11 items-center gap-3">
      {box}
      <label className="text-sm font-medium" htmlFor="pilih-semua">Pilih semua di halaman ini</label>
    </span>
  );
}

const FORMAT_OPTIONS: { size: LabelSize; description: string }[] = [
  { description: "Label paket dan bukti pengirim.", size: "10x15" },
  { description: "Label paket saja.", size: "10x10" },
];

const CONTENT_OPTIONS: BatchPrintContent[] = ["label", "invoice", "keduanya"];

function OptionCard({ checked, children, name, onChange }: { checked: boolean; children: ReactNode; name: string; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-4 has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring">
      <span className="grid flex-1 gap-1">{children}</span>
      <input checked={checked} className="mt-1 size-4 shrink-0 accent-primary" name={name} onChange={onChange} type="radio" />
    </label>
  );
}

/**
 * PR-87 two-step print modal, after Mengantar's (analysis §9.5): (1) format — thermal
 * 10 × 15 or 10 × 10; (2) what to print — labels, invoices or both — then the batch view.
 * The toolbar button is outline until rows are selected (one primary per page).
 */
export function BatchPrintDialog() {
  const router = useRouter();
  const { numbers, selected } = useSelection();
  const chosen = numbers.filter((number) => selected.has(number));
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [size, setSize] = useState<LabelSize>(DEFAULT_LABEL_SIZE);
  const [content, setContent] = useState<BatchPrintContent>("label");
  const count = chosen.length;

  const counts: Record<BatchPrintContent, string> = {
    invoice: `${count} invoice`,
    keduanya: `${count} label · ${count} invoice`,
    label: `${count} label`,
  };

  return (
    <div className="flex items-center gap-3 max-md:w-full">
      <Dialog onOpenChange={(next) => { setOpen(next); if (next) setStep(1); }} open={open}>
        <DialogTrigger asChild>
          <Button className="max-md:flex-1" disabled={count === 0} type="button" variant={count > 0 ? "default" : "outline"}>
            <Printer aria-hidden="true" />
            Cetak terpilih{count > 0 ? ` (${count})` : ""}
          </Button>
        </DialogTrigger>
        <DialogContent className="gap-6 p-6 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">{step === 1 ? "Format cetak" : "Yang dicetak"}</DialogTitle>
            <DialogDescription>Langkah {step} dari 2 · {count} resi dipilih</DialogDescription>
          </DialogHeader>
          {step === 1 ? (
            <fieldset aria-label="Format cetak" className="grid gap-3 sm:grid-cols-2">
              {FORMAT_OPTIONS.map((option) => (
                <OptionCard checked={size === option.size} key={option.size} name="format-cetak" onChange={() => setSize(option.size)}>
                  <span className="text-sm font-bold">Thermal {LABEL_SIZES[option.size].name}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </OptionCard>
              ))}
            </fieldset>
          ) : (
            <fieldset aria-label="Yang dicetak" className="grid gap-3">
              {CONTENT_OPTIONS.map((option) => (
                <OptionCard checked={content === option} key={option} name="isi-cetak" onChange={() => setContent(option)}>
                  <span className="text-sm font-bold">{BATCH_CONTENT_LABELS[option]}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{counts[option]}</span>
                </OptionCard>
              ))}
            </fieldset>
          )}
          <DialogFooter className="-mx-6 -mb-6 px-6 sm:justify-between">
            {step === 1 ? (
              <>
                <span className="hidden sm:block" />
                <Button onClick={() => setStep(2)} type="button">Lanjut</Button>
              </>
            ) : (
              <>
                <Button onClick={() => setStep(1)} type="button" variant="outline">
                  <ArrowLeft aria-hidden="true" />
                  Kembali ke format
                </Button>
                <Button onClick={() => router.push(batchPrintHref({ content, numbers: chosen, size }))} type="button">
                  Buka pratinjau cetak
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {count === 0 ? <span className="text-xs text-muted-foreground">Pilih resi untuk cetak massal</span> : null}
    </div>
  );
}
