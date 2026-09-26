import type { Metadata } from "next";
import { Store } from "lucide-react";

import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { db } from "@/db/client";
import { listOutletPickupPoints } from "@/db/outlet-pickup-point-repository";
import { withTenantContext } from "@/db/tenant-context";
import type { MengantarPickupOptionsActionState } from "@/app/app/pengaturan/actions";

import { OutletSelect } from "../_components/outlet-select";
import { loadSettingsOutlets, readAuditScenario, requireTenantAdmin, STORE_SETUP } from "../_components/settings-data";
import { PickupPoints, type SafePickupPoint } from "./pickup-points";

export const metadata: Metadata = { title: "Titik pickup · Pengaturan", robots: { index: false } };

/** Development browser-audit fixtures, so the list and picker states render without Mengantar. */
function auditFixture(scenario: Awaited<ReturnType<typeof readAuditScenario>>) {
  if (scenario === "settings-pickup-empty") return { options: undefined, points: [] };
  if (scenario !== "settings-pickup-list" && scenario !== "settings-pickup-provider-error") return null;
  const points: SafePickupPoint[] = [1, 2, 3].map((index) => ({
    isDefault: index === 1,
    originAreaLabel: `Kecamatan Audit ${index}, Kota Bandung, Jawa Barat`,
    pickupAddressId: `pickup-audit-${index}`,
    pickupAddressLabel: `Gudang Audit ${index}, Jalan Contoh ${index}`,
  }));
  const options: MengantarPickupOptionsActionState = scenario === "settings-pickup-list"
    ? {
        options: Array.from({ length: 6 }, (_, index) => ({
          originAreaId: `origin-audit-${index + 1}`,
          originLabel: `Kecamatan Audit ${index + 1}, Kota Bandung, Jawa Barat`,
          pickupAddressId: `pickup-audit-${index + 1}`,
          pickupLabel: `Gudang Audit ${index + 1}, Jalan Contoh ${index + 1}`,
        })),
        success: true,
      }
    : { message: "Daftar pickup Mengantar belum dapat dimuat. Pilihan tersimpan tidak berubah." };
  return { options, points };
}

export default async function PickupSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string | string[] }>;
}) {
  const principal = await requireTenantAdmin();
  const scenario = await readAuditScenario("/app/pengaturan/pickup");
  if (scenario === "settings-pickup-error") throw new Error("Intentional development-only pickup settings failure.");
  if (scenario === "settings-pickup-stream") await new Promise((resolve) => setTimeout(resolve, 1_200));

  const { active, outlets } = await loadSettingsOutlets(principal, (await searchParams).outlet);
  if (!active) {
    return (
      <DataCard>
        <EmptyState
          description="Titik pickup diatur per outlet. Hubungi admin platform untuk menyiapkan outlet gerai ini."
          icon={Store}
          title="Belum ada outlet"
        />
      </DataCard>
    );
  }

  const fixture = auditFixture(scenario);
  const points: SafePickupPoint[] = fixture?.points ?? (await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => listOutletPickupPoints(tx, context, active.id),
    STORE_SETUP,
  )).map(({ isDefault, originAreaLabel, pickupAddressId, pickupAddressLabel }) => ({
    isDefault,
    originAreaLabel,
    pickupAddressId,
    pickupAddressLabel,
  }));

  return (
    <>
      {outlets.length > 1 ? <OutletSelect activeId={active.id} outlets={outlets.map(({ id, name, readinessStatus }) => ({ id, name, readinessStatus }))} /> : null}
      <PickupPoints
        connectionSource={active.connectionSource}
        key={active.id}
        optionsFixture={fixture?.options}
        outletId={active.id}
        outletName={active.name}
        points={points}
      />
    </>
  );
}
