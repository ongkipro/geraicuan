import "server-only";

/**
 * Provider tracking ingestion — deliberately closed.
 *
 * The verified Mengantar surface in this repository is estimate, order, and
 * pay-unpaid; each has a sanitized capture under `tests/fixtures/`. No provider
 * push or callback contract has been verified: there is no fixture, the
 * integration skill documents no such endpoint, and `PR-30` is still `Queued`
 * in `docs/spec/02-PRD.md`.
 *
 * The implementation committed in `67beb92` invented the whole contract — the
 * `x-mengantar-signature` / `x-webhook-signature` header names, the
 * `cnote_no` / `awb` / `tracking_number` and `status` / `tracking_status`
 * payload fields, and the provider status vocabulary it mapped. It compared the
 * HMAC with `!==` rather than a constant-time comparison, read an unbounded
 * body, had no replay window, and wrote `shipments` through the raw pool with
 * `eq(shipments.id, …)` and no tenant predicate, resolving its target by
 * `cnote_no` across every tenant. It never actually worked: row-level security
 * denies the application role any read of `provider_order_snapshots` without a
 * tenant context, so every delivery was silently discarded while the caller was
 * answered `{ success: true }`.
 *
 * Rather than harden a signature scheme, timestamp header, and payload shape
 * that no provider is known to send, this endpoint refuses every request. It
 * stays mounted so the route inventory keeps describing reality.
 *
 * Before it may accept traffic again, all of the following must exist:
 *   1. the provider's own documentation of the push contract, plus a sanitized
 *      capture of a real delivery under `tests/fixtures/`;
 *   2. a tenant-scoped execution context — the handler has no user principal,
 *      so it needs a bounded machine principal that resolves the tenant from
 *      the provider record before it writes anything (T-79 design note in
 *      `TASKS.md`);
 *   3. constant-time signature comparison, a bounded body read, and a replay
 *      window bound to whatever nonce or timestamp the real contract carries;
 *   4. idempotent, transition-validated application of the event, owned by
 *      T-80.
 */
export function POST() {
  // No body: an anonymous scanner learns nothing about what this path is or
  // whether it is merely switched off. The route inventory that describes it
  // is `docs/spec/18-SYSTEM-MAP.md`, not an HTTP response.
  return new Response(null, { status: 404 });
}
