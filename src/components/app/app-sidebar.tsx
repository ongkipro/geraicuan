"use client";

import { ChevronDown, LogOut, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { NAV_ICONS } from "@/components/app/nav-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  platformCmsNavigation,
  tenantCmsNavigation,
  type CmsNavigationGroup,
  type TenantCmsRole,
} from "@/lib/cms-shell-navigation";

export type ShellScope =
  | { kind: "tenant"; role: TenantCmsRole }
  | { kind: "platform" };

export type ShellAccount = { name: string; email: string };

export const SHELL_ROLE_LABEL: Record<TenantCmsRole | "SUPER_ADMIN", string> = {
  OPERATOR: "Operator",
  SUPER_ADMIN: "Super Admin",
  TENANT_ADMIN: "Tenant Admin",
};

/** The menu for the current route: role-filtered, with exactly one current item. */
export function useShellNavigation(scope: ShellScope): CmsNavigationGroup[] {
  const pathname = usePathname();
  const search = useSearchParams();
  return scope.kind === "tenant"
    ? tenantCmsNavigation(scope.role, pathname, search)
    : platformCmsNavigation(pathname);
}

function loginDestination(scope: ShellScope) {
  return scope.kind === "tenant" ? "/login/tenant" : "/login/super-admin";
}

function initial(name: string) {
  return name.trim().charAt(0).toLocaleUpperCase("id-ID") || "?";
}

/**
 * Spec 10 v3.2 §3 sidebar (Mengantar look, D2): no panel — it sits on the canvas under the
 * full-width top bar (which now carries the brand). Flat groups with uppercase labels; each item
 * has its icon in a 40×40 box that turns into a primary square on the current item, whose row
 * is a white pill with primary text and a 4px primary bar at the right edge. The account row
 * with its menu stays in the footer. Collapses to an icon rail with tooltips; below 768px it is
 * the Sheet opened from the top bar.
 */
export function AppSidebar({ account, scope }: { account: ShellAccount; scope: ShellScope }) {
  const groups = useShellNavigation(scope);
  const { isMobile, setOpenMobile } = useSidebar();
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]! group-data-[side=left]:border-r-0"
      collapsible="icon"
    >
      <SidebarContent className="pt-3">
        <nav aria-label="Menu utama">
          {groups.map((group, index) => {
            // Dasbor sits alone at the top, without its "Utama" label.
            const labelled = !(scope.kind === "tenant" && index === 0);
            return (
              <SidebarGroup className="px-4 py-1.5 group-data-[collapsible=icon]:px-2" key={group.label}>
                {labelled ? <SidebarGroupLabel className="mb-1 h-auto px-2">{group.label}</SidebarGroupLabel> : null}
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = NAV_ICONS[item.key];
                    return (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton
                          asChild
                          className="relative h-11 gap-3 px-0.5 text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground data-active:shadow-card after:absolute after:inset-y-2 after:right-0 after:hidden after:w-1 after:rounded-l-full after:bg-brand data-active:after:block max-md:h-11 group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:after:hidden [&_svg]:size-5"
                          isActive={item.current}
                          tooltip={item.label}
                        >
                          <Link
                            aria-current={item.current ? "page" : undefined}
                            href={item.href}
                            onClick={closeOnMobile}
                          >
                            <span
                              aria-hidden="true"
                              className="flex size-10 shrink-0 items-center justify-center rounded-lg group-data-[active=true]/menu-button:bg-primary group-data-[active=true]/menu-button:text-primary-foreground"
                            >
                              {Icon ? <Icon /> : null}
                            </span>
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            );
          })}
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t p-4 group-data-[collapsible=icon]:p-2">
        <AccountMenu account={account} scope={scope} />
      </SidebarFooter>
    </Sidebar>
  );
}

function AccountMenu({ account, scope }: { account: ShellAccount; scope: ShellScope }) {
  const { isMobile } = useSidebar();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setFailed(false);
    setPending(true);
    try {
      const response = await fetch("/api/auth/sign-out", {
        body: "{}",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("sign-out failed");
      window.location.assign(loginDestination(scope));
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="h-auto min-h-12 gap-2 px-2 text-foreground group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-1!"
              tooltip={account.name}
            >
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-sm font-semibold text-foreground"
              >
                {initial(account.name)}
              </span>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">{account.name}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{account.email}</span>
              </span>
              <ChevronDown aria-hidden="true" className="ml-auto size-4! text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56"
            side={isMobile ? "top" : "right"}
            sideOffset={8}
          >
            <DropdownMenuLabel className="grid text-sm font-normal">
              <span className="font-semibold text-foreground">{account.name}</span>
              <span className="text-xs text-muted-foreground">{account.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {scope.kind === "tenant" && scope.role === "TENANT_ADMIN" ? (
              <DropdownMenuItem asChild className="min-h-10 text-sm">
                <Link href="/app/anggota">
                  <UsersRound aria-hidden="true" />
                  Anggota &amp; akses
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              className="min-h-10 text-sm"
              disabled={pending}
              onSelect={(event) => {
                event.preventDefault();
                void signOut();
              }}
            >
              <LogOut aria-hidden="true" />
              {pending ? "Mengakhiri sesi…" : "Keluar"}
            </DropdownMenuItem>
            {failed ? (
              <p className="px-2 py-1.5 text-xs text-destructive" role="alert">
                Sesi belum dapat diakhiri. Coba lagi.
              </p>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
