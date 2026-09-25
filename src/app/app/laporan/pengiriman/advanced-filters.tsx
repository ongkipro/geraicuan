"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { FilterSelect } from "@/app/app/laporan/_components/filter-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type Option = { label: string; value: string };

/**
 * "Filter lanjutan" of the report's filter row: kurir and status behind one disclosure. The panel
 * stays mounted while closed (only hidden), so a closed panel still submits the filters it holds;
 * it opens by itself when one of them is active. It is laid out as the last line of the row.
 */
export function AdvancedFilters({
  courier,
  couriers,
  status,
  statuses,
}: {
  courier: string | null;
  couriers: readonly Option[];
  status: string | null;
  statuses: readonly Option[];
}) {
  const active = Number(Boolean(courier)) + Number(Boolean(status));
  const [open, setOpen] = useState(active > 0);
  return (
    <Collapsible className="contents" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="outline">
          <SlidersHorizontal aria-hidden="true" />
          Filter lanjutan
          {active > 0 ? <Badge className="tabular-nums" variant="secondary">{active}</Badge> : null}
          <ChevronDown aria-hidden="true" className={open ? "rotate-180 text-muted-foreground" : "text-muted-foreground"} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent
        className="order-last flex basis-full flex-wrap items-center gap-3 data-[state=closed]:hidden"
        forceMount
      >
        <FilterSelect allLabel="Semua kurir" label="Kurir" name="kurir" options={couriers} value={courier} />
        <FilterSelect allLabel="Semua status" label="Status" name="status" options={statuses} value={status} />
      </CollapsibleContent>
    </Collapsible>
  );
}
