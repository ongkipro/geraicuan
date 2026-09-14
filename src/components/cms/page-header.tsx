import type { ReactNode } from "react";

type PageHeaderProps = {
  actions?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  focusTargetId?: string;
  title: ReactNode;
};

/** shadcn-admin page heading: eyebrow, bold title, muted description, actions on the right. */
export function PageHeader({ actions, description, eyebrow, focusTargetId, title }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0 space-y-0.5">
        {eyebrow ? (
          <p className="text-xs font-medium text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className="rounded-sm text-2xl font-bold tracking-tight text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          id={focusTargetId}
          tabIndex={focusTargetId ? -1 : undefined}
        >
          {title}
        </h1>
        {description ? (
          <div className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full [&>*]:min-h-11 md:[&>*]:min-h-8">{actions}</div> : null}
    </header>
  );
}
