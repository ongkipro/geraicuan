import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatCardProps = {
  /** KPI label, e.g. "Kiriman dibuat". */
  title: string;
  /** Already-formatted value, e.g. "1.204" or "Rp 2,4 jt". */
  value: ReactNode;
  /** Spoken value for the link name when `value` is not plain text; without it the link is named by the rendered title and value. */
  valueLabel?: string;
  icon?: LucideIcon;
  /** Muted `text-xs` line under the value (comparison, disclosure). */
  description?: ReactNode;
  /** When set the whole card is one link named "title: value". */
  href?: string;
  footer?: ReactNode;
  className?: string;
  /** Accepted for existing callers; spec 10 v2 has one neutral StatCard, so it no longer changes colour. */
  accent?: "blue" | "emerald" | "indigo" | "amber" | "rose" | "neutral";
};

/** Dashboard KPI card (spec 10 §6): label → value → context line, one neutral variant. Server component. */
export function StatCard({ className, description, footer, href, icon: Icon, title, value, valueLabel }: StatCardProps) {
  const descriptionId = useId();
  const titleId = useId();
  const valueId = useId();
  const spokenValue = valueLabel ?? (typeof value === "string" || typeof value === "number" ? String(value) : undefined);

  const card = (
    <Card
      className={cn(
        "h-full gap-2 p-4 sm:p-5",
        href && "transition-colors hover:bg-accent/40",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-0">
        <div className="text-sm font-medium text-muted-foreground" data-slot="card-title" id={titleId}>{title}</div>
        {Icon ? (
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-1.5 p-0">
        <div className="text-3xl font-bold leading-none tracking-tight tabular-nums text-foreground" data-slot="stat-value" id={valueId}>{value}</div>
        {description ? <div className="text-xs text-muted-foreground" data-slot="stat-description" id={descriptionId}>{description}</div> : null}
      </CardContent>
      {footer ? <CardFooter className="p-0 pt-1 text-xs text-muted-foreground">{footer}</CardFooter> : null}
    </Card>
  );

  if (!href) return card;

  return (
    <Link
      aria-describedby={description ? descriptionId : undefined}
      aria-label={spokenValue === undefined ? undefined : `${title}: ${spokenValue}`}
      aria-labelledby={spokenValue === undefined ? `${titleId} ${valueId}` : undefined}
      className="group/stat block h-full min-h-11 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
    >
      {card}
    </Link>
  );
}
