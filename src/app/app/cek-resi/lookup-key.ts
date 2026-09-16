import type { ShipmentTrackingLookupKey } from "@/db/shipment-tracking-lookup-repository";

// PR-51: the operator types either a GeraiCUAN shipment number (`10013` / `GC-10013`) or an AWB.
// Format validation is tenant-independent, so rejecting a malformed key leaks nothing about which
// tenant owns what; every well-formed key goes through the same tenant-scoped lookup.
const NUMBER_PATTERN = /^(?:([A-Z0-9]{2,5})-)?([1-9][0-9]{4,9})$/;
const AWB_PATTERN = /^[A-Z0-9][A-Z0-9/-]{4,39}$/;
const MAX_TENANT_NUMBER = 2_147_483_647;
export const MAX_TRACKING_KEY_LENGTH = 40;

/** Returns the normalized key, or null when the input cannot be a shipment number or an AWB. */
export function parseTrackingLookupKey(raw: string): ShipmentTrackingLookupKey | null {
  const value = raw.trim().toUpperCase();
  if (value.length > MAX_TRACKING_KEY_LENGTH) return null;

  const number = NUMBER_PATTERN.exec(value);
  const parsedNumber = number ? Number(number[2]) : NaN;
  const tenantNumber = Number.isSafeInteger(parsedNumber) && parsedNumber <= MAX_TENANT_NUMBER
    ? parsedNumber
    : null;
  const awb = AWB_PATTERN.test(value) ? value : null;
  if (tenantNumber === null && awb === null) return null;

  return { awb, prefix: tenantNumber === null ? null : number?.[1] ?? null, tenantNumber };
}
