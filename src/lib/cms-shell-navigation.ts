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
        label: "Ringkasan",
        shortLabel: "RG",
      },
    ],
  },
  {
    label: "Operasional",
    items: [
      {
        href: "/app/pengiriman",
        key: "shipments",
        label: "Kiriman",
        shortLabel: "KI",
      },
      {
        href: "/app/pengiriman/rts",
        key: "rts",
        label: "Retur (RTS)",
        shortLabel: "RT",
      },
      {
        href: "/app/kontak",
        key: "contacts",
        label: "Kontak",
        shortLabel: "KO",
      },
    ],
  },
  {
    label: "Wawasan",
    items: [
      {
        href: "/app/analitik",
        key: "analytics",
        label: "Analitik",
        roles: ["TENANT_ADMIN"],
        shortLabel: "AN",
      },
      {
        href: "/app/keuangan",
        key: "finance",
        label: "Keuangan",
        roles: ["TENANT_ADMIN"],
        shortLabel: "KE",
      },
    ],
  },
  {
    label: "Administrasi",
    items: [
      {
        href: "/app/pengaturan",
        key: "settings",
        label: "Outlet & koneksi",
        roles: ["TENANT_ADMIN"],
        shortLabel: "OK",
      },
      {
        href: "/app/anggota",
        key: "members",
        label: "Anggota & akses",
        roles: ["TENANT_ADMIN"],
        shortLabel: "AA",
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

  const contextualShipmentRoute =
    pathname === "/app/impor" ||
    pathname.startsWith("/app/impor/") ||
    pathname === "/app/label" ||
    pathname.startsWith("/app/label/");
  const matchedDefinition = navigationGroups
    .flatMap((group) => group.items)
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => routeMatches(pathname, item.href));
  const currentKey = contextualShipmentRoute
    ? "shipments"
    : matchedDefinition?.key ?? "dashboard";

  return resolveNavigation(visibleGroups, currentKey);
}

export function platformCmsNavigation(pathname: string): CmsNavigationGroup[] {
  const currentKey = platformNavigationGroups
    .flatMap((group) => group.items)
    .find((item) => routeMatches(pathname, item.href))?.key ??
    "platform-overview";

  return resolveNavigation(platformNavigationGroups, currentKey);
}
