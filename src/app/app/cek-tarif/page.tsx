import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { ShippingRateActionState } from "@/app/app/cek-tarif/actions";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";
import { QuickRateForm } from "@/app/app/cek-tarif/quick-rate-form";
import { FormLayout, PageAside } from "@/components/cms/cms-layouts";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

export const metadata: Metadata = { title: "Cek Tarif", robots: { index: false } };

export default async function QuickRatePage() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  const scenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/cek-tarif") : null;
  if (scenario === "quick-rate-error") throw new Error("Intentional development-only quick-rate page failure.");
  const outlets = await withTenantContext(db, principal.userId, principal.tenantId, listReadyShipmentOutlets);
  const initialState: ShippingRateActionState = scenario === "quick-rate-provider-error"
    ? { error: "Tarif belum dapat dimuat dari Mengantar. Coba lagi." }
    : scenario && ["quick-rate-demo", "quick-rate-empty", "quick-rate-stale"].includes(scenario) ? { quote: {
      outletId: outlets[0]?.id ?? "", originAreaLabel: "SURABAYA, JAWA TIMUR", destinationAreaLabel: "KEBAYORAN BARU, JAKARTA SELATAN", weightGrams: 1000, retrievedAt: "2026-09-14T17:00:00Z",
      services: scenario === "quick-rate-empty" ? [] : [
        { providerService: "JNE REG", shippingAmountIdr: 22000, deliveryEstimate: "2–3 hari", codEligible: true },
        { providerService: "J&T EZ", shippingAmountIdr: 24000, deliveryEstimate: "Estimasi mengikuti jadwal layanan di area tujuan", codEligible: true },
      ],
    } } : {};
  return (
    <PageContainer>
      <PageHeader title="Cek Tarif" description="Bandingkan estimasi ongkir dari outlet ke area tujuan sebelum membuat kiriman." />
      <FormLayout
        aside={(
          <PageAside label="Bantuan cek tarif">
            <Card className="ios-glass-card rounded-2xl border-border/60 shadow-xs">
              <CardHeader>
                <CardTitle>Perlu diingat</CardTitle>
                <CardDescription>Estimasi ini belum membuat kiriman apa pun.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm text-muted-foreground">
                <p>Area asal mengikuti pickup Mengantar yang tersimpan pada outlet.</p>
                <p>Biaya akhir dapat berbeda mengikuti detail kiriman dan layanan yang dipilih saat membuat draf.</p>
              </CardContent>
            </Card>
          </PageAside>
        )}
      >
        <QuickRateForm initialState={initialState} initialStale={scenario === "quick-rate-stale"} canManageSettings={principal.role === "TENANT_ADMIN"} outlets={outlets} />
      </FormLayout>
    </PageContainer>
  );
}
