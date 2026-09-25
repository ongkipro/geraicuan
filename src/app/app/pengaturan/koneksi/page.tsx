import type { Metadata } from "next";
import { CircleAlert } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { MengantarConnectionForm } from "@/app/app/pengaturan/mengantar-connection-form";
import { OutletSettingsWorkspace } from "@/app/app/pengaturan/outlet-settings-workspace";
import {
  administrationNavigation,
  SETTINGS_INDEX_HREF,
} from "@/app/app/pengaturan/settings-nav";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { SettingsLayout } from "@/components/cms/settings-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { db } from "@/db/client";
import {
  listOutletReadiness,
  type OutletReadiness,
} from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import {
  parseUiAuditScenarioForRoute,
  UI_AUDIT_HEADER,
} from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

const updatedAtFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

const auditUpdatedAt = new Date("2026-09-01T00:00:00.000Z");

function buildManyOutletAuditFixture(count = 10): OutletReadiness[] {
  return Array.from({ length: count }, (_, index) => {
    const sequence = String(index + 1).padStart(12, "0");
    const needsAttention = index < 3;
    const privateAttention = needsAttention && index === 2;
    const privateConnection = privateAttention || index % 3 === 1;
    return {
      id: `79000000-0000-4000-8000-${sequence}`,
      name: `Outlet Audit ${String(index + 1).padStart(2, "0")}`,
      defaultPickupAddressId: needsAttention && index === 0 ? null : `pickup-audit-${index + 1}`,
      defaultPickupAddressLabel:
        needsAttention && index === 0 ? null : `Gudang Audit ${index + 1}, Jalan Contoh ${index + 1}`,
      defaultOriginAreaId: needsAttention && index === 1 ? null : `origin-audit-${index + 1}`,
      defaultOriginAreaLabel:
        needsAttention && index === 1 ? null : `Kecamatan Audit ${index + 1}, Kota Bandung, Jawa Barat`,
      connectionIssue: privateAttention ? "secret_unavailable" : null,
      connectionSource: privateConnection ? "private" : "platform_default",
      connectionStatus:
        privateAttention
          ? "private_attention"
          : privateConnection
            ? "private_ready"
            : "platform_default",
      connectionUpdatedAt: privateConnection ? auditUpdatedAt : null,
      readinessStatus: needsAttention ? "needs_attention" : "ready",
      updatedAt: auditUpdatedAt,
    };
  });
}

type OutletSettingsPageProps = {
  searchParams?: Promise<{ outlet?: string | string[] }>;
};

export default async function MengantarConnectionSettingsPage({
  searchParams = Promise.resolve({}),
}: OutletSettingsPageProps) {
  let principal;
  try {
    principal = await requireCmsScope("tenant", { allowPendingApproval: true });
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

  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute(
        (await headers()).get(UI_AUDIT_HEADER),
        "/app/pengaturan/koneksi",
      )
    : null;

  if (auditScenario === "settings-koneksi-error") {
    throw new Error("Intentional development-only Mengantar connection settings page failure.");
  }
  if (auditScenario === "settings-koneksi-stream") {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
  }

  let outlets: OutletReadiness[];
  if (auditScenario === "settings-connection-empty") {
    outlets = [];
  } else if (auditScenario === "settings-connection-many") {
    outlets = buildManyOutletAuditFixture(10);
  } else if (auditScenario === "settings-private-attention") {
    outlets = [{
      id: "79000000-0000-4000-8000-000000000099",
      name: "Outlet Audit Privat",
      defaultPickupAddressId: "pickup-audit-private",
      defaultPickupAddressLabel: "Gudang Privat, Jalan Audit 99",
      defaultOriginAreaId: "origin-audit-private",
      defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
      connectionIssue: "secret_unavailable",
      connectionSource: "private",
      connectionStatus: "private_attention",
      connectionUpdatedAt: auditUpdatedAt,
      readinessStatus: "needs_attention",
      updatedAt: auditUpdatedAt,
    }];
  } else if (
    auditScenario === "settings-private-auth-error"
    || auditScenario === "settings-provider-error"
  ) {
    outlets = [{
      id: auditScenario === "settings-private-auth-error"
        ? "79000000-0000-4000-8000-000000000097"
        : "79000000-0000-4000-8000-000000000098",
      name: auditScenario === "settings-private-auth-error"
        ? "Outlet Audit Autentikasi"
        : "Outlet Audit Provider",
      defaultPickupAddressId: "pickup-audit-private",
      defaultPickupAddressLabel: "Gudang Privat, Jalan Audit 98",
      defaultOriginAreaId: "origin-audit-private",
      defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
      connectionIssue: auditScenario === "settings-private-auth-error"
        ? "authentication"
        : "provider_unavailable",
      connectionSource: "private",
      connectionStatus: "private_attention",
      connectionUpdatedAt: auditUpdatedAt,
      readinessStatus: "needs_attention",
      updatedAt: auditUpdatedAt,
    }];
  } else {
    outlets = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => listOutletReadiness(tx, context),
      { allowPendingApproval: true },
    );
  }
  const orderedOutlets = [...outlets].sort((left, right) => {
    if (left.readinessStatus !== right.readinessStatus) {
      return left.readinessStatus === "needs_attention" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "id-ID") || left.id.localeCompare(right.id);
  });
  const requestedOutlet = (await searchParams).outlet;
  const requestedOutletId = typeof requestedOutlet === "string" ? requestedOutlet : null;
  const activeOutlet = orderedOutlets.find(({ id }) => id === requestedOutletId)
    ?? orderedOutlets[0]
    ?? null;
  const outletFormProps = activeOutlet
    ? {
        id: activeOutlet.id,
        name: activeOutlet.name,
        defaultPickupAddressId: activeOutlet.defaultPickupAddressId,
        defaultPickupAddressLabel: activeOutlet.defaultPickupAddressLabel,
        defaultOriginAreaId: activeOutlet.defaultOriginAreaId,
        defaultOriginAreaLabel: activeOutlet.defaultOriginAreaLabel,
        connectionIssue: activeOutlet.connectionIssue,
        connectionSource: activeOutlet.connectionSource,
        connectionStatus: activeOutlet.connectionStatus,
        connectionUpdatedAtLabel: activeOutlet.connectionUpdatedAt
          ? `${updatedAtFormatter.format(activeOutlet.connectionUpdatedAt)} WIB`
          : null,
        readinessStatus: activeOutlet.readinessStatus,
        updatedAtLabel: `${updatedAtFormatter.format(activeOutlet.updatedAt)} WIB`,
        privateConnectionRequired: activeOutlet.privateConnectionRequired,
      }
    : null;

  return (
    <PageContainer>
      <SettingsLayout
        currentHref="/app/pengaturan/koneksi"
        header={
          <PageHeader
            description="Sumber koneksi Mengantar tiap outlet: default GeraiCUAN atau akun sendiri."
            eyebrow="Pengaturan"
            title="Koneksi Mengantar"
          />
        }
        indexHref={SETTINGS_INDEX_HREF}
        items={administrationNavigation}
        navLabel="Menu pengaturan"
      >
        {outlets.length === 0 ? (
          <Alert className="lg:max-w-xl">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Belum ada outlet</AlertTitle>
            <AlertDescription>
              Outlet harus tersedia sebelum koneksi Mengantar dapat diatur. Hubungi Super Admin
              untuk menyiapkan outlet tenant ini.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid min-w-0 gap-6">
            {activeOutlet && outletFormProps ? (
              outlets.length === 1 ? (
                <MengantarConnectionForm key={activeOutlet.id} outlet={outletFormProps} />
              ) : (
                <OutletSettingsWorkspace
                  activeOutletId={activeOutlet.id}
                  basePath="/app/pengaturan/koneksi"
                  outlets={orderedOutlets.map(({ id, name, readinessStatus }) => ({
                    id,
                    name,
                    readinessStatus,
                  }))}
                >
                  <MengantarConnectionForm key={activeOutlet.id} outlet={outletFormProps} />
                </OutletSettingsWorkspace>
              )
            ) : null}
          </div>
        )}
      </SettingsLayout>
    </PageContainer>
  );
}
