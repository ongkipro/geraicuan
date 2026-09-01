import type { ReactNode } from "react";

type PageHeaderProps = {
  actions?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  focusTargetId?: string;
  title: ReactNode;
};

export function PageHeader({ actions, description, eyebrow, focusTargetId, title }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className="rounded-sm text-2xl font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-3xl"
          id={focusTargetId}
          tabIndex={focusTargetId ? -1 : undefined}
        >
          {title}
        </h1>
        {description ? (
          <div className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full [&>*]:min-h-11">{actions}</div> : null}
    </header>
  );
}
