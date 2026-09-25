"use client";

import { CircleAlert } from "lucide-react";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { RetryRegionButton, useFocusTargetOnMount } from "@/components/cms/retry-region-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const HEADING_ID = "shipment-detail-error-heading";

export default function ShipmentDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useFocusTargetOnMount(HEADING_ID);
  return (
    <PageContainer>
      <PageHeader description="Detail internal tidak ditampilkan ketika pembacaan gagal." eyebrow="Pengiriman" focusTargetId={HEADING_ID} title="Detail kiriman" />
      <Alert role="alert" variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Detail kiriman tidak dapat dimuat</AlertTitle>
        <AlertDescription className="space-y-4"><p>Status dan tindakan tetap tidak berubah sampai data berhasil dimuat kembali.</p><RetryRegionButton focusTargetId={HEADING_ID} onRetry={reset} /></AlertDescription>
      </Alert>
    </PageContainer>
  );
}
