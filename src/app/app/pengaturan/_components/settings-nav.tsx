"use client";

import { Link2, MapPin, Store, Tag, Truck, User, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Spec 10 §4.10: the settings sub-menu, in this order. */
export const SETTINGS_NAV_ITEMS = [
  { href: "/app/pengaturan", icon: User, label: "Profil gerai" },
  { href: "/app/pengaturan/label", icon: Tag, label: "Informasi label" },
  { href: "/app/pengaturan/pickup", icon: MapPin, label: "Titik pickup" },
  { href: "/app/pengaturan/outlet", icon: Store, label: "Outlet" },
  { href: "/app/pengaturan/kurir", icon: Truck, label: "Mitra kurir" },
  { href: "/app/pengaturan/koneksi", icon: Link2, label: "Koneksi Mengantar" },
  { href: "/app/anggota", icon: UsersRound, label: "Anggota & akses" },
] as const;

/**
 * T-252: from 1024px a left rail; below it one horizontally scrolling row of 44px pills, so the
 * page content starts right under the menu instead of below seven stacked rows. The current pill
 * is scrolled into view, and a fade marks whichever side still hides pills.
 */
export function SettingsNav() {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const [fade, setFade] = useState({ end: false, start: false });

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const current = list.querySelector<HTMLElement>("[aria-current=page]");
    // Horizontal only: scrollIntoView would also move the page.
    if (current && list.scrollWidth > list.clientWidth) {
      list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
    }
    const update = () => {
      const next = {
        end: list.scrollLeft + list.clientWidth < list.scrollWidth - 1,
        start: list.scrollLeft > 1,
      };
      setFade((value) => (value.end === next.end && value.start === next.start ? value : next));
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => {
      list.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [pathname]);

  return (
    <nav
      aria-label="Menu pengaturan"
      className={cn(
        "relative w-full min-w-0 shrink-0 rounded-2xl bg-card p-2 shadow-card lg:sticky lg:top-24 lg:w-64",
        "before:pointer-events-none before:absolute before:inset-y-2 before:left-2 before:z-10 before:w-8 before:rounded-l-lg before:bg-linear-to-r before:from-card before:opacity-0 before:transition-opacity before:content-['']",
        "after:pointer-events-none after:absolute after:inset-y-2 after:right-2 after:z-10 after:w-8 after:rounded-r-lg after:bg-linear-to-l after:from-card after:opacity-0 after:transition-opacity after:content-['']",
        fade.start && "max-lg:before:opacity-100",
        fade.end && "max-lg:after:opacity-100",
      )}
    >
      <ul className="flex gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] lg:grid lg:overflow-visible" ref={listRef}>
        {SETTINGS_NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const current = pathname === href;
          return (
            <li className="shrink-0" key={href}>
              <Link
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:h-10 lg:gap-3",
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
