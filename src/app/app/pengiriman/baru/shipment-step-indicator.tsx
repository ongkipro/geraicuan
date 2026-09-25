import { Check } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
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
 * T-205: the owner's reference puts the three steps in one card under the page
 * header, across the page at every width (it replaced the rail list and the
 * separate mobile bar, so the steps are read once, in one place). Design spec §7.1
 * still holds: a list of states, not tabs; `aria-current="step"` plus a visible
 * state word carry the current step, and colour is additive only.
 */
export function ShipmentStepIndicator({ steps }: { steps: ShipmentStep[] }) {
  return (
    <Card>
      <CardContent>
        <nav aria-label="Tahapan pembuatan kiriman">
          <ol className="flex items-start gap-2 sm:items-center sm:gap-3">
            {steps.map((step, index) => (
              <li
                aria-current={step.state === "current" ? "step" : undefined}
                className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left"
                data-state={step.state}
                key={step.label}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
                    // Spec 10 §1.9/§5 (T-203): the current step is the one blue mark; done is the
                    // neutral accent marker with a check, pending an outlined number.
                    step.state === "done" && "bg-accent text-accent-foreground",
                    step.state === "current" && "bg-primary text-primary-foreground",
                    step.state === "pending" && "border border-input text-muted-foreground",
                  )}
                >
                  {step.state === "done" ? <Check className="size-4" /> : index + 1}
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className={cn("text-sm", step.state === "current" ? "font-semibold" : "font-medium")}>{step.label}</span>
                  <span className="text-xs text-muted-foreground wrap-anywhere">{step.detail ?? STATE_WORD[step.state]}</span>
                </span>
                {index < steps.length - 1 ? (
                  <span aria-hidden="true" className="hidden h-px min-w-6 flex-1 bg-border sm:block" />
                ) : null}
              </li>
            ))}
          </ol>
        </nav>
      </CardContent>
    </Card>
  );
}
