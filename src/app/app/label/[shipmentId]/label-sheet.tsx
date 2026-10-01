"use client";

import { useContext, useLayoutEffect, useRef, type CSSProperties } from "react";

import { useGeraiBrand } from "@/app/app/brand/gerai-brand";
import { courierPrintLogoSrc } from "@/lib/gerai-settings";
import { courierDisplayName } from "@/lib/mengantar-couriers";
import { LabelBarcode } from "@/app/app/label/[shipmentId]/label-barcode";
import { LabelPrintContext, LabelSheetFrame } from "@/app/app/label/[shipmentId]/label-print-context";
import type { PrintableLabel } from "@/db/label-print-repository";
import { MONEY_LABELS } from "@/lib/shipment-money";
import {
  DEFAULT_LABEL_FIELDS_BY_SIZE,
  formatCityProvince,
  RETURN_WARNING_TEXT,
  type LabelFields,
  type LabelFieldsBySize,
} from "@/lib/label-fields";
import {
  formatAddressArea,
  formatDimensions,
  formatDistrictCity,
  formatIdr,
  formatPhoneGroups,
  formatWeight,
  formatWibDateTime,
  recipientDensity,
} from "@/lib/label-format";
import { THERMAL } from "@/lib/label-size";

const DENSITY_TIERS = ["compact", "long", "dense", "ultra"] as const;
type DensityTier = (typeof DENSITY_TIERS)[number];
/** The street's line clamp at the "ultra" tier (label.css `--street-lines` default). */
const ULTRA_STREET_LINES = 7;
/** The patokan's line clamp before fitting (label.css `--landmark-lines` default). */
const LANDMARK_LINES = 2;

/** What the fitting ladder may change on the recipient block; the browser adapter is in `LabelPackage`. */
export type RecipientFitTarget = {
  overflowing: () => boolean;
  setTier: (tier: DensityTier) => void;
  /** null restores the stylesheet default. */
  setLandmarkLines: (lines: number | null) => void;
  setStreetLines: (lines: number | null) => void;
};

/**
 * T-255 / T-258: the long-address fitting ladder, run after layout while the recipient block
 * overflows. The patokan gives way first (down to one line with an ellipsis), then the type
 * steps down tier by tier, and last the street gives up lines. The kecamatan, kota, provinsi
 * and kode pos lines are never clamped, so they always print whole.
 */
export function fitRecipientBlock(target: RecipientFitTarget, estimate: DensityTier, hasLandmark: boolean) {
  let index = DENSITY_TIERS.indexOf(estimate);
  target.setTier(DENSITY_TIERS[index]);
  target.setLandmarkLines(null);
  target.setStreetLines(null);
  if (hasLandmark) {
    for (let lines = LANDMARK_LINES - 1; target.overflowing() && lines >= 1; lines -= 1) target.setLandmarkLines(lines);
  }
  while (target.overflowing() && index < DENSITY_TIERS.length - 1) target.setTier(DENSITY_TIERS[++index]);
  for (let lines = ULTRA_STREET_LINES - 1; target.overflowing() && lines >= 2; lines -= 1) target.setStreetLines(lines);
}

/**
 * "JNE REG" under a "JNE" heading reads twice; print the service alone when it repeats the courier,
 * and nothing when the service is only the courier again ("JT" under "JT").
 */
function serviceName(courier: string, service: string) {
  if (service.trim().toUpperCase() === courier.trim().toUpperCase()) return "";
  return service.toUpperCase().startsWith(`${courier.toUpperCase()} `) ? service.slice(courier.length + 1) : service;
}

/*
 * T-243: the gerai logo and the catatan resi. The logo sits in the 8 mm head row's own box
 * (at most 7 × 20 mm, grayscale for the thermal head); the catatan takes the sender origin's
 * second line (the origin clamps to one), so the sender block never grows (T-255).
 */
const BRAND_STYLE: CSSProperties = { alignSelf: "center", display: "flex", alignItems: "center", gap: "1.5mm", minWidth: 0 };
const LOGO_STYLE: CSSProperties = {
  display: "block", width: "auto", height: "auto", maxWidth: "20mm", maxHeight: "7mm", objectFit: "contain", filter: "grayscale(1) contrast(1.15)",
};
const COURIER_STYLE: CSSProperties = { alignSelf: "center", display: "flex", alignItems: "center", gap: "1.5mm", minWidth: 0 };
const COURIER_LOGO_STYLE: CSSProperties = { display: "block", width: "auto", height: "6.5mm", maxWidth: "40mm", flex: "none" };
const NOTE_STYLE: CSSProperties = {
  fontSize: "7pt", fontWeight: 600, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

/**
 * T-176 thermal sheet: a 10 × 10 cm package label for the courier and, at 10 × 15 cm,
 * a 10 × 5 cm stub the operator cuts off and hands to the sender.
 *
 * T-229 / PR-86: `fields` is the gerai's saved choice per size (Pengaturan → Informasi
 * label); the size comes from the print context, so switching size in the preview
 * applies that size's choice. Without it the sheet prints the defaults, which are the
 * label as it was before T-229. Geometry is unchanged: hidden text leaves its row.
 */
/**
 * R6-X (critique 2026-09-30T19-21-59Z #7, error prevention): the courier cannot deliver without the
 * recipient's name and phone, so they always print. A stored "off" (saved before this rule) is kept
 * as stored but ignored here, the one place every sheet — page, batch, settings preview — is drawn.
 */
export const LOCKED_LABEL_FIELDS = {
  recipientName: "Selalu tercetak: kurir butuh nama penerima untuk mengantar.",
  recipientPhone: "Selalu tercetak: kurir menghubungi nomor ini saat mengantar.",
} as const satisfies Partial<Record<keyof LabelFields, string>>;

export function LabelSheet({ fields, label }: { fields?: LabelFieldsBySize; label: PrintableLabel }) {
  const { size } = useContext(LabelPrintContext);
  const shown: LabelFields = { ...(fields ?? DEFAULT_LABEL_FIELDS_BY_SIZE)[size], recipientName: true, recipientPhone: true };
  const brand = useGeraiBrand();
  return (
    <LabelSheetFrame stub={<LabelSenderStub label={label} />}>
      <LabelPackage
        label={label}
        logoSrc={shown.geraiLogo ? brand.logoSrc : null}
        note={shown.labelNote ? brand.note : null}
        shown={shown}
      />
    </LabelSheetFrame>
  );
}

function LabelPackage({ label, logoSrc, note, shown }: {
  label: PrintableLabel;
  logoSrc: string | null;
  note: string | null;
  shown: LabelFields;
}) {
  const cityProvince = shown.recipientAddressDetail ? null : formatCityProvince(label.destinationAreaLabel);
  // Density follows what prints, so hidden fields let the rest print larger.
  const recipientLayout = recipientDensity({
    nameLength: shown.recipientName ? label.recipient.name.length : 0,
    addressLength: cityProvince === null ? label.recipient.address.length : 0,
    areaLabelLength: cityProvince === null ? label.destinationAreaLabel.length : cityProvince.length,
  });
  const recipientRef = useRef<HTMLDivElement>(null);
  const landmark = cityProvince === null ? label.recipient.landmark : null;
  // T-255: the tier is an estimate from character counts; after layout the ladder steps down
  // while the recipient block still overflows (a long name wraps, a long kelurahan wraps), so
  // the address never clips. Starts from the estimate each render, so freed room scales back up.
  useLayoutEffect(() => {
    const element = recipientRef.current;
    if (!element) return;
    const setLines = (property: string) => (lines: number | null) =>
      lines === null ? element.style.removeProperty(property) : element.style.setProperty(property, String(lines));
    const target: RecipientFitTarget = {
      overflowing: () => element.scrollHeight > element.clientHeight + 1,
      setTier: (tier) => { element.dataset.density = tier; },
      setLandmarkLines: setLines("--landmark-lines"),
      setStreetLines: setLines("--street-lines"),
    };
    const fit = () => fitRecipientBlock(target, recipientLayout.tier, Boolean(landmark));
    fit();
    void document.fonts?.ready.then(fit);
  });
  const area = formatAddressArea(label.destinationAreaLabel);
  // Past the 480-character tier the two area lines share one line, so the street keeps its room.
  const areaLines = recipientLayout.omitAreaLine ? [area.lines.join(", ")] : area.lines;
  const courierLogoSrc = shown.courierLogo ? courierPrintLogoSrc(label.courier) : null;
  const dimensions = formatDimensions(label.package.lengthCm, label.package.widthCm, label.package.heightCm);

  return (
    <section aria-label="Label paket 10 × 10 cm" className="label-package">
      <div className="label-head">
        {courierLogoSrc ? (
          <p className="label-courier" style={COURIER_STYLE}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static black-only print mark */}
            <img alt={courierDisplayName(label.courier)} className="label-courier-logo" src={courierLogoSrc} style={COURIER_LOGO_STYLE} />
            <span className="label-service">{serviceName(label.courier, label.providerService)}</span>
          </p>
        ) : (
          <p className="label-courier">
            {courierDisplayName(label.courier)} <span className="label-service">{serviceName(label.courier, label.providerService)}</span>
          </p>
        )}
        {logoSrc ? (
          <div className="label-brand" style={BRAND_STYLE}>
            <p className="label-mark">GeraiCUAN</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin bytes; must print as-is */}
            <img alt="Logo gerai" className="label-logo" src={logoSrc} style={LOGO_STYLE} />
          </div>
        ) : (
          <p className="label-mark">GeraiCUAN</p>
        )}
      </div>

      <div className="label-awb-block">
        <LabelBarcode fill heightMm={THERMAL.packageBarHeightMm} value={label.awb} />
        <p className="label-awb"><span className="label-eyebrow">Resi</span> {label.awb}</p>
      </div>

      {/* T-255: the recipient reads first — name, phone, then the address from street to
          province, the kode pos bold at the end of the last line. */}
      <div className="label-party label-recipient" data-density={recipientLayout.tier} ref={recipientRef}>
        <p className="label-recipient-id">
          <span className="label-eyebrow">Penerima</span>
          {/* Owner, 2026-09-27: name left, phone right on one line; a long name wraps, the phone never. */}
          <span className="label-recipient-line">
            {shown.recipientName ? <span className="label-party-name">{label.recipient.name}</span> : null}
            {shown.recipientPhone ? <>{" "}<span className="label-party-phone">{formatPhoneGroups(label.recipient.phone)}</span></> : null}
          </span>
        </p>
        {cityProvince !== null ? (
          <p className="label-party-area">{cityProvince}</p>
        ) : (
          <>
            <p className="label-party-address">{label.recipient.address}</p>
            {/* T-258: the patokan follows the address detail switch and prints only when stored. */}
            {landmark ? <p className="label-party-landmark"><b>Patokan:</b> {landmark}</p> : null}
            {areaLines.map((line, index) => {
              const last = index === areaLines.length - 1;
              return (
                <p className={last ? "label-party-area label-party-region" : "label-party-area"} key={index}>
                  <span>{line}</span>
                  {last && area.postalCode ? <>{" "}<b className="label-postal">{area.postalCode}</b></> : null}
                </p>
              );
            })}
            {areaLines.length === 0 && area.postalCode ? (
              <p className="label-party-area label-party-region"><b className="label-postal">{area.postalCode}</b></p>
            ) : null}
          </>
        )}
      </div>

      <div className="label-party label-sender">
        <p className="label-sender-line">
          <span className="label-eyebrow">Pengirim</span>{" "}
          <span className="label-party-name">{label.sender.name}</span>
          {shown.senderPhone ? <>{" · "}<span className="label-party-phone">{formatPhoneGroups(label.sender.phone)}</span></> : null}
        </p>
        {shown.senderAddress ? (
          <p className="label-sender-origin" style={note ? { WebkitLineClamp: 1 } : undefined}>{label.sender.address}</p>
        ) : null}
        {note ? <p className="label-note" style={NOTE_STYLE}>{note}</p> : null}
      </div>

      <div className="label-payment-block">
        {label.paymentMethod === "COD_ONGKIR" ? (
          <>
            <div className="label-payment" data-cod="">
              <span>COD ONGKIR — TAGIH ONGKIR SAJA</span>
              <b>{formatIdr(label.providerCodAmountIdr as number)}</b>
            </div>
            <div className="label-money">
              <div><span>Barang sudah dibayar</span><b>JANGAN DITAGIH</b></div>
            </div>
          </>
        ) : label.isCod ? (
          <>
            <div className="label-payment" data-cod="">
              <span>COD — TAGIH KE PENERIMA</span>
              <b>{formatIdr(label.providerCodAmountIdr as number)}</b>
            </div>
            {/* T-270 (owner 2026-10-01): the customer's view only — Nilai barang + Ongkir (the amount
                less Nilai barang), which add up to the amount above. Biaya COD and Pembulatan are the
                gerai's business, inside Ongkir, never printed apart. */}
            {label.collectBreakdown ? (
              <div className="label-money">
                <div><span>{MONEY_LABELS.goods}</span><span>{formatIdr(label.collectBreakdown.goodsValueIdr)}</span></div>
                <div><span>{MONEY_LABELS.customerOngkir}</span><span>{formatIdr(label.collectBreakdown.ongkirIdr)}</span></div>
              </div>
            ) : null}
          </>
        ) : (
          // T-255: non-COD is plain bold text; only an amount to collect prints inverted.
          // T-270 (owner 2026-10-01): no seller-side amount (Ongkir dibayar ke Mengantar) for any
          // role — the sheet is the courier's and recipient's document.
          <div className="label-payment">
            <span>NON-COD — JANGAN TAGIH PENERIMA</span>
          </div>
        )}
      </div>

      {/* T-255: two plain lines — what is inside and its weight, then size, value and insurance.
          T-273: "Nilai barang", the form's word (COD Ongkir keeps "Nilai (lunas)" so it never reads as a sum to collect, T-186); the insurance only when the parcel is insured, so a
          Non-COD label never reads a value "untuk asuransi" beside "Asuransi Mengantar Tidak ada". */}
      <div className="label-facts">
        <p className="label-facts-line">
          <b>Isi</b>{" "}<span className="label-facts-content">{label.package.content}</span>
          <span className="label-facts-weight">{" · "}{formatWeight(label.package.weightGrams)} · {label.package.quantity} koli</span>
        </p>
        <p className="label-facts-line">
          {dimensions ?? "Dimensi tidak dicatat"}
          {" · "}<b>{label.paymentMethod === "COD_ONGKIR" ? "Nilai (lunas)" : "Nilai barang"}</b> {formatIdr(label.package.declaredValueIdr)}
          {label.insuranceAmountIdr === null ? null : <>{" · "}<b>Asuransi Mengantar</b> {formatIdr(label.insuranceAmountIdr)}</>}
        </p>
      </div>

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
 * address, patokan (T-258) or phone, no sender contact, no package value and no COD breakdown.
 * T-265 (owner 2026-09-30): no "Diserahkan" line while no handover is recorded — the stub never
 * claims a time nobody confirmed. T-267: once a handover is recorded ("Tandai sudah
 * diserahkan"), the row returns with that recorded server time in WIB; an undone handover removes it.
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
          {courierDisplayName(label.courier)} <span className="label-service">{serviceName(label.courier, label.providerService)}</span>
        </p>
        <p className="label-stub-payment">
          {label.paymentMethod === "COD_ONGKIR"
            ? <>COD ONGKIR <b>{formatIdr(label.providerCodAmountIdr as number)}</b></>
            : label.isCod ? <>COD <b>{formatIdr(label.providerCodAmountIdr as number)}</b></> : "NON-COD"}
        </p>
      </div>
      <div className="label-awb-block">
        <LabelBarcode fill heightMm={THERMAL.stubBarHeightMm} value={label.awb} />
        <p className="label-awb"><span className="label-eyebrow">Resi</span> {label.awb}</p>
      </div>
      <dl className="label-stub-facts">
        <div><dt>No. kiriman</dt><dd>{label.publicReference}</dd></div>
        <div><dt>Tujuan</dt><dd>{formatDistrictCity(label.destinationAreaLabel)}</dd></div>
        {label.handedOverAt ? (
          <div><dt>Diserahkan</dt><dd><time dateTime={label.handedOverAt.toISOString()}>{formatWibDateTime(label.handedOverAt)}</time></dd></div>
        ) : null}
      </dl>
    </section>
  );
}
