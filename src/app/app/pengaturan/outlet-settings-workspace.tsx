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
    <section className="grid min-w-0 gap-6 xl:grid-cols-[14rem_minmax(0,1fr)] xl:gap-10">
      <div className="min-w-0">
        <button
          aria-controls="outlet-navigation-list"
          aria-expanded={open}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden"
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
          className={`${open ? "block" : "hidden"} mt-2 max-h-[50dvh] overflow-y-auto rounded-md border p-1 xl:sticky xl:top-4 xl:mt-0 xl:block xl:max-h-[calc(100dvh-8rem)] xl:border-0 xl:p-0`}
          id="outlet-navigation-list"
        >
          <ul className="space-y-1">
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
                    className={`flex min-h-11 items-start gap-2 rounded-md px-3 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
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

      <div className="min-w-0">
        {children}
      </div>
    </section>
  );
}
