import type { membershipRoles } from "@/db/schema";
import { DEFAULT_CONTACT_ROLE, parseContactRole } from "@/lib/contact-role-filter";

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
      // T-188: sender and recipient contacts are separate menus over one
      // contacts table; a dual-role contact is listed under both.
      {
        href: "/app/kontak/pengirim",
        key: "contacts-sender",
        label: "Pengirim",
        shortLabel: "PG",
      },
      {
        href: "/app/kontak/penerima",
        key: "contacts-recipient",
        label: "Penerima",
        shortLabel: "PN",
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
      // T-182 (PR-61): stores awaiting approval.
      {
        href: "/platform/pendaftaran",
        key: "platform-registrations",
        label: "Pendaftaran",
        shortLabel: "PD",
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

/** The subset of URLSearchParams the resolver reads, so server tests can pass a plain one. */
type SearchParamsReader = { get(name: string): string | null };

/**
 * T-188: `/app/kontak/baru` and a contact detail belong to whichever contact
 * menu they were opened from — `peran` on the create form, `dari` on a detail —
 * defaulting to Pengirim. The role lists themselves match by their own href.
 */
function contactNavigationPath(pathname: string, search: SearchParamsReader | undefined) {
  if (!pathname.startsWith("/app/kontak/")) return pathname;
  const segment = pathname.slice("/app/kontak/".length).split("/")[0];
  if (segment === "pengirim" || segment === "penerima") return pathname;
  const role = parseContactRole(search?.get(segment === "baru" ? "peran" : "dari")) ?? DEFAULT_CONTACT_ROLE;
  return `/app/kontak/${role}`;
}

export function tenantCmsNavigation(
  role: TenantCmsRole,
  pathname: string,
  search?: SearchParamsReader,
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
    : contactNavigationPath(pathname, search);
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
