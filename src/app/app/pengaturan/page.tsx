import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DataCard } from "@/components/app/data-card";
import { db } from "@/db/client";
import { loadTenantShipmentPrefix } from "@/db/shipment-number-repository";
import { withTenantContext } from "@/db/tenant-context";
import { loadTenantBrand, loadTenantProfile } from "@/db/tenant-settings-repository";
import { geraiLogoSrc } from "@/lib/gerai-settings";
import { suggestShipmentPrefix } from "@/lib/shipment-number";

import { GeraiIdentityCard } from "./_components/gerai-identity-card";
import { GeraiLogoCard } from "./_components/gerai-logo-card";
import { GeraiProfileCard } from "./_components/gerai-profile-card";
import { formatWib, readAuditScenario, requireTenantAdmin, STORE_SETUP } from "./_components/settings-data";
import { ShipmentPrefixCard } from "./_components/shipment-prefix-card";

export const metadata: Metadata = { title: "Pengaturan", robots: { index: false } };

const FACT_ROW = "grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-3 sm:gap-4";

export default async function ProfileSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string | string[] }>;
}) {
  const principal = await requireTenantAdmin();

  // Old links carried `?outlet=` to the combined settings page; the Outlet page owns it now.
  const requestedOutlet = (await searchParams).outlet;
  if (typeof requestedOutlet === "string" && requestedOutlet !== "") {
    redirect(`/app/pengaturan/outlet?outlet=${encodeURIComponent(requestedOutlet)}`);
  }

  const scenario = await readAuditScenario("/app/pengaturan");
  if (scenario === "settings-error") throw new Error("Intentional development-only profile settings failure.");
  if (scenario === "settings-stream") await new Promise((resolve) => setTimeout(resolve, 1_200));

  const { brand, profile, shipmentPrefix } = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    async (tx, context) => ({
      brand: await loadTenantBrand(tx, context),
      profile: await loadTenantProfile(tx, context),
      shipmentPrefix: await loadTenantShipmentPrefix(tx, context),
    }),
    STORE_SETUP,
  );

  return (
    <>
      <GeraiIdentityCard name={profile.name} whatsapp={profile.contactWhatsapp} />

      <GeraiLogoCard
        geraiName={profile.name}
        logoSrc={geraiLogoSrc(brand.logo?.sha256 ?? null)}
        updatedAtLabel={brand.logo ? formatWib(brand.logo.updatedAt) : null}
      />

      <GeraiProfileCard
        initial={{
          businessCategory: brand.businessCategory,
          csEmail: brand.csEmail,
          labelNote: brand.labelNote,
          website: brand.website,
        }}
      />

      <ShipmentPrefixCard
        attemptId={randomUUID()}
        lockedAtLabel={shipmentPrefix.lockedAt ? formatWib(shipmentPrefix.lockedAt) : null}
        prefix={shipmentPrefix.prefix}
        suggestedPrefix={suggestShipmentPrefix(shipmentPrefix.tenantName)}
      />

      <DataCard description="Berlaku sama untuk semua gerai dan tidak dapat diubah." title="Format tanggal dan angka">
        <dl className="grid divide-y text-sm">
          <div className={FACT_ROW}>
            <dt className="text-muted-foreground">Bahasa dan format</dt>
            <dd className="sm:col-span-2">Indonesia (id-ID)</dd>
          </div>
          <div className={FACT_ROW}>
            <dt className="text-muted-foreground">Zona waktu</dt>
            <dd className="sm:col-span-2">WIB (Asia/Jakarta, UTC+7)</dd>
          </div>
          <div className={FACT_ROW}>
            <dt className="text-muted-foreground">Mata uang</dt>
            <dd className="sm:col-span-2 tabular-nums">Rupiah (IDR), contoh Rp 1.250.000</dd>
          </div>
        </dl>
      </DataCard>
    </>
  );
}
