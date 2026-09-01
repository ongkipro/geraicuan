export const DATA_STALE_AFTER_MS = 5 * 60 * 1_000;

export function isDataStale(
  generatedAt: Date,
  now: Date,
  staleAfterMs = DATA_STALE_AFTER_MS,
) {
  if (!Number.isFinite(generatedAt.getTime()) || !Number.isFinite(now.getTime())) {
    return true;
  }
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs < 1) {
    throw new RangeError("Data freshness threshold must be a positive integer.");
  }
  return now.getTime() - generatedAt.getTime() >= staleAfterMs;
}
