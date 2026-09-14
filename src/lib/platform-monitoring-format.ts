import { shipmentReference } from "@/lib/shipment-reference";

const countFormatter = new Intl.NumberFormat("id-ID");

export function formatCount(value: number): string {
  return countFormatter.format(value);
}

export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "—";
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainder = minutes % 60;
    return remainder === 0 ? `${hours} jam` : `${hours} jam ${remainder} menit`;
  }
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder === 0 ? `${days} hari` : `${days} hari ${remainder} jam`;
}

export function formatShortId(id: string): string {
  return shipmentReference(id);
}
