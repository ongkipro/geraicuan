import Link from "next/link";

import { RecordItem } from "@/components/cms/record-list";
import { ShipmentStatusBadge, type StatusTone } from "@/components/cms/shipment-status-badge";
import { serviceDisplayName } from "@/lib/labels/courier";
import { areaDisplayCase, formatDistrictCity, formatIdr, formatWibDateTimeParts } from "@/lib/label-format";
import { courierDisplayName } from "@/lib/mengantar-couriers";
import { presentShipmentPayment, type ShipmentPaymentFacts } from "@/lib/payment-method";
import { cn } from "@/lib/utils";

// Owner steering (T-148): long admin tables stack related facts instead of spreading them over columns.

/** V-33: the one style for a shipment number or AWB that links to its detail (spec 10 §2.2: identifiers are mono). */
export const shipmentIdLinkClassName = "font-mono font-medium tabular-nums text-primary underline-offset-4 hover:underline";

export function StackedDateTime({ value }: { value: Date | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const { date, time } = formatWibDateTimeParts(value);
  return (
    <time className="block whitespace-nowrap tabular-nums" dateTime={value.toISOString()}>
      <span className="block">{date}</span>
      <span className="block text-xs text-muted-foreground">{time}</span>
    </time>
  );
}

function carrierName(service: string | null | undefined, courier: string | null | undefined) {
  return service ? serviceDisplayName(service) : courier ? courierDisplayName(courier) : "—";
}

export function CourierAwbStack({ awb, courier, service }: { awb: string | null; courier?: string | null; service: string | null }) {
  // V-5: one display name per courier/service ("JT" → "J&T", "SapCargo" → "SAP Cargo").
  const carrier = carrierName(service, courier);
  return (
    <>
      <span className="block whitespace-nowrap">{carrier}</span>
      {awb
        ? <span className="block font-mono text-xs break-all text-muted-foreground">{awb}</span>
        : <span className="block text-xs text-muted-foreground">Belum ada resi</span>}
    </>
  );
}

export function RecipientStack({ areaLabel, name, phone }: { areaLabel: string; name: string; phone: string | null }) {
  return (
    <>
      <span className="block font-medium wrap-anywhere">{name}</span>
      {phone ? <span className="block text-xs tabular-nums text-muted-foreground">{phone}</span> : null}
      <span className="block text-xs wrap-anywhere text-muted-foreground">{areaDisplayCase(formatDistrictCity(areaLabel))}</span>
    </>
  );
}

/**
 * T-190: the payment method and the figure it is read by (Non-COD: nilai
 * asuransi, COD: total COD, COD Ongkir: ongkir ditagih), from the one shared
 * mapping. The figure line is omitted while it is unknown.
 */
export function PaymentStack({ className, facts }: { className?: string; facts: ShipmentPaymentFacts }) {
  const payment = presentShipmentPayment(facts);
  return (
    <span className={className ?? "block"} data-payment-method={payment.method}>
      <span className="block">{payment.label}</span>
      {payment.amountIdr === null
        ? null
        : <span className="block whitespace-nowrap tabular-nums">{`${payment.amountLabel} ${formatIdr(payment.amountIdr)}`}</span>}
    </span>
  );
}

export type ShipmentRecordItemProps = {
  /** Shipment number (`PREFIX-NNNNN`), the row's one link. */
  reference: string;
  href: string;
  status: { label: string; tone: StatusTone };
  recipientName: string;
  areaLabel: string;
  service: string | null;
  courier?: string | null;
  awb: string | null;
  payment: ShipmentPaymentFacts;
  /** The row's time (last activity, issue time), shown as a WIB date and time. */
  at: Date | null;
};

/**
 * T-203 / spec 10 §6: one shipment row as a mobile record card, the same facts the
 * table stacks — shipment number + status, recipient · area, courier · AWB, and the
 * money a COD courier collects (otherwise the payment method) against the row time.
 */
export function ShipmentRecordItem({ areaLabel, at, awb, courier, href, payment, recipientName, reference, service, status }: ShipmentRecordItemProps) {
  const presented = presentShipmentPayment(payment);
  const value = presented.method !== "NON_COD" && presented.amountIdr !== null
    ? `${presented.label} ${formatIdr(presented.amountIdr)}`
    : presented.label;
  const parts = at ? formatWibDateTimeParts(at) : null;
  return (
    <RecordItem
      meta={parts && at ? <time className="tabular-nums" dateTime={at.toISOString()}>{parts.date}, {parts.time}</time> : "—"}
      primary={<><span className="font-medium">{recipientName}</span> · {areaDisplayCase(formatDistrictCity(areaLabel))}</>}
      secondary={service || courier ? <>{carrierName(service, courier)} · {awb ? <span className="font-mono">{awb}</span> : "Belum ada resi"}</> : awb ? <span className="font-mono">{awb}</span> : "Belum ada resi"}
      status={<ShipmentStatusBadge label={status.label} tone={status.tone} />}
      title={<Link className={cn("inline-flex min-h-11 items-center whitespace-nowrap", shipmentIdLinkClassName)} href={href}>{reference}</Link>}
      value={value}
    />
  );
}
