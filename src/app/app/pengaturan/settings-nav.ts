import { Settings2, UsersRound } from "lucide-react";

import type { SettingsNavItem } from "@/components/cms/settings-layout";

/** Administrasi sub-navigation shared by /app/pengaturan and /app/anggota (page, loading, error). */
export const administrationNavigation: readonly SettingsNavItem[] = [
  { href: "/app/pengaturan", icon: Settings2, label: "Outlet & koneksi" },
  { href: "/app/anggota", icon: UsersRound, label: "Anggota & akses" },
];
