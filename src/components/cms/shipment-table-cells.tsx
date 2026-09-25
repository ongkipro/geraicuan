import { formatDistrictCity, formatIdr, formatWibDateTimeParts } from "@/lib/label-format";
import { presentShipmentPayment, type ShipmentPaymentFacts } from "@/lib/payment-method";

// Owner steering (T-148): long admin tables stack related facts instead of spreading them over columns.

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

export function CourierAwbStack({ awb, courier, service }: { awb: string | null; courier?: string | null; service: string | null }) {
  const carrier = service ?? courier ?? null;
  return (
    <>
      <span className="block whitespace-nowrap">{carrier ?? "—"}</span>
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
      <span className="block text-xs wrap-anywhere text-muted-foreground">{formatDistrictCity(areaLabel)}</span>
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
