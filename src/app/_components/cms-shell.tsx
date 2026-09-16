"use client";

import { ChevronsUpDown } from "lucide-react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";

import { CmsHeaderClock, CmsHeaderSearch } from "@/app/_components/cms-header-tools";
import { CmsNavigation } from "@/app/_components/cms-navigation";
import { SignOutControl, type LoginDestination } from "@/app/_components/sign-out-control";
import { SkipLink } from "@/app/_components/skip-link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { TenantCmsRole } from "@/lib/cms-shell-navigation";

type CmsShellProps = {
  account: { initials: string; label: string; secondary?: string };
  children: ReactNode;
  destination: LoginDestination;
  roleLabel: string;
  scopeDescription: string;
  scopeTitle: string;
} & (
  | { navigationRole: TenantCmsRole; scope: "tenant" }
  | { scope: "platform" }
);

// UX-3: tablet widths start as the icon rail; desktop starts expanded. Mobile
// widths use the Sidebar's own Sheet regardless of this state.
const TABLET_QUERY = "(min-width: 768px) and (max-width: 1023px)";

export function CmsShell(props: CmsShellProps) {
  const signOutDestinationRef = useRef<LoginDestination | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    function revalidateRestoredSession(event: PageTransitionEvent) {
      if (!event.persisted) return;

      document.documentElement.style.visibility = "hidden";
      window.location.reload();
    }

    window.addEventListener("pageshow", revalidateRestoredSession);
    return () => {
      window.removeEventListener("pageshow", revalidateRestoredSession);
    };
  }, []);

  useEffect(() => {
    const tablet = window.matchMedia(TABLET_QUERY);
    const applyWidth = () => setSidebarOpen(!tablet.matches);
    applyWidth();
    tablet.addEventListener("change", applyWidth);
    return () => tablet.removeEventListener("change", applyWidth);
  }, []);

  return (
    <TooltipProvider>
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SkipLink className="cms-skip-link" targetId="konten-utama">
          Lewati ke konten utama
        </SkipLink>
        {props.scope === "tenant" ? (
          <CmsNavigation
            account={<AccountMenu accountOpen={accountOpen} props={props} setAccountOpen={setAccountOpen} signOutDestinationRef={signOutDestinationRef} />}
            role={props.navigationRole}
            roleLabel={props.roleLabel}
            scope="tenant"
            scopeTitle={props.scopeTitle}
          />
        ) : (
          <CmsNavigation
            account={<AccountMenu accountOpen={accountOpen} props={props} setAccountOpen={setAccountOpen} signOutDestinationRef={signOutDestinationRef} />}
            roleLabel={props.roleLabel}
            scope="platform"
            scopeTitle={props.scopeTitle}
          />
        )}
        <SidebarInset className="min-w-0" id="konten-utama" tabIndex={-1}>
          {/* PR-51: Cek tarif moved into the sidebar "Cek" group, so both scopes share one header row. */}
          <header className="sticky top-0 z-30 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b bg-background px-4 md:h-16 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:rounded-t-xl" data-slot="cms-header">
            <div className="flex h-16 items-center gap-3">
              <SidebarTrigger aria-label="Buka atau tutup navigasi" className="size-11 md:size-8" variant="outline" />
              <Separator className="hidden h-6! md:block" orientation="vertical" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                <strong className="max-w-full truncate text-sm font-medium" title={props.scopeTitle}>{props.scopeTitle}</strong>
                <Badge className="shrink-0" variant="secondary">{props.roleLabel}</Badge>
              </span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">{props.scopeDescription}</span>
            </div>
            {props.scope === "tenant" ? <CmsHeaderSearch role={props.navigationRole} scope="tenant" /> : <CmsHeaderSearch scope="platform" />}
            <div className="col-span-3 flex h-8 items-center border-t md:col-span-1 md:h-auto md:border-t-0 md:border-l md:pl-3"><CmsHeaderClock /></div>
          </header>
          <div className="cms-main min-w-0 self-center [&_[id]]:scroll-mt-28 md:[&_[id]]:scroll-mt-20">
            {props.children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

// shadcn-admin NavUser: the account lives in the sidebar footer. It reads the
// Sidebar context, so it renders inside SidebarProvider; on mobile the menu
// opens below the trigger or it would open past the Sheet's edge.
function AccountMenu({
  accountOpen,
  props,
  setAccountOpen,
  signOutDestinationRef,
}: {
  accountOpen: boolean;
  props: CmsShellProps;
  setAccountOpen: Dispatch<SetStateAction<boolean>>;
  signOutDestinationRef: RefObject<LoginDestination | null>;
}) {
  const { isMobile } = useSidebar();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={setAccountOpen} open={accountOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              onPointerDown={(event) => {
                if (event.button !== 0 || event.ctrlKey) return;
                event.preventDefault();
                setAccountOpen((open) => !open);
              }}
              size="lg"
              type="button"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{props.account.initials}</AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">{props.account.label}</span>
                {props.account.secondary ? (
                  <span className="truncate text-xs">{props.account.secondary}</span>
                ) : null}
              </span>
              <ChevronsUpDown aria-hidden="true" className="ms-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            onCloseAutoFocus={(event) => {
              const destination = signOutDestinationRef.current;
              if (!destination) return;

              event.preventDefault();
              signOutDestinationRef.current = null;
              window.requestAnimationFrame(() => {
                window.location.replace(destination);
              });
            }}
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="grid gap-0.5 px-2 py-2">
              <span className="truncate text-sm font-medium text-foreground">
                {props.account.label}
              </span>
              {props.account.secondary ? (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {props.account.secondary}
                </span>
              ) : null}
              <span className="text-xs font-normal text-muted-foreground">
                {props.roleLabel}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="p-1">
              <SignOutControl
                destination={props.destination}
                onSignedOut={(destination) => {
                  signOutDestinationRef.current = destination;
                  setAccountOpen(false);
                }}
              />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
