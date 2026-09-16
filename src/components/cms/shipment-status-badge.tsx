import { CircleAlert, CircleCheck, Clock3, FilePenLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * One tone vocabulary for the whole CMS (T-155). Lifecycle, severity and finance all
 * read from it, so "perhatian" cannot be amber in one place and grey in another. Every
 * tone carries an icon as well as a colour: status never depends on colour alone.
 */
export const toneClass = {
  danger: "border-transparent bg-[var(--danger-surface)] text-[var(--danger)]",
  neutral: "border-border bg-muted text-muted-foreground",
  ok: "border-transparent bg-[var(--ok-surface)] text-[var(--ok)]",
  warn: "border-transparent bg-[var(--warn-surface)] text-[var(--warn)]",
} as const;

export const toneIcon = {
  danger: CircleAlert,
  neutral: FilePenLine,
  ok: CircleCheck,
  warn: Clock3,
} as const;

export type StatusTone = keyof typeof toneClass;

/** Round badge for severity and other non-lifecycle states (spec 10 §119). */
export function ToneBadge({ label, tone }: { label: string; tone: StatusTone }) {
  const Icon = toneIcon[tone];
  return (
    <Badge className={cn("rounded-full", toneClass[tone])} variant="outline">
      <Icon aria-hidden="true" data-icon="inline-start" />
      {label}
    </Badge>
  );
}

export function ShipmentStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof toneClass;
}) {
  const Icon = toneIcon[tone];
  return (
    <Badge className={cn("rounded-md", toneClass[tone])} variant="outline">
      <Icon aria-hidden="true" data-icon="inline-start" />
      {label}
    </Badge>
  );
}
