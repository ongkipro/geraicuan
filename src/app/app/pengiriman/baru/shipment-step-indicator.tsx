import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type ShipmentStepState = "done" | "current" | "pending";

export type ShipmentStep = {
  detail?: string;
  label: string;
  state: ShipmentStepState;
};

const STATE_WORD: Record<ShipmentStepState, string> = {
  current: "Sedang dikerjakan",
  done: "Selesai",
  pending: "Menunggu",
};

/**
 * Design spec §7.1 — a vertical list of states, not a horizontal strip of
 * static text. `aria-current="step"` plus a visible state word carry the
 * current step; colour is additive only.
 */
export function ShipmentStepIndicator({ steps }: { steps: ShipmentStep[] }) {
  return (
    <nav aria-label="Tahapan pembuatan kiriman">
      <ol className="grid gap-0">
        {steps.map((step, index) => (
          <li
            aria-current={step.state === "current" ? "step" : undefined}
            className={cn(
              "step relative flex min-h-11 items-start gap-3 py-1.5",
              index > 0 && "before:absolute before:-top-3 before:left-[0.875rem] before:h-3 before:w-0.5 before:content-['']",
              index > 0 && (steps[index - 1].state === "done" ? "before:bg-[var(--ok)]" : "before:bg-[color:var(--hairline)]"),
            )}
            data-state={step.state}
            key={step.label}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                step.state === "done" && "bg-[var(--ok)] text-white",
                step.state === "current" && "bg-primary text-primary-foreground",
                step.state === "pending" && "border-[1.5px] border-[color:var(--hairline)] text-muted-foreground",
              )}
            >
              {step.state === "done" ? <Check className="size-4" /> : index + 1}
            </span>
            <span className="grid gap-0.5">
              <span className="text-xs text-muted-foreground">Langkah {index + 1}</span>
              <span className={cn("text-sm", step.state === "current" ? "font-semibold" : "font-medium")}>{step.label}</span>
              <span className="text-xs text-muted-foreground">{step.detail ?? STATE_WORD[step.state]}</span>
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Design spec §7.3 — below the split, a compact progress bar with sr-only state text. */
export function CompactShipmentStepIndicator({ steps }: { steps: ShipmentStep[] }) {
  const currentIndex = steps.findIndex((step) => step.state === "current");
  const current = currentIndex === -1 ? steps[0] : steps[currentIndex];
  const currentNumber = currentIndex === -1 ? 1 : currentIndex + 1;
  return (
    <nav aria-label="Tahapan pembuatan kiriman" className="@4xl/page:hidden">
      <p className="text-sm font-semibold">Langkah {currentNumber} dari {steps.length} · {current.label}</p>
      {/* The bars are decoration now that the words live below them: an empty
          `<li>` carrying `aria-current="step"` made a screen reader announce a
          list of three blank items ahead of the sentence that actually says
          where the operator is. `data-state` stays for the audits. */}
      <ol aria-hidden="true" className="mt-2 flex gap-1.5">
        {steps.map((step) => (
          <li
            className={cn(
              "h-1.5 flex-1 rounded-full",
              step.state === "done" && "bg-[var(--ok)]",
              step.state === "current" && "bg-primary",
              step.state === "pending" && "bg-[color:var(--hairline)]",
            )}
            data-state={step.state}
            key={step.label}
          />
        ))}
      </ol>
      {/* The per-step words sit here rather than inside each bar. A `sr-only`
        span is clipped to a pixel but still painted, so inside the bars it
        inherited page ink over `--ok`, `--primary` and `--hairline`; the
        current bar measured 2.57:1 in the T-159 sweep at 1024 and 390. The
        bars are the graphic; this line is the text, on the page ground. */}
      <p className="sr-only">
        {steps.map((step) => `Langkah ${step.label}: ${STATE_WORD[step.state]}`).join(". ")}
      </p>
    </nav>
  );
}
