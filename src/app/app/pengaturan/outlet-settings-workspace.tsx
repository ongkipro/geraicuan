"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { ToneBadge } from "@/components/cms/shipment-status-badge";

type OutletNavigationItem = {
  id: string;
  name: string;
  readinessStatus: "ready" | "needs_attention";
};

export function OutletSettingsWorkspace({
  activeOutletId,
  basePath = "/app/pengaturan/outlet",
  children,
  focusTargetId = "outlet-detail-title",
  outlets,
}: {
  activeOutletId: string;
  /** The settings page this selector stays on; `?outlet=` is its URL state. */
  basePath?: string;
  children: ReactNode;
  /** Heading the selector moves focus to after a switch. */
  focusTargetId?: string;
  outlets: readonly OutletNavigationItem[];
}) {
  const [open, setOpen] = useState(false);
  const activeOutlet = outlets.find(({ id }) => id === activeOutletId) ?? outlets[0];

  useEffect(() => {
    if (window.location.hash !== `#${focusTargetId}`) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(focusTargetId)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeOutletId, focusTargetId]);

  if (!activeOutlet) return null;

  // V-25: the selector stays a disclosure above the content at every width, so a
  // nested outlet column never narrows the settings content column.
  return (
    <section className="grid min-w-0 gap-6">
      <div className="min-w-0">
        <button
          aria-controls="outlet-navigation-list"
          aria-expanded={open}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span className="grid min-w-0 gap-0.5">
            <span className="text-xs font-medium text-muted-foreground">Outlet aktif</span>
            <span className="truncate text-sm font-semibold">{activeOutlet.name}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <ToneBadge label={activeOutlet.readinessStatus === "ready" ? "Siap" : "Perlu dilengkapi"} tone={activeOutlet.readinessStatus === "ready" ? "ok" : "warn"} />
            <ChevronDown
              aria-hidden="true"
              className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </span>
        </button>

        <nav
          aria-label="Pilih outlet"
          className={`${open ? "block" : "hidden"} mt-2 max-h-[50dvh] overflow-y-auto rounded-md border bg-popover p-1 shadow-md`}
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
                    href={`${basePath}?outlet=${encodeURIComponent(outlet.id)}#${focusTargetId}`}
                    onClick={() => setOpen(false)}
                  >
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="line-clamp-2 text-sm font-medium">{outlet.name}</span>
                      <span className="text-xs text-muted-foreground">
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
