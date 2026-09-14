/** Spec 19 M-3: a courier with fewer resolved outcomes than this is marked low volume. */
export const COURIER_LOW_VOLUME_THRESHOLD = 10;

const countFormatter = new Intl.NumberFormat("id-ID");

export type CourierRateRow = {
  courier: string;
  issuedCount: number;
  resolvedSubmissionCount: number;
};

export function isLowVolumeCourier(row: CourierRateRow) {
  return row.resolvedSubmissionCount < COURIER_LOW_VOLUME_THRESHOLD;
}

export function courierIssueRate(row: CourierRateRow) {
  return row.resolvedSubmissionCount > 0 ? (row.issuedCount / row.resolvedSubmissionCount) * 100 : 0;
}

export function lowVolumeLabel(row: CourierRateRow) {
  return `Volume rendah (n = ${countFormatter.format(row.resolvedSubmissionCount)})`;
}

/**
 * Presentation order for the already-returned rows: couriers with enough
 * volume first by rate, then low-volume couriers, so a rate built on a
 * handful of outcomes never ranks above a higher-volume courier.
 */
export function orderCouriersForRanking<T extends CourierRateRow>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) =>
    Number(isLowVolumeCourier(left)) - Number(isLowVolumeCourier(right))
    || courierIssueRate(right) - courierIssueRate(left)
    || right.resolvedSubmissionCount - left.resolvedSubmissionCount
    || left.courier.localeCompare(right.courier, "id-ID"));
}
