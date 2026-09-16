import { Building2, KeyRound, MapPinned, Store, UsersRound } from "lucide-react";

import type { SettingsNavItem } from "@/components/cms/settings-layout";

/** The settings index: Profil toko, and the page the mobile back link returns to. */
export const SETTINGS_INDEX_HREF = "/app/pengaturan";

/** PR-46 settings menu shared by every settings page (page, loading, error). */
export const administrationNavigation: readonly SettingsNavItem[] = [
  {
    description: "Nama toko, awalan nomor kiriman, format tanggal.",
    href: "/app/pengaturan",
    icon: Store,
    label: "Profil toko",
  },
  {
    description: "Alamat penjemputan Mengantar dan titik utama tiap outlet.",
    href: "/app/pengaturan/pickup",
    icon: MapPinned,
    label: "Titik pickup",
  },
  {
    description: "Kesiapan outlet dan area asal pengiriman.",
    href: "/app/pengaturan/outlet",
    icon: Building2,
    label: "Outlet",
  },
  {
    description: "Default GeraiCUAN atau akun Mengantar milik outlet.",
    href: "/app/pengaturan/koneksi",
    icon: KeyRound,
    label: "Koneksi Mengantar",
  },
  {
    description: "Undang anggota dan atur peran akses.",
    href: "/app/anggota",
    icon: UsersRound,
    label: "Anggota & akses",
  },
];
