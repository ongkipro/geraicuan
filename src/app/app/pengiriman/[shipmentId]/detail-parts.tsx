import { ArrowLeft, Store, Truck, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatWibDateTime } from "@/lib/label-format";
import { cn } from "@/lib/utils";

import { CopyValueButton } from "./copy-button";
import type { AttentionSignal, TrackingEntry } from "./detail-model";

/**
 * T-213 building blocks measured from `detail-kiriman.html` (card: 24px padding, 18/700 title,
 * 8px under it to a divider, 16px to the body) in the Mengantar order-detail order (owner,
 * 2026-09-26): identity strip → route → pelacakan → paket → penerima → pengirim.
 */

export function DetailCard({ children, className, id, title }: {
  children: ReactNode;
  className?: string;
  id: string;
  title: string;
}) {
  return (
    <Card aria-labelledby={id} className={cn("gap-4", className)} role="region">
      <CardHeader>
        <CardTitle className="border-b pb-2">
          <h2 id={id}>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

export type DefinitionItem = { label: string; value: ReactNode; wide?: boolean };

/** Label 13px muted over a 15px/600 value, two columns from `sm`. */
export function DefinitionGrid({ items }: { items: readonly DefinitionItem[] }) {
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <div className={cn("flex min-w-0 flex-col gap-0.5", item.wide && "sm:col-span-2")} key={item.label}>
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="text-sm font-semibold wrap-anywhere text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export type IdentityItem = { copy?: string; label: string; mono?: boolean; value: string };

/** Nomor kiriman · Resi · Penerima · Telepon, each copyable (Mengantar identity strip); number and resi 18px mono bold (spec 10 §2.4). */
export function IdentityStrip({ items }: { items: readonly IdentityItem[] }) {
  return (
    <Card aria-label="Identitas kiriman" role="region" size="default">
      <CardContent>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:flex md:flex-wrap md:justify-between md:gap-x-8">
          {items.map((item) => (
            <div className="flex min-w-0 flex-col gap-0.5" key={item.label}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="flex min-w-0 items-center gap-1">
                <span className={cn("min-w-0 text-sm font-semibold wrap-anywhere tabular-nums", item.mono && "font-mono text-lg font-bold", !item.copy && "font-medium text-muted-foreground")}>
                  {item.value}
                </span>
                {item.copy ? <CopyValueButton label={item.label} value={item.copy} /> : null}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function RouteStop({ align, detail, icon: Icon, label, title }: {
  align: "start" | "center" | "end";
  detail?: ReactNode;
  icon: LucideIcon;
  label: string;
  title: ReactNode;
}) {
  return (
    <li className={cn(
      "relative z-10 flex min-w-0 flex-1 flex-col gap-2",
      align === "start" && "items-start text-left",
      align === "center" && "items-center text-center",
      align === "end" && "items-end text-right",
    )}>
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-card">
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold wrap-anywhere">{title}</span>
        {detail ? <span className="text-xs text-muted-foreground wrap-anywhere">{detail}</span> : null}
      </span>
    </li>
  );
}

/** Pengirim — kurir — Penerima joined by one line, with the delivery estimate under the courier. */
export function RouteHeader({ courier, estimate, recipient, sender }: {
  courier: { detail?: ReactNode; title: ReactNode };
  estimate: string | null;
  recipient: { detail?: ReactNode; title: ReactNode };
  sender: { detail?: ReactNode; title: ReactNode };
}) {
  return (
    <Card aria-label="Rute kiriman" role="region">
      <CardContent>
        <ol className="relative flex items-start justify-between gap-3">
          <span aria-hidden="true" className="absolute top-5 right-5 left-5 h-0.5 bg-primary" />
          <RouteStop align="start" detail={sender.detail} icon={Store} label="Pengirim" title={sender.title} />
          <RouteStop
            align="center"
            detail={estimate ? `Estimasi tiba ${estimate}` : courier.detail}
            icon={Truck}
            label="Ekspedisi"
            title={courier.title}
          />
          <RouteStop align="end" detail={recipient.detail} icon={UserRound} label="Penerima" title={recipient.title} />
        </ol>
      </CardContent>
    </Card>
  );
}

/** Newest first; time 13px muted, status 15px ink, Mengantar's description 13px muted. */
export function TrackingTimeline({ entries }: { entries: readonly TrackingEntry[] }) {
  return (
    <ol className="relative flex flex-col gap-6 pl-6 before:absolute before:top-2 before:bottom-2 before:left-2 before:w-0.5 before:bg-border">
      {entries.map((entry, index) => (
        <li className="relative flex flex-col gap-0.5" key={entry.key}>
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1 -left-6 flex size-4 items-center justify-center rounded-full border-2 bg-card",
              index === 0 ? "border-ok bg-ok-surface" : "border-input",
            )}
          >
            {index === 0 ? <span className="size-1.5 rounded-full bg-ok" /> : null}
          </span>
          <time className="text-xs text-muted-foreground" dateTime={entry.at.toISOString()}>{formatWibDateTime(entry.at)}</time>
          <span className={cn("text-sm text-foreground", index === 0 ? "font-bold" : "font-medium")}>{entry.title}</span>
          {entry.detail ? <span className="text-xs text-muted-foreground wrap-anywhere">{entry.detail}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * T-238 "Perlu perhatian": Mengantar's own attention fields as small badges in the status card.
 * Tenant Admin only (they come from the provider observation); nothing renders without one.
 */
export function AttentionSignals({ signals }: { signals: readonly AttentionSignal[] }) {
  if (signals.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 border-t pt-2">
      <h3 className="text-xs font-medium text-muted-foreground">Catatan dari Mengantar</h3>
      <ul aria-label="Catatan dari Mengantar" className="flex flex-wrap gap-1.5">
        {signals.map((signal) => (
          <li
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs font-medium wrap-anywhere",
              signal.urgent ? "border-warn/40 bg-warn-surface text-warn" : "bg-muted text-muted-foreground",
            )}
            key={signal.key}
          >
            {signal.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Back link above the eyebrow (spec 10 §4.9), 13px/600 primary as in the reference. */
export function BackToQueue({ href }: { href: string }) {
  return (
    <Link className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline md:min-h-6" href={href}>
      <ArrowLeft aria-hidden="true" className="size-4" />
      Kembali ke histori kiriman
    </Link>
  );
}
