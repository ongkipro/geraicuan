"use client";

import {
  BarChart3,
  BookOpenText,
  Building2,
  ClipboardList,
  ContactRound,
  FileText,
  LayoutDashboard,
  PackagePlus,
  RotateCcw,
  Settings2,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  platformCmsNavigation,
  tenantCmsNavigation,
  type TenantCmsRole,
} from "@/lib/cms-shell-navigation";

const navigationIcons: Record<string, LucideIcon> = {
  analytics: BarChart3,
  contacts: ContactRound,
  dashboard: LayoutDashboard,
  finance: BookOpenText,
  rts: RotateCcw,
  settings: Settings2,
  shipments: Truck,
  "shipment-new": PackagePlus,
  "platform-audit": ClipboardList,
  "platform-overview": LayoutDashboard,
  "platform-tenants": Building2,
};

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
          {groups.map((group) => (
            <SidebarGroup key={group.label}>
              {group.label !== "Utama" ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = navigationIcons[item.key] ?? FileText;
                    return (
                      <SidebarMenuItem key={item.key}>
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
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </nav>
      <SidebarFooter>{props.account}</SidebarFooter>
      {/* Pointer affordance only; the header trigger is the accessible control. */}
      <SidebarRail aria-hidden="true" title="Buka atau tutup navigasi" />
    </Sidebar>
  );
}
