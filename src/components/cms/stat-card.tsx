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
  /** Vibrant iOS accent tone */
  accent?: "blue" | "emerald" | "indigo" | "amber" | "rose" | "neutral";
};

const accentMap = {
  blue: {
    card: "hover:border-blue-500/40",
    icon: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
  },
  emerald: {
    card: "hover:border-emerald-500/40",
    icon: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
  },
  indigo: {
    card: "hover:border-indigo-500/40",
    icon: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
  },
  amber: {
    card: "hover:border-amber-500/40",
    icon: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  },
  rose: {
    card: "hover:border-rose-500/40",
    icon: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
  },
  neutral: {
    card: "hover:border-primary/40",
    icon: "bg-muted text-muted-foreground",
  },
} as const;

/** Dashboard KPI card on Apple iOS glassmorphism standards. Server component. */
export function StatCard({ accent = "neutral", className, description, footer, href, icon: Icon, title, value, valueLabel }: StatCardProps) {
  const descriptionId = useId();
  const titleId = useId();
  const valueId = useId();
  const spokenValue = valueLabel ?? (typeof value === "string" || typeof value === "number" ? String(value) : undefined);
  const theme = accentMap[accent] ?? accentMap.neutral;

  const card = (
    <Card
      className={cn(
        "h-full gap-2.5 rounded-2xl p-5 border border-border/60 transition-all duration-200 backdrop-blur-xl bg-card/85 shadow-xs",
        href && "hover:-translate-y-0.5 hover:shadow-md hover:border-border active:scale-[0.99]",
        href && theme.card,
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-0">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground" data-slot="card-title" id={titleId}>{title}</div>
        {Icon ? (
          <span className={cn("flex size-9 items-center justify-center rounded-xl transition-all duration-200", theme.icon)}>
            <Icon aria-hidden="true" className="size-4.5 shrink-0" />
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-1.5 p-0">
        <div className="text-3xl sm:text-[2rem] font-bold tracking-tight tabular-nums text-foreground leading-none py-0.5" data-slot="stat-value" id={valueId}>{value}</div>
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
      className="group/stat block h-full min-h-11 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
    >
      {card}
    </Link>
  );
}
