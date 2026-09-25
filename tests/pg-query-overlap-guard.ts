// T-197: fail any test that sends a query to a node-postgres client while that
// client is still running or queueing another. A transaction (and so every
// withTenantContext / withPlatformContext session) is one client: concurrent
// queries on it pipeline behind each other, which pg deprecates and pg@9
// removes. Registered for every integration file in vitest.integration.config.mts.
import pg from "pg";
import { afterAll, afterEach } from "vitest";

type ClientState = { _activeQuery: unknown; _queryQueue: unknown[] };

const overlaps: string[] = [];
const sqlText = (query: unknown) =>
  String(typeof query === "string" ? query : (query as { text?: unknown } | null)?.text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

const originalQuery = pg.Client.prototype.query;
if (!(originalQuery as { overlapGuard?: true }).overlapGuard) {
  const guarded = function (this: pg.Client & ClientState, ...args: unknown[]) {
    if (this._activeQuery || this._queryQueue.length > 0) overlaps.push(sqlText(args[0]));
    return (originalQuery as (...values: unknown[]) => unknown).apply(this, args);
  };
  Object.assign(guarded, { overlapGuard: true });
  pg.Client.prototype.query = guarded as typeof pg.Client.prototype.query;
}

/** Returns and clears the overlaps recorded so far (for the guard's own test). */
export function takePgQueryOverlaps() {
  return overlaps.splice(0);
}

function failOnOverlap() {
  const found = takePgQueryOverlaps();
  if (found.length > 0) {
    throw new Error(
      `A query was sent to a pg client already running one (${found.length}×; run them in turn on a transaction): ${found.join(" | ")}`,
    );
  }
}

afterEach(failOnOverlap);
afterAll(failOnOverlap);
