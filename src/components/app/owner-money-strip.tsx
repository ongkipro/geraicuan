import { Calculator } from "lucide-react";

import { formatIdr } from "@/components/app/money";
import { StatStrip } from "@/components/app/stat-strip";
import { StatusBadge } from "@/components/app/status-badge";
import type { OwnerMoneySummary } from "@/db/owner-money-repository";

const count = new Intl.NumberFormat("id-ID");

/**
 * T-275 (D-41): the gerai owner's money for a period, on Dasbor and Pencairan COD — Tenant
 * Admin only; the caller never renders it for an Operator and the loader refuses one. Each
 * figure keeps its spec 19 OWN-* metric ID.
 */
export function OwnerMoneyStrip({ summary }: { summary: OwnerMoneySummary }) {
  const { margin, needsReviewCount, settled, unsettled } = summary;
  const estimated = margin.estimateCount > 0;
  return (
    <StatStrip
      items={[
        {
          key: "unsettled",
          label: "COD belum cair",
          metric: "OWN-COD-UNSETTLED-IDR",
          note: `${count.format(unsettled.count)} kiriman · estimasi cair ${formatIdr(unsettled.estimatedPayoutIdr)}`,
          value: formatIdr(unsettled.codIdr),
        },
        {
          badge: needsReviewCount > 0 ? <StatusBadge className="h-5 px-1.5" label={`${count.format(needsReviewCount)} perlu dicek`} tone="warning" /> : undefined,
          key: "settled",
          label: "Sudah cair",
          metric: "OWN-COD-SETTLED-IDR",
          note: `${count.format(settled.count)} kiriman · sesuai invoice Mengantar`,
          value: formatIdr(settled.payoutIdr),
        },
        {
          badge: estimated ? <StatusBadge className="h-5 px-1.5" icon={Calculator} label="Estimasi" tone="info" /> : undefined,
          key: "margin",
          label: "Margin ongkir",
          metric: "OWN-MARGIN-IDR",
          note: estimated
            ? `${formatIdr(margin.provenIdr)} terbukti dari pencairan · sisanya perkiraan`
            : `Seluruhnya terbukti dari pencairan Mengantar`,
          value: formatIdr(margin.idr),
        },
      ]}
      label="Uang gerai"
    />
  );
}
