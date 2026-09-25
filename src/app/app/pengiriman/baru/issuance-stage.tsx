"use client";

import { Save } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import {
  IssuanceConsent,
  IssuanceOutcome,
  IssuanceProvider,
  IssuanceServiceChooser,
  IssuanceSubmitButton,
  courierOfOption,
  useIssuance,
} from "@/app/app/pengiriman/_components/issuance-panel";
import { Button } from "@/components/ui/button";
import { deliveryEstimateLabel, serviceDisplayName } from "@/lib/labels/courier";
import { courierDisplayName } from "@/lib/mengantar-couriers";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-method";

import { EstimateRefreshButton } from "./estimate-loader";
import { SectionCard } from "./flow-parts";
import { MobileActionBar, SummaryRail, type RailRow } from "./summary-rail";

type ProviderProps = Omit<ComponentProps<typeof IssuanceProvider>, "children">;

export type IssuanceStageRail = {
  destination: string;
  freshness: string;
  handover: string;
  origin: { detail?: string; title: string } | null;
  packageLabel: string;
  sender: string;
};

/** T-211 step 3: saved sections, section 5 (courier grid → services → physical check), rail, bottom bar. */
export function IssuanceStage({
  destinationContext,
  draftHref,
  provider,
  rail,
  sections,
}: {
  destinationContext: string;
  draftHref: string;
  provider: ProviderProps;
  rail: IssuanceStageRail;
  sections: ReactNode;
}) {
  return (
    <IssuanceProvider {...provider}>
      <div className="flex flex-col items-start gap-6 pb-32 lg:flex-row lg:pb-0">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-6">
          {sections}
          <SectionCard
            aside={<EstimateRefreshButton shipmentId={provider.shipmentId} />}
            emphasis
            id="section-service"
            number={5}
            title="Pilih layanan ekspedisi"
          >
            <IssuanceServiceChooser context={destinationContext} />
            <div className="border-t pt-4">
              <IssuanceConsent packageLabel={rail.packageLabel} />
            </div>
            <IssuanceOutcome />
          </SectionCard>
        </div>
        <div className="hidden w-90 shrink-0 lg:sticky lg:top-24 lg:block">
          <IssuanceRail draftHref={draftHref} rail={rail} />
        </div>
      </div>
      <IssuanceBottomBar draftHref={draftHref} />
    </IssuanceProvider>
  );
}

function IssuanceRail({ draftHref, rail }: { draftHref: string; rail: IssuanceStageRail }) {
  const { charges, paymentMethod, selected } = useIssuance();
  const rows: RailRow[] = [
    { label: "Tipe penyerahan", tone: "accent", value: rail.handover },
    { label: "Ekspedisi", tone: "accent", value: selected ? courierDisplayName(courierOfOption(selected)) : "Belum dipilih" },
    { label: "Layanan & estimasi", value: selected ? `${serviceDisplayName(selected.providerService)} (${deliveryEstimateLabel(selected.deliveryEstimate)})` : "—" },
    { label: "Pengirim di label", value: rail.sender },
    { label: "Berat & jumlah", value: rail.packageLabel },
    { label: "Metode bayar", tone: "accent", value: PAYMENT_METHOD_LABELS[paymentMethod] },
  ];
  return (
    <SummaryRail
      actions={(
        <>
          <IssuanceSubmitButton />
          <Button asChild className="w-full" variant="outline">
            <Link href={draftHref}><Save aria-hidden="true" />Simpan draf</Link>
          </Button>
        </>
      )}
      destination={rail.destination}
      freshness={rail.freshness}
      moneyRows={charges?.rows ?? [{ amountIdr: null, label: "Pilih layanan untuk rincian biaya" }]}
      origin={rail.origin}
      rows={rows}
      source="Tarif resmi"
      total={charges
        ? { amountIdr: charges.total.amountIdr, label: charges.total.label, note: charges.note }
        : { amountIdr: null, label: "Total", note: "Pilih layanan terlebih dahulu" }}
    />
  );
}

function IssuanceBottomBar({ draftHref }: { draftHref: string }) {
  const { charges, gateMessage, paymentMethod, selected } = useIssuance();
  return (
    <MobileActionBar
      actions={(
        <>
          <Button asChild size="lg" variant="outline">
            <Link href={draftHref}><Save aria-hidden="true" />Draf</Link>
          </Button>
          <IssuanceSubmitButton label="Terbitkan AWB" showGate={false} />
        </>
      )}
      caption={gateMessage ?? `${selected ? serviceDisplayName(selected.providerService) : "—"} · ${PAYMENT_METHOD_LABELS[paymentMethod]}`}
      total={charges?.total.amountIdr ?? null}
    />
  );
}
