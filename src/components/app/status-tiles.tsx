import { Check } from "lucide-react";
import Link from "next/link";

import { shipmentStatusTone, type StatusTone } from "@/components/app/status-badge";
import { cn } from "@/lib/utils";

export type StatusTile = {
  count: number;
  hint?: string;
  href: string;
  key: string;
  label: string;
  selected: boolean;
  /** Pastel tint by meaning; defaults to the shipment status tone when `key` is a status, else neutral. */
  tone?: StatusTone;
};

const number = new Intl.NumberFormat("id-ID");

/** Spec 10 v3.2 §2.1: one pastel tint per meaning, only on tiles. */
const TINT: Record<StatusTone, string> = {
  danger: "bg-tile-danger",
  info: "bg-tile-info",
  neutral: "bg-tile",
  success: "bg-tile-ok",
  warning: "bg-tile-warn",
};

/**
 * Spec 10 v3.2 §4.6 queue filters (Mengantar look, D12): one white card holding up to six
 * borderless pastel tiles (two columns on a phone). Each tile links to its filtered URL; the
 * selected one gets a 2px primary ring and a check.
 */
export function StatusTiles({ label, tiles }: { label: string; tiles: StatusTile[] }) {
  return (
    <nav aria-label={label} className="rounded-2xl bg-card p-4 shadow-card">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => {
          const tone = tile.tone ?? shipmentStatusTone(tile.key) ?? "neutral";
          return (
            <li key={tile.key}>
              <Link
                aria-current={tile.selected ? "true" : undefined}
                className={cn(
                  "relative flex h-full flex-col gap-1 rounded-xl p-4 transition-shadow hover:ring-1 hover:ring-input",
                  TINT[tone],
                  tile.selected && "ring-2 ring-primary hover:ring-2 hover:ring-primary",
                )}
                data-tone={tone}
                href={tile.href}
              >
                <span className="pr-6 text-sm font-medium text-foreground">{tile.label}</span>
                <span className="text-2xl font-bold tabular-nums text-foreground">{number.format(tile.count)}</span>
                {tile.hint ? <span className="text-xs text-muted-foreground">{tile.hint}</span> : null}
                {tile.selected ? (
                  <Check aria-hidden="true" className="absolute top-4 right-4 size-4 text-primary" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
