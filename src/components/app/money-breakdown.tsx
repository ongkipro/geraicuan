import { Calculator, SearchCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { formatIdr, Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { MoneyLine, ShipmentMoney } from "@/lib/shipment-money";
import { cn } from "@/lib/utils";

const SETTLEMENT_CAPTION = "Dipotong Mengantar saat pencairan";

/**
 * T-261 "Rincian uang" (spec 17 §T-261, spec 10 §4.15): the one per-shipment money
 * breakdown. Order is fixed — Ditagih ke penerima (and what it is made of), what Mengantar keeps,
 * Estimasi cair, then context lines outside the arithmetic. Every amount carries its spec 19
 * metric ID in `data-metric-id`. Presentational only: `shipmentMoney` decides the lines.
 *
 * T-269: every section adds up on screen — the indented parts sum to Ditagih ke penerima, and
 * Ditagih ke penerima minus "Dipotong Mengantar saat pencairan" is Estimasi cair. An Operator's
 * money arrives without the settlement section (`moneyForRole`), so none of it renders.
 */
export function MoneyBreakdown({ checkHref, className, money }: {
  /** "Periksa kiriman" target for the inconsistent state; omitted on the shipment's own detail. */
  checkHref?: string;
  className?: string;
  money: ShipmentMoney;
}) {
  if (money.kind === "pending") {
    return (
      <div className={cn("flex flex-col gap-3", className)} data-money-state="pending" data-slot="money-breakdown">
        <p className="text-sm text-muted-foreground">Rincian uang muncul setelah pesanan dikirim ke Mengantar.</p>
        <MoneyRows lines={money.info} tone="muted" />
      </div>
    );
  }

  if (money.kind === "inconsistent") {
    return (
      <div className={cn("flex flex-col gap-3", className)} data-money-state="inconsistent" data-slot="money-breakdown">
        <MoneyRows lines={[money.collect]} tone="strong" />
        <MoneyInconsistentAlert amountIdr={money.collect.amountIdr} checkHref={checkHref} method={money.method} />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)} data-money-state="ready" data-slot="money-breakdown">
      <MoneyRows lines={[money.collect]} tone="strong" />
      {money.collectParts.length > 0 ? (
        <MoneyRows className="ml-1 border-l pl-3" label="Rincian tagihan ke penerima" lines={money.collectParts} tone="muted" />
      ) : null}
      {money.deductions.length > 0 ? (
        <div className="flex flex-col gap-2 border-t pt-3" data-money-section="settlement">
          {/* Named once for sight (the caption) and once for the list (its aria-label). */}
          {money.method === "NON_COD" ? null : (
            <p aria-hidden="true" className="text-xs font-medium text-muted-foreground">{SETTLEMENT_CAPTION}</p>
          )}
          <MoneyRows label={money.method === "NON_COD" ? undefined : SETTLEMENT_CAPTION} lines={money.deductions} />
        </div>
      ) : null}
      {money.estimate ? (
        <dl className="border-t pt-3">
          <div className="flex items-start justify-between gap-4" data-metric-id={money.estimate.metricId}>
            <dt className="flex min-w-0 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                {money.estimate.label}
                <StatusBadge icon={Calculator} label="Estimasi" tone="info" />
              </span>
              {money.estimate.note ? <span className="text-xs text-muted-foreground">{money.estimate.note}</span> : null}
            </dt>
            <dd className="text-base font-bold text-foreground">
              <Money amount={money.estimate.amountIdr} />
            </dd>
          </div>
        </dl>
      ) : null}
      {money.info.length > 0 ? <MoneyRows className="border-t pt-3" lines={money.info} tone="muted" /> : null}
    </div>
  );
}

/**
 * The COD breakdown does not add up: warn tint (spec 10 §2.1 warn tokens), what is wrong in plain
 * words, and the way to check it. The total from Mengantar stays authoritative; this never blocks
 * printing (the label page's guards are unchanged).
 */
export function MoneyInconsistentAlert({ amountIdr, checkHref, className, method }: {
  amountIdr: number | null;
  checkHref?: string;
  className?: string;
  method: "COD" | "COD_ONGKIR";
}) {
  const amount = amountIdr === null ? "—" : formatIdr(amountIdr);
  return (
    <Alert className={cn("border-warn bg-warn-surface", className)} data-money-alert="inconsistent" role="status">
      <TriangleAlert aria-hidden="true" className="text-warn" />
      <AlertTitle className="font-semibold text-warn">Rincian COD tidak konsisten</AlertTitle>
      <AlertDescription className="grid gap-3 text-foreground [&_a]:no-underline [&_p:not(:last-child)]:mb-0">
        <p>
          {method === "COD"
            ? `Total COD di pesanan Mengantar (${amount}) tidak sama dengan nilai barang + ongkir + biaya COD yang tercatat di GeraiCuan, jadi rinciannya tidak ditampilkan.`
            : `Nilai COD Ongkir di pesanan Mengantar (${amount}) tidak sama dengan yang tercatat di GeraiCuan.`}
          {" "}Kurir tetap menagih total dari Mengantar. Cocokkan dengan pesanan di Mengantar sebelum menyerahkan paket.
        </p>
        {checkHref ? (
          <div>
            <Button asChild variant="outline">
              <Link href={checkHref}><SearchCheck aria-hidden="true" />Periksa kiriman</Link>
            </Button>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/**
 * The compact variant for a list cell: one line per amount, label then value. Phrasing content
 * only (spans), so it sits inside a table cell or a record row's value slot.
 */
export function MoneyBreakdownCompact({ align = "end", className, lines, showFirstLabel = true }: {
  align?: "start" | "end";
  className?: string;
  lines: readonly MoneyLine[];
  /** False under a column header that already names the first figure (kept for screen readers). */
  showFirstLabel?: boolean;
}) {
  if (lines.length === 0) return <Money amount={null} />;
  return (
    <span
      className={cn("flex flex-col gap-0.5", align === "end" ? "items-end" : "items-start", className)}
      data-slot="money-breakdown-compact"
    >
      {lines.map((line, index) => (
        <span
          className={cn("flex flex-wrap items-baseline gap-x-1.5", align === "end" ? "justify-end text-right" : "justify-start")}
          data-metric-id={line.metricId}
          key={line.key}
        >
          <span className={cn("text-xs font-normal text-muted-foreground", index === 0 && !showFirstLabel && "sr-only")}>{line.label}</span>
          <span className={index === 0 ? "text-sm font-medium text-foreground" : "text-xs font-normal text-muted-foreground"}>
            <LineAmount line={line} />
          </span>
        </span>
      ))}
    </span>
  );
}

function LineAmount({ line }: { line: MoneyLine }) {
  if (line.sign === "minus" && line.amountIdr !== null) {
    return <span className="whitespace-nowrap tabular-nums" data-slot="money">−{formatIdr(line.amountIdr)}</span>;
  }
  return <Money amount={line.amountIdr} />;
}

function MoneyRows({ className, label, lines, tone = "default" }: {
  className?: string;
  label?: string;
  lines: readonly MoneyLine[];
  tone?: "default" | "muted" | "strong";
}) {
  return (
    <dl aria-label={label} className={cn("flex flex-col gap-2", className)}>
      {lines.map((line) => (
        <div className="flex items-start justify-between gap-4" data-metric-id={line.metricId} key={line.key}>
          <dt className="flex min-w-0 flex-col gap-0.5">
            <span className={cn(
              "text-sm",
              tone === "strong" ? "font-semibold text-foreground" : tone === "muted" ? "text-muted-foreground" : "text-foreground",
            )}>
              {line.label}
            </span>
            {line.note ? <span className="text-xs text-muted-foreground">{line.note}</span> : null}
          </dt>
          <dd className={cn(
            "text-right",
            tone === "strong" ? "text-base font-bold text-foreground" : tone === "muted" ? "text-sm text-muted-foreground" : "text-sm font-medium text-foreground",
          )}>
            <LineAmount line={line} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
