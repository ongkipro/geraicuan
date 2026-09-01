import type { Metadata } from "next";
import { Download, Settings2 } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { BulkIntakeForm } from "@/app/app/impor/bulk-intake-form";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { db } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

export default async function BulkImportPage() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");

  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/impor")
    : null;
  if (auditScenario === "bulk-import-error") throw new Error("Intentional development-only bulk import failure.");

  let outletsPromise = withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    listReadyShipmentOutlets(tx, context),
  );
  if (auditScenario === "bulk-import-stream") {
    outletsPromise = outletsPromise.then((value) => new Promise<typeof value>((resolve) => setTimeout(() => resolve(value), 1_200)));
  }
  const loadedOutlets = await outletsPromise;
  const configuredOutlets = auditScenario === "bulk-import-unconfigured" ? [] : loadedOutlets;
  const auditPreview = auditScenario === "bulk-import-mixed" && configuredOutlets[0] ? {
    errors: [{ field: "telepon_penerima" as const, message: "Nomor telepon penerima tidak valid.", row: 3 }],
    submissionId: "00000000-0000-4000-8000-000000000141",
    totalRows: 2,
    validRows: [{
      confirmationToken: "development-only-invalid-confirmation-token",
      input: {
        declaredValueIdr: 150_000, destinationAreaId: "3171010", destinationAreaLabel: "Gambir, Jakarta Pusat", isCod: false,
        outletId: configuredOutlets[0].id, packageContent: "Paket audit", packageHeightCm: null, packageLengthCm: null,
        packageQuantity: 1, packageWeightGrams: 500, packageWidthCm: null, recipientAddress: "Alamat penerima audit",
        recipientName: "Penerima audit", recipientPhone: "081234567890", senderAddress: "Alamat pengirim audit",
        senderName: "Pengirim audit", senderPhone: "081212345678",
      },
      row: 2,
    }],
  } : undefined;
  return (
    <PageContainer>
      <PageHeader
        actions={(
          <Button asChild className="min-h-11" variant="outline">
            <a href="/app/impor/template.csv">
              <Download aria-hidden="true" /> Unduh template CSV
            </a>
          </Button>
        )}
        description="Validasi CSV dan pilih baris yang layak sebelum membuat draf tenant."
        eyebrow="Pengiriman"
        title="Impor massal"
      />
      {configuredOutlets.length === 0 ? (
        <Alert>
          <Settings2 aria-hidden="true" />
          <AlertTitle>Outlet belum dikonfigurasi</AlertTitle>
          <AlertDescription className="space-y-3">
            {principal.role === "TENANT_ADMIN"
              ? "Lengkapi alamat pickup dan area asal outlet sebelum mengimpor draf."
              : "Hubungi Tenant Admin untuk mengatur alamat pickup outlet."}
            {principal.role === "TENANT_ADMIN" ? (
              <div>
                <Button asChild className="min-h-11" variant="outline">
                  <Link href="/app/pengaturan">Buka pengaturan outlet</Link>
                </Button>
              </div>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : (
        <BulkIntakeForm initialPreview={auditPreview} outlets={configuredOutlets} />
      )}
    </PageContainer>
  );
}
