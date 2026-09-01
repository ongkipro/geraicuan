import type { Metadata } from "next";
import { CircleAlert } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OutletSettingsForm } from "@/app/app/pengaturan/outlet-settings-form";
import { DefinitionGrid } from "@/components/cms/detail-section";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
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
import type { MengantarPickupOption } from "@/lib/mengantar-locations";

export const metadata: Metadata = { robots: { index: false } };

const updatedAtFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

const auditUpdatedAt = new Date("2026-09-01T00:00:00.000Z");

function buildManyOutletAuditFixture(): OutletReadiness[] {
  return Array.from({ length: 10 }, (_, index) => {
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

function buildPickupOptionsAuditFixture(): MengantarPickupOption[] {
  return Array.from({ length: 12 }, (_, index) => ({
    originAreaId: `origin-audit-${index + 1}`,
    originLabel: `Kecamatan Audit ${index + 1}, Kota Bandung, Jawa Barat`,
    pickupAddressId: `pickup-audit-${index + 1}`,
    pickupLabel: `Gudang Audit ${index + 1}, Jalan Contoh ${index + 1}`,
  }));
}

export default async function OutletSettingsPage() {
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

  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute(
        (await headers()).get(UI_AUDIT_HEADER),
        "/app/pengaturan",
      )
    : null;

  if (auditScenario === "settings-error") {
    throw new Error("Intentional development-only outlet settings page failure.");
  }
  if (auditScenario === "settings-stream") {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
  }

  let outlets: OutletReadiness[];
  if (auditScenario === "settings-empty" || auditScenario === "settings-first-run") {
    outlets = [];
  } else if (auditScenario === "settings-many") {
    outlets = buildManyOutletAuditFixture();
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
    );
  }
  const readyCount = outlets.filter((outlet) => outlet.readinessStatus === "ready").length;
  const privateCount = outlets.filter((outlet) => outlet.connectionSource === "private").length;
  const orderedOutlets = [...outlets].sort((left, right) => {
    if (left.readinessStatus !== right.readinessStatus) {
      return left.readinessStatus === "needs_attention" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "id-ID") || left.id.localeCompare(right.id);
  });

  return (
    <PageContainer>
      <PageHeader
        description="Lengkapi pickup, area asal, dan sumber koneksi. Nilai kredensial tidak pernah dikirim ke browser."
        eyebrow="Pengaturan"
        title="Outlet & koneksi"
      />

      {outlets.length === 0 ? (
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Belum ada outlet</AlertTitle>
          <AlertDescription>
            Outlet harus tersedia sebelum pickup dan area asal dapat diatur. Hubungi Super Admin
            untuk menyiapkan outlet tenant ini.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {outlets.length > 1 ? (
            <section aria-label="Ringkasan kesiapan outlet">
              <DefinitionGrid
                items={[
                  { label: "Total outlet", value: outlets.length },
                  { label: "Siap dipakai", value: readyCount },
                  { label: "Koneksi privat", value: privateCount },
                  { label: "Default platform", value: outlets.length - privateCount },
                ]}
              />
            </section>
          ) : null}

          <section aria-label="Daftar pengaturan outlet" className="grid max-w-3xl gap-4">
            {outlets.length > 1 ? (
              <p className="text-sm leading-6 text-muted-foreground">
                Outlet yang perlu dilengkapi ditampilkan lebih dulu. Buka outlet siap pakai untuk
                mengubah pickup atau memeriksa sumber koneksinya.
              </p>
            ) : null}
            {orderedOutlets.map((outlet) => (
              <OutletSettingsForm
                defaultExpanded={
                  outlets.length === 1 || outlet.readinessStatus === "needs_attention"
                }
                key={outlet.id}
                pickupOptionsFixture={
                  auditScenario === "settings-many"
                    ? { options: buildPickupOptionsAuditFixture(), success: true }
                    : auditScenario === "settings-provider-error"
                      ? {
                          message:
                            "Daftar pickup Mengantar belum dapat dimuat. Pilihan tersimpan tidak berubah.",
                        }
                      : undefined
                }
                outlet={{
                  id: outlet.id,
                  name: outlet.name,
                  defaultPickupAddressId: outlet.defaultPickupAddressId,
                  defaultPickupAddressLabel: outlet.defaultPickupAddressLabel,
                  defaultOriginAreaId: outlet.defaultOriginAreaId,
                  defaultOriginAreaLabel: outlet.defaultOriginAreaLabel,
                  connectionIssue: outlet.connectionIssue,
                  connectionSource: outlet.connectionSource,
                  connectionStatus: outlet.connectionStatus,
                  connectionUpdatedAtLabel: outlet.connectionUpdatedAt
                    ? `${updatedAtFormatter.format(outlet.connectionUpdatedAt)} WIB`
                    : null,
                  readinessStatus: outlet.readinessStatus,
                  updatedAtLabel: `${updatedAtFormatter.format(outlet.updatedAt)} WIB`,
                }}
              />
            ))}
          </section>
        </>
      )}
    </PageContainer>
  );
}
