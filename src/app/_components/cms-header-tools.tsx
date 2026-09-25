"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { platformCmsNavigation, tenantCmsNavigation, type TenantCmsRole } from "@/lib/cms-shell-navigation";
import { formatWibDateTimeParts } from "@/lib/label-format";

type SearchProps = { scope: "tenant"; role: TenantCmsRole } | { scope: "platform" };

export function CmsHeaderSearch(props: SearchProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const groups = props.scope === "platform"
    ? platformCmsNavigation(pathname)
    : tenantCmsNavigation(props.role, pathname, searchParams);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)
        || event.altKey || event.isComposing || event.repeat) return;
      if (open) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.target instanceof HTMLElement
        && (event.target.isContentEditable || event.target.closest("input, textarea, select"))) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [open]);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {/* T-204 reference: an input-shaped trigger (muted ground, search icon, ⌘K hint) from lg; an icon button below. */}
        <Button aria-label="Cari halaman" aria-keyshortcuts="Control+k Meta+k" className="size-11 shrink-0 gap-2 text-muted-foreground md:size-10 lg:w-64 lg:justify-start lg:bg-muted lg:px-3 lg:font-normal lg:hover:bg-muted lg:hover:text-foreground" type="button" variant="outline">
          <Search aria-hidden="true" />
          <span className="hidden min-w-0 truncate text-xs lg:inline">Cari halaman…</span>
          <kbd aria-hidden="true" className="ms-auto hidden shrink-0 rounded border bg-background px-1.5 font-mono text-xs text-muted-foreground lg:inline">⌘K</kbd>
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 p-3 sm:max-w-lg" onOpenAutoFocus={(event) => { event.preventDefault(); searchRef.current?.focus(); }} showCloseButton={false}>
        <DialogHeader className="relative min-h-11 justify-center pr-12 text-left">
          <DialogTitle>Cari halaman</DialogTitle>
          <DialogDescription>Pindah ke menu yang tersedia untuk akun Anda.</DialogDescription>
          <DialogClose asChild><Button aria-label="Tutup pencarian" className="absolute top-0 right-0 size-11" size="icon" type="button" variant="ghost"><X aria-hidden="true" /></Button></DialogClose>
        </DialogHeader>
        <Command className="min-h-0">
          <CommandInput aria-label="Cari halaman" className="min-w-0 flex-1 shrink" placeholder="Ketik nama halaman…" ref={searchRef} />
          <CommandList className="min-h-0 max-h-[min(24rem,calc(100dvh-11rem))] overscroll-contain">
            <CommandEmpty className="px-4 leading-6">Halaman tidak ditemukan. Coba nama menu lain.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup heading={group.label} key={group.label}>
                {group.items.map((item) => (
                  <CommandItem className="min-h-11 p-0 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-ring [&>svg]:hidden" key={item.key} onSelect={() => { setOpen(false); router.push(item.href); }} value={`${item.label} ${group.label}`}>
                    <Link className="flex min-h-11 w-full items-center justify-between gap-3 rounded-sm px-3 py-2" href={item.href} onClick={(event) => event.stopPropagation()} onNavigate={() => setOpen(false)} prefetch={false} tabIndex={-1}>
                      <span>{item.label}</span>
                      {item.current ? <Badge variant="secondary">Saat ini</Badge> : null}
                    </Link>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// V-30: minutes, not seconds (a ticking second is noise), and the zone reads "WIB" as on every page.
// T-203: nothing is shown until the browser knows the time — no "--.--" stand-in; the reserved
// width keeps the header from shifting when the first tick lands (one animation frame later).
export function CmsHeaderClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const frame = requestAnimationFrame(tick);
    const interval = window.setInterval(tick, 15_000);
    return () => { cancelAnimationFrame(frame); window.clearInterval(interval); };
  }, []);
  if (!now) return <span aria-hidden="true" className="block w-44" data-slot="cms-clock-pending" />;
  const parts = formatWibDateTimeParts(now);

  // T-204 reference: one muted line, "25 Sep 2026 · 18.54 WIB".
  return (
    <time aria-live="off" className="block w-44 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums" dateTime={now.toISOString()}>
      {parts.date} · {parts.time}
    </time>
  );
}
