import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  action?: ReactNode;
  description: ReactNode;
  icon: LucideIcon;
  title: ReactNode;
};

export function EmptyState({ action, description, icon: Icon, title }: EmptyStateProps) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center border-y px-4 py-12 text-center">
      <div className="mb-4 flex size-10 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
        <Icon aria-hidden="true" className="size-5" />
      </div>
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      <div className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</div>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
