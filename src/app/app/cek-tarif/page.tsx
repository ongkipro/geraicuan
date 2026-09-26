import { PackagePlus } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import type { ShippingRateActionState } from "@/app/app/cek-tarif/actions";
import { RateCheck } from "@/app/app/cek-tarif/rate-check";
import { requireContactPagePrincipal } from "@/app/app/kontak/contact-page-guard";
import { DataCard } from "@/components/app/data-card";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { db } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false }, title: "Cek tarif" };

/** Development-only audit states (T-143 scenarios); no Mengantar call is made for them. */
function auditState(scenario: string | null, outletId: string): ShippingRateActionState {
  if (scenario === "quick-rate-provider-error") return { error: "Tarif belum dapat dimuat dari Mengantar. Coba lagi." };
  if (scenario !== "quick-rate-demo" && scenario !== "quick-rate-empty" && scenario !== "quick-rate-stale") return {};
  return {
    quote: {
      destinationAreaLabel: "KEBAYORAN BARU, JAKARTA SELATAN",
      originAreaLabel: "SURABAYA, JAWA TIMUR",
      outletId,
      retrievedAt: "2026-09-14T17:00:00Z",
      // Real Mengantar service keys (fixture catalogue), so the audit shows the T-237 rules.
      services: scenario === "quick-rate-empty" ? [] : [
        { codEligible: false, deliveryEstimate: "2-3 Day", providerService: "JNE", shippingAmountIdr: 22_000 },
        { codEligible: true, deliveryEstimate: "1-2 Hari", providerService: "JT", shippingAmountIdr: 24_000 },
        { codEligible: true, deliveryEstimate: "2 - 3 days", providerService: "SAP", shippingAmountIdr: 20_500 },
        { codEligible: false, deliveryEstimate: "3 - 5 days", providerService: "SAPLite", shippingAmountIdr: 17_500 },
        { codEligible: true, deliveryEstimate: "2-4 Hari", providerService: "lion", shippingAmountIdr: 21_000 },
        { codEligible: true, deliveryEstimate: "1-3 Hari", providerService: "spx", shippingAmountIdr: 20_000 },
        { codEligible: true, deliveryEstimate: "2-3 Hari", providerService: "anteraja", shippingAmountIdr: 22_000 },
      ],
      weightGrams: 1000,
    },
  };
}

/** The rail (ref "Aturan Perhitungan"): only rules the estimate and T-237 actually apply. */
const RULES: [string, string][] = [
  ["Estimasi, bukan tarif resmi.", "Tarif resmi tercatat saat resi diterbitkan di Buat kiriman."],
  ["Asal kiriman", "mengikuti titik pickup Mengantar pada outlet."],
  ["Kargo", "hanya muncul bila berat memenuhi minimum kargo kurir."],
  ["Shopee Express dan SAP Lite", "bisa dicek tarifnya, tetapi belum bisa dipesan lewat API Mengantar."],
  ["Biaya COD", "dihitung di Buat kiriman sesuai nilai barang."],
];

/** Spec 17 `/app/cek-tarif` (ref cek-tarif.html): route + weight form and results; rules in the rail. */
export default async function RateCheckPage() {
  const principal = await requireContactPagePrincipal();
  const scenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/cek-tarif")
    : null;
  if (scenario === "quick-rate-error") throw new Error("Intentional development-only quick-rate page failure.");
  const outlets = await withTenantContext(db, principal.userId, principal.tenantId, listReadyShipmentOutlets);

  return (
    <>
      <PageHeader
        actions={<Button asChild variant="outline"><Link href="/app/pengiriman/baru"><PackagePlus aria-hidden="true" />Buat kiriman</Link></Button>}
        description="Bandingkan estimasi ongkir kurir Mengantar sebelum membuat kiriman."
        title="Cek tarif"
      />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <RateCheck canManageSettings={principal.role === "TENANT_ADMIN"} initialState={auditState(scenario, outlets[0]?.id ?? "")} outlets={outlets} />
        </div>
        <aside aria-label="Perlu diingat">
          <DataCard title="Perlu diingat">
            <ul className="grid gap-3 text-sm text-muted-foreground">
              {RULES.map(([lead, text]) => (
                <li className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-x-2" key={lead}>
                  <span aria-hidden="true" className="mt-2 size-1.5 rounded-full bg-primary" />
                  <span><strong className="font-semibold text-foreground">{lead}</strong> {text}</span>
                </li>
              ))}
            </ul>
          </DataCard>
        </aside>
      </div>
    </>
  );
}
