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

      <section className="invoice-block-money">
        <p className="invoice-row"><span>Ongkir</span><span>{formatIdr(invoice.shippingChargeIdr)}</span></p>
        {invoice.insuranceIdr > 0 ? (
          <p className="invoice-row"><span>Asuransi</span><span>{formatIdr(invoice.insuranceIdr)}</span></p>
        ) : null}
        <p className="invoice-row invoice-total"><span>Total ongkir</span><span>{formatIdr(invoice.totalIdr)}</span></p>
        <p className="invoice-note">Pembayaran: {invoiceCollectionLine(invoice)}</p>
        <p>Nilai barang (informasi): {formatIdr(invoice.declaredValueIdr)}</p>
      </section>

      <section className="invoice-footer">
        <p>Nota ini bukan bukti pembayaran.</p>
      </section>
    </article>
  );
}
