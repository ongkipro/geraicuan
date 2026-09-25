"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { AppSidebar, SHELL_ROLE_LABEL, type ShellAccount, type ShellScope } from "@/components/app/app-sidebar";
import { SiteHeader } from "@/components/app/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const FULL_SIDEBAR_QUERY = "(min-width: 1024px)";

/** Spec 10 v3.2 §4.8 (D11): routes shown in the focused layout — no sidebar, stepper in the top bar. */
const FOCUSED_ROUTES = new Set(["/app/pengiriman/baru"]);

/**
 * The authenticated frame (spec 10 v3.2 §3, `sidebar-16` pattern): the full-width 64px primary
 * top bar, and under it the sidebar on the canvas — full from 1024px, icon rail at 768–1023px
 * (the operator can still expand it), Sheet below 768px — beside the main region with 32px/16px
 * padding and a left-aligned 1120px content column. A focused route drops the sidebar and
 * centres the column.
 */
export function AppShell({
  account,
  children,
  notice,
  scope,
  subtitle,
  title,
}: {
  account: ShellAccount;
  children: ReactNode;
  /** One shell-wide notice above the page (e.g. gerai awaiting approval). */
  notice?: ReactNode;
  scope: ShellScope;
  subtitle: string;
  title: string;
}) {
  const [open, setOpen] = useState(true);
  const focused = FOCUSED_ROUTES.has(usePathname());

  useEffect(() => {
    const query = window.matchMedia(FULL_SIDEBAR_QUERY);
    const sync = () => setOpen(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return (
    <SidebarProvider
      className="flex-col"
      onOpenChange={setOpen}
      open={open}
      style={{ "--header-height": "4rem" } as CSSProperties}
    >
      <a
        className="sr-only z-50 rounded-lg bg-card px-3 py-2 text-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        href="#konten"
      >
        Lewati ke konten
      </a>
      <SiteHeader
        focused={focused}
        roleLabel={SHELL_ROLE_LABEL[scope.kind === "tenant" ? scope.role : "SUPER_ADMIN"]}
        scope={scope}
        subtitle={subtitle}
        title={title}
      />
      <div className="flex flex-1">
        {focused ? null : <AppSidebar account={account} scope={scope} />}
        <SidebarInset className="min-w-0">
          <div className="px-4 py-4 md:px-8 md:py-8" data-shell={focused ? "focused" : undefined} data-slot="app-content">
            <div className={cn("flex w-full max-w-content flex-col gap-6 outline-none", focused && "mx-auto")} id="konten" tabIndex={-1}>
              {notice}
              {children}
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
