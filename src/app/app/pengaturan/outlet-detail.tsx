import { MapPin } from "lucide-react";
import Link from "next/link";

import {
  missingOutletConfiguration,
  type SafeOutletReadiness,
} from "@/app/app/pengaturan/outlet-settings-types";
import { SettingsCard } from "@/components/cms/settings-layout";
import { ToneBadge } from "@/components/cms/shipment-status-badge";
import { Button } from "@/components/ui/button";

/**
 * T-158: the Outlet page's own half — readiness and the location pair the
 * default pickup point produces. Read-only, so it stays a server component:
 * choosing a pickup point lives on `/app/pengaturan/pickup`, and the connection
 * on `/app/pengaturan/koneksi`.
 *
 * T-206 reference (`pengaturan.html`, Outlet tab): one card per outlet — name and
 * readiness badge, then label/value rows divided by hairlines, then the two
 * "Kelola" actions in the footer.
 */
export function OutletDetail({ outlet }: { outlet: SafeOutletReadiness }) {
  const missing = missingOutletConfiguration(outlet);
  const rowClassName = "grid min-w-0 gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4";

  return (
    <SettingsCard
      badge={<ToneBadge label={outlet.readinessStatus === "ready" ? "Siap" : "Perlu dilengkapi"} tone={outlet.readinessStatus === "ready" ? "ok" : "warn"} />}
      description={missing.length > 0
        ? `Periksa ${missing.join(", ")}.`
        : "Dapat dipakai untuk membuat kiriman."}
      footer={(
        <>
          <Button asChild className="min-h-11 md:min-h-10" variant="outline">
            <Link href={`/app/pengaturan/pickup?outlet=${encodeURIComponent(outlet.id)}`}>
              Kelola titik pickup
            </Link>
          </Button>
          <Button asChild className="min-h-11 md:min-h-10" variant="outline">
            <Link href={`/app/pengaturan/koneksi?outlet=${encodeURIComponent(outlet.id)}`}>
              Kelola koneksi Mengantar
            </Link>
          </Button>
        </>
      )}
      id="outlet-detail-title"
      title={outlet.name}
    >
      <dl className="grid divide-y">
        <div className={rowClassName}>
          <dt className="text-sm text-muted-foreground" id="outlet-location-title">Lokasi pengiriman</dt>
          <dd className="grid min-w-0 gap-1 text-sm">
            <span className="flex items-start gap-2 font-medium [overflow-wrap:anywhere]">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {outlet.defaultPickupAddressLabel ?? (
                <span className="font-normal text-muted-foreground">Belum ada titik pickup</span>
              )}
            </span>
            <span className="text-muted-foreground [overflow-wrap:anywhere]">
              Area asal (otomatis):{" "}
              <span className="text-foreground" id={`origin-${outlet.id}`}>
                {outlet.defaultOriginAreaLabel ?? "Akan terisi setelah pickup dipilih"}
              </span>
            </span>
          </dd>
        </div>
        <div className={rowClassName}>
          <dt className="text-sm text-muted-foreground" id="outlet-connection-summary-title">Koneksi Mengantar</dt>
          <dd className="grid min-w-0 justify-items-start gap-1 text-sm">
            <ToneBadge
              label={outlet.connectionSource === "private"
                ? "Akun sendiri"
                : outlet.privateConnectionRequired ? "Belum terhubung" : "Bawaan GeraiCUAN"}
              tone={outlet.connectionStatus === "private_attention"
                ? "danger"
                : outlet.connectionSource !== "private" && outlet.privateConnectionRequired ? "warn" : "ok"}
            />
            <span className="text-muted-foreground">
              {outlet.connectionStatus === "private_attention"
                ? "Koneksi privat perlu diperiksa sebelum kiriman baru dapat dibuat."
                : outlet.connectionStatus === "private_ready"
                  ? "Memakai API key Mengantar milik outlet."
                  : outlet.privateConnectionRequired
                    ? "Hubungkan API key akun Mengantar gerai sebelum membuat kiriman."
                    : "Memakai koneksi Mengantar yang dikelola GeraiCUAN."}
            </span>
          </dd>
        </div>
        <div className={rowClassName}>
          <dt className="text-sm text-muted-foreground">Diperbarui</dt>
          <dd className="text-sm tabular-nums">{outlet.updatedAtLabel}</dd>
        </div>
      </dl>
    </SettingsCard>
  );
}
