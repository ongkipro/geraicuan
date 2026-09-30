"use client";

import { ArrowLeft, ListChecks, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";

import { selectUnprintedLabels } from "@/app/app/label/cetak/actions";
import { BATCH_CONTENT_LABELS, batchPrintHref, MAX_BATCH_SHIPMENTS, type BatchPrintContent } from "@/app/app/label/cetak/batch-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DEFAULT_LABEL_SIZE, LABEL_SIZES, type LabelSize } from "@/lib/label-size";
import { cn } from "@/lib/utils";

/** T-267: Buat kiriman's planned handover per shipment number, the handover dialog's default. */
export type PlannedHandoverTypes = Readonly<Record<number, "PICKUP" | "DROP_OFF" | null>>;

/** T-267: the last handover outcome, shown above the list until the next selection. */
export type SelectionNotice = { tone: "success" | "warning" | "danger"; title: string; lines: string[] };

type Selection = {
  /** The selectable rows of this page. */
  numbers: readonly number[];
  /** Planned handover types of this page's rows plus any a "Pilih semua" brought in. */
  types: PlannedHandoverTypes;
  notice: SelectionNotice | null;
  setNotice: (notice: SelectionNotice | null) => void;
  /** The chosen shipment numbers: this page's, plus any "Pilih semua belum dicetak" took from other pages. */
  selected: ReadonlySet<number>;
  /** A line about the last "Pilih semua belum dicetak" when the cap cut it short. */
  note: string | null;
  toggle: (number: number, on: boolean) => void;
  setAll: (on: boolean) => void;
  replace: (numbers: readonly number[], note: string | null, types?: PlannedHandoverTypes) => void;
  clear: () => void;
};

const SelectionContext = createContext<Selection | null>(null);

export function useBatchSelection() {
  return useSelection();
}

function useSelection() {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error("BatchSelectionProvider is missing.");
  return selection;
}

/** PR-87: the rows chosen on Cetak resi, by shipment number. */
export function BatchSelectionProvider({ children, numbers, types = {} }: { children: ReactNode; numbers: readonly number[]; types?: PlannedHandoverTypes }) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<SelectionNotice | null>(null);
  const [extraTypes, setExtraTypes] = useState<PlannedHandoverTypes>({});
  const value: Selection = {
    clear: () => { setSelected(new Set()); setNote(null); },
    note,
    notice,
    numbers,
    replace: (next, nextNote, nextTypes) => { setSelected(new Set(next)); setNote(nextNote); if (nextTypes) setExtraTypes(nextTypes); },
    selected,
    setNotice,
    types: { ...extraTypes, ...types },
    // The page box adds or removes this page's rows; picks from other pages stay.
    setAll: (on) => { setNote(null); setSelected((current) => {
      const next = new Set(current);
      for (const number of numbers) {
        if (on) next.add(number);
        else next.delete(number);
      }
      return next;
    }); },
    toggle: (number, on) => { setNote(null); setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(number);
      else next.delete(number);
      return next;
    }); },
  };
  return (
    <SelectionContext.Provider value={value}>
      {children}
      <p aria-live="polite" className="sr-only">{selected.size > 0 ? `${selected.size} resi dipilih` : ""}</p>
      {/* T-266: room below the last row for the phone/tablet selection bar. */}
      {selected.size > 0 ? <div aria-hidden="true" className="h-28 lg:hidden print:hidden" data-slot="selection-bar-spacer" /> : null}
    </SelectionContext.Provider>
  );
}

/**
 * T-265 (critique 2026-09-29 #3, harden): the desktop table and the phone card both render this
 * box for the same row, one of them hidden by CSS. Each layout gets its own id, so the card's
 * <label for> never resolves to the hidden table copy, and each box is named after its resi.
 *
 * T-266 (critique #4, adapt): on the phone card the box sits in the card's 44px leading column; a
 * label covering the whole column (full card height) toggles it, so the card needs no extra
 * "Pilih untuk cetak" line. The rest of the card is still the link (T-263).
 */
export function SelectRowCheckbox({ awb, number, visibleLabel = false }: { awb: string; number: number; visibleLabel?: boolean }) {
  const { selected, toggle } = useSelection();
  const id = `pilih-${visibleLabel ? "kartu" : "tabel"}-${number}`;
  const box = (
    <Checkbox
      className={visibleLabel ? undefined : "relative after:absolute after:-inset-3.5 after:content-['']"}
      aria-label={visibleLabel ? undefined : `Pilih resi ${awb}`}
      checked={selected.has(number)}
      id={id}
      onCheckedChange={(checked) => toggle(number, checked === true)}
    />
  );
  if (!visibleLabel) return <span className="inline-flex min-h-11 items-center gap-3 md:min-h-6">{box}</span>;
  return (
    <span className="relative flex w-11 flex-1 justify-center pt-3">
      {box}
      <label className="absolute inset-0 cursor-pointer" htmlFor={id}>
        <span className="sr-only">Pilih untuk cetak resi {awb}</span>
      </label>
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
  // The box lines up with the rows' leading column (T-266).
  return (
    <span className="flex min-h-11 w-full items-center">
      <span className="flex w-11 shrink-0 justify-center">{box}</span>
      <label className="flex min-h-11 flex-1 cursor-pointer items-center text-sm font-medium" htmlFor="pilih-semua">Pilih semua di halaman ini</label>
    </span>
  );
}

/**
 * T-266 "Pilih semua belum dicetak (N)": every unprinted resi of the current filter, across pages,
 * by a Server Action (tenant from the session, filter re-parsed there). N is LBL-UNPRINTED; one
 * batch takes at most MAX_BATCH_SHIPMENTS, so a larger queue selects the newest ones and says so.
 */
export function SelectUnprintedButton({ className, params, total }: { className?: string; params: Record<string, string>; total: number }) {
  const { replace } = useSelection();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("grid gap-1", className)}>
      <Button
        className="max-lg:h-11"
        disabled={pending}
        onClick={() => startTransition(async () => {
          try {
            const result = await selectUnprintedLabels(params);
            setFailed(false);
            replace(result.numbers, result.total > result.numbers.length
              ? `${result.numbers.length} terbaru dari ${result.total} · maks. ${MAX_BATCH_SHIPMENTS} per cetak`
              : null);
          } catch {
            setFailed(true);
          }
        })}
        type="button"
        variant="outline"
      >
        <ListChecks aria-hidden="true" />
        {pending ? "Memilih…" : <span>Pilih semua belum dicetak <span className="tabular-nums" data-metric-id="LBL-UNPRINTED">({total})</span></span>}
      </Button>
      {failed ? <span className="text-xs text-destructive" role="alert">Resi belum dicetak tidak dapat dipilih. Coba lagi.</span> : null}
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
 * T-266: the line under a "Pilih semua belum dicetak" the cap cut short, or the cap itself when a
 * selection outgrows one batch. Inside the phone/tablet bar; under the toolbar on desktop.
 */
export function SelectionNote({ className }: { className?: string }) {
  const { note, selected } = useSelection();
  const overCap = selected.size > MAX_BATCH_SHIPMENTS;
  if (!overCap && !note) return null;
  return (
    <p className={cn("text-xs", overCap ? "font-medium text-destructive" : "text-muted-foreground", className)}>
      {overCap ? `Maks. ${MAX_BATCH_SHIPMENTS} resi per cetak massal` : note}
    </p>
  );
}

/**
 * PR-87 two-step print modal, after Mengantar's (analysis §9.5): (1) format — thermal
 * 10 × 15 or 10 × 10; (2) what to print — labels, invoices or both — then the batch view.
 * The toolbar button is outline until rows are selected (one primary per page).
 *
 * T-266 (critique #4): below 1024px the same toolbar element becomes the selection bar, pinned to
 * the bottom while one or more resi are chosen (count, Batal pilih, Cetak terpilih) and absent
 * otherwise — never a second print button. 44px targets, safe-area inset, never printed.
 */
const SELECTION_BAR =
  "max-lg:flex-wrap max-lg:gap-x-2 max-lg:gap-y-1 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:border-t max-lg:bg-card max-lg:px-4 max-lg:pt-3 max-lg:pb-[max(--spacing(3),env(safe-area-inset-bottom))] max-lg:shadow-lg";

/** The toolbar element's classes for a selection size: pinned bar below 1024px, or absent there. */
export function selectionBarClassName(count: number) {
  return cn("flex items-center gap-3 print:hidden", count > 0 ? SELECTION_BAR : "max-lg:hidden");
}

export function BatchPrintDialog({ defaultSize = DEFAULT_LABEL_SIZE }: { defaultSize?: LabelSize }) {
  const router = useRouter();
  const { clear, selected } = useSelection();
  const chosen = [...selected];
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  // T-243: the gerai's default size (Pengaturan → Informasi label) is preselected.
  const [size, setSize] = useState<LabelSize>(defaultSize);
  const [content, setContent] = useState<BatchPrintContent>("label");
  const count = chosen.length;
  const overCap = count > MAX_BATCH_SHIPMENTS;

  const counts: Record<BatchPrintContent, string> = {
    invoice: `${count} invoice`,
    keduanya: `${count} label · ${count} invoice`,
    label: `${count} label`,
  };

  return (
    <div
      aria-label={count > 0 ? "Resi terpilih" : undefined}
      className={selectionBarClassName(count)}
      data-slot="selection-bar"
      data-state={count > 0 ? "open" : "closed"}
      role={count > 0 ? "region" : undefined}
    >
      <SelectionNote className="max-lg:order-first max-lg:basis-full lg:hidden" />
      {count > 0 ? <span className="flex-1 text-sm font-semibold whitespace-nowrap tabular-nums lg:hidden">{count} dipilih</span> : null}
      {count > 0 ? (
        <Button
          className="max-lg:h-11 max-lg:px-3"
          onClick={() => { clear(); document.getElementById("daftar-resi")?.focus(); }}
          type="button"
          variant="ghost"
        >
          Batal pilih
        </Button>
      ) : null}
      <Dialog onOpenChange={(next) => { setOpen(next); if (next) setStep(1); }} open={open}>
        <DialogTrigger asChild>
          <Button className="max-lg:h-11" disabled={count === 0 || overCap} type="button" variant={count > 0 ? "default" : "outline"}>
            <Printer aria-hidden="true" className="max-[379px]:hidden" />
            <span>Cetak terpilih{count > 0 ? <span className="tabular-nums max-lg:hidden"> ({count})</span> : null}</span>
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
