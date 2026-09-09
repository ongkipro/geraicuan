"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

type OutletNavigationItem = {
  id: string;
  name: string;
  readinessStatus: "ready" | "needs_attention";
};

export function OutletSettingsWorkspace({
  activeOutletId,
  children,
  outlets,
}: {
  activeOutletId: string;
  children: ReactNode;
  outlets: readonly OutletNavigationItem[];
}) {
  const [open, setOpen] = useState(false);
  const activeOutlet = outlets.find(({ id }) => id === activeOutletId) ?? outlets[0];

  useEffect(() => {
    if (window.location.hash !== "#outlet-detail-title") return;
    const frame = requestAnimationFrame(() => {
      document.getElementById("outlet-detail-title")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeOutletId]);

  if (!activeOutlet) return null;

  return (
    <section className="grid min-w-0 border-y xl:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="min-w-0 xl:border-r">
        <button
          aria-controls="outlet-navigation-list"
          aria-expanded={open}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-1 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 xl:hidden"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span className="grid min-w-0 gap-0.5">
            <span className="text-xs font-medium text-muted-foreground">Outlet aktif</span>
            <span className="truncate text-sm font-semibold">{activeOutlet.name}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Badge variant={activeOutlet.readinessStatus === "ready" ? "secondary" : "destructive"}>
              {activeOutlet.readinessStatus === "ready" ? "Siap" : "Perlu dilengkapi"}
            </Badge>
            <ChevronDown
              aria-hidden="true"
              className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </span>
        </button>

        <nav
          aria-label="Pilih outlet"
          className={`${open ? "block" : "hidden"} max-h-[50dvh] overflow-y-auto border-t xl:sticky xl:top-4 xl:block xl:max-h-[calc(100dvh-8rem)] xl:border-t-0`}
          id="outlet-navigation-list"
        >
          <ul className="divide-y">
            {outlets.map((outlet) => {
              const active = outlet.id === activeOutlet.id;
              return (
                <li key={outlet.id}>
                  {/* A selector within the current page, not a second current
                      page: the shell nav already marks "Outlet & koneksi" as
                      `page`, and browser screening found two of them at
                      1280px. */}
                  <Link
                    aria-current={active ? "true" : undefined}
                    className={`relative flex min-h-11 items-start gap-2 px-3 py-3 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 ${active ? "bg-accent text-accent-foreground before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary" : "hover:bg-muted/60"}`}
                    href={`/app/pengaturan?outlet=${encodeURIComponent(outlet.id)}#outlet-detail-title`}
                    onClick={() => setOpen(false)}
                  >
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="line-clamp-2 text-sm font-medium leading-5">{outlet.name}</span>
                      <span className="text-xs leading-4 text-muted-foreground">
                        {outlet.readinessStatus === "ready" ? "Siap dipakai" : "Perlu dilengkapi"}
                      </span>
                    </span>
                    {active ? <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="min-w-0 border-t px-0 py-6 xl:border-t-0 xl:px-6">
        {children}
      </div>
    </section>
  );
}
