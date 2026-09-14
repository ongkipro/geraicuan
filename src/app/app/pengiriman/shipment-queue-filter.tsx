"use client";

import { ListFilter } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SHIPMENT_STATUS_OPTIONS,
  shipmentQueueHref,
  type ShipmentQueueStatusFilter,
} from "@/lib/shipment-queue";

const OPERATIONAL_VALUES = new Set([
  "ALL",
  "ACTION_REQUIRED",
  "READY_TO_PROGRESS",
  "ISSUED_TODAY",
]);

export function ShipmentQueueFilter({ status }: { status: ShipmentQueueStatusFilter }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const operational = SHIPMENT_STATUS_OPTIONS.filter((option) => OPERATIONAL_VALUES.has(option.value));
  const lifecycle = SHIPMENT_STATUS_OPTIONS.filter((option) => !OPERATIONAL_VALUES.has(option.value));

  return (
    // Single-choice view with grouped options, so it stays a Select (combobox)
    // rather than a multi-select facet; styled as a toolbar facet trigger.
    // Reset lives in the page's DataTableToolbar.
    <div className="flex w-full items-center md:w-auto">
      <label className="flex w-full items-center md:w-auto" htmlFor="status-kiriman">
        <span className="sr-only">Tampilan antrean</span>
        <Select
          disabled={pending}
          onValueChange={(value) => startTransition(() => router.push(shipmentQueueHref(value as ShipmentQueueStatusFilter)))}
          value={status}
        >
          <SelectTrigger className="w-full justify-start border-dashed max-md:min-h-11 md:w-[13.5rem]" id="status-kiriman">
            <ListFilter aria-hidden="true" className="text-muted-foreground" />
            <SelectValue className="flex-1 text-left" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              <SelectLabel>Tampilan operasional</SelectLabel>
              {operational.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Status lifecycle</SelectLabel>
              {lifecycle.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <span aria-live="polite" className="sr-only" role="status">{pending ? "Memuat tampilan antrean…" : ""}</span>
    </div>
  );
}
