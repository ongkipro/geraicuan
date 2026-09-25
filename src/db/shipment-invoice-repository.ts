import "server-only";


import { and, eq, inArray, sql } from "drizzle-orm";

import {
  outletPickupPoints,
  outlets,
  providerBatches,
  providerOrderSnapshots,
  shipmentDrafts,
  shipmentEstimateServices,
  shipmentInvoices,
  shipmentParties,
  shipments,
  tenants,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { formatDistrictCity } from "@/lib/label-format";
import { deliveryEstimateLabel, serviceDisplayName } from "@/lib/labels/courier";
import { courierDisplayName } from "@/lib/mengantar-couriers";
import { geraiAddress, parseProductRows } from "@/lib/shipment-draft-logic";

/**
 * DATA-14 `document`: every business field the nota renders, frozen at issuance
 * (PR-77). A reprint reads this and the money columns only — never `tenants`,
 * `contacts` or `shipment_drafts` again.
 */
export type ShipmentInvoiceDocument = {
  gerai: { name: string; whatsapp: string | null; address: string };
  resi: string;
  /** "JNE REG": the courier and its service, as the label heads them. */
  courierService: string;
  /**
   * The label's sender line after masking (PR-71), as stored on the shipment:
   * `city` is the typed "Kota / asal pengirim" under masking, else the gerai's
   * pickup address — exactly what the label prints.
   */
  sender: { name: string; phone: string; city: string };
  /** Privacy minimum: no full address or phone on a document handed out. */
  recipient: { name: string; city: string };
  items: { name: string; quantity: number }[];
  weightGrams: number;
  deliveryEstimate: string;
};

export type ShipmentInvoice = {
  id: string;
  shipmentId: string;
  invoiceNumber: string;
  issuedAt: Date;
  issuedByUserId: string;
  templateVersion: number;
  document: ShipmentInvoiceDocument;
  shippingChargeIdr: number;
  insuranceIdr: number;
  totalIdr: number;
  collectionMode: "NON_COD" | "COD_SHIPPING_ONLY" | "COD";
  courierCollectionIdr: number | null;
  declaredValueIdr: number;
};

export type IssueShipmentInvoiceResult =
  | { ok: true; invoice: ShipmentInvoice }
  | { ok: false; code: "NOT_ISSUED" | "NOT_FOUND" };

const MAX_INVOICE_ITEMS = 20;

/** "JNE REG" under a "JNE" heading reads twice; the same rule as the label sheet. */
export function courierServiceName(courier: string, service: string) {
  // "lion" → "Lion Parcel", "jne REG" → "JNE Reg"; a bare variant gets its courier's name.
  const shown = serviceDisplayName(service);
  const courierName = courierDisplayName(courier);
  return shown.toUpperCase().includes(courierName.toUpperCase()) ? shown : `${courierName} ${shown}`;
}

/**
 * The draft's product rows as the nota lists them, at most 20 lines: a longer
 * list keeps 19 and rolls the rest into one counted line, so no quantity is lost.
 */
function invoiceItems(packageContent: string, packageQuantity: number) {
  const rows = parseProductRows(packageContent, String(packageQuantity))
    .map((row) => ({ name: row.name, quantity: Number(row.quantity) }));
  if (rows.length <= MAX_INVOICE_ITEMS) return rows;
  const rest = rows.slice(MAX_INVOICE_ITEMS - 1);
  return [
    ...rows.slice(0, MAX_INVOICE_ITEMS - 1),
    {
      name: `${rest.length} produk lainnya`,
      quantity: rest.reduce((sum, row) => sum + row.quantity, 0),
    },
  ];
}

export async function loadShipmentInvoice(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<ShipmentInvoice | null> {
  const [row] = await tx
    .select({
      id: shipmentInvoices.id,
      shipmentId: shipmentInvoices.shipmentId,
      invoiceNumber: shipmentInvoices.invoiceNumber,
      issuedAt: shipmentInvoices.issuedAt,
      issuedByUserId: shipmentInvoices.issuedByUserId,
      templateVersion: shipmentInvoices.templateVersion,
      document: shipmentInvoices.document,
      shippingChargeIdr: shipmentInvoices.shippingChargeIdr,
      insuranceIdr: shipmentInvoices.insuranceIdr,
      totalIdr: shipmentInvoices.totalIdr,
      collectionMode: shipmentInvoices.collectionMode,
      courierCollectionIdr: shipmentInvoices.courierCollectionIdr,
      declaredValueIdr: shipmentInvoices.declaredValueIdr,
    })
    .from(shipmentInvoices)
    .where(
      and(
        eq(shipmentInvoices.tenantId, context.tenantId),
        eq(shipmentInvoices.shipmentId, shipmentId),
      ),
    )
    .limit(1);
  return row
    ? { ...row, document: row.document as ShipmentInvoiceDocument }
    : null;
}

/**
 * PR-76: at most one invoice per shipment, only once the provider issued a
 * resi. The insert is one `INSERT … SELECT … WHERE cnote_no IS NOT NULL
 * ON CONFLICT (shipment_id) DO NOTHING`, so a repeated or concurrent request
 * returns the invoice that won; the money columns and the resi come from the
 * provider snapshot inside that statement. No provider call is made.
 */
export async function issueShipmentInvoice(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<IssueShipmentInvoiceResult> {
  const existing = await loadShipmentInvoice(tx, context, shipmentId);
  if (existing) return { ok: true, invoice: existing };

  const [source] = await tx
    .select({
      geraiName: tenants.name,
      geraiWhatsapp: tenants.contactWhatsapp,
      outletPickupLabel: outlets.defaultPickupAddressLabel,
      pickupAddressId: shipmentDrafts.pickupAddressId,
      outletId: shipments.outletId,
      packageContent: shipmentDrafts.packageContent,
      packageQuantity: shipmentDrafts.packageQuantity,
      weightGrams: shipmentDrafts.packageWeightGrams,
      cnoteNo: providerOrderSnapshots.cnoteNo,
      providerService: providerOrderSnapshots.providerService,
      courier: providerBatches.courier,
      deliveryEstimate: shipmentEstimateServices.deliveryEstimate,
    })
    .from(shipments)
    .innerJoin(tenants, eq(tenants.id, shipments.tenantId))
    .innerJoin(
      outlets,
      and(eq(outlets.id, shipments.outletId), eq(outlets.tenantId, shipments.tenantId)),
    )
    .leftJoin(
      shipmentDrafts,
      and(
        eq(shipmentDrafts.shipmentId, shipments.id),
        eq(shipmentDrafts.tenantId, shipments.tenantId),
      ),
    )
    .leftJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .leftJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .leftJoin(
      shipmentEstimateServices,
      and(
        eq(shipmentEstimateServices.id, providerOrderSnapshots.estimateServiceId),
        eq(shipmentEstimateServices.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(and(eq(shipments.id, shipmentId), eq(shipments.tenantId, context.tenantId)))
    .limit(1);

  if (!source) return { ok: false, code: "NOT_FOUND" };
  const resi = source.cnoteNo?.trim();
  if (
    !resi ||
    source.packageContent === null ||
    source.packageQuantity === null ||
    source.weightGrams === null ||
    source.courier === null ||
    source.providerService === null ||
    source.deliveryEstimate === null
  ) {
    return { ok: false, code: "NOT_ISSUED" };
  }

  const parties = await tx
    .select({
      role: shipmentParties.role,
      name: shipmentParties.name,
      phone: shipmentParties.phone,
      address: shipmentParties.address,
      areaLabel: shipmentParties.destinationAreaLabel,
    })
    .from(shipmentParties)
    .where(
      and(
        eq(shipmentParties.tenantId, context.tenantId),
        eq(shipmentParties.shipmentId, shipmentId),
        inArray(shipmentParties.role, ["SENDER", "RECIPIENT"]),
      ),
    );
  const sender = parties.find((party) => party.role === "SENDER");
  const recipient = parties.find((party) => party.role === "RECIPIENT");
  if (!sender || !recipient?.areaLabel) return { ok: false, code: "NOT_ISSUED" };

  // The pickup point this shipment was drafted from; a pre-T-157 draft has
  // none and falls back to the outlet's default, as estimate and submit do.
  const [point] = source.pickupAddressId
    ? await tx
      .select({ pickupAddressLabel: outletPickupPoints.pickupAddressLabel })
      .from(outletPickupPoints)
      .where(
        and(
          eq(outletPickupPoints.tenantId, context.tenantId),
          eq(outletPickupPoints.outletId, source.outletId),
          eq(outletPickupPoints.pickupAddressId, source.pickupAddressId),
        ),
      )
      .limit(1)
    : [];
  const pickupLabel = point?.pickupAddressLabel ?? source.outletPickupLabel;

  const document: ShipmentInvoiceDocument = {
    gerai: {
      name: source.geraiName,
      whatsapp: source.geraiWhatsapp,
      address: geraiAddress(pickupLabel ? { pickupAddressLabel: pickupLabel } : null),
    },
    resi,
    courierService: courierServiceName(source.courier, source.providerService),
    sender: { name: sender.name, phone: sender.phone, city: sender.address },
    recipient: { name: recipient.name, city: formatDistrictCity(recipient.areaLabel) },
    items: invoiceItems(source.packageContent, source.packageQuantity),
    weightGrams: source.weightGrams,
    deliveryEstimate: deliveryEstimateLabel(source.deliveryEstimate),
  };

  // The resi is re-read from the snapshot in the statement itself, so the
  // document can never carry a resi the provider snapshot does not.
  await tx.execute(sql`
    INSERT INTO ${shipmentInvoices} (
      tenant_id, shipment_id, provider_order_snapshot_id, invoice_number,
      issued_by_user_id, document, shipping_charge_idr, insurance_idr, total_idr,
      collection_mode, courier_collection_idr, declared_value_idr
    )
    SELECT
      s.tenant_id,
      s.id,
      pos.id,
      'INV-' || s.public_reference,
      ${context.userId},
      jsonb_set(${JSON.stringify(document)}::jsonb, '{resi}', to_jsonb(btrim(pos.cnote_no))),
      -- COD Ongkir: the recipient pays the courier the charge the gerai set, which is
      -- the shipping the customer is charged; the list price would contradict it.
      CASE WHEN d.cod_shipping_only THEN pos.provider_cod_amount_idr ELSE pos.shipping_amount_idr END,
      CASE WHEN d.cod_shipping_only THEN 0 ELSE coalesce(pos.insurance_amount_idr, 0) END,
      CASE WHEN d.cod_shipping_only THEN pos.provider_cod_amount_idr
        ELSE pos.shipping_amount_idr + coalesce(pos.insurance_amount_idr, 0) END,
      CASE
        WHEN NOT pos.is_cod THEN 'NON_COD'
        WHEN d.cod_shipping_only THEN 'COD_SHIPPING_ONLY'
        ELSE 'COD'
      END,
      pos.provider_cod_amount_idr,
      d.declared_value_idr
    FROM ${shipments} s
    JOIN ${providerOrderSnapshots} pos
      ON pos.shipment_id = s.id AND pos.tenant_id = s.tenant_id
    JOIN ${shipmentDrafts} d
      ON d.shipment_id = s.id AND d.tenant_id = s.tenant_id
    WHERE s.id = ${shipmentId}
      AND s.tenant_id = ${context.tenantId}
      AND pos.cnote_no IS NOT NULL
      AND d.is_cod = pos.is_cod
    ON CONFLICT (shipment_id) DO NOTHING
  `);

  const invoice = await loadShipmentInvoice(tx, context, shipmentId);
  return invoice ? { ok: true, invoice } : { ok: false, code: "NOT_ISSUED" };
}
