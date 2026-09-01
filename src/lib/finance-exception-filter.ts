export const RECONCILIATION_VARIANCE_FILTER = "VARIANCE" as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FinanceExceptionFilter =
  | typeof RECONCILIATION_VARIANCE_FILTER
  | null;

export function parseFinanceExceptionFilter(
  value: string | string[] | undefined,
): FinanceExceptionFilter {
  const first = Array.isArray(value) ? value[0] : value;
  return first === RECONCILIATION_VARIANCE_FILTER
    ? RECONCILIATION_VARIANCE_FILTER
    : null;
}

export function reconciliationVarianceHref(reconciliationId?: string) {
  const query = new URLSearchParams({
    status: RECONCILIATION_VARIANCE_FILTER,
  });
  if (reconciliationId && UUID_PATTERN.test(reconciliationId)) {
    query.set("rekonsiliasiId", reconciliationId);
    return `/app/keuangan?${query.toString()}#reconciliation-${reconciliationId}`;
  }
  return `/app/keuangan?${query.toString()}#reconciliation-history-title`;
}
