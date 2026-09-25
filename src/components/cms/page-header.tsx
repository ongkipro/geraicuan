import type { ReactNode } from "react";

type PageHeaderProps = {
  actions?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  focusTargetId?: string;
  title: ReactNode;
};

/**
 * shadcn-admin page heading: eyebrow, bold title, muted description, actions on the right.
 * T-204 reference spacing: 13px uppercase eyebrow, 4px to the 26px title, 4px to the 15px
 * description; actions centred beside the text from md and full width (44px) below it.
 */
export function PageHeader({ actions, description, eyebrow, focusTargetId, title }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
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
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3 max-md:w-full max-md:[&>*]:min-h-11 max-md:[&>*]:flex-1">{actions}</div> : null}
    </header>
  );
}
