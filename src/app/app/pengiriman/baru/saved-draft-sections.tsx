import { CircleCheck } from "lucide-react";

import { formatIdr } from "@/components/app/money";
import type { ShipmentFlowDraft } from "@/db/shipment-draft-repository";
import { PAYMENT_METHOD_LABELS, paymentMethodOf } from "@/lib/payment-method";
import {
  gramsToKilogramLabel,
  HANDOVER_TYPE_LABELS,
  isHandoverType,
  isPickupVehicle,
  PICKUP_VEHICLE_LABELS,
  pickupDateLabel,
  pickupSlotLabel,
} from "@/lib/shipment-draft-logic";

import { DetailRows, SectionCard } from "./flow-parts";

function SavedBadge() {
  return (
    <span className="flex items-center gap-1.5 self-start rounded-sm border border-ok bg-ok-surface px-2.5 py-0.5 text-xs font-semibold text-ok sm:self-auto">
      <CircleCheck aria-hidden="true" className="size-3.5" />Tersimpan
    </span>
  );
}

/** "Penjemputan terjadwal · Rabu, 30 Sep 2026 · 10.00–11.00 WIB · Motor", or the handover alone. */
export function handoverSummary(draft: Pick<ShipmentFlowDraft, "handoverType" | "pickupDate" | "pickupSlot" | "pickupVehicle">) {
  if (!isHandoverType(draft.handoverType)) return "Belum dicatat";
  if (draft.handoverType === "PICKUP" && draft.pickupDate && draft.pickupSlot) {
    const vehicle = isPickupVehicle(draft.pickupVehicle) ? ` · ${PICKUP_VEHICLE_LABELS[draft.pickupVehicle]}` : "";
    return `${HANDOVER_TYPE_LABELS.PICKUP} · ${pickupDateLabel(draft.pickupDate)} · ${pickupSlotLabel(draft.pickupSlot)}${vehicle}`;
  }
  return HANDOVER_TYPE_LABELS[draft.handoverType];
}

/**
 * T-211: after "Simpan & cek tarif" sections 1–4 show what was saved, read-only, in the same
 * numbered cards; the draft itself is never edited here (a new shipment starts a new form).
 */
export function SavedDraftSections({
  draft,
  origin,
}: {
  draft: ShipmentFlowDraft;
  origin: { areaLabel: string | null; outletName: string; pickupLabel: string | null };
}) {
  const method = paymentMethodOf(draft.isCod, draft.codShippingOnly);
  const dimensions = draft.packageLengthCm && draft.packageWidthCm && draft.packageHeightCm
    ? `${draft.packageLengthCm} × ${draft.packageWidthCm} × ${draft.packageHeightCm} cm`
    : null;
  return (
    <>
      <SectionCard aside={<SavedBadge />} id="section-handover" number={1} title="Penyerahan paket & asal">
        <DetailRows
          rows={[
            ["Tipe penyerahan", handoverSummary(draft)],
            ["Outlet asal", origin.outletName],
            ["Titik pickup", origin.pickupLabel ?? "—"],
            ["Area asal", origin.areaLabel ?? "—"],
          ]}
        />
        {draft.handoverType === "PICKUP" ? (
          <p className="text-xs text-muted-foreground">Jadwal dan kendaraan disimpan di GeraiCUAN, belum dikirim ke Mengantar.</p>
        ) : null}
      </SectionCard>

      <SectionCard aside={<SavedBadge />} id="section-parties" number={2} title="Pengirim & penerima">
        <DetailRows
          rows={[
            ["Pengirim di label", draft.sender ? `${draft.sender.name} · ${draft.sender.phone}` : "—"],
            ["Alamat / kota di label", draft.sender?.address ?? "—"],
            ["Penerima", draft.recipient ? `${draft.recipient.name} · ${draft.recipient.phone}` : "—"],
            ["Alamat penerima", draft.recipient?.address ?? "—"],
            ["Kecamatan tujuan", draft.destinationAreaLabel],
            ...(draft.recipientAddressLandmark ? [["Patokan rumah", draft.recipientAddressLandmark] as [string, string]] : []),
          ]}
        />
      </SectionCard>

      <SectionCard aside={<SavedBadge />} id="section-payment" number={3} title="Pembayaran">
        <DetailRows
          rows={[
            ["Metode pembayaran", PAYMENT_METHOD_LABELS[method]],
            [method === "NON_COD" ? "Nilai barang (asuransi)" : method === "COD" ? "Nilai barang" : "Nilai barang (sudah dibayar)", formatIdr(draft.declaredValueIdr)],
          ]}
        />
      </SectionCard>

      <SectionCard aside={<SavedBadge />} id="section-package" number={4} title="Produk & paket">
        <DetailRows
          rows={[
            ["Isi paket", draft.packageContent],
            ["Berat & jumlah", `${gramsToKilogramLabel(draft.packageWeightGrams)} · ${draft.packageQuantity} barang`],
            ...(draft.shippingInstruction ? [["Instruksi pengiriman", draft.shippingInstruction] as [string, string]] : []),
            ...(dimensions ? [["Dimensi", dimensions] as [string, string]] : []),
            ...(draft.isHazardous ? [["Barang berbahaya", "Ya"] as [string, string]] : []),
          ]}
        />
      </SectionCard>
    </>
  );
}
