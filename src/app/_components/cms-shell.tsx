"use client";

import { ChevronDown, PanelLeft, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { CmsNavigation } from "@/app/_components/cms-navigation";
import { SignOutControl, type LoginDestination } from "@/app/_components/sign-out-control";
import { SkipLink } from "@/app/_components/skip-link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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

export function CmsShell(props: CmsShellProps) {
  const signOutDestinationRef = useRef<LoginDestination | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [navigationOpen, setNavigationOpen] = useState(false);

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

  const navigation = (presentation: "rail" | "sheet" | "sidebar") =>
    props.scope === "tenant" ? (
      <CmsNavigation
        onNavigate={
          presentation === "sheet" ? () => setNavigationOpen(false) : undefined
        }
        presentation={presentation}
        role={props.navigationRole}
        scope="tenant"
      />
    ) : (
      <CmsNavigation
        onNavigate={
          presentation === "sheet" ? () => setNavigationOpen(false) : undefined
        }
        presentation={presentation}
        scope="platform"
      />
    );

  return (
    <TooltipProvider>
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SkipLink className="cms-skip-link" targetId="konten-utama">
          Lewati ke konten utama
        </SkipLink>
        <div className="hidden lg:flex">{navigation("sidebar")}</div>
        <div className="hidden md:flex lg:hidden">{navigation("rail")}</div>
        <SidebarInset
          className="min-w-0 bg-background"
          id="konten-utama"
          tabIndex={-1}
        >
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background px-3 md:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
                <SheetTrigger asChild>
                  <Button
                    aria-label="Buka navigasi"
                    className="h-11 gap-2 px-3 md:hidden"
                    variant="ghost"
                  >
                    <PanelLeft aria-hidden="true" />
                    <span>Menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent
                  className="w-72! max-w-[88vw]! gap-0 p-0 sm:max-w-72!"
                  showCloseButton={false}
                  side="left"
                >
                  <SheetHeader className="sr-only">
                    <SheetTitle>Navigasi GeraiCUAN</SheetTitle>
                    <SheetDescription>Pilih halaman CMS yang ingin dibuka.</SheetDescription>
                  </SheetHeader>
                  <SheetClose asChild>
                    <Button
                      aria-label="Tutup navigasi"
                      className="absolute right-2 top-1.5 z-10 size-11"
                      size="icon"
                      variant="ghost"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </SheetClose>
                  {navigation("sheet")}
                </SheetContent>
              </Sheet>
              <SidebarTrigger
                aria-label="Buka atau tutup navigasi"
                className="hidden size-11 lg:inline-flex"
              />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <strong className="truncate text-sm font-medium">{props.scopeTitle}</strong>
                  <Badge className="hidden sm:inline-flex" variant="secondary">
                    {props.roleLabel}
                  </Badge>
                </div>
                <p className="hidden truncate text-xs text-muted-foreground lg:block">
                  {props.scopeDescription}
                </p>
              </div>
            </div>

            <DropdownMenu onOpenChange={setAccountOpen} open={accountOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  className="min-h-11 gap-2 px-2"
                  onPointerDown={(event) => {
                    if (event.button !== 0 || event.ctrlKey) return;
                    event.preventDefault();
                    setAccountOpen((open) => !open);
                  }}
                  type="button"
                  variant="ghost"
                >
                  <Avatar size="sm">
                    <AvatarFallback>{props.account.initials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-40 truncate text-sm sm:inline">
                    {props.account.label}
                  </span>
                  <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64"
                onCloseAutoFocus={(event) => {
                  const destination = signOutDestinationRef.current;
                  if (!destination) return;

                  event.preventDefault();
                  signOutDestinationRef.current = null;
                  window.requestAnimationFrame(() => {
                    window.location.replace(destination);
                  });
                }}
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
          </header>
          <div className="cms-main min-w-0 max-w-screen-2xl self-center px-4 py-6 md:px-6 lg:px-8">
            {props.children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
