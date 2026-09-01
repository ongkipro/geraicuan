import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DetailSection({
  children,
  className,
  description,
  id,
  title,
}: {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  id: string;
  title: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("grid gap-4 border-b pb-6", className)}>
      <div>
        <h2 className="font-medium" id={id}>{title}</h2>
        {description ? <div className="mt-1 text-sm leading-6 text-muted-foreground">{description}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function DefinitionGrid({
  items,
}: {
  items: readonly { label: ReactNode; value: ReactNode }[];
}) {
  return (
    <dl className="grid overflow-hidden rounded-lg border sm:grid-cols-2">
      {items.map((item, index) => (
        <div className={cn("grid gap-1 p-3", index > 0 && "border-t", index === 1 && "sm:border-t-0", index % 2 === 1 && "sm:border-l")} key={index}>
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 break-words text-sm font-medium tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
