"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Which outlet a settings page is showing; `?outlet=` is its URL state. Shown only with 2+ outlets. */
export function OutletSelect({
  activeId,
  outlets,
}: {
  activeId: string;
  outlets: readonly { id: string; name: string; readinessStatus: "ready" | "needs_attention" }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <Label className="shrink-0" htmlFor="settings-outlet">Outlet</Label>
      <Select
        disabled={pending}
        onValueChange={(id) => startTransition(() => router.push(`${pathname}?outlet=${encodeURIComponent(id)}`))}
        value={activeId}
      >
        <SelectTrigger aria-busy={pending} className="w-full sm:w-80" id="settings-outlet">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {outlets.map((outlet) => (
            <SelectItem key={outlet.id} value={outlet.id}>
              {outlet.name}{outlet.readinessStatus === "needs_attention" ? " · perlu dilengkapi" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
