"use client";

import { Menu, PanelLeft, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { NAV_ICONS } from "@/components/app/nav-icons";
import { useShellNavigation, type ShellScope } from "@/components/app/app-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useSidebar } from "@/components/ui/sidebar";

const clockFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  timeZone: "Asia/Jakarta",
  year: "numeric",
});

/** "25 Sep 2026 · 18.54 WIB" — the reference's top-bar stamp. */
export function formatWibStamp(instant: Date) {
  const parts = Object.fromEntries(clockFormat.formatToParts(instant).map((part) => [part.type, part.value]));
  return `${parts.day} ${parts.month} ${parts.year} · ${parts.hour}.${parts.minute} WIB`;
}

function subscribeMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, 15_000);
  return () => window.clearInterval(timer);
}

/** Client-only clock: the server renders nothing, so hydration never disagrees on the minute. */
function useWibStamp() {
  return useSyncExternalStore(subscribeMinute, () => formatWibStamp(new Date()), () => "");
}

/** The white "GC" mark and wordmark on the primary bar (the brand moved here from the sidebar). */
function Brand({ home }: { home: string }) {
  return (
    <Link aria-label="GeraiCUAN, ke beranda" className="flex shrink-0 items-center gap-3 rounded-lg outline-offset-2 focus-visible:outline-primary-foreground" href={home}>
      <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-primary-foreground text-sm font-bold text-primary">
        GC
      </span>
      <span aria-hidden="true" className="text-base font-bold max-md:hidden">GeraiCUAN</span>
    </Link>
  );
}

/**
 * Spec 10 v3.2 §3 top bar (Mengantar look, D1): full width, 64px, sticky, solid `--primary` with
 * white text — sidebar trigger (below 1024px) · brand · gerai name + role badge + outlet line ·
 * white "Cari halaman…" (⌘K; an icon below 640px) · date/time WIB. `focused` (D11, Buat kiriman)
 * keeps only the brand and a close ✕ back to Histori kiriman; the page's stepper sits centred
 * in the bar.
 */
export function SiteHeader({
  focused = false,
  roleLabel,
  scope,
  subtitle,
  title,
}: {
  focused?: boolean;
  roleLabel: string;
  scope: ShellScope;
  subtitle: string;
  title: string;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const stamp = useWibStamp();
  const { toggleSidebar } = useSidebar();
  const home = scope.kind === "tenant" ? "/app" : "/platform";

  useEffect(() => {
    if (focused) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focused]);

  const onPrimary = "text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground aria-expanded:bg-primary-hover aria-expanded:text-primary-foreground focus-visible:ring-primary-foreground/60";

  if (focused) {
    return (
      <header
        className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center justify-between gap-3 bg-primary px-4 text-primary-foreground shadow-resting md:px-6"
        data-focused="true"
        data-slot="site-header"
      >
        <Brand home={home} />
        <Button aria-label="Tutup, kembali ke Histori kiriman" asChild className={onPrimary} size="icon" variant="ghost">
          <Link href="/app/pengiriman"><X aria-hidden="true" className="size-6" /></Link>
        </Button>
      </header>
    );
  }

  return (
    <header
      className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-3 bg-primary px-4 text-primary-foreground shadow-resting md:px-6"
      data-slot="site-header"
    >
      <Button
        aria-label="Buka atau tutup menu"
        // No trigger on desktop, where the sidebar is always open; tablet (rail) and phone (sheet) keep it.
        className={`-ml-2 lg:hidden ${onPrimary}`}
        data-sidebar="trigger"
        onClick={toggleSidebar}
        size="icon"
        type="button"
        variant="ghost"
      >
        {/* A hamburger on the phone (the menu is a sheet there), the panel icon beside the rail. */}
        <Menu aria-hidden="true" className="size-6 md:hidden" />
        <PanelLeft aria-hidden="true" className="max-md:hidden" />
      </Button>
      <Brand home={home} />
      <span aria-hidden="true" className="h-8 w-px shrink-0 bg-primary-foreground/30 max-md:hidden" />
      <div className="grid min-w-0 flex-1 leading-tight">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{title}</span>
          <Badge className="shrink-0 max-sm:hidden" variant="secondary">{roleLabel}</Badge>
        </div>
        <span className="truncate text-xs text-primary-foreground/85 max-sm:hidden">{subtitle}</span>
      </div>
      <Button
        aria-keyshortcuts="Meta+K Control+K"
        aria-label="Cari halaman"
        className="w-64 justify-start border-transparent bg-card px-3 font-normal text-muted-foreground hover:bg-accent hover:text-foreground max-sm:hidden"
        onClick={() => setSearchOpen(true)}
        type="button"
        variant="outline"
      >
        <Search aria-hidden="true" />
        <span className="text-xs">Cari halaman…</span>
        <kbd className="ml-auto rounded border border-border px-1.5 font-mono text-xs text-muted-foreground">⌘K</kbd>
      </Button>
      <Button aria-label="Cari halaman" className={`sm:hidden ${onPrimary}`} onClick={() => setSearchOpen(true)} size="icon" type="button" variant="ghost">
        <Search aria-hidden="true" className="size-5" />
      </Button>
      <time className="shrink-0 text-xs whitespace-nowrap text-primary-foreground/85 max-md:hidden" suppressHydrationWarning>
        {stamp}
      </time>
      <PageSearch onOpenChange={setSearchOpen} open={searchOpen} scope={scope} />
    </header>
  );
}

function PageSearch({
  onOpenChange,
  open,
  scope,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  scope: ShellScope;
}) {
  const router = useRouter();
  const groups = useShellNavigation(scope);
  const extra = scope.kind === "tenant" && scope.role === "TENANT_ADMIN"
    ? [{ href: "/app/anggota", key: "members", label: "Anggota & akses" }]
    : [];

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog
      description="Ketik nama halaman lalu tekan Enter."
      onOpenChange={onOpenChange}
      open={open}
      title="Cari halaman"
    >
      <Command>
        <CommandInput placeholder="Cari halaman…" />
        <CommandList>
          <CommandEmpty>Halaman tidak ditemukan.</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup heading={group.label} key={group.label}>
              {group.items.map((item) => {
                const Icon = NAV_ICONS[item.key];
                return (
                  <CommandItem className="min-h-10 text-sm" key={item.key} onSelect={() => go(item.href)} value={`${group.label} ${item.label}`}>
                    {Icon ? <Icon aria-hidden="true" /> : null}
                    {item.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
          {extra.length ? (
            <CommandGroup heading="Akun">
              {extra.map((item) => (
                <CommandItem className="min-h-10 text-sm" key={item.key} onSelect={() => go(item.href)} value={item.label}>
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
