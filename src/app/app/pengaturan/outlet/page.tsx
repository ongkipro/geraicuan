import type { Metadata } from "next";
import { MapPin, Store } from "lucide-react";
import Link from "next/link";

import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { missingOutletConfiguration, type SafeOutletReadiness } from "@/app/app/pengaturan/outlet-settings-types";

import { loadSettingsOutlets, readAuditScenario, requireTenantAdmin, toSafeOutlet } from "../_components/settings-data";
import { connectionSentence } from "../_components/settings-logic";

export const metadata: Metadata = { title: "Outlet · Pengaturan", robots: { index: false } };

const ROW = "grid gap-1 py-2 sm:grid-cols-3 sm:gap-4";

function OutletRow({ outlet }: { outlet: SafeOutletReadiness }) {
  const missing = missingOutletConfiguration(outlet);
  const query = `?outlet=${encodeURIComponent(outlet.id)}`;
  return (
    <li aria-labelledby={`outlet-${outlet.id}`} className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold wrap-anywhere" id={`outlet-${outlet.id}`}>{outlet.name}</h3>
        {outlet.readinessStatus === "ready"
          ? <StatusBadge label="Siap" tone="success" />
          : <StatusBadge label="Perlu dilengkapi" tone="warning" />}
      </div>
      {missing.length > 0 ? (
        <p className="text-sm text-warn">Lengkapi {missing.join(", ")}.</p>
      ) : null}
      <dl className="divide-y text-sm">
        <div className={ROW}>
          <dt className="text-muted-foreground">Lokasi pengiriman</dt>
          <dd className="grid gap-0.5 sm:col-span-2">
            {outlet.defaultPickupAddressLabel ? (
              <span className="flex items-start gap-2 font-medium wrap-anywhere">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {outlet.defaultPickupAddressLabel}
              </span>
            ) : <span className="text-muted-foreground">Belum ada titik pickup utama</span>}
            <span className="text-muted-foreground wrap-anywhere">
              Area asal: {outlet.defaultOriginAreaLabel ?? "terisi dari titik pickup utama"}
            </span>
          </dd>
        </div>
        <div className={ROW}>
          <dt className="text-muted-foreground">Koneksi Mengantar</dt>
          <dd className="font-medium sm:col-span-2">{connectionSentence(outlet)}</dd>
        </div>
        <div className={ROW}>
          <dt className="text-muted-foreground">Diperbarui</dt>
          <dd className="tabular-nums sm:col-span-2">{outlet.updatedAtLabel}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap justify-end gap-3">
        <Button asChild size="sm" variant="outline">
          <Link href={`/app/pengaturan/pickup${query}`}>Kelola titik pickup</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/app/pengaturan/koneksi${query}`}>Kelola koneksi</Link>
        </Button>
      </div>
    </li>
  );
}

/** Read-only readiness of every outlet; each row links to the page that owns what is missing. */
export default async function OutletSettingsPage() {
  const principal = await requireTenantAdmin();
  const scenario = await readAuditScenario("/app/pengaturan/outlet");
  if (scenario === "settings-outlet-error") throw new Error("Intentional development-only outlet settings failure.");
  if (scenario === "settings-outlet-stream") await new Promise((resolve) => setTimeout(resolve, 1_200));

  const { outlets } = scenario === "settings-empty" || scenario === "settings-first-run"
    ? { outlets: [] }
    : await loadSettingsOutlets(principal, undefined);
  const safe = outlets.map(toSafeOutlet);
  const ready = safe.filter((outlet) => outlet.readinessStatus === "ready").length;

  return (
    <DataCard
      count={safe.length}
      description={safe.length > 0 ? `${ready} siap dipakai · ${safe.length - ready} perlu dilengkapi` : undefined}
      title="Daftar outlet"
    >
      {safe.length === 0 ? (
        <EmptyState
          description="Outlet disiapkan oleh Super Admin. Hubungi Super Admin untuk menambahkan outlet gerai ini."
          icon={Store}
          title="Belum ada outlet"
        />
      ) : (
        <ul aria-label="Outlet gerai" className="divide-y">
          {safe.map((outlet) => <OutletRow key={outlet.id} outlet={outlet} />)}
        </ul>
      )}
    </DataCard>
  );
}
