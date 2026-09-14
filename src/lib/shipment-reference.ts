// A short, human-readable shipment reference. Ids are random UUIDs, but fixture
// ids share their leading groups, so the reference uses the tail, which
// differs between rows either way. The provider AWB remains the only shipping
// identifier; this only names the internal record.
export function shipmentReference(shipmentId: string) {
  return shipmentId.replaceAll("-", "").slice(-8).toUpperCase();
}
