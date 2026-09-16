import type { membershipRoles } from "@/db/schema";

export type TenantCmsRole = (typeof membershipRoles)[number];

export type CmsNavigationItem = {
  current: boolean;
  href: string;
  key: string;
  label: string;
  shortLabel: string;
};

export type CmsNavigationGroup = {
  items: CmsNavigationItem[];
  label: string;
};

type NavigationDefinition = Omit<CmsNavigationItem, "current"> & {
  roles?: readonly TenantCmsRole[];
};

// PR-54: the accepted CMS navigation groups (2026-09-16). Every authenticated
// destination is reachable from one grouped menu, so nothing is reachable
// only from a header button or another page's link.
const navigationGroups: readonly {
  label: string;
  items: readonly NavigationDefinition[];
}[] = [
  {
    label: "Utama",
    items: [
      {
        href: "/app",
        key: "dashboard",
        label: "Dasbor",
        shortLabel: "DB",
      },
    ],
  },
  {
    label: "Pengiriman",
    items: [
      {
        href: "/app/pengiriman/baru",
        key: "shipment-new",
        label: "Buat kiriman",
        shortLabel: "BK",
      },
      {
        href: "/app/impor",
        key: "import",
        label: "Impor CSV",
        shortLabel: "IM",
      },
      {
        href: "/app/pengiriman",
        key: "shipments",
        label: "Histori kiriman",
        shortLabel: "KI",
      },
      {
        href: "/app/pengiriman/rts",
        key: "rts",
        label: "Retur (RTS)",
        shortLabel: "RT",
      },
      {
        href: "/app/label",
        key: "print-label",
        label: "Cetak resi",
        shortLabel: "CL",
      },
    ],
  },
  {
    label: "Data",
    items: [
      {
        href: "/app/kontak",
        key: "contacts",
        label: "Kontak",
        shortLabel: "KO",
      },
    ],
  },
  {
    label: "Cek",
    items: [
      {
        href: "/app/cek-resi",
        key: "tracking-lookup",
        label: "Cek resi",
        shortLabel: "CR",
      },
      {
        href: "/app/cek-tarif",
        key: "quick-rate",
        label: "Cek tarif",
        shortLabel: "CT",
      },
    ],
  },
  {
    label: "Laporan",
    items: [
      {
        href: "/app/analitik",
        key: "analytics",
        label: "Analitik",
        roles: ["TENANT_ADMIN"],
        shortLabel: "AN",
      },
      // T-165 and T-166 (PR-55): both reports are a Tenant Admin record, so
      // they carry the same role restriction Analitik already has.
      {
        href: "/app/laporan/pengiriman",
        key: "shipment-report",
        label: "Laporan pengiriman",
        roles: ["TENANT_ADMIN"],
        shortLabel: "LP",
      },
      {
        href: "/app/laporan/cetak-resi",
        key: "print-history-report",
        label: "Riwayat cetak resi",
        roles: ["TENANT_ADMIN"],
        shortLabel: "RC",
      },
    ],
  },
  {
    label: "Pengelolaan",
    items: [
      {
        href: "/app/keuangan",
        key: "finance",
        label: "Keuangan",
        roles: ["TENANT_ADMIN"],
        shortLabel: "KE",
      },
      {
        href: "/app/pengaturan",
        key: "settings",
        label: "Pengaturan",
        roles: ["TENANT_ADMIN"],
        shortLabel: "OK",
      },
    ],
  },
];

const platformNavigationGroups: readonly {
  label: string;
  items: readonly NavigationDefinition[];
}[] = [
  {
    label: "Platform",
    items: [
      {
        href: "/platform",
        key: "platform-overview",
        label: "Ringkasan",
        shortLabel: "RG",
      },
      {
        href: "/platform/tenant",
        key: "platform-tenants",
        label: "Tenant",
        shortLabel: "TN",
      },
      {
        href: "/platform/audit",
        key: "platform-audit",
        label: "Audit",
        shortLabel: "AU",
      },
    ],
  },
];

function routeMatches(pathname: string, href: string) {
  return (href === "/app" || href === "/platform")
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function resolveNavigation(
  groups: readonly { label: string; items: readonly NavigationDefinition[] }[],
  currentKey: string,
): CmsNavigationGroup[] {
  return groups.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      current: item.key === currentKey,
      href: item.href,
      key: item.key,
      label: item.label,
      shortLabel: item.shortLabel,
    })),
  }));
}

export function tenantCmsNavigation(
  role: TenantCmsRole,
  pathname: string,
): CmsNavigationGroup[] {
  const visibleGroups = navigationGroups
    .map((group) => ({
      label: group.label,
      items: group.items.filter(
        (item) => !item.roles || item.roles.includes(role),
      ),
    }))
    .filter((group) => group.items.length > 0);

  // /app/anggota (member management) is reached from Pengaturan, not its own
  // menu entry, so it resolves the Pengaturan destination as current.
  const navigationPath = pathname === "/app/anggota" || pathname.startsWith("/app/anggota/")
    ? "/app/pengaturan"
    : pathname;
  const matchedDefinition = navigationGroups
    .flatMap((group) => group.items)
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => routeMatches(navigationPath, item.href));
  // No fallback destination: a route that is missing from the menu must resolve
  // zero current rows so the route-by-route test names it, rather than quietly
  // marking Dasbor current while the operator is somewhere else.
  return resolveNavigation(visibleGroups, matchedDefinition?.key ?? "");
}

export function platformCmsNavigation(pathname: string): CmsNavigationGroup[] {
  const currentKey = platformNavigationGroups
    .flatMap((group) => group.items)
    .find((item) => routeMatches(pathname, item.href))?.key ??
    "platform-overview";

  return resolveNavigation(platformNavigationGroups, currentKey);
}
