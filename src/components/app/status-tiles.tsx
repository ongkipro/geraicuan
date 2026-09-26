import {
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
  /** Icon and composition colour by meaning; defaults to the shipment status tone when `key` is a status, else neutral. */
  tone?: StatusTone;
};

const number = new Intl.NumberFormat("id-ID");

/** Spec 10 v3.2 §2.1: the ink (icon) and bar colour of each meaning. */
const TONE: Record<StatusTone, { ink: string; bar: string; icon: LucideIcon }> = {
  danger: { bar: "bg-danger", icon: TriangleAlert, ink: "text-danger" },
  info: { bar: "bg-info", icon: Truck, ink: "text-info" },
  neutral: { bar: "bg-muted-foreground", icon: Layers, ink: "text-primary" },
  success: { bar: "bg-ok", icon: CircleCheck, ink: "text-ok" },
  warning: { bar: "bg-warn", icon: Clock, ink: "text-warn" },
};

/**
 * Spec 10 §4.6 stat strip (T-248). Breakpoints are container queries on the strip, so the
 * sidebar's width is already paid: one row from a 56rem strip (1280px viewport and up) for five
 * and six tiles, from 36rem for four; below that three columns (two for four tiles) in rows. A
 * row with one cell short gets its last cell stretched, so the 1px dividers never frame a hole.
 * The five- and six-tile row is a flex row whose cells start at their content width and share
 * the rest equally: equal cells left 103px for "Dalam perjalanan" at 1280px and wrapped it.
 */
export const STATUS_TILE_LAYOUT: Record<number, { grid: string; last: string }> = {
  4: { grid: "grid-cols-2 @xl:grid-cols-4", last: "" },
  5: { grid: "grid-cols-3 @4xl:flex", last: "col-span-2 @4xl:col-span-1" },
  6: { grid: "grid-cols-3 @4xl:flex", last: "" },
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
 * Spec 10 v3.2 §4.6 queue filters as a compact stat strip (T-248, owner 2026-09-26: "rapikan
 * lagi biar kecil2"). One card of equal segments split by 1px dividers; each segment is its
 * filter link: the §4.12 status icon (16px, tone ink) + label (13/500 muted, never truncated),
 * then the count (20/600) and its share of `total` in muted 13px. The first tile is the page's
 * "all" filter and carries no share. The hint is screen-reader text. One stacked composition
 * bar along the bottom edge shows the other tiles' shares of `total` (zero takes no width), with
 * a screen-reader breakdown that also names the part of `total` no tile covers. Selected: 2px
 * primary bottom indicator, primary text, aria-current. T-247 (review L9): `total` is the page's
 * explicit base (spec 19 QUE-SHARE / RTS-SHARE / LBL-SHARE), never inferred from the largest count.
 */
export function StatusTiles({ label, tiles, total }: { label: string; tiles: StatusTile[]; total: number }) {
  const layout = STATUS_TILE_LAYOUT[tiles.length] ?? STATUS_TILE_LAYOUT[6];
  const segments = compositionSegments(tiles, total);
  const active = tiles.slice(1).find((tile) => tile.selected)?.key;
  const breakdown = segments.map((segment) =>
    `${segment.label} ${number.format(segment.count)} (${tileShare(segment.count, total)}%${segment.key === active ? ", dipilih" : ""})`);
  return (
    <nav aria-label={label} className="@container overflow-hidden rounded-2xl bg-card shadow-card">
      <ul className={cn("grid gap-px bg-border", layout.grid)}>
        {tiles.map((tile, index) => {
          const toneKey = toneOf(tile);
          const Icon = tile.icon ?? shipmentStatusIcon(tile.key) ?? TONE[toneKey].icon;
          return (
            <li className={cn("flex min-w-0 bg-card @4xl:flex-auto", index === tiles.length - 1 && layout.last)} key={tile.key}>
              <Link
                aria-current={tile.selected ? "true" : undefined}
                className={cn(
                  "relative flex min-h-16 w-full min-w-0 flex-col justify-between gap-1 px-3 py-2.5 outline-none transition-colors @xl:px-4 @xl:py-3",
                  "hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  tile.selected && "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
                )}
                data-tone={toneKey}
                href={tile.href}
              >
                <span className={cn("text-xs font-medium text-balance", tile.selected ? "text-primary" : "text-muted-foreground")}>
                  <Icon aria-hidden="true" className={cn("mr-1.5 inline size-4 align-[-3px]", TONE[toneKey].ink)} />
                  {tile.label}
                </span>
                <span className="flex items-baseline gap-1.5 whitespace-nowrap pt-0.5">
                  <span className={cn("text-xl leading-none font-semibold tabular-nums", tile.selected ? "text-primary" : "text-foreground")}>
                    {number.format(tile.count)}
                  </span>
                  {index > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{tileShare(tile.count, total)}%</span> : null}
                </span>
                {tile.hint ? <span className="sr-only">, {tile.hint}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* The bar and its legend repeat the sentence below for sight; the active status stays full tone. */}
      <div aria-hidden="true" data-slot="tile-composition">
        <span className="flex h-2 items-end gap-0.5">
          {segments.map((segment) => (
            <span
              className={cn(
                "block h-1.5 transition-opacity",
                segment.bar,
                active && (segment.key === active ? "h-2" : "opacity-35"),
              )}
              data-active={segment.key === active ? "" : undefined}
              data-count={segment.count}
              data-segment={segment.key}
              key={segment.key}
              style={{ width: `${(segment.count / total) * 100}%` }}
            />
          ))}
        </span>
        {segments.length > 0 ? (
          <span className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs text-muted-foreground @xl:px-4">
            {segments.map((segment) => (
              <span className={cn("flex items-center gap-1.5", segment.key === active && "font-medium text-foreground")} key={segment.key}>
                <span className={cn("size-2 shrink-0 rounded-full", segment.bar, active && segment.key !== active && "opacity-35")} />
                {segment.label} ({number.format(segment.count)})
              </span>
            ))}
          </span>
        ) : null}
      </div>
      {breakdown.length > 0 ? (
        <p className="sr-only">
          Komposisi dari {number.format(total)}: {breakdown.join(", ")}.
        </p>
      ) : null}
    </nav>
  );
}

/**
 * The composition bar's segments: every status tile with a count, then "Lainnya", the part of
 * `total` no tile names (spec 19 QUE-OTHER / RTS-OTHER / LBL-OTHER = base − Σ status tiles).
 * The callers' tiles are disjoint buckets of their base, so the remainder is never negative; an
 * overlapping caller would get no remainder rather than a negative one.
 */
export function compositionSegments(tiles: StatusTile[], total: number) {
  const parts = tiles.slice(1).filter((tile) => tile.count > 0).map((tile) => ({
    bar: TONE[toneOf(tile)].bar,
    count: tile.count,
    key: tile.key,
    label: tile.label,
  }));
  const other = Math.max(0, total - parts.reduce((sum, part) => sum + part.count, 0));
  return other > 0 ? [...parts, { bar: "bg-input", count: other, key: "OTHER", label: "Lainnya" }] : parts;
}

function toneOf(tile: StatusTile): StatusTone {
  return tile.tone ?? shipmentStatusTone(tile.key) ?? "neutral";
}
