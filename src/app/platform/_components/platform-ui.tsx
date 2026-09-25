import { ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { auditOutcomeLabel, tenantStatusLabel, tenantStatusTone } from "@/lib/labels/audit";
import { cn } from "@/lib/utils";

import { badgeTone, wibParts } from "./platform-format";
import { RetryButton } from "./retry-button";

const number = new Intl.NumberFormat("id-ID");

/**
 * Spec 10 §4.3 card of a platform page: title 18/700 as the region's h2, an optional count
 * badge, an action at the right; `flush` puts a divider under the header for a table body.
 */
export function PlatformCard({
  action,
  children,
  className,
  count,
  countNoun,
  description,
  flush = false,
  footer,
  id,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  count?: number;
  countNoun?: string;
  description?: ReactNode;
  flush?: boolean;
  footer?: ReactNode;
  id: string;
  title: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col", className)}>
      <Card className={cn("min-w-0 flex-1", flush ? "gap-0 pb-0 has-data-[slot=card-footer]:pb-0" : "gap-4")}>
        <CardHeader className={cn(flush && "border-b")}>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <h2 id={id}>{title}</h2>
            {count !== undefined ? (
              <Badge className="tabular-nums" variant="secondary">
                {number.format(count)}
                {countNoun ? ` ${countNoun}` : ""}
              </Badge>
            ) : null}
          </CardTitle>
          {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
          {action ? <CardAction className="flex items-center gap-3">{action}</CardAction> : null}
        </CardHeader>
        <CardContent className={cn("min-w-0", flush ? "px-0" : "flex flex-col gap-4")}>{children}</CardContent>
        {footer ? <CardFooter className={cn(flush && "border-t py-4")}>{footer}</CardFooter> : null}
      </Card>
    </section>
  );
}

/** The reference's plain arrow link ("Lihat semua tenant →"). */
export function ArrowLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline md:min-h-6"
      href={href}
      prefetch={false}
    >
      {children}
      <ChevronRight aria-hidden="true" className="size-4" />
    </Link>
  );
}

/** A region whose read failed: its cause, and the rest of the page keeps working (spec 10 §6). */
export function RegionError({ title }: { title: string }) {
  return (
    <Alert role="alert" variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{title} tidak dapat dimuat</AlertTitle>
      <AlertDescription className="grid gap-3">
        <p>Bagian lain halaman tetap dapat dipakai.</p>
        <div><RetryButton /></div>
      </AlertDescription>
    </Alert>
  );
}

export function TenantStatusBadge({ status }: { status: string }) {
  return <StatusBadge label={tenantStatusLabel(status)} tone={badgeTone(tenantStatusTone(status))} />;
}

export function AuditOutcomeBadge({ outcome }: { outcome: string }) {
  const { label, tone } = auditOutcomeLabel(outcome);
  return <StatusBadge label={label} tone={badgeTone(tone)} />;
}

/** Date on the first line (15px), time WIB under it (13px muted). */
export function TimeCell({ instant }: { instant: Date }) {
  const { date, time } = wibParts(instant);
  return (
    <span className="flex flex-col">
      <span className="whitespace-nowrap">{date}</span>
      <span className="text-xs whitespace-nowrap text-muted-foreground">{time}</span>
    </span>
  );
}

/** Two-line cell: primary 15px ink, secondary 13px muted (spec 10 §4.4). */
export function StackCell({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="min-w-0">{primary}</span>
      {secondary ? <span className="text-xs text-muted-foreground">{secondary}</span> : null}
    </span>
  );
}

/**
 * Spec 10 §4.4 footer: "Menampilkan 1–25 dari 60 …" and plain page links, so paging works
 * before hydration and keeps the rest of the URL.
 */
export function PlatformPagination({
  hrefForPage,
  label,
  noun,
  page,
  pageSize,
  total,
}: {
  hrefForPage: (page: number) => string;
  label: string;
  noun: string;
  page: number;
  pageSize: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, total);
  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-slot="platform-pagination">
      <p className="text-xs text-muted-foreground tabular-nums">
        Menampilkan <strong className="font-semibold text-foreground">{number.format(first)}–{number.format(last)}</strong> dari{" "}
        <strong className="font-semibold text-foreground">{number.format(total)}</strong> {noun}
      </p>
      {totalPages > 1 ? (
        <nav aria-label={label} className="flex items-center gap-2">
          <PageLink disabled={current <= 1} href={hrefForPage(current - 1)} label="Halaman sebelumnya">
            <ChevronLeft aria-hidden="true" />
            Sebelumnya
          </PageLink>
          <span className="px-1 text-xs text-muted-foreground tabular-nums">
            {number.format(current)} / {number.format(totalPages)}
          </span>
          <PageLink disabled={current >= totalPages} href={hrefForPage(current + 1)} label="Halaman berikutnya">
            Berikutnya
            <ChevronRight aria-hidden="true" />
          </PageLink>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({ children, disabled, href, label }: { children: ReactNode; disabled: boolean; href: string; label: string }) {
  if (disabled) {
    return (
      <Button aria-label={label} className="px-3" disabled type="button" variant="outline">
        {children}
      </Button>
    );
  }
  return (
    <Button asChild className="px-3" variant="outline">
      <Link aria-label={label} href={href} prefetch={false}>{children}</Link>
    </Button>
  );
}

/** A table that runs edge to edge in a flush card: its outer cells line up with the card's 24px padding. */
export const FLUSH_TABLE =
  "[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6 max-md:[&_td:first-child]:pl-4 max-md:[&_th:first-child]:pl-4";
/** Desktop table / phone record list switch (spec 10 §4.4–4.5). */
export const DESKTOP_ONLY = "max-md:hidden";
// The shared RecordItem is a one-column grid whose track grows to a long nowrap title; pin it to
// the container so the title truncates instead of pushing the badge off-screen.
export const PHONE_ONLY = "md:hidden [&_[data-slot=record-item]]:grid-cols-[minmax(0,1fr)]";
