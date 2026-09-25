"use client";

import {
  Building2,
  Calculator,
  ChartColumn,
  ClipboardCheck,
  FileClock,
  FileText,
  History,
  LayoutDashboard,
  MapPinHouse,
  PackagePlus,
  PackageSearch,
  Printer,
  ScrollText,
  Send,
  Settings,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  type CmsNavigationItem,
  type TenantCmsRole,
} from "@/lib/cms-shell-navigation";

// T-204: the owner's reference (and the shadcn sidebar pattern) gives every
// destination its own icon in one flat list, so the collapsed rail is simply the
// same items as icons with tooltips — no per-group flyout or disclosure.
const navigationIcons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  "shipment-new": PackagePlus,
  shipments: History,
  rts: Undo2,
  "print-label": Printer,
  "contacts-sender": Send,
  "contacts-recipient": MapPinHouse,
  "tracking-lookup": PackageSearch,
  "quick-rate": Calculator,
  "shipment-report": ChartColumn,
  "print-history-report": FileClock,
  settings: Settings,
  "platform-overview": LayoutDashboard,
  "platform-tenants": Building2,
  "platform-registrations": ClipboardCheck,
  "platform-audit": ScrollText,
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

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <nav aria-label={navigationLabel} className="flex min-h-0 flex-1 flex-col">
        <SidebarHeader className="h-16 shrink-0 flex-row items-center gap-1 border-b border-sidebar-border px-3 group-data-[collapsible=icon]:px-2">
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
                  <span className="grid flex-1 text-start leading-tight">
                    <span className="truncate text-base font-bold">GeraiCUAN</span>
                    <span className="truncate text-xs text-muted-foreground">{props.roleLabel}</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="gap-2 py-2">
          {groups.map((group) => {
            // "Utama" holds Dasbor alone and carries no visible label, as in the reference.
            const labelled = group.label !== "Utama";
            const labelId = `cms-nav-group-${group.label.toLowerCase()}`;
            return (
              <SidebarGroup className="px-3 py-1 group-data-[collapsible=icon]:px-2" key={group.label}>
                {labelled ? (
                  <SidebarGroupLabel
                    className="px-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                    id={labelId}
                  >
                    {group.label}
                  </SidebarGroupLabel>
                ) : null}
                <SidebarGroupContent>
                  <SidebarMenu aria-labelledby={labelled ? labelId : undefined} className="gap-1">
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
          })}
        </SidebarContent>
      </nav>
      <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:p-2">{props.account}</SidebarFooter>
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
  item: CmsNavigationItem;
  railTooltip: (label: string) => string | undefined;
}) {
  const Icon = navigationIcons[item.key] ?? FileText;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className="h-10 gap-3 px-3 font-medium text-muted-foreground max-md:h-11 data-active:font-semibold"
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
