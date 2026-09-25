import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * T-211 building blocks of Buat kiriman, measured from `buat-kiriman.html`: the 3-step bar,
 * the numbered section card (24px number chip, 18/700 title, divider, status at the right),
 * the uppercase sub-block label and the definition rows of a saved section.
 */

export type FlowStep = { detail: string; label: string; state: "current" | "done" | "pending" };

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
              <span
                className={cn(
                  "text-sm leading-tight",
                  step.state === "current" ? "font-semibold whitespace-nowrap" : "truncate font-medium max-md:sr-only",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 ? <span aria-hidden="true" className="h-0.5 min-w-3 flex-1 bg-primary-foreground/40" /> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SectionCard({
  aside,
  children,
  emphasis = false,
  id,
  number,
  title,
}: {
  aside?: ReactNode;
  children: ReactNode;
  /** Section 5 when it is the active step: primary-tinted frame and a filled number chip. */
  emphasis?: boolean;
  id: string;
  number: number;
  title: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex flex-col gap-5 rounded-2xl bg-card p-6 shadow-card max-md:p-4",
        emphasis && "ring-2 ring-primary/40",
      )}
    >
      <header className="flex flex-col justify-between gap-2 border-b pb-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-sm text-xs font-bold",
              emphasis ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            )}
          >
            {number}
          </span>
          <h2 className="text-lg font-bold" id={id}>{title}</h2>
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
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
