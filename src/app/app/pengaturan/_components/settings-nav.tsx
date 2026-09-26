"use client";

import { Link2, MapPin, Store, Tag, User, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Spec 10 §4.10: the settings sub-menu, in this order. */
export const SETTINGS_NAV_ITEMS = [
  { href: "/app/pengaturan", icon: User, label: "Profil gerai" },
  { href: "/app/pengaturan/label", icon: Tag, label: "Informasi label" },
  { href: "/app/pengaturan/pickup", icon: MapPin, label: "Titik pickup" },
  { href: "/app/pengaturan/outlet", icon: Store, label: "Outlet" },
  { href: "/app/pengaturan/koneksi", icon: Link2, label: "Koneksi Mengantar" },
  { href: "/app/anggota", icon: UsersRound, label: "Anggota & akses" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Menu pengaturan"
      className="w-full shrink-0 rounded-2xl bg-card p-2 shadow-card lg:w-64"
    >
      <ul className="grid gap-1">
        {SETTINGS_NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const current = pathname === href;
          return (
            <li key={href}>
              <Link
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring max-md:h-11",
                  current
                    ? "bg-accent font-semibold text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                href={href}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
