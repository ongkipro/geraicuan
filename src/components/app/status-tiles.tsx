import {
  ArrowUpRight,
  Check,
  CircleCheck,
  Clock,
  Layers,
  TriangleAlert,
  Truck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { shipmentStatusIcon, shipmentStatusTone, type StatusTone } from "@/components/app/status-badge";
import { cn } from "@/lib/utils";

export type StatusTile = {
  count: number;
  hint?: string;
  href: string;
  /** Overrides the icon; defaults to the §4.12 status icon when `key` is a status, else the tone's. */
  icon?: LucideIcon;
  key: string;
  label: string;
  selected: boolean;
  /** Pastel tint by meaning; defaults to the shipment status tone when `key` is a status, else neutral. */
  tone?: StatusTone;
};

const number = new Intl.NumberFormat("id-ID");

/** Spec 10 v3.2 §2.1: one pastel tint per meaning, only on tiles; the ink/bar colour of the same meaning. */
const TONE: Record<StatusTone, { tint: string; ink: string; bar: string; icon: LucideIcon }> = {
  danger: { bar: "bg-danger", icon: TriangleAlert, ink: "text-danger", tint: "bg-tile-danger" },
  info: { bar: "bg-info", icon: Truck, ink: "text-info", tint: "bg-tile-info" },
  neutral: { bar: "bg-primary", icon: Layers, ink: "text-primary", tint: "bg-tile" },
  success: { bar: "bg-ok", icon: CircleCheck, ink: "text-ok", tint: "bg-tile-ok" },
  warning: { bar: "bg-warn", icon: Clock, ink: "text-warn", tint: "bg-tile-warn" },
};

/**
 * Columns follow the tile count, so a page never restyles the grid: six tiles only from `xl`
 * (at 1024px six columns left 68px for a label), five and four fill one row.
 */
const COLUMNS: Record<number, string> = {
  4: "md:grid-cols-4",
  5: "md:grid-cols-3 xl:grid-cols-5",
  6: "md:grid-cols-3 xl:grid-cols-6",
};

/**
 * The share a tile shows: its count over the page's stated base, rounded; 0 when the base is 0.
 * Spec 19 names the base per page (QUE-SHARE, RTS-SHARE, LBL-SHARE). A count above its base
 * is a caller bug, so it is not clamped away.
 */
export function tileShare(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

/**
 * Spec 10 v3.2 §4.6 queue filters (owner 2026-09-26: "lebih menarik dan dinamis, presisi"):
 * one white card of up to six pastel tiles (two columns on a phone). Each tile: a tone icon
 * chip (the §4.12 status icon) and, on hover, an arrow; the label, never truncated; the count;
 * its share of `total` as a thin bar and "x% · hint". Tiles in a row share their row tracks
 * (subgrid), so a label that wraps keeps every count on one line. The selected tile gets a
 * 2px primary ring and a check. T-247 (review L9): `total` is the page's explicit base
 * (spec 19 QUE-SHARE / RTS-SHARE / LBL-SHARE), never inferred from the largest count.
 */
export function StatusTiles({ label, tiles, total }: { label: string; tiles: StatusTile[]; total: number }) {
  return (
    <nav aria-label={label} className="rounded-2xl bg-card p-4 shadow-card">
      <ul className={cn("grid grid-cols-2 gap-3", COLUMNS[tiles.length] ?? COLUMNS[6])}>
        {tiles.map((tile) => {
          const toneKey = tile.tone ?? shipmentStatusTone(tile.key) ?? "neutral";
          const tone = TONE[toneKey];
          const Icon = tile.icon ?? shipmentStatusIcon(tile.key) ?? tone.icon;
          const percent = tileShare(tile.count, total);
          return (
            <li className="row-span-5 grid min-w-0 grid-rows-subgrid gap-y-2" key={tile.key}>
              <Link
                aria-current={tile.selected ? "true" : undefined}
                className={cn(
                  "group/tile relative row-span-5 grid min-w-0 grid-rows-subgrid gap-y-2 rounded-xl p-4 outline-none transition-[box-shadow,transform] duration-150",
                  "hover:-translate-y-0.5 hover:shadow-card focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                  tone.tint,
                  tile.selected && "ring-2 ring-primary",
                )}
                data-tone={toneKey}
                href={tile.href}
              >
                <span className="flex items-center justify-between">
                  <span aria-hidden="true" className={cn("flex size-9 items-center justify-center rounded-lg bg-card/80", tone.ink)}>
                    <Icon className="size-5" />
                  </span>
                  {tile.selected ? (
                    <Check aria-hidden="true" className="size-5 text-primary" />
                  ) : (
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-5 text-muted-foreground opacity-0 transition-opacity group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100"
                    />
                  )}
                </span>
                <span className="text-sm font-medium text-balance text-foreground">{tile.label}</span>
                <span className="text-3xl leading-none font-bold tabular-nums text-foreground">{number.format(tile.count)}</span>
                <span className="mt-1 flex items-center gap-2">
                  <span aria-hidden="true" className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
                    <span className={cn("block h-full rounded-full", tone.bar)} style={{ width: `${Math.min(100, percent)}%` }} />
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">{percent}%</span>
                </span>
                <span className="text-xs text-muted-foreground">{tile.hint}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
