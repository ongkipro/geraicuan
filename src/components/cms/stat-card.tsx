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
};

/** Dashboard KPI card on the shadcn-admin anatomy. Server component. */
export function StatCard({ className, description, footer, href, icon: Icon, title, value, valueLabel }: StatCardProps) {
  const descriptionId = useId();
  const titleId = useId();
  const valueId = useId();
  const spokenValue = valueLabel ?? (typeof value === "string" || typeof value === "number" ? String(value) : undefined);
  const card = (
    <Card
      className={cn(
        "h-full gap-2",
        href && "transition-colors group-hover/stat:bg-muted/40",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
        {/* A div, not CardTitle's h2: four KPI headings would crowd the page outline. */}
        <div className="text-sm font-medium" data-slot="card-title" id={titleId}>{title}</div>
        {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /> : null}
      </CardHeader>
      <CardContent className="grid gap-1">
        <div className="text-2xl font-bold tabular-nums" data-slot="stat-value" id={valueId}>{value}</div>
        {description ? <div className="text-xs text-muted-foreground" data-slot="stat-description" id={descriptionId}>{description}</div> : null}
      </CardContent>
      {footer ? <CardFooter className="text-xs text-muted-foreground">{footer}</CardFooter> : null}
    </Card>
  );

  if (!href) return card;

  return (
    <Link
      aria-describedby={description ? descriptionId : undefined}
      // A ReactNode value has no safe string form: name the link by the rendered title and value instead.
      aria-label={spokenValue === undefined ? undefined : `${title}: ${spokenValue}`}
      aria-labelledby={spokenValue === undefined ? `${titleId} ${valueId}` : undefined}
      className="group/stat block min-h-11 rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
      href={href}
    >
      {card}
    </Link>
  );
}
