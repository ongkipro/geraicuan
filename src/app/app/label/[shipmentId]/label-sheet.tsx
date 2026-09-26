"use client";

import { useContext } from "react";

import { LabelBarcode } from "@/app/app/label/[shipmentId]/label-barcode";
import { HandoverTime, LabelPrintContext, LabelSheetFrame } from "@/app/app/label/[shipmentId]/label-print-context";
import type { PrintableLabel } from "@/db/label-print-repository";
import {
  DEFAULT_LABEL_FIELDS_BY_SIZE,
  formatCityProvince,
  RETURN_WARNING_TEXT,
  type LabelFields,
  type LabelFieldsBySize,
} from "@/lib/label-fields";
import {
  formatDimensions,
  formatDistrictCity,
  formatIdr,
  formatWeight,
  formatWibDateTime,
  recipientDensity,
} from "@/lib/label-format";
import { THERMAL } from "@/lib/label-size";

/** "JNE REG" under a "JNE" heading reads twice; print the service alone when it repeats the courier. */
function serviceName(courier: string, service: string) {
  return service.toUpperCase().startsWith(`${courier.toUpperCase()} `) ? service.slice(courier.length + 1) : service;
}

/**
 * T-176 thermal sheet: a 10 × 10 cm package label for the courier and, at 10 × 15 cm,
 * a 10 × 5 cm stub the operator cuts off and hands to the sender.
 *
 * T-229 / PR-86: `fields` is the gerai's saved choice per size (Pengaturan → Informasi
 * label); the size comes from the print context, so switching size in the preview
 * applies that size's choice. Without it the sheet prints the defaults, which are the
 * label as it was before T-229. Geometry is unchanged: hidden text leaves its row.
 */
export function LabelSheet({ fields, label }: { fields?: LabelFieldsBySize; label: PrintableLabel }) {
  const { size } = useContext(LabelPrintContext);
  const shown = (fields ?? DEFAULT_LABEL_FIELDS_BY_SIZE)[size];
  return (
    <LabelSheetFrame stub={<LabelSenderStub label={label} />}>
      <LabelPackage label={label} shown={shown} />
    </LabelSheetFrame>
  );
}

function LabelPackage({ label, shown }: { label: PrintableLabel; shown: LabelFields }) {
  const cityProvince = shown.recipientAddressDetail ? null : formatCityProvince(label.destinationAreaLabel);
  // Density follows what prints, so hidden fields let the rest print larger.
  const recipientLayout = recipientDensity({
    nameLength: shown.recipientName ? label.recipient.name.length : 0,
    addressLength: cityProvince === null ? label.recipient.address.length : 0,
    areaLabelLength: cityProvince === null ? label.destinationAreaLabel.length : cityProvince.length,
  });
  const dimensions = formatDimensions(label.package.lengthCm, label.package.widthCm, label.package.heightCm);
  const insurance = label.insuranceAmountIdr === null ? "Tidak ada" : formatIdr(label.insuranceAmountIdr);

  return (
    <section aria-label="Label paket 10 × 10 cm" className="label-package">
      <div className="label-head">
        <p className="label-courier">
          {label.courier} <span className="label-service">{serviceName(label.courier, label.providerService)}</span>
        </p>
        <p className="label-mark">GeraiCUAN</p>
      </div>

      <div className="label-awb-block">
        <LabelBarcode heightMm={THERMAL.packageBarHeightMm} value={label.awb} />
        <p className="label-awb"><span className="label-eyebrow">Resi</span> {label.awb}</p>
      </div>

      <div className="label-party label-recipient" data-density={recipientLayout.tier}>
        <p className="label-party-line">
          <span className="label-eyebrow">Penerima</span>
          {shown.recipientName ? <>{" "}<span className="label-party-name">{label.recipient.name}</span></> : null}
          {shown.recipientPhone ? <>{" "}<span className="label-party-phone">{label.recipient.phone}</span></> : null}
        </p>
        {cityProvince !== null ? (
          <p className="label-party-area">{cityProvince}</p>
        ) : (
          <>
            {recipientLayout.omitAreaLine ? null : (
              <p className="label-party-area">{label.destinationAreaLabel}</p>
            )}
            <p className="label-party-address">{label.recipient.address}</p>
          </>
        )}
      </div>

      <div className="label-party label-sender">
        <p className="label-sender-line">
          <span className="label-eyebrow">Pengirim</span>{" "}
          <span className="label-party-name">{label.sender.name}</span>
          {shown.senderPhone ? <>{" "}<span className="label-party-phone">{label.sender.phone}</span></> : null}
          {shown.senderAddress ? <>{" · "}<span className="label-party-address">{label.sender.address}</span></> : null}
        </p>
      </div>

      <div className="label-payment-block">
        {label.paymentMethod === "COD_ONGKIR" ? (
          <>
            <div className="label-payment">
              <span>COD ONGKIR — TAGIH ONGKIR SAJA</span>
              <b>{formatIdr(label.providerCodAmountIdr as number)}</b>
            </div>
            <div className="label-money">
              <div><span>Barang sudah dibayar</span><span>JANGAN DITAGIH</span></div>
            </div>
          </>
        ) : label.isCod ? (
          <>
            <div className="label-payment">
              <span>COD — TAGIH KE PENERIMA</span>
              <b>{formatIdr(label.providerCodAmountIdr as number)}</b>
            </div>
            {label.codBreakdown ? (
              <div className="label-money">
                <div><span>Nilai barang</span><span>{formatIdr(label.codBreakdown.goodsValueIdr)}</span></div>
                <div><span>Ongkir Mengantar</span><span>{formatIdr(label.codBreakdown.shippingAmountIdr)}</span></div>
                {/* T-193: one Biaya COD — the fee Mengantar keeps, VAT inside it —
                    and the round-up, so the lines add up to the amount above. */}
                <div><span>Biaya COD (termasuk PPN)</span><span>{formatIdr(label.codBreakdown.codFeeIdr)}</span></div>
                {label.codBreakdown.roundingIdr > 0 ? (
                  <div><span>Pembulatan</span><span>{formatIdr(label.codBreakdown.roundingIdr)}</span></div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="label-payment">
              <span>NON-COD — JANGAN TAGIH PENERIMA</span>
            </div>
            <div className="label-money">
              <div><span>Ongkir Mengantar</span><span>{formatIdr(label.shippingAmountIdr)}</span></div>
            </div>
          </>
        )}
      </div>

      <dl className="label-facts">
        <div className="label-facts-wide"><dt>Isi</dt><dd>{label.package.content}</dd></div>
        <div><dt>Berat</dt><dd>{formatWeight(label.package.weightGrams)} · {label.package.quantity} koli</dd></div>
        <div><dt>Dimensi</dt><dd>{dimensions ?? "Tidak dicatat"}</dd></div>
        <div>
          <dt>{label.paymentMethod === "COD_ONGKIR" ? "Nilai (lunas)" : "Nilai"}</dt>
          <dd>{formatIdr(label.package.declaredValueIdr)}</dd>
        </div>
        <div><dt>Asuransi Mengantar</dt><dd>{insurance}</dd></div>
      </dl>

      <div className="label-footer">
        {shown.returnWarning ? (
          // The footer row stays one 7 pt line: the warning takes the issue time's place.
          <p><b className="label-footer-warning">{RETURN_WARNING_TEXT}</b> · Nomor kiriman {label.publicReference}</p>
        ) : (
          <p>
            Nomor kiriman {label.publicReference} · Terbit {formatWibDateTime(label.issuedAt)}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * The stub leaves the building with the sender, so it carries what proves and traces
 * the handover and nothing that only the parcel needs: no recipient name, street
 * address or phone, no sender contact, no package value and no COD breakdown.
 */
function LabelSenderStub({ label }: { label: PrintableLabel }) {
  return (
    <section aria-label="Bukti serah terima pengirim 10 × 5 cm" className="label-stub">
      <div className="label-stub-head">
        <p className="label-stub-title">Bukti serah terima · untuk pengirim</p>
        <p className="label-stub-outlet">{label.outletName}</p>
      </div>
      <div className="label-stub-service">
        <p className="label-courier">
          {label.courier} <span className="label-service">{serviceName(label.courier, label.providerService)}</span>
        </p>
        <p className="label-stub-payment">
          {label.paymentMethod === "COD_ONGKIR"
            ? <>COD ONGKIR <b>{formatIdr(label.providerCodAmountIdr as number)}</b></>
            : label.isCod ? <>COD <b>{formatIdr(label.providerCodAmountIdr as number)}</b></> : "NON-COD"}
        </p>
      </div>
      <div className="label-awb-block">
        <LabelBarcode heightMm={THERMAL.stubBarHeightMm} value={label.awb} />
        <p className="label-awb"><span className="label-eyebrow">Resi</span> {label.awb}</p>
      </div>
      <dl className="label-stub-facts">
        <div><dt>No. kiriman</dt><dd>{label.publicReference}</dd></div>
        <div><dt>Tujuan</dt><dd>{formatDistrictCity(label.destinationAreaLabel)}</dd></div>
        <div><dt>Diserahkan</dt><dd><HandoverTime /></dd></div>
      </dl>
    </section>
  );
}
