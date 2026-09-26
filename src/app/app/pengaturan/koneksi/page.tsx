import type { Metadata } from "next";
import { Store } from "lucide-react";

import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import type { OutletReadiness } from "@/db/outlet-readiness-repository";

import { OutletSelect } from "../_components/outlet-select";
import { loadSettingsOutlets, readAuditScenario, requireTenantAdmin, toSafeOutlet } from "../_components/settings-data";
import { ConnectionForm } from "./connection-form";

export const metadata: Metadata = { title: "Koneksi Mengantar · Pengaturan", robots: { index: false } };

/** Development browser-audit fixture: one outlet whose own connection needs attention. */
function attentionFixture(issue: OutletReadiness["connectionIssue"]): OutletReadiness {
  const updatedAt = new Date("2026-09-01T00:00:00.000Z");
  return {
    connectionIssue: issue,
    connectionSource: "private",
    connectionStatus: "private_attention",
    connectionUpdatedAt: updatedAt,
    defaultOriginAreaId: "origin-audit-private",
    defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
    defaultPickupAddressId: "pickup-audit-private",
    defaultPickupAddressLabel: "Gudang Privat, Jalan Audit 99",
    id: "79000000-0000-4000-8000-000000000099",
    name: "Outlet Audit Privat",
    readinessStatus: "needs_attention",
    updatedAt,
  };
}

export default async function ConnectionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string | string[] }>;
}) {
  const principal = await requireTenantAdmin();
  const scenario = await readAuditScenario("/app/pengaturan/koneksi");
  if (scenario === "settings-koneksi-error") throw new Error("Intentional development-only connection settings failure.");
  if (scenario === "settings-koneksi-stream") await new Promise((resolve) => setTimeout(resolve, 1_200));

  const fixture = scenario === "settings-private-attention"
    ? attentionFixture("secret_unavailable")
    : scenario === "settings-private-auth-error" ? attentionFixture("authentication") : null;
  const { active, outlets } = fixture
    ? { active: fixture, outlets: [fixture] }
    : scenario === "settings-connection-empty"
      ? { active: null, outlets: [] }
      : await loadSettingsOutlets(principal, (await searchParams).outlet);

  if (!active) {
    return (
      <DataCard>
        <EmptyState
          description="Koneksi Mengantar diatur per outlet. Hubungi admin platform untuk menyiapkan outlet gerai ini."
          icon={Store}
          title="Belum ada outlet"
        />
      </DataCard>
    );
  }

  return (
    <>
      {outlets.length > 1 ? (
        <OutletSelect activeId={active.id} outlets={outlets.map(({ id, name, readinessStatus }) => ({ id, name, readinessStatus }))} />
      ) : null}
      <ConnectionForm key={active.id} outlet={toSafeOutlet(active)} />
    </>
  );
}
