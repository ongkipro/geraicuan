"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type OutletOption = { id: string; name: string; readinessStatus: "ready" | "needs_attention" };

const outletLabel = (outlet: OutletOption | undefined) =>
  outlet ? `${outlet.name}${outlet.readinessStatus === "needs_attention" ? " · perlu dilengkapi" : ""}` : "";

/** Which outlet a settings page is showing; `?outlet=` is its URL state. Shown only with 2+ outlets. */
export function OutletSelect({
  activeId,
  outlets,
}: {
  activeId: string;
  outlets: readonly OutletOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const activeLabel = outletLabel(outlets.find((outlet) => outlet.id === activeId));
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <Label className="shrink-0" htmlFor="settings-outlet">Outlet</Label>
      <Select
        disabled={pending}
        onValueChange={(id) => startTransition(() => router.push(`${pathname}?outlet=${encodeURIComponent(id)}`))}
        value={activeId}
      >
        {/* A long name is clamped to one line in the trigger; the title carries it whole. */}
        <SelectTrigger aria-busy={pending} className="w-full sm:w-80" id="settings-outlet" title={activeLabel}>
          {/* Children, not Radix's own mirror: the outlet name is in the server HTML (T-236). */}
          <SelectValue>{activeLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent position="popper">
          {outlets.map((outlet) => (
            <SelectItem key={outlet.id} value={outlet.id}>
              {outletLabel(outlet)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
