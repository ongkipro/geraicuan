import { cn } from "@/lib/utils";

const idr = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});

/** Spec 10 §7: "Rp 1.250.000" — rupiah, no decimals, id-ID grouping. */
export function formatIdr(amount: number) {
  return idr.format(amount);
}

/** A money value in tabular figures; `null` reads as an em dash, never as Rp 0. */
export function Money({ amount, className }: { amount: number | null | undefined; className?: string }) {
  return (
    <span className={cn("tabular-nums whitespace-nowrap", className)} data-slot="money">
      {amount === null || amount === undefined ? "—" : formatIdr(amount)}
    </span>
  );
}
