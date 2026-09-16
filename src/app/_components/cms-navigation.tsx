"use client";

import {
  BarChart3,
  BookOpenText,
  Building2,
  Calculator,
  ChevronDown,
  ClipboardList,
  ContactRound,
  FileText,
  FileUp,
  LayoutDashboard,
  Package,
  PackagePlus,
  PackageSearch,
  PrinterCheck,
  RotateCcw,
  ScanSearch,
  Settings2,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SheetClose } from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  platformCmsNavigation,
  tenantCmsNavigation,
  type CmsNavigationGroup,
  type TenantCmsRole,
} from "@/lib/cms-shell-navigation";

const navigationIcons: Record<string, LucideIcon> = {
  analytics: BarChart3,
  contacts: ContactRound,
  dashboard: LayoutDashboard,
  finance: BookOpenText,
  import: FileUp,
  "print-label": PrinterCheck,
  "quick-rate": Calculator,
  rts: RotateCcw,
  settings: Settings2,
  shipments: Truck,
  "shipment-new": PackagePlus,
  "tracking-lookup": PackageSearch,
  "platform-audit": ClipboardList,
  "platform-overview": LayoutDashboard,
  "platform-tenants": Building2,
};

// PR-54: every group except "Utama" (a single unlabelled destination) is a
// collapsible dropdown, so each carries a rail-width flyout icon too.
const navigationGroupIcons: Record<string, LucideIcon> = {
  Pengiriman: Package,
  Data: ContactRound,
  Cek: ScanSearch,
  Laporan: BarChart3,
  Pengelolaan: Settings2,
};

// PR-54: open/closed state per group persists per browser. Keyed by group
// label — the accepted PR-54 group set is fixed Indonesian text, not user
// content, so it is a stable storage key.
const GROUP_STATE_STORAGE_KEY = "geraicuan.cms-nav-groups";

function readStoredGroupState(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(GROUP_STATE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeStoredGroupState(state: Record<string, boolean>) {
  try {
    window.localStorage.setItem(GROUP_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing or a full quota: the group simply falls back to its
    // route-derived default next load, which is not worth surfacing.
  }
}

function groupHoldsCurrent(group: CmsNavigationGroup) {
  return group.items.some((item) => item.current);
}

// The route-derived default (open only the group holding the current route)
// is identical on the server and on first client render, so there is no
// hydration mismatch; stored preferences are merged in afterward, client-only.
function defaultOpenGroups(groups: CmsNavigationGroup[]) {
  return Object.fromEntries(
    groups
      .filter((group) => group.label !== "Utama")
      .map((group) => [group.label, groupHoldsCurrent(group)]),
  );
}

type CmsNavigationProps = {
  account: ReactNode;
  roleLabel: string;
  scopeTitle: string;
} & (
  | { role: TenantCmsRole; scope: "tenant" }
  | { scope: "platform" }
);

// One shadcn Sidebar serves every width (shadcn-admin AppSidebar pattern):
// full sidebar on desktop, icon rail when collapsed, and its own Sheet on
// mobile. Destinations keep their accessible name when collapsed and gain a
// tooltip there.
export function CmsNavigation(props: CmsNavigationProps) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile, state } = useSidebar();
  // A mounted tooltip is its own Escape layer even while hidden, so the mobile
  // Sheet would need two Escapes. Tooltips exist only on the collapsed rail.
  const railTooltip = (label: string) =>
    state === "collapsed" && !isMobile ? label : undefined;
  const isPlatform = props.scope === "platform";
  const groups = isPlatform
    ? platformCmsNavigation(pathname)
    : tenantCmsNavigation(props.role, pathname);
  const brandHref = isPlatform ? "/platform" : "/app";
  const navigationLabel = isPlatform ? "Navigasi platform" : "Navigasi tenant";
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => defaultOpenGroups(groups));

  useEffect(() => {
    // Client-only: layer the persisted preference over the route-derived
    // default, but the group holding the current route always wins so the
    // active destination is never hidden on load.
    function applyStoredGroupState() {
      const stored = readStoredGroupState();
      setOpenGroups((previous) => {
        const next = { ...previous };
        for (const group of groups) {
          if (group.label === "Utama") continue;
          next[group.label] = groupHoldsCurrent(group) || (stored[group.label] ?? previous[group.label] ?? false);
        }
        return next;
      });
    }
    applyStoredGroupState();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-derive only when the route (and so the current group) changes
  }, [pathname]);

  function toggleGroup(label: string) {
    setOpenGroups((previous) => {
      const next = { ...previous, [label]: !previous[label] };
      writeStoredGroupState(next);
      return next;
    });
  }

  const isRail = state === "collapsed" && !isMobile;

  return (
    <Sidebar collapsible="icon" variant="inset">
      <nav aria-label={navigationLabel} className="flex min-h-0 flex-1 flex-col">
        <SidebarHeader className="flex-row items-center gap-1">
          {isMobile ? (
            // First in focus order when the Sheet opens; drawn at the right.
            <SheetClose asChild>
              <Button aria-label="Tutup navigasi" className="order-last size-11 shrink-0" size="icon" variant="ghost">
                <X aria-hidden="true" />
              </Button>
            </SheetClose>
          ) : null}
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip={railTooltip("GeraiCUAN")}>
                <Link href={brandHref} onClick={closeOnMobile}>
                  <span aria-hidden="true" className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                    GC
                  </span>
                  <span className="grid flex-1 text-start text-sm leading-tight">
                    <span className="truncate font-semibold">GeraiCUAN</span>
                    <span className="truncate text-xs">{props.roleLabel}</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {groups.map((group) => {
            if (group.label === "Utama") {
              return (
                <SidebarGroup key={group.label}>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => (
                        <NavigationItem
                          closeOnMobile={closeOnMobile}
                          item={item}
                          key={item.key}
                          railTooltip={railTooltip}
                        />
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            }

            const GroupIcon = navigationGroupIcons[group.label] ?? FileText;

            if (isRail) {
              // SidebarMenuSub is hidden at the icon rail width, so a
              // collapsed group opens as a DropdownMenu flyout instead.
              return (
                <SidebarGroup key={group.label}>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuButton isActive={groupHoldsCurrent(group)} tooltip={group.label}>
                              <GroupIcon aria-hidden="true" />
                              <span>{group.label}</span>
                            </SidebarMenuButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" side="right">
                            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                            {group.items.map((item) => {
                              const Icon = navigationIcons[item.key] ?? FileText;
                              return (
                                <DropdownMenuItem asChild key={item.key}>
                                  <Link
                                    aria-current={item.current ? "page" : undefined}
                                    href={item.href}
                                    onClick={closeOnMobile}
                                  >
                                    <Icon aria-hidden="true" />
                                    <span>{item.label}</span>
                                  </Link>
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            }

            // The expanded/mobile shape: a split disclosure row. The group
            // label is its own (non-navigating) heading, and a separate
            // button carries the chevron and aria-expanded, so no
            // data-state ever lands on a nav <a> (cms-shell-render pins
            // that assertion for the item links).
            const open = openGroups[group.label] ?? groupHoldsCurrent(group);
            const contentId = `cms-nav-group-${group.label.toLowerCase()}`;
            return (
              <SidebarGroup key={group.label}>
                <Collapsible onOpenChange={() => toggleGroup(group.label)} open={open}>
                  <div className="flex h-8 shrink-0 items-center gap-1 px-2 text-[0.8125rem] font-medium text-sidebar-foreground/70">
                    <GroupIcon aria-hidden="true" className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{group.label}</span>
                    <CollapsibleTrigger asChild>
                      <button
                        aria-controls={contentId}
                        aria-expanded={open}
                        aria-label={`${open ? "Tutup" : "Buka"} grup ${group.label}`}
                        className="group/nav-trigger flex size-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                        type="button"
                      >
                        <ChevronDown aria-hidden="true" className="size-4 transition-transform group-data-[state=open]/nav-trigger:rotate-180" />
                      </button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent id={contentId}>
                    <SidebarGroupContent>
                      <SidebarMenuSub className="mx-0 border-l-0 px-0">
                        {group.items.map((item) => {
                          const Icon = navigationIcons[item.key] ?? FileText;
                          return (
                            <SidebarMenuSubItem key={item.key}>
                              <SidebarMenuSubButton
                                asChild
                                className="max-md:min-h-11"
                                isActive={item.current}
                              >
                                <Link
                                  aria-current={item.current ? "page" : undefined}
                                  href={item.href}
                                  onClick={closeOnMobile}
                                >
                                  <Icon aria-hidden="true" />
                                  <span>{item.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarGroup>
            );
          })}
        </SidebarContent>
      </nav>
      <SidebarFooter>{props.account}</SidebarFooter>
      {/* Pointer affordance only; the header trigger is the accessible control. */}
      <SidebarRail aria-hidden="true" title="Buka atau tutup navigasi" />
    </Sidebar>
  );
}

function NavigationItem({
  closeOnMobile,
  item,
  railTooltip,
}: {
  closeOnMobile: () => void;
  item: { current: boolean; href: string; key: string; label: string };
  railTooltip: (label: string) => string | undefined;
}) {
  const Icon = navigationIcons[item.key] ?? FileText;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className="max-md:min-h-11"
        isActive={item.current}
        tooltip={railTooltip(item.label)}
      >
        <Link
          aria-current={item.current ? "page" : undefined}
          href={item.href}
          onClick={closeOnMobile}
        >
          <Icon aria-hidden="true" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
