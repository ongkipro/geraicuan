import { serviceDisplayName } from "@/lib/labels/courier";
import { areaDisplayCase, formatDistrictCity, formatIdr, formatWibDateTime, formatWibDateTimeParts } from "@/lib/label-format";
import { courierDisplayName } from "@/lib/mengantar-couriers";
import { presentShipmentPayment, type ShipmentPaymentFacts } from "@/lib/payment-method";

/*
 * T-212: the stacked cells Histori kiriman, Retur and Cetak resi share (spec 10 §4.4: primary
 * 15px ink, secondary 13px muted). Every label comes from a shared source — the payment
 * mapping, the courier names; statuses render through the one `ShipmentStatusBadge`.
 */

/** Spec 10 §2.2: shipment numbers and resi are mono; a link to a detail is primary. */
export const idLinkClassName = "font-mono font-semibold text-primary underline-offset-4 hover:underline";

/** "COD · Rp 119.479", "COD Ongkir · Rp 35.000" or "Non-COD" (the goods value is not what a courier collects). */
export function paymentText(facts: ShipmentPaymentFacts, separator = " · ") {
  const payment = presentShipmentPayment(facts);
  return payment.method !== "NON_COD" && payment.amountIdr !== null
    ? `${payment.label}${separator}${formatIdr(payment.amountIdr)}`
    : payment.label;
}

/** Spec 10 §7: areas read "Kecamatan, Kota" in lists. */
export function areaText(areaLabel: string) {
  return areaDisplayCase(formatDistrictCity(areaLabel));
}

export function carrierText(service: string | null | undefined, courier?: string | null) {
  if (service) return serviceDisplayName(service);
  return courier ? courierDisplayName(courier) : null;
}

export function DateTimeText({ value }: { value: Date | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <time className="tabular-nums" dateTime={value.toISOString()}>{formatWibDateTime(value)}</time>;
}

/** Date over time, for the narrow "Terbit" column. */
export function StackedDateTime({ value }: { value: Date | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const { date, time } = formatWibDateTimeParts(value);
  return (
    <time className="block tabular-nums whitespace-nowrap" dateTime={value.toISOString()}>
      <span className="block">{date}</span>
      <span className="block text-xs text-muted-foreground">{time}</span>
    </time>
  );
}

export function RecipientCell({ areaLabel, name, phone }: { areaLabel: string; name: string; phone?: string | null }) {
  return (
    <>
      <span className="block font-semibold wrap-anywhere">{name}</span>
      {phone ? <span className="block text-xs tabular-nums text-muted-foreground">{phone}</span> : null}
      <span className="block text-xs wrap-anywhere text-muted-foreground">{areaText(areaLabel)}</span>
    </>
  );
}

const shortDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

/** "25 Sep" (WIB), for a secondary line such as "Dibuat 25 Sep". */
export function formatShortDate(value: Date) {
  return shortDate.format(value);
}
