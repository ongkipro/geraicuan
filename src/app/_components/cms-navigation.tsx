"use client";

import {
  BarChart3,
  ChevronDown,
  ContactRound,
  FileText,
  LayoutDashboard,
  Package,
  ScanSearch,
  Settings2,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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

// Icons mark top-level rows only (Dasbor and the group headers); submenu
// items are text so the tree reads as one hierarchy.
const navigationIcons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
};

// PR-54: every group except "Utama" (a single unlabelled destination) is a
// collapsible dropdown, so each carries a rail-width flyout icon too.
const navigationGroupIcons: Record<string, LucideIcon> = {
  Pengiriman: Package,
  Data: ContactRound,
  Cek: ScanSearch,
  Laporan: BarChart3,
  Pengelolaan: Settings2,
  Platform: ShieldCheck,
};

// PR-54: open/closed state per group persists per browser. Keyed by group
// label — the accepted PR-54 group set is fixed Indonesian text, not user
// content, so it is a stable storage key. T-187 bumped it to .v2: the old map
// held implicit `false` for every group the user never touched (the old
// default was closed), which would hide groups under the new all-open default.
const GROUP_STATE_STORAGE_KEY = "geraicuan.cms-nav-groups.v2";

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

// T-187: every group starts open, so the whole tree is visible on a first
// visit. The default is identical on the server and on first client render, so
// there is no hydration mismatch; stored preferences are merged in afterward,
// client-only.
function defaultOpenGroups(groups: CmsNavigationGroup[]) {
  return Object.fromEntries(
    groups.filter((group) => group.label !== "Utama").map((group) => [group.label, true]),
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
  const searchParams = useSearchParams();
  const { isMobile, setOpenMobile, state } = useSidebar();
  // A mounted tooltip is its own Escape layer even while hidden, so the mobile
  // Sheet would need two Escapes. Tooltips exist only on the collapsed rail.
  const railTooltip = (label: string) =>
    state === "collapsed" && !isMobile ? label : undefined;
  const isPlatform = props.scope === "platform";
  const groups = isPlatform
    ? platformCmsNavigation(pathname)
    : tenantCmsNavigation(props.role, pathname, searchParams);
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
          next[group.label] = groupHoldsCurrent(group) || (stored[group.label] ?? previous[group.label] ?? true);
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
                  <span aria-hidden="true" className="flex aspect-square size-8 items-center justify-center rounded-xl bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground shadow-xs">
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
              // T-195: the flyout's aria-current link does not exist until the
              // flyout opens, so the trigger of the group holding the current
              // page carries it as an accessible description. aria-current is
              // not used here: the trigger is a menu button, not the page link.
              // A `hidden` element still supplies the description when
              // referenced by id, without a second copy in browse mode.
              const currentItem = group.items.find((item) => item.current);
              const currentDescriptionId = `cms-nav-rail-current-${group.label.toLowerCase()}`;
              return (
                <SidebarGroup key={group.label}>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        {currentItem ? (
                          <span hidden id={currentDescriptionId}>
                            Halaman saat ini: {currentItem.label}
                          </span>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuButton
                              aria-describedby={currentItem ? currentDescriptionId : undefined}
                              isActive={Boolean(currentItem)}
                              tooltip={group.label}
                            >
                              <GroupIcon aria-hidden="true" />
                              <span>{group.label}</span>
                            </SidebarMenuButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" side="right">
                            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                            {/* Icons mark top-level rows only; submenu items are text.
                                T-197: the current item wears the tree's active tokens
                                (sidebar accent, medium weight) plus the primary start
                                marker its tree connector uses, so it differs from focus. */}
                            {group.items.map((item) => (
                              <DropdownMenuItem
                                asChild
                                className="aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground aria-[current=page]:shadow-[inset_2px_0_0_var(--sidebar-primary)]"
                                key={item.key}
                              >
                                <Link
                                  aria-current={item.current ? "page" : undefined}
                                  href={item.href}
                                  onClick={closeOnMobile}
                                >
                                  <span>{item.label}</span>
                                </Link>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            }

            // T-187: the expanded/mobile shape is a tree. The whole group row
            // (icon, label, chevron) is one native <button> disclosure, so a
            // click anywhere on it, Enter, or Space toggles the group. Its
            // accessible name is the visible label; aria-expanded carries the
            // state. data-state lands on that <button> and the <li>, never on
            // a nav <a> (cms-shell-render pins that for the item links).
            const open = openGroups[group.label] ?? true;
            const contentId = `cms-nav-group-${group.label.toLowerCase()}`;
            return (
              <SidebarGroup className="py-1" key={group.label}>
                <SidebarMenu>
                  <Collapsible asChild onOpenChange={() => toggleGroup(group.label)} open={open}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          aria-controls={contentId}
                          aria-expanded={open}
                          className="h-9 font-semibold max-md:h-11"
                          data-nav-group-trigger={group.label}
                          type="button"
                        >
                          <GroupIcon aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{group.label}</span>
                          <ChevronDown aria-hidden="true" className="text-sidebar-foreground/60 transition-transform group-data-[state=open]/menu-button:rotate-180 motion-reduce:transition-none" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent id={contentId}>
                        {/* Tree guide: each <li> draws its own vertical segment
                            (::before) under the group icon's centre and a
                            horizontal connector (::after) to its row; the last
                            segment stops at its connector. */}
                        <SidebarMenuSub className="ms-4 me-0 translate-x-0 gap-0.5 border-l-0 px-0 py-0.5">
                          {group.items.map((item) => {
                            return (
                              <SidebarMenuSubItem
                                className="ps-4 before:absolute before:inset-y-0 before:start-0 before:w-px before:bg-sidebar-foreground/20 after:absolute after:start-0 after:top-1/2 after:h-px after:w-3 after:bg-sidebar-foreground/20 last:before:bottom-1/2 has-[a[aria-current=page]]:after:bg-sidebar-primary"
                                data-nav-tree-item=""
                                key={item.key}
                              >
                                <SidebarMenuSubButton
                                  asChild
                                  className="h-8 rounded-lg data-active:bg-primary/10 data-active:text-primary data-active:font-semibold data-[size=md]:text-[0.9375rem] max-md:h-11"
                                  isActive={item.current}
                                >
                                  <Link
                                    aria-current={item.current ? "page" : undefined}
                                    href={item.href}
                                    onClick={closeOnMobile}
                                  >
                                    <span>{item.label}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                </SidebarMenu>
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
