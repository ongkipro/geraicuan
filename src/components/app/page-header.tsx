import type { ReactNode } from "react";

/**
 * Spec 10 v3.2 §4.1 page header (Mengantar look, D5): H1 (= menu label) 32/700 navy with no
 * eyebrow, actions on the right (at most one filled primary; the rest outline, "?" help instead
 * of a Tutorial button). A description line renders only where a screen contract passes one.
 */
export function PageHeader({
  actions,
  back,
  description,
  title,
}: {
  actions?: ReactNode;
  /** A back link rendered above the title on detail pages. */
  back?: ReactNode;
  description?: ReactNode;
  /** Retired in v3.2 (no eyebrow); accepted and ignored so callers need no edit. */
  eyebrow?: string;
  title: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        {back ? <div className="mb-2">{back}</div> : null}
        <h1 className="text-h1 font-bold text-foreground max-md:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto md:flex-nowrap max-md:*:flex-1">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
