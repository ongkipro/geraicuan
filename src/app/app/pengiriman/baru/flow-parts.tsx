import { Check, Lock } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * T-211 building blocks of Buat kiriman, measured from `buat-kiriman.html`: the 3-step bar,
 * the numbered section card (18/700 title, divider, status at the right), the uppercase
 * sub-block label and the definition rows of a saved section. T-249 adds the section progress
 * spine: every section carries one state, drawn by the same marker in the card, the spine and
 * the rail checklist.
 */

export type FlowStep = {
  detail: string;
  label: string;
  /** T-249: the step's sub-progress under its label, e.g. "3/4 bagian lengkap". */
  progress?: string;
  state: "current" | "done" | "pending";
};

/**
 * Spec 10 v3.2 §4.8 (D11): the stepper lives in the primary top bar of the focused layout,
 * centred — fixed over the sticky 64px bar, so it needs no script and keeps its DOM place after
 * the H1. White on primary: current = white chip, done = check, pending = outlined; below
 * 768px only the current step keeps its label.
 */
export function FlowStepper({ steps }: { steps: FlowStep[] }) {
  return (
    <nav
      aria-label="Langkah buat kiriman"
      className="fixed top-0 left-1/2 z-40 flex h-16 w-[min(40rem,calc(100vw-8rem))] -translate-x-1/2 items-center text-primary-foreground"
      data-slot="flow-stepper"
    >
      <ol className="flex w-full items-center justify-between gap-2">
        {steps.map((step, index) => (
          <li className="flex min-w-0 flex-1 items-center gap-2 last:flex-none" key={step.label}>
            <div
              aria-current={step.state === "current" ? "step" : undefined}
              className={cn("flex min-w-0 items-center gap-2", step.state === "current" && "shrink-0")}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2 max-md:size-7 border-primary-foreground text-sm font-bold",
                  step.state === "current" && "bg-primary-foreground text-primary",
                  step.state === "done" && "bg-primary-foreground/20",
                )}
              >
                {step.state === "done" ? <Check aria-hidden="true" className="size-4" /> : index + 1}
                <span className="sr-only">{step.state === "done" ? " (selesai)" : ""}</span>
              </span>
              <span className={cn("flex min-w-0 flex-col", step.state !== "current" && "max-md:sr-only")}>
                <span
                  className={cn(
                    "text-sm leading-tight",
                    step.state === "current" ? "font-semibold whitespace-nowrap" : "truncate font-medium",
                  )}
                >
                  {step.label}
                </span>
                {step.progress ? (
                  <span className="text-xs leading-tight whitespace-nowrap text-primary-foreground/85 max-md:hidden" data-slot="step-progress">
                    {step.progress}
                  </span>
                ) : null}
              </span>
            </div>
            {index < steps.length - 1 ? <span aria-hidden="true" className="h-0.5 min-w-3 flex-1 bg-primary-foreground/40" /> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** T-249: one state per section — complete, the one being filled, still to fill, or not yet open. */
export type SectionState = "complete" | "current" | "locked" | "pending";

/** The five sections of Buat kiriman, in order; sections 1–4 are filled in the form, 5 after the estimate. */
export const FLOW_SECTIONS = [
  { id: "section-handover", title: "Penyerahan paket & asal" },
  { id: "section-parties", title: "Pengirim & penerima" },
  { id: "section-payment", title: "Pembayaran" },
  { id: "section-package", title: "Produk & paket" },
  { id: "section-service", title: "Pilih layanan ekspedisi" },
] as const;

export const STATE_WORDS: Record<SectionState, string> = {
  complete: "lengkap",
  current: "sedang diisi",
  locked: "terkunci",
  pending: "belum lengkap",
};

/**
 * T-249: which section is complete, current, pending or locked. Current is the section holding
 * focus, else the first incomplete one; section 5 is locked until an estimate exists.
 */
export function flowSectionStates(missing: number[], focusedIndex: number | null, serviceLocked: boolean): SectionState[] {
  const firstIncomplete = missing.findIndex((count) => count > 0);
  const current = focusedIndex ?? (firstIncomplete === -1 ? null : firstIncomplete);
  return FLOW_SECTIONS.map((_, index) => {
    if (index === FLOW_SECTIONS.length - 1 && serviceLocked) return "locked";
    if (index === current) return "current";
    return (missing[index] ?? 0) === 0 ? "complete" : "pending";
  });
}

/** Complete sections joined by the spine: the segment into a complete section after a complete one is success-toned. */
export function spineSegments(states: SectionState[]): ("done" | "todo" | undefined)[] {
  return states.map((state, index) =>
    index === states.length - 1 ? undefined : state === "complete" && states[index + 1] === "complete" ? "done" : "todo");
}

/** The state marker: success check, primary number, outlined number, or a lock. */
export function SectionMarker({ className, number, state }: { className?: string; number: number; state: SectionState }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors duration-150 motion-reduce:transition-none",
        state === "complete" && "border-ok bg-ok text-primary-foreground",
        state === "current" && "border-primary bg-primary text-primary-foreground",
        state === "pending" && "border-input bg-card text-muted-foreground",
        state === "locked" && "border-dashed border-input bg-muted text-muted-foreground",
        className,
      )}
      data-state={state}
    >
      {state === "complete" ? (
        <Check className="size-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150" key="done" strokeWidth={3} />
      ) : state === "locked" ? (
        <Lock className="size-3.5" />
      ) : (
        number
      )}
    </span>
  );
}

/** T-249 header status: "Lengkap", "n isian belum diisi", or why section 5 is not open yet. */
export function SectionStatus({ missing, state }: { missing: number; state: SectionState }) {
  if (state === "locked") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock aria-hidden="true" className="size-3.5" />Terbuka setelah cek tarif
      </span>
    );
  }
  if (missing === 0) {
    return (
      <span className="flex items-center gap-1.5 self-start rounded-sm border border-ok bg-ok-surface px-2.5 py-0.5 text-xs font-semibold text-ok sm:self-auto">
        <Check aria-hidden="true" className="size-3.5" />Lengkap
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{missing} isian belum diisi</span>;
}

export function SectionCard({
  aside,
  children,
  connector,
  emphasis = false,
  id,
  number,
  state,
  title,
}: {
  aside?: ReactNode;
  children: ReactNode;
  /** The spine segment down to the next section (none on the last one). */
  connector?: "done" | "todo";
  /** Section 5 when it is the active step: primary-tinted frame. */
  emphasis?: boolean;
  id: string;
  number: number;
  state: SectionState;
  title: string;
}) {
  return (
    <div className="flex gap-4" data-flow-section={id} data-state={state}>
      {/* The spine (≥ 1024px): marker at the header's centre line, a segment down to the next marker. */}
      <div aria-hidden="true" className="relative hidden w-8 shrink-0 justify-center lg:flex">
        <SectionMarker className="mt-5.5" number={number} state={state} />
        {connector ? (
          <span
            className={cn(
              "absolute top-15 -bottom-10 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors duration-150 motion-reduce:transition-none",
              connector === "done" ? "bg-ok" : "bg-border",
            )}
            data-connector={connector}
          />
        ) : null}
      </div>
      <section
        aria-labelledby={id}
        className={cn(
          "flex min-w-0 flex-1 scroll-mt-20 flex-col gap-5 rounded-2xl bg-card p-6 shadow-card max-md:p-4",
          emphasis && "ring-2 ring-primary/40",
        )}
      >
        <header className="flex flex-col justify-between gap-2 border-b pb-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <SectionMarker className="size-7 lg:hidden" number={number} state={state} />
            <h2 className="text-lg font-bold" id={id} tabIndex={-1}>
              <span className="sr-only">{`Bagian ${number}: `}</span>
              {title}
              <span className="sr-only">{` (${STATE_WORDS[state]})`}</span>
            </h2>
          </div>
          {aside}
        </header>
        {children}
      </section>
    </div>
  );
}

/**
 * The guard under "Simpan & cek tarif" (spec 10 §4.11): the sections still missing a required
 * field, by name — two at most, then "+n lainnya" — so it never exceeds two lines.
 */
export function saveGuard(missing: number[]) {
  const open = missing.flatMap((count, index) => (count > 0 ? [FLOW_SECTIONS[index].title] : []));
  if (open.length === 0) return { hidden: "", text: "Semua bagian lengkap. Tarif dicek setelah disimpan." };
  const shown = open.slice(0, 2).join(", ");
  const more = open.length - 2;
  return {
    hidden: more > 0 ? open.slice(2).join(", ") : "",
    text: `Belum lengkap: ${shown}${more > 0 ? ` +${more} lainnya` : ""}.`,
  };
}

type Party = { address: string; name: string; phone: string };

/**
 * T-249: the required (*) fields of sections 1–4 that are still empty, by label. Presence only —
 * the server's `validateShipmentDraft` stays the one validity rule, as before.
 */
export function requiredFieldsMissing(input: {
  declaredValue: string;
  destinationChosen: boolean;
  handoverType: "DROP_OFF" | "PICKUP";
  pickupDate: string;
  pickupReady: boolean;
  pickupSlot: string;
  products: { name: string; quantity: string; weightKg: string }[];
  recipient: Party;
  sender: Party;
}): string[][] {
  const blank = (value: string) => value.trim() === "";
  const pick = (entries: [string, boolean][]) => entries.filter(([, isMissing]) => isMissing).map(([label]) => label);
  const pickup = input.handoverType === "PICKUP";
  const several = input.products.length > 1;
  return [
    pick([
      ["Titik pickup", !input.pickupReady],
      ["Tanggal penjemputan", pickup && blank(input.pickupDate)],
      ["Jam penjemputan", pickup && blank(input.pickupSlot)],
    ]),
    pick([
      ["Nama pengirim di label", blank(input.sender.name)],
      ["No. HP / WhatsApp di label", blank(input.sender.phone)],
      ["Kota / asal pengirim di label", blank(input.sender.address)],
      ["Nama pelanggan", blank(input.recipient.name)],
      ["Nomor telepon", blank(input.recipient.phone)],
      ["Alamat lengkap penerima", blank(input.recipient.address)],
      ["Kecamatan tujuan", !input.destinationChosen],
    ]),
    pick([["Nilai barang", blank(input.declaredValue)]]),
    input.products.flatMap((row, index) => {
      const suffix = several ? ` ${index + 1}` : "";
      return pick([
        [`Nama produk${suffix}`, blank(row.name)],
        [`Jumlah${suffix}`, blank(row.quantity)],
        [`Berat (kg)${suffix}`, blank(row.weightKg)],
      ]);
    }),
  ];
}

/** "DATA PENGIRIM (CETAK DI LABEL)" — the uppercase sub-block label of section 2. */
export function SubBlockTitle({ children, id }: { children: ReactNode; id?: string }) {
  return <h3 className="text-sm font-bold tracking-wide uppercase" id={id}>{children}</h3>;
}

/** A tinted inner block (pickup address, sender on label, COD value box, product row). */
export function InsetBlock({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3 rounded-lg border bg-muted/60 p-4", className)}>{children}</div>;
}

export function DetailRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div className="flex min-w-0 flex-col gap-0.5" key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm font-medium wrap-anywhere">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A required-field star (visible) with its spoken meaning. */
export function Required() {
  return <span className="text-destructive"> *<span className="sr-only">wajib</span></span>;
}
