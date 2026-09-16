import { MapPin } from "lucide-react";
import Link from "next/link";

import {
  missingOutletConfiguration,
  type SafeOutletReadiness,
} from "@/app/app/pengaturan/outlet-settings-types";
import { SettingsCard } from "@/components/cms/settings-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * T-158: the Outlet page's own half — readiness and the location pair the
 * default pickup point produces. Read-only, so it stays a server component:
 * choosing a pickup point lives on `/app/pengaturan/pickup`, and the connection
 * on `/app/pengaturan/koneksi`.
 */
export function OutletDetail({ outlet }: { outlet: SafeOutletReadiness }) {
  const missing = missingOutletConfiguration(outlet);

  return (
    <section aria-labelledby="outlet-detail-title" className="grid min-w-0 gap-8">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Outlet aktif</p>
          <h2
            className="mt-1 rounded-sm text-xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="outlet-detail-title"
            tabIndex={-1}
          >
            {outlet.name}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {missing.length > 0
              ? `Periksa ${missing.join(", ")}.`
              : "Dapat dipakai untuk membuat kiriman."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Terakhir diperbarui {outlet.updatedAtLabel}.
          </p>
        </div>
        <Badge variant={outlet.readinessStatus === "ready" ? "secondary" : "destructive"}>
          {outlet.readinessStatus === "ready" ? "Siap" : "Perlu dilengkapi"}
        </Badge>
      </header>

      <SettingsCard
        description="Titik pickup utama outlet ini. Area asal Mengantar mengikuti alamat pickup yang dipilih."
        footer={
          <Button asChild className="min-h-11 md:min-h-9" variant="outline">
            <Link href={`/app/pengaturan/pickup?outlet=${encodeURIComponent(outlet.id)}`}>
              Kelola titik pickup
            </Link>
          </Button>
        }
        id="outlet-location-title"
        title="Lokasi pengiriman"
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="grid min-w-0 gap-1">
            <dt className="text-xs font-medium text-muted-foreground">Alamat pickup utama</dt>
            <dd className="flex items-start gap-2 text-sm leading-6 [overflow-wrap:anywhere]">
              <MapPin aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
              {outlet.defaultPickupAddressLabel ?? (
                <span className="text-muted-foreground">Belum ada titik pickup</span>
              )}
            </dd>
          </div>
          <div className="grid min-w-0 gap-1">
            <dt className="text-xs font-medium text-muted-foreground">
              Area asal <span className="font-normal">(otomatis)</span>
            </dt>
            <dd className="text-sm leading-6 [overflow-wrap:anywhere]" id={`origin-${outlet.id}`}>
              {outlet.defaultOriginAreaLabel ?? (
                <span className="text-muted-foreground">Akan terisi setelah pickup dipilih</span>
              )}
            </dd>
          </div>
        </dl>
      </SettingsCard>

      <SettingsCard
        badge={
          <Badge variant={outlet.connectionStatus === "private_attention" ? "destructive" : "secondary"}>
            {outlet.connectionSource === "private" ? "Akun sendiri" : "Default GeraiCUAN"}
          </Badge>
        }
        description="Akun Mengantar yang dipakai outlet ini untuk estimasi dan pembuatan order."
        footer={
          <Button asChild className="min-h-11 md:min-h-9" variant="outline">
            <Link href={`/app/pengaturan/koneksi?outlet=${encodeURIComponent(outlet.id)}`}>
              Kelola koneksi Mengantar
            </Link>
          </Button>
        }
        id="outlet-connection-summary-title"
        title="Koneksi Mengantar"
      >
        <p className="text-sm leading-6 text-muted-foreground">
          {outlet.connectionStatus === "private_attention"
            ? "Koneksi privat outlet ini perlu diperiksa sebelum kiriman baru dapat dibuat."
            : outlet.connectionStatus === "private_ready"
              ? "Outlet ini memakai API key Mengantar miliknya sendiri."
              : "Outlet ini memakai koneksi Mengantar yang dikelola GeraiCUAN."}
        </p>
      </SettingsCard>
    </section>
  );
}
