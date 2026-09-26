import "server-only";

import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { RTS_STATUSES } from "@/db/rts-repository";
import {
  contacts,
  providerOrderSnapshots,
  shipmentCodTotals,
  shipmentDrafts,
  shipmentParties,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { paymentMethodOf, type PaymentMethod } from "@/lib/payment-method";
import type { ShipmentStatus } from "@/lib/shipment-queue";

/**
 * T-241 (spec 05 DATA contact attribution, spec 19 CON-SHP-*): what GeraiCUAN's own shipments say
 * about one contact. `shipment_parties` stores an immutable name/phone/address snapshot and no
 * contact id, so a shipment belongs to a contact when, **in the same tenant**, its party row of the
 * contact's list role (`SENDER` on Pengirim, `RECIPIENT` on Penerima) has the same national phone
 * number as the contact — digits only, a leading `62` or `0` dropped — the rule
 * `checkDuplicateShipment` already uses, so a `+62…` snapshot matches a `08…` contact. Two contacts
 * sharing a number read the same shipments. No provider data (D-30): no Mengantar score.
 */
export type ContactShipmentRole = "SENDER" | "RECIPIENT";

const nationalNumber = (column: SQL | typeof shipmentParties.phone | typeof contacts.phone) =>
  sql`regexp_replace(regexp_replace(${column}, '[^0-9]', '', 'g'), '^(62|0)', '')`;

/** The attribution join predicate: same tenant, the list's role, the same national number. */
function attributedTo(role: ContactShipmentRole) {
  return and(
    eq(shipmentParties.tenantId, contacts.tenantId),
    eq(shipmentParties.role, role),
    sql`${nationalNumber(shipmentParties.phone)} = ${nationalNumber(contacts.phone)}`,
  );
}

const shipmentOfParty = and(
  eq(shipments.id, shipmentParties.shipmentId),
  eq(shipments.tenantId, shipmentParties.tenantId),
);

const deliveredCount = sql<number>`count(*) filter (where ${shipments.status} = 'DELIVERED')::int`.mapWith(Number);

/**
 * CON-SHP-COUNT / CON-SHP-DELIVERED per contact for one list page (≤ 20 contacts).
 * lazy: the phone expression has no index, so this scans the tenant's party rows of one role;
 * add an expression index on the national number if a tenant's history makes the list slow.
 */
export async function loadContactShipmentCounts(
  tx: TenantTransaction,
  context: TenantContext,
  input: { contactIds: string[]; role: ContactShipmentRole },
) {
  if (input.contactIds.length === 0) return new Map<string, { deliveredCount: number; shipmentCount: number }>();
  const rows = await tx
    .select({
      contactId: contacts.id,
      deliveredCount,
      shipmentCount: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(contacts)
    .innerJoin(shipmentParties, attributedTo(input.role))
    .innerJoin(shipments, shipmentOfParty)
    .where(and(eq(contacts.tenantId, context.tenantId), inArray(contacts.id, input.contactIds)))
    .groupBy(contacts.id);
  return new Map(rows.map(({ contactId, ...counts }) => [contactId, counts]));
}

export type ContactShipmentSummary = {
  /** CON-SHP-COD-COUNT: issued COD orders behind CON-SHP-COD-VALUE-IDR. */
  codOrderCount: number;
  /** CON-SHP-COD-VALUE-IDR: RPT-SHP-COD-VALUE-TOTAL's definition over this contact's shipments. */
  codValueIdr: number;
  deliveredCount: number;
  /** CON-SHP-LAST-30D: created in the 30 days before the read. */
  last30DaysCount: number;
  returnedCount: number;
  shipmentCount: number;
};

/** The four KPI cards on a contact detail, in one aggregate over the attributed shipments. */
export async function loadContactShipmentSummary(
  tx: TenantTransaction,
  context: TenantContext,
  input: { contactId: string; role: ContactShipmentRole },
): Promise<ContactShipmentSummary> {
  const [row] = await tx
    .select({
      codOrderCount: sql<number>`count(${shipmentCodTotals.shipmentId})::int`.mapWith(Number),
      codValueIdr: sql<number>`coalesce(sum(${shipmentCodTotals.providerCodAmountIdr}), 0)::bigint`.mapWith(Number),
      deliveredCount,
      last30DaysCount: sql<number>`count(*) filter (where ${shipments.createdAt} >= statement_timestamp() - interval '30 days')::int`.mapWith(Number),
      returnedCount: sql<number>`count(*) filter (where ${inArray(shipments.status, [...RTS_STATUSES])})::int`.mapWith(Number),
      shipmentCount: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(contacts)
    .innerJoin(shipmentParties, attributedTo(input.role))
    .innerJoin(shipments, shipmentOfParty)
    .leftJoin(
      providerOrderSnapshots,
      and(eq(providerOrderSnapshots.shipmentId, shipments.id), eq(providerOrderSnapshots.tenantId, shipments.tenantId)),
    )
    // Only an issued COD order is money a courier will collect (RPT-SHP-COD-VALUE-TOTAL's join).
    .leftJoin(
      shipmentCodTotals,
      and(
        eq(shipmentCodTotals.shipmentId, providerOrderSnapshots.shipmentId),
        eq(shipmentCodTotals.tenantId, providerOrderSnapshots.tenantId),
        eq(providerOrderSnapshots.isCod, true),
        eq(providerOrderSnapshots.status, "ISSUED"),
      ),
    )
    .where(and(eq(contacts.tenantId, context.tenantId), eq(contacts.id, input.contactId)));
  return row ?? { codOrderCount: 0, codValueIdr: 0, deliveredCount: 0, last30DaysCount: 0, returnedCount: 0, shipmentCount: 0 };
}

export type ContactHistoryPayment = "all" | "cod" | "noncod";

export const CONTACT_HISTORY_PAGE_SIZE = 10;

export type ContactHistoryRow = {
  awb: string | null;
  /** The other party: the recipient on a Pengirim, the sender on a Penerima. */
  counterpartName: string;
  createdAt: Date;
  declaredValueIdr: number;
  destinationAreaLabel: string;
  paymentMethod: PaymentMethod;
  providerCodAmountIdr: number | null;
  providerService: string | null;
  publicReference: string;
  shipmentId: string;
  status: ShipmentStatus;
};

export type ContactHistoryPage = {
  counts: Record<ContactHistoryPayment, number>;
  page: number;
  rows: ContactHistoryRow[];
  totalPages: number;
};

/**
 * The contact's shipment history, newest first, 10 per page. Tabs split on the draft's `is_cod`
 * (SHP-COD's basis: COD Ongkir is COD); the tab counts share the page's attribution and tenant scope.
 */
export async function loadContactShipmentHistory(
  tx: TenantTransaction,
  context: TenantContext,
  input: { contactId: string; page: number; payment: ContactHistoryPayment; role: ContactShipmentRole },
): Promise<ContactHistoryPage> {
  const base = and(eq(contacts.tenantId, context.tenantId), eq(contacts.id, input.contactId));
  const [countRow] = await tx
    .select({
      all: sql<number>`count(*)::int`.mapWith(Number),
      cod: sql<number>`count(*) filter (where ${shipmentDrafts.isCod})::int`.mapWith(Number),
    })
    .from(contacts)
    .innerJoin(shipmentParties, attributedTo(input.role))
    .innerJoin(shipments, shipmentOfParty)
    .innerJoin(shipmentDrafts, and(eq(shipmentDrafts.shipmentId, shipments.id), eq(shipmentDrafts.tenantId, shipments.tenantId)))
    .where(base);
  const counts = { all: countRow?.all ?? 0, cod: countRow?.cod ?? 0, noncod: (countRow?.all ?? 0) - (countRow?.cod ?? 0) };
  const totalPages = Math.max(1, Math.ceil(counts[input.payment] / CONTACT_HISTORY_PAGE_SIZE));
  const page = Math.min(input.page, totalPages);
  if (counts[input.payment] === 0) return { counts, page: 1, rows: [], totalPages };

  const counterpart = alias(shipmentParties, "counterpart");
  const rows = await tx
    .select({
      awb: providerOrderSnapshots.cnoteNo,
      codShippingOnly: shipmentDrafts.codShippingOnly,
      counterpartName: counterpart.name,
      createdAt: shipments.createdAt,
      declaredValueIdr: shipmentDrafts.declaredValueIdr,
      destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
      isCod: shipmentDrafts.isCod,
      providerCodAmountIdr: providerOrderSnapshots.providerCodAmountIdr,
      providerService: providerOrderSnapshots.providerService,
      publicReference: shipments.publicReference,
      shipmentId: shipments.id,
      status: shipments.status,
    })
    .from(contacts)
    .innerJoin(shipmentParties, attributedTo(input.role))
    .innerJoin(shipments, shipmentOfParty)
    .innerJoin(shipmentDrafts, and(eq(shipmentDrafts.shipmentId, shipments.id), eq(shipmentDrafts.tenantId, shipments.tenantId)))
    .innerJoin(
      counterpart,
      and(
        eq(counterpart.shipmentId, shipments.id),
        eq(counterpart.tenantId, shipments.tenantId),
        eq(counterpart.role, input.role === "SENDER" ? "RECIPIENT" : "SENDER"),
      ),
    )
    .leftJoin(
      providerOrderSnapshots,
      and(eq(providerOrderSnapshots.shipmentId, shipments.id), eq(providerOrderSnapshots.tenantId, shipments.tenantId)),
    )
    .where(and(
      base,
      input.payment === "all" ? undefined : eq(shipmentDrafts.isCod, input.payment === "cod"),
    ))
    .orderBy(desc(shipments.createdAt), desc(shipments.id))
    .limit(CONTACT_HISTORY_PAGE_SIZE)
    .offset((page - 1) * CONTACT_HISTORY_PAGE_SIZE);

  return {
    counts,
    page,
    rows: rows.map(({ codShippingOnly, isCod, ...row }) => ({ ...row, paymentMethod: paymentMethodOf(isCod, codShippingOnly) })),
    totalPages,
  };
}
