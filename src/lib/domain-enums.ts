/**
 * Domain literals shared by the server and the browser, with no dependency on
 * the database schema.
 *
 * These live apart from `@/db/schema` because `src/lib/shipment-queue.ts` needs
 * them at runtime and is imported by a client component. A value import from
 * the schema drags the entire Drizzle table graph — every table, column and
 * constraint — into the browser bundle. Nothing here imports `drizzle-orm`, so
 * nothing here can.
 *
 * `src/db/schema.ts` re-exports both names, so server code may keep importing
 * them from wherever reads better.
 */
export const shipmentStatuses = [
  "DRAFT",
  "ESTIMATED",
  "SUBMISSION_QUEUED",
  "SUBMISSION_UNKNOWN",
  "ISSUED",
  "AWAITING_UPSTREAM_PAYMENT",
  "FAILED",
  "RTS_QUEUED",
  "RTS_IN_TRANSIT",
  "RTS_RECEIVED",
  "IN_TRANSIT",
  "DELIVERED",
  "PROBLEM",
] as const;

export const membershipRoles = ["TENANT_ADMIN", "OPERATOR"] as const;
