import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { saveShipmentPrefix } from "@/app/app/pengaturan/actions";
import { ShipmentPrefixForm } from "@/app/app/pengaturan/shipment-prefix-form";
import {
  administrationNavigation,
  SETTINGS_INDEX_HREF,
} from "@/app/app/pengaturan/settings-nav";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { SettingsCard, SettingsLayout } from "@/components/cms/settings-layout";
import { db } from "@/db/client";
import { loadTenantShipmentPrefix } from "@/db/shipment-number-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import {
  parseUiAuditScenarioForRoute,
  UI_AUDIT_HEADER,
} from "@/lib/ui-audit-scenario";
import { suggestShipmentPrefix } from "@/lib/shipment-number";

export const metadata: Metadata = { robots: { index: false } };

const updatedAtFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

type TenantProfileSettingsPageProps = {
  searchParams?: Promise<{ outlet?: string | string[] }>;
};

export default async function TenantProfileSettingsPage({
  searchParams = Promise.resolve({}),
}: TenantProfileSettingsPageProps) {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/tenant");
    }
    throw error;
  }

  if (principal.scope !== "tenant") {
    redirect("/login/tenant");
  }
  if (principal.role !== "TENANT_ADMIN") {
    redirect("/app");
  }

  // T-158: old links carried `?outlet=` to the combined settings page. The
  // outlet is no longer this page's state, so the request lands on the page
  // that owns it instead of silently dropping the selection.
  const requestedOutlet = (await searchParams).outlet;
  if (typeof requestedOutlet === "string" && requestedOutlet !== "") {
    redirect(`/app/pengaturan/outlet?outlet=${encodeURIComponent(requestedOutlet)}`);
  }

  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute(
        (await headers()).get(UI_AUDIT_HEADER),
        "/app/pengaturan",
      )
    : null;

  if (auditScenario === "settings-error") {
    throw new Error("Intentional development-only tenant profile page failure.");
  }
  if (auditScenario === "settings-stream") {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
  }

  const shipmentPrefix = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => loadTenantShipmentPrefix(tx, context),
  );

  return (
    <PageContainer>
      <SettingsLayout
        currentHref="/app/pengaturan"
        header={
          <PageHeader
            description="Identitas toko dan format angka, tanggal, dan nomor kiriman."
            eyebrow="Pengaturan"
            title="Profil toko"
          />
        }
        indexHref={SETTINGS_INDEX_HREF}
        items={administrationNavigation}
        navLabel="Menu pengaturan"
      >
        <div className="grid min-w-0 gap-6">
          <SettingsCard
            description="Nama yang tampil di GeraiCUAN. Hubungi Super Admin bila nama toko perlu diubah."
            id="tenant-name-title"
            title="Nama toko"
          >
            <p className="text-base font-medium [overflow-wrap:anywhere]" id="tenant-name-value">
              {shipmentPrefix.tenantName}
            </p>
          </SettingsCard>

          <ShipmentPrefixForm
            action={saveShipmentPrefix}
            attemptId={randomUUID()}
            lockedAtLabel={shipmentPrefix.lockedAt ? `${updatedAtFormatter.format(shipmentPrefix.lockedAt)} WIB` : null}
            prefix={shipmentPrefix.prefix}
            suggestedPrefix={suggestShipmentPrefix(shipmentPrefix.tenantName)}
          />

          <SettingsCard
            description="Tetap untuk semua tenant, tidak dapat diubah."
            id="tenant-locale-title"
            title="Format tanggal dan angka"
          >
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <dt className="text-xs font-medium text-muted-foreground">Bahasa dan format</dt>
                <dd className="text-sm">Indonesia (<span className="font-mono">id-ID</span>)</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-xs font-medium text-muted-foreground">Zona waktu</dt>
                <dd className="text-sm">WIB (<span className="font-mono">Asia/Jakarta</span>, UTC+7)</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Semua tanggal, jam, dan rekap harian di GeraiCUAN dihitung pada dasar WIB.
            </p>
          </SettingsCard>
        </div>
      </SettingsLayout>
    </PageContainer>
  );
}
