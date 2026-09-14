import type { PrintableLabel } from "@/db/label-print-repository";
import {
  formatDimensions,
  formatIdr,
  formatWeight,
  formatWibDateTime,
  recipientDensity,
} from "@/lib/label-format";
import { shipmentReference } from "@/lib/shipment-reference";

export function LabelSheet({ label }: { label: PrintableLabel }) {
  const recipientLayout = recipientDensity({
    nameLength: label.recipient.name.length,
    addressLength: label.recipient.address.length,
    areaLabelLength: label.destinationAreaLabel.length,
  });
  const senderLayout = recipientDensity({
    nameLength: label.sender.name.length,
    addressLength: label.sender.address.length,
    areaLabelLength: 0,
  });
  const dimensions = formatDimensions(
    label.package.lengthCm,
    label.package.widthCm,
    label.package.heightCm,
  );

  return (
    <article className="label-sheet" aria-label="Label 100 × 150 mm">
      <div className="label-head">
        <div>
          <p className="label-courier">{label.courier}</p>
          <p className="label-service">{label.providerService}</p>
        </div>
        <p className="label-mark">GeraiCUAN</p>
      </div>

      <div>
        <p className="label-eyebrow">No. resi (AWB) Mengantar</p>
        <p className="label-awb">{label.awb}</p>
      </div>

      <div className="label-party" data-density={recipientLayout.tier}>
        <p className="label-eyebrow">Penerima</p>
        <p className="label-party-name">{label.recipient.name}</p>
        <p className="label-party-phone">{label.recipient.phone}</p>
        <p className="label-party-address">{label.recipient.address}</p>
        {recipientLayout.omitAreaLine ? null : (
          <p className="label-party-address">{label.destinationAreaLabel}</p>
        )}
      </div>

      <div
        className="label-party label-sender"
        data-density={senderLayout.tier}
      >
        <p className="label-eyebrow">Pengirim</p>
        <p className="label-party-name">{label.sender.name}</p>
        <p className="label-party-phone">{label.sender.phone}</p>
        <p className="label-party-address">{label.sender.address}</p>
      </div>

      <div>
        <p className="label-eyebrow">Paket</p>
        <dl className="label-facts">
          <div className="label-facts-wide">
            <dt>Isi</dt>
            <dd className="label-facts-wrap">{label.package.content}</dd>
          </div>
          <div>
            <dt>Berat</dt>
            <dd>
              {formatWeight(label.package.weightGrams)} · {label.package.quantity} koli
            </dd>
          </div>
          <div>
            <dt>Dimensi</dt>
            <dd>{dimensions ?? "Tidak dicatat"}</dd>
          </div>
          <div>
            <dt>Nilai</dt>
            <dd>{formatIdr(label.package.declaredValueIdr)}</dd>
          </div>
          <div>
            <dt>Asuransi</dt>
            <dd>
              {label.insuranceAmountIdr === null
                ? "Tidak ada"
                : formatIdr(label.insuranceAmountIdr)}
            </dd>
          </div>
        </dl>
      </div>

      <div>
        {label.isCod ? (
          <>
            <div className="label-payment">
              <span>COD — TAGIH KE PENERIMA</span>
              <b>{formatIdr(label.providerCodAmountIdr as number)}</b>
            </div>
            {label.codBreakdown ? (
              <div className="label-money">
                <div>
                  <span>Nilai barang</span>
                  <span>{formatIdr(label.codBreakdown.goodsValueIdr)}</span>
                </div>
                <div>
                  <span>Ongkir penyedia</span>
                  <span>{formatIdr(label.codBreakdown.shippingAmountIdr)}</span>
                </div>
                <div>
                  <span>Biaya layanan COD</span>
                  <span>{formatIdr(label.codBreakdown.serviceFeeIdr)}</span>
                </div>
                <div>
                  <span>PPN</span>
                  <span>{formatIdr(label.codBreakdown.vatAmountIdr)}</span>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="label-payment">
              <span>NON-COD — JANGAN TAGIH PENERIMA</span>
            </div>
            <div className="label-money">
              <div>
                <span>Ongkir penyedia</span>
                <span>{formatIdr(label.shippingAmountIdr)}</span>
              </div>
              <div>
                <span>Asuransi</span>
                <span>
                  {label.insuranceAmountIdr === null
                    ? "Tidak ada"
                    : formatIdr(label.insuranceAmountIdr)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="label-footer">
        <p>
          Kiriman {shipmentReference(label.shipmentId)} · Terbit{" "}
          {formatWibDateTime(label.issuedAt)}
          <br />
          Nilai ongkir/asuransi berasal dari Mengantar
        </p>
      </div>
    </article>
  );
}
