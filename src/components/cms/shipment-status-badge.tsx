import { CircleAlert, CircleCheck, Clock3, FilePenLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const toneClass = {
  danger: "border-transparent bg-[var(--danger-surface)] text-[var(--danger)]",
  neutral: "border-border bg-muted text-muted-foreground",
  ok: "border-transparent bg-[var(--ok-surface)] text-[var(--ok)]",
  warn: "border-transparent bg-[var(--warn-surface)] text-[var(--warn)]",
} as const;

const toneIcon = {
  danger: CircleAlert,
  neutral: FilePenLine,
  ok: CircleCheck,
  warn: Clock3,
} as const;

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
