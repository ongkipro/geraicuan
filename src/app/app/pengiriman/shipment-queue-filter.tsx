"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="grid gap-1.5 text-sm font-medium" htmlFor="status-kiriman">
        Tampilan antrean
        <Select
          disabled={pending}
          onValueChange={(value) => startTransition(() => router.push(shipmentQueueHref(value as ShipmentQueueStatusFilter)))}
          value={status}
        >
          <SelectTrigger className="w-full min-w-64 data-[size=default]:h-11 sm:w-72 sm:data-[size=default]:h-9" id="status-kiriman">
            <SelectValue />
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
      {status !== "ALL" ? (
        <Button asChild className="min-h-11 sm:min-h-9" variant="ghost">
          <Link href="/app/pengiriman"><RotateCcw aria-hidden="true" />Reset</Link>
        </Button>
      ) : null}
      <span aria-live="polite" className="sr-only" role="status">{pending ? "Memuat tampilan antrean…" : ""}</span>
    </div>
  );
}
