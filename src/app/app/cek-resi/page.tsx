import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { TrackingLookupState } from "@/app/app/cek-resi/actions";
import { TrackingLookupForm } from "@/app/app/cek-resi/tracking-lookup-form";
import { FormLayout, PageAside } from "@/components/cms/cms-layouts";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { title: "Cek resi · GeraiCUAN", robots: { index: false } };

const AUDIT_STATES: Record<string, TrackingLookupState> = {
  "resi-lookup-found": {
    kind: "found",
    query: "GC-10013",
    result: {
      awb: "SANITIZED-AUDIT-AWB",
      courier: "JNE",
      declaredValueIdr: 250_000,
      destinationAreaLabel: "KEBAYORAN BARU, JAKARTA SELATAN",
      observation: { observedAtIso: "2026-09-14T17:00:00Z", providerStatus: "ON PROCESS" },
      paymentMethod: "COD",
      providerCodAmountIdr: 270_000,
      providerService: "JNE REG",
      publicReference: "GC-10013",
      status: "IN_TRANSIT",
      updatedAtIso: "2026-09-14T17:05:00Z",
    },
  },
  // T-190: a COD Ongkir result shows the method and the shipping charge, never goods.
  "resi-lookup-found-cod-ongkir": {
    kind: "found",
    query: "GC-10014",
    result: {
      awb: "SANITIZED-AUDIT-AWB-2",
      courier: "SAP",
      declaredValueIdr: 250_000,
      destinationAreaLabel: "KEBAYORAN BARU, JAKARTA SELATAN",
      observation: { observedAtIso: "2026-09-14T17:00:00Z", providerStatus: "ON PROCESS" },
      paymentMethod: "COD_ONGKIR",
      providerCodAmountIdr: 20_000,
      providerService: "SAP REG",
      publicReference: "GC-10014",
      status: "IN_TRANSIT",
      updatedAtIso: "2026-09-14T17:05:00Z",
    },
  },
  "resi-lookup-missing": { kind: "missing", query: "GC-99999" },
  "resi-lookup-limited": { kind: "limited", query: "GC-10013" },
};

export default async function TrackingLookupPage() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");

  const scenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/cek-resi")
    : null;
  if (scenario === "resi-lookup-error") {
    throw new Error("Intentional development-only tracking lookup page failure.");
  }

  return (
    <PageContainer>
      <PageHeader
        description="Lacak status terakhir kiriman dengan nomor kiriman atau nomor resi."
        eyebrow="Cek"
        title="Cek resi"
      />
      <FormLayout
        aside={(
          <PageAside label="Bantuan cek resi">
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Tips pencarian</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid list-disc gap-2 pl-5 text-sm text-muted-foreground">
                  <li>Nomor kiriman GeraiCUAN (contoh <span className="font-mono">GC-10013</span>) paling cepat.</li>
                  <li>Nomor resi kurir juga bisa dipakai.</li>
                  <li>Resi dari luar tenant ini tidak akan ditemukan.</li>
                </ul>
              </CardContent>
            </Card>
          </PageAside>
        )}
      >
        <TrackingLookupForm initialState={scenario ? AUDIT_STATES[scenario] : { kind: "idle" }} />
      </FormLayout>
    </PageContainer>
  );
}
