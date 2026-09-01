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
  Printer,
  Settings2,
  Truck,
  Upload,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  labels: Printer,
  members: UsersRound,
  settings: Settings2,
  shipments: Truck,
  "shipment-import": Upload,
  "shipment-new": PackagePlus,
  "platform-audit": ClipboardList,
  "platform-overview": LayoutDashboard,
  "platform-tenants": Building2,
};

type CmsNavigationProps = {
  onNavigate?: () => void;
  presentation?: "rail" | "sheet" | "sidebar";
} & (
  | { role: TenantCmsRole; scope: "tenant" }
  | { scope: "platform" }
);

export function CmsNavigation(props: CmsNavigationProps) {
  const pathname = usePathname();
  const isPlatform = props.scope === "platform";
  const groups = isPlatform
    ? platformCmsNavigation(pathname)
    : tenantCmsNavigation(props.role, pathname);
  const brandHref = isPlatform ? "/platform" : "/app";
  const navigationLabel = isPlatform ? "Navigasi platform" : "Navigasi tenant";

  if (props.presentation === "rail") {
    return (
      <Sidebar className="w-16 border-r" collapsible="none">
        <nav
          aria-label={navigationLabel}
          className="flex min-h-0 flex-1 flex-col"
        >
          <SidebarHeader className="h-14 items-center justify-center border-b border-sidebar-border p-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  aria-label="GeraiCUAN"
                  className="flex size-11 items-center justify-center rounded-md outline-none ring-sidebar-ring hover:bg-sidebar-accent focus-visible:ring-2"
                  href={brandHref}
                >
                  <span className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-bold tracking-wide text-primary-foreground">
                    GC
                  </span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">GeraiCUAN</TooltipContent>
            </Tooltip>
          </SidebarHeader>
          <SidebarContent className="gap-0 py-2">
            {groups.map((group) => (
              <div
                className="border-t border-sidebar-border px-2 py-2 first:border-t-0 first:pt-0"
                key={group.label}
              >
                <p className="sr-only">{group.label}</p>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = navigationIcons[item.key] ?? FileText;
                    return (
                      <SidebarMenuItem key={item.key}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              aria-current={item.current ? "page" : undefined}
                              className="flex min-h-11 w-full items-center justify-center rounded-md outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground"
                              data-active={item.current}
                              href={item.href}
                            >
                              <Icon aria-hidden="true" className="size-4" />
                              <span className="sr-only">{item.label}</span>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            ))}
          </SidebarContent>
        </nav>
      </Sidebar>
    );
  }

  const content = (
    <nav aria-label={navigationLabel} className="flex min-h-0 flex-1 flex-col">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="min-h-11"
              size="lg"
              tooltip="GeraiCUAN"
            >
              <Link href={brandHref} onClick={props.onNavigate}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold tracking-wide text-primary-foreground">
                  GC
                </span>
                <span className="font-semibold tracking-tight">GeraiCUAN</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = navigationIcons[item.key] ?? FileText;
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        asChild
                        className="min-h-11"
                        isActive={item.current}
                        tooltip={item.label}
                      >
                        <Link
                          aria-current={item.current ? "page" : undefined}
                          href={item.href}
                          onClick={props.onNavigate}
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
  );

  if (props.presentation === "sheet") return content;

  return (
    <Sidebar collapsible="offcanvas" variant="sidebar">
      {content}
    </Sidebar>
  );
}
