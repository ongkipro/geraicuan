import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Spec 10 §6: an empty region says why it is empty and offers the next action. */
export function EmptyState({
  action,
  description,
  icon: Icon = Inbox,
  title,
}: {
  action?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center" data-slot="empty-state">
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </span>
      <div className="grid max-w-md gap-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}
