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
    <section aria-labelledby={id} className={cn("grid min-w-0 gap-4 border-t pt-6", className)}>
      <div>
        <h2 className="text-base font-semibold" id={id}>{title}</h2>
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
    <dl className="grid min-w-0 gap-x-8 sm:grid-cols-2">
      {items.map((item, index) => (
        <div className={cn("grid min-w-0 gap-1 border-b py-3")} key={index}>
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 break-words text-sm font-medium tabular-nums text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
