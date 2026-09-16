import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { TrackingLookupState } from "@/app/app/cek-resi/actions";
import { TrackingLookupForm } from "@/app/app/cek-resi/tracking-lookup-form";
import { FormLayout, PageAside } from "@/components/cms/cms-layouts";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { title: "Cek resi", robots: { index: false } };

const AUDIT_STATES: Record<string, TrackingLookupState> = {
  "resi-lookup-found": {
    kind: "found",
    query: "GC-10013",
    result: {
      awb: "SANITIZED-AUDIT-AWB",
      courier: "JNE",
      destinationAreaLabel: "KEBAYORAN BARU, JAKARTA SELATAN",
      isCod: true,
      observation: { observedAtIso: "2026-09-14T17:00:00Z", providerStatus: "ON PROCESS" },
      providerService: "JNE REG",
      publicReference: "GC-10013",
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
        description="Cari kiriman tenant ini dengan nomor kiriman GeraiCUAN atau nomor resi, lalu lihat status terakhirnya."
        title="Cek resi"
      />
      <FormLayout
        aside={(
          <PageAside label="Bantuan cek resi">
            <Card>
              <CardHeader>
                <CardTitle>Tips pencarian</CardTitle>
                <CardDescription>Pencarian hanya mencakup kiriman milik tenant ini.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm text-muted-foreground">
                <p>Gunakan nomor kiriman GeraiCUAN (contoh GC-10013) untuk hasil paling cepat.</p>
                <p>Nomor resi kurir dari luar tenant tidak akan ditemukan.</p>
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
