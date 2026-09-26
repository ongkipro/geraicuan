import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Spec 10 §4.3 card: title (16/600) with an optional count badge, "?" help or action at the
 * right; an optional one-line description; a body; a right-aligned footer. `flush` is for a
 * table body: the header gets its 1px divider and the table runs edge to edge (no inner frame).
 */
export function DataCard({
  action,
  children,
  count,
  description,
  flush = false,
  footer,
  title,
  titleAs: Title = "h2",
}: {
  action?: ReactNode;
  children: ReactNode;
  count?: number;
  description?: ReactNode;
  flush?: boolean;
  footer?: ReactNode;
  title?: ReactNode;
  titleAs?: "h2" | "h3";
}) {
  const hasHeader = Boolean(title || action || count !== undefined);
  return (
    <Card className={cn(flush && "gap-0")} data-flush={flush || undefined}>
      {hasHeader ? (
        <CardHeader className={cn(flush && "border-b")}>
          {title ? (
            <CardTitle className="flex items-center gap-2">
              <Title>{title}</Title>
              {count !== undefined ? <Badge className="tabular-nums" variant="secondary">{count}</Badge> : null}
            </CardTitle>
          ) : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
          {action ? <CardAction className="flex items-center gap-2">{action}</CardAction> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn(flush ? "px-0" : "flex flex-col gap-4")}>{children}</CardContent>
      {footer ? <CardFooter className={cn(flush && "flex-wrap justify-between")}>{footer}</CardFooter> : null}
    </Card>
  );
}
