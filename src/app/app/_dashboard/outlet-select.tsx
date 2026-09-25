"use client";

import { useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "semua";

/**
 * The outlet control of the dashboard filter row: a shadcn Select whose value travels in a hidden
 * `outlet` input of the surrounding GET form ("" = all outlets, the value the page already reads).
 */
export function OutletSelect({ outlets, value }: { outlets: readonly { id: string; name: string }[]; value?: string }) {
  const [selected, setSelected] = useState(value ?? ALL);
  return (
    <>
      <input name="outlet" type="hidden" value={selected === ALL ? "" : selected} />
      <Select onValueChange={setSelected} value={selected}>
        <SelectTrigger aria-label="Outlet" className="min-w-44 font-medium">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value={ALL}>Semua outlet</SelectItem>
          {outlets.map((outlet) => (
            <SelectItem key={outlet.id} value={outlet.id}>{outlet.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
