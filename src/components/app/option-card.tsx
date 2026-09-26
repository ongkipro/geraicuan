import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A selectable radio option card (handover type, pickup vehicle, payment method, member role):
 * 1px input border; selected = accent + 2px primary. The native radio carries `name`/`value`,
 * so it submits with the surrounding form like any radio.
 */
export function OptionCard({ checked, children, description, disabled, icon, name, onSelect, value }: {
  checked: boolean;
  children: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  name: string;
  onSelect: () => void;
  value: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-input has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        checked && "border-2 border-primary bg-accent hover:border-primary",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="flex flex-col gap-1">
        <span className={cn("flex flex-wrap items-center gap-2 text-base font-bold", checked ? "text-accent-foreground" : "text-foreground")}>
          {icon}
          {children}
        </span>
        {description ? <span className={cn("text-xs", checked ? "text-accent-foreground" : "text-muted-foreground")}>{description}</span> : null}
      </span>
      <input checked={checked} className="mt-1 size-4 shrink-0 accent-primary" disabled={disabled} name={name} onChange={onSelect} type="radio" value={value} />
    </label>
  );
}
