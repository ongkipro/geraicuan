import type { ShipmentInvoice } from "@/db/shipment-invoice-repository";
import { geraiLogoVersionSrc } from "@/lib/gerai-settings";
import { formatIdr, formatWeight, formatWibDateTime } from "@/lib/label-format";

export type InvoiceMedium = "80mm" | "a4";

export const INVOICE_MEDIA: Record<InvoiceMedium, { name: string; description: string }> = {
  "80mm": { description: "Kertas termal roll, lebar cetak 72 mm.", name: "Thermal 80 mm" },
  a4: { description: "Kertas A4, dua kolom.", name: "A4" },
};

export const DEFAULT_INVOICE_MEDIUM: InvoiceMedium = "80mm";

/** At most five item lines on the nota (spec 17 UX-v3.9); the rest are counted. */
const VISIBLE_ITEMS = 5;

/**
 * PR-78: the courier instruction, never a paid/unpaid statement. COD amounts are what
 * the courier collects, apart from Total ongkir.
 */
export function invoiceCollectionLine(invoice: Pick<ShipmentInvoice, "collectionMode" | "courierCollectionIdr">) {
  if (invoice.collectionMode === "NON_COD" || invoice.courierCollectionIdr === null) return "Non-COD — dibayar di gerai";
  const amount = formatIdr(invoice.courierCollectionIdr);
  return invoice.collectionMode === "COD_SHIPPING_ONLY"
    ? `COD ongkir — ditagih kurir: ${amount}`
    : `COD — ditagih kurir ke penerima: ${amount}`;
}

/**
 * T-271 (owner 2026-10-01, D-40): the money lines of a template version 2 nota, derived only from
 * the invoice's stored immutable columns. The customer must not be able to derive the gerai's
 * Biaya COD + Pembulatan, so a COD nota prints the customer-facing split of what the courier
 * collects — Nilai barang + Ongkir, where Ongkir = collected − Nilai barang (CUSTOMER-ONGKIR-IDR) —
 * and never the quote's list price beside the collection. COD Ongkir: the whole charge is Ongkir.
 * Non-COD: the version 1 lines. Insurance is not collected from a COD recipient, so a COD nota
 * leaves it out. Null for Non-COD, which renders the version 1 lines.
 */
export function invoiceV2CodLines(
  invoice: Pick<ShipmentInvoice, "collectionMode" | "courierCollectionIdr" | "declaredValueIdr">,
): { goodsValueIdr: number | null; ongkirIdr: number | null; totalIdr: number } | null {
  if (invoice.collectionMode === "NON_COD" || invoice.courierCollectionIdr === null) return null;
  const collected = invoice.courierCollectionIdr;
  if (invoice.collectionMode === "COD_SHIPPING_ONLY") return { goodsValueIdr: null, ongkirIdr: collected, totalIdr: collected };
  // A collection below Nilai barang has no honest split (never expected: COD-TOTAL ≥ goods + ongkir).
  return collected >= invoice.declaredValueIdr
    ? { goodsValueIdr: invoice.declaredValueIdr, ongkirIdr: collected - invoice.declaredValueIdr, totalIdr: collected }
    : { goodsValueIdr: null, ongkirIdr: null, totalIdr: collected };
}

function InvoiceMoneyV2Cod({ invoice, lines }: { invoice: ShipmentInvoice; lines: NonNullable<ReturnType<typeof invoiceV2CodLines>> }) {
  const shippingOnly = invoice.collectionMode === "COD_SHIPPING_ONLY";
  return (
    <section className="invoice-block-money">
      {lines.goodsValueIdr === null ? null : (
        <p className="invoice-row"><span>Nilai barang</span><span>{formatIdr(lines.goodsValueIdr)}</span></p>
      )}
      {lines.ongkirIdr === null ? null : (
        <p className="invoice-row"><span>Ongkir</span><span>{formatIdr(lines.ongkirIdr)}</span></p>
      )}
      <p className="invoice-row invoice-total">
        <span>{shippingOnly ? "Total ongkir" : "Total"}</span><span>{formatIdr(lines.totalIdr)}</span>
      </p>
      <p className="invoice-note">Pembayaran: {invoiceCollectionLine(invoice)}</p>
      {shippingOnly ? <p>Nilai barang (informasi): {formatIdr(invoice.declaredValueIdr)}</p> : null}
    </section>
  );
}

/**
 * The nota (PR-77, DATA-14): renders the stored `document` and money columns only, so a
 * reprint is the issued document unchanged. No paid/unpaid, payment method, QR, bank
 * or tax label (PR-78).
 */
export function InvoiceSheet({ invoice, medium }: { invoice: ShipmentInvoice; medium: InvoiceMedium }) {
  const { document: doc } = invoice;
  const items = doc.items.slice(0, VISIBLE_ITEMS);
  const hiddenItems = doc.items.length - items.length;
  // T-247 (L3): the logo version recorded at issuance, never the gerai's current logo.
  const logoSrc = geraiLogoVersionSrc(invoice.logoSha256);
  // T-271: a reprint renders the template version stored at issuance; version 1 is unchanged.
  const v2Lines = invoice.templateVersion >= 2 ? invoiceV2CodLines(invoice) : null;

  return (
    <article aria-label={`Invoice ${invoice.invoiceNumber}`} className="invoice-sheet" data-medium={medium}>
      <section className="invoice-block-gerai">
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin bytes; next/image would proxy them */}
        {logoSrc ? <img alt="" className="invoice-logo" src={logoSrc} /> : null}
        <p className="invoice-gerai-name">{doc.gerai.name}</p>
        {doc.gerai.whatsapp ? <p>WhatsApp {doc.gerai.whatsapp}</p> : null}
        {doc.gerai.address ? <p className="invoice-gerai-address">{doc.gerai.address}</p> : null}
      </section>

      <section className="invoice-block-head">
        <p className="invoice-title">INVOICE</p>
        <p className="invoice-mono">{invoice.invoiceNumber}</p>
        <p>{formatWibDateTime(invoice.issuedAt)}</p>
      </section>

      <section className="invoice-block-shipment">
        <p>Resi</p>
        <p className="invoice-resi">{doc.resi}</p>
        <p className="invoice-row"><span>Ekspedisi</span><span>{doc.courierService}</span></p>
        <p className="invoice-row"><span>Estimasi</span><span>{doc.deliveryEstimate}</span></p>
        <p className="invoice-row"><span>Pengirim</span><span>{doc.sender.name} · {doc.sender.phone}</span></p>
        <p className="invoice-row"><span>Penerima</span><span>{doc.recipient.name} · {doc.recipient.city}</span></p>
      </section>

      <section className="invoice-block-items">
        <p>Isi paket</p>
        <ul>
          {items.map((item, index) => (
            <li className="invoice-item" key={`${item.name}-${index}`}>
              <span>{item.name}</span>
              <span>{item.quantity}×</span>
            </li>
          ))}
          {hiddenItems > 0 ? <li>+{hiddenItems} lainnya</li> : null}
        </ul>
        <p className="invoice-row"><span>Berat</span><span>{formatWeight(doc.weightGrams)}</span></p>
      </section>

      {v2Lines ? <InvoiceMoneyV2Cod invoice={invoice} lines={v2Lines} /> : (
        <section className="invoice-block-money">
          <p className="invoice-row"><span>Ongkir</span><span>{formatIdr(invoice.shippingChargeIdr)}</span></p>
          {invoice.insuranceIdr > 0 ? (
            <p className="invoice-row"><span>Asuransi</span><span>{formatIdr(invoice.insuranceIdr)}</span></p>
          ) : null}
          <p className="invoice-row invoice-total"><span>Total ongkir</span><span>{formatIdr(invoice.totalIdr)}</span></p>
          <p className="invoice-note">Pembayaran: {invoiceCollectionLine(invoice)}</p>
          <p>Nilai barang (informasi): {formatIdr(invoice.declaredValueIdr)}</p>
        </section>
      )}

      <section className="invoice-footer">
        <p>Nota ini bukan bukti pembayaran.</p>
      </section>
    </article>
  );
}
