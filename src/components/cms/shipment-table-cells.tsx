import { formatDistrictCity, formatWibDateTimeParts } from "@/lib/label-format";

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
