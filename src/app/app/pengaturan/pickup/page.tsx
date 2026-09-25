import type { Metadata } from "next";
import { CircleAlert } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OutletSettingsWorkspace } from "@/app/app/pengaturan/outlet-settings-workspace";
import {
  PickupPointsManager,
  type SafePickupPoint,
} from "@/app/app/pengaturan/pickup/pickup-points-manager";
import {
  administrationNavigation,
  SETTINGS_INDEX_HREF,
} from "@/app/app/pengaturan/settings-nav";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { SettingsLayout } from "@/components/cms/settings-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { db } from "@/db/client";
import { listOutletPickupPoints } from "@/db/outlet-pickup-point-repository";
import {
  listOutletReadiness,
  type OutletReadiness,
} from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import type { MengantarPickupOption } from "@/lib/mengantar-locations";
import {
  parseUiAuditScenarioForRoute,
  UI_AUDIT_HEADER,
} from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { title: "Titik pickup · GeraiCUAN", robots: { index: false } };

const auditUpdatedAt = new Date("2026-09-01T00:00:00.000Z");
const AUDIT_OUTLET_ID = "79000000-0000-4000-8000-000000000004";

function buildPickupOptionsAuditFixture(): MengantarPickupOption[] {
  return Array.from({ length: 12 }, (_, index) => ({
    originAreaId: `origin-audit-${index + 1}`,
    originLabel: `Kecamatan Audit ${index + 1}, Kota Bandung, Jawa Barat`,
    pickupAddressId: `pickup-audit-${index + 1}`,
    pickupLabel: `Gudang Audit ${index + 1}, Jalan Contoh ${index + 1}`,
  }));
}

function buildAuditOutlet(hasPickup: boolean): OutletReadiness {
  return {
    id: AUDIT_OUTLET_ID,
    name: "Outlet Audit Pickup",
    defaultPickupAddressId: hasPickup ? "pickup-audit-1" : null,
    defaultPickupAddressLabel: hasPickup ? "Gudang Audit 1, Jalan Contoh 1" : null,
    defaultOriginAreaId: hasPickup ? "origin-audit-1" : null,
    defaultOriginAreaLabel: hasPickup
      ? "Kecamatan Audit 1, Kota Bandung, Jawa Barat"
      : null,
    connectionIssue: null,
    connectionSource: "platform_default",
    connectionStatus: "platform_default",
    connectionUpdatedAt: null,
    readinessStatus: hasPickup ? "ready" : "needs_attention",
    updatedAt: auditUpdatedAt,
  };
}

function buildPickupPointsAuditFixture(): SafePickupPoint[] {
  return [1, 2, 3].map((index) => ({
    pickupAddressId: `pickup-audit-${index}`,
    pickupAddressLabel: `Gudang Audit ${index}, Jalan Contoh ${index}`,
    originAreaLabel: `Kecamatan Audit ${index}, Kota Bandung, Jawa Barat`,
    isDefault: index === 1,
  }));
}

type PickupSettingsPageProps = {
  searchParams?: Promise<{ outlet?: string | string[] }>;
};

export default async function PickupSettingsPage({
  searchParams = Promise.resolve({}),
}: PickupSettingsPageProps) {
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
        "/app/pengaturan/pickup",
      )
    : null;

  if (auditScenario === "settings-pickup-error") {
    throw new Error("Intentional development-only pickup settings page failure.");
  }
  if (auditScenario === "settings-pickup-stream") {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
  }

  const scenarioOutlets: OutletReadiness[] | null =
    auditScenario === "settings-pickup-list"
      || auditScenario === "settings-pickup-provider-error"
      ? [buildAuditOutlet(true)]
      : auditScenario === "settings-pickup-empty"
        ? [buildAuditOutlet(false)]
        : null;

  const outlets = scenarioOutlets ?? await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => listOutletReadiness(tx, context),
    { allowPendingApproval: true },
  );

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

  const points: SafePickupPoint[] = scenarioOutlets
    ? auditScenario === "settings-pickup-empty" ? [] : buildPickupPointsAuditFixture()
    : activeOutlet
      ? (await withTenantContext(
          db,
          principal.userId,
          principal.tenantId,
          (tx, context) => listOutletPickupPoints(tx, context, activeOutlet.id),
          { allowPendingApproval: true },
        )).map(({ isDefault, originAreaLabel, pickupAddressId, pickupAddressLabel }) => ({
          isDefault,
          originAreaLabel,
          pickupAddressId,
          pickupAddressLabel,
        }))
      : [];

  const optionsFixture = auditScenario === "settings-pickup-list"
    ? { options: buildPickupOptionsAuditFixture(), success: true as const }
    : auditScenario === "settings-pickup-provider-error"
      ? {
          message:
            "Daftar pickup Mengantar belum dapat dimuat. Pilihan tersimpan tidak berubah.",
        }
      : undefined;

  return (
    <PageContainer>
      <SettingsLayout
        currentHref="/app/pengaturan/pickup"
        header={
          <PageHeader
            description="Alamat penjemputan Mengantar yang boleh dipakai tiap outlet."
            eyebrow="Pengelolaan"
            title="Titik pickup"
          />
        }
        indexHref={SETTINGS_INDEX_HREF}
        items={administrationNavigation}
        navLabel="Menu pengaturan"
      >
        {!activeOutlet ? (
          <Alert className="lg:max-w-xl">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Belum ada outlet</AlertTitle>
            <AlertDescription>
              Outlet harus tersedia sebelum titik pickup dapat diatur. Hubungi Super Admin untuk
              menyiapkan outlet tenant ini.
            </AlertDescription>
          </Alert>
        ) : orderedOutlets.length === 1 ? (
          <PickupPointsManager
            connectionSource={activeOutlet.connectionSource}
            key={activeOutlet.id}
            optionsFixture={optionsFixture}
            outletId={activeOutlet.id}
            outletName={activeOutlet.name}
            points={points}
          />
        ) : (
          <OutletSettingsWorkspace
            activeOutletId={activeOutlet.id}
            basePath="/app/pengaturan/pickup"
            focusTargetId="pickup-points-title"
            outlets={orderedOutlets.map(({ id, name, readinessStatus }) => ({
              id,
              name,
              readinessStatus,
            }))}
          >
            <PickupPointsManager
              connectionSource={activeOutlet.connectionSource}
              key={activeOutlet.id}
              optionsFixture={optionsFixture}
              outletId={activeOutlet.id}
              outletName={activeOutlet.name}
              points={points}
            />
          </OutletSettingsWorkspace>
        )}
      </SettingsLayout>
    </PageContainer>
  );
}
