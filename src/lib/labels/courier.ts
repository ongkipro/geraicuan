import { courierDisplayName, mengantarCourierOfService } from "@/lib/mengantar-couriers";

/**
 * Spec 10 §8: one display name for a courier or service everywhere it renders (V-5).
 * The provider spells service keys inconsistently (`SapCargo`, `SAPLite`, `iDexpressCargo`, `lion`);
 * the stored key is never changed — only its presentation.
 */
export function serviceDisplayName(providerService: string | null | undefined): string {
  const service = providerService?.trim() ?? "";
  if (!service) return "—";
  const courier = mengantarCourierOfService(service);
  if (!courier) return service;
  const rest = service.slice(courier.length).trim();
  const variant = rest ? rest.charAt(0).toUpperCase() + rest.slice(1).toLowerCase() : "";
  return variant ? `${courierDisplayName(courier)} ${variant}` : courierDisplayName(courier);
}

/**
 * Normalises the provider's free-text delivery estimates ("1-2 Day", "2 - 3 days", "4 HARI",
 * "1 - 2 Hari") to one Indonesian form ("1–2 hari", "4 hari"). Unrecognised text is returned
 * trimmed; an empty or "-" estimate reads "—".
 */
export function deliveryEstimateLabel(estimate: string | null | undefined): string {
  const text = estimate?.trim() ?? "";
  if (!text || text === "-") return "—";
  const match = /^(\d+)\s*(?:-|–|s\.?d\.?)?\s*(\d+)?\s*(day|days|hari)?$/i.exec(text);
  if (!match) return text;
  const [, from, to] = match;
  return to && to !== from ? `${from}–${to} hari` : `${from} hari`;
}
