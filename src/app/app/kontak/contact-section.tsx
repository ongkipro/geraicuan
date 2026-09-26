import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

/**
 * T-246 (owner 2026-09-26): the contact detail page is one white surface; below the KPI cards
 * each region is a flat section — title 18/700 (+ count badge), optional one-line description,
 * action at the right — separated from the one above by a hairline, with no card chrome.
 */
export function ContactSection({
  action,
  children,
  count,
  description,
  id,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  count?: number;
  description?: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4 border-t pt-6" data-slot="contact-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground" id={id}>{title}</h2>
            {count !== undefined ? <Badge className="tabular-nums" variant="secondary">{count}</Badge> : null}
          </div>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
