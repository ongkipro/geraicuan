"use client";

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
  "NEEDS_ATTENTION",
  "READY_TO_PROGRESS",
  "ISSUED_TODAY",
]);

export function ShipmentQueueFilter({
  carry,
  status,
}: {
  /** The page's range URL state, kept across a status change (PR-53). */
  carry?: Readonly<Record<string, string>>;
  status: ShipmentQueueStatusFilter;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const operational = SHIPMENT_STATUS_OPTIONS.filter((option) => OPERATIONAL_VALUES.has(option.value));
  const lifecycle = SHIPMENT_STATUS_OPTIONS.filter((option) => !OPERATIONAL_VALUES.has(option.value));
  const current = SHIPMENT_STATUS_OPTIONS.find((option) => option.value === status)?.label;

  return (
    // Single-choice view with grouped options, so it stays a Select (combobox)
    // rather than a multi-select facet. T-203: the trigger names itself in
    // words ("Status: …") and renders the chosen label on first paint instead
    // of waiting for Radix to mirror the item text after hydration; no dashed
    // frame (spec 10 §1.6). Reset lives in the page's DataTableToolbar.
    <div className="flex w-full items-center md:w-auto">
      <label className="flex w-full items-center md:w-auto" htmlFor="status-kiriman">
        <span className="sr-only">Status kiriman</span>
        <Select
          disabled={pending}
          onValueChange={(value) => startTransition(() => router.push(shipmentQueueHref(value as ShipmentQueueStatusFilter, 1, carry)))}
          value={status}
        >
          <SelectTrigger className="w-full justify-start font-medium max-md:min-h-11 md:w-auto md:min-w-54" id="status-kiriman">
            <span aria-hidden="true" className="text-muted-foreground">Status:</span>
            <SelectValue className="flex-1 text-left">{current}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              <SelectLabel>Tampilan operasional</SelectLabel>
              {operational.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Tahap kiriman</SelectLabel>
              {lifecycle.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <span aria-live="polite" className="sr-only" role="status">{pending ? "Memuat tampilan antrean…" : ""}</span>
    </div>
  );
}
