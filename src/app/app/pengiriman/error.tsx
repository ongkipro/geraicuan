"use client";

import { CircleAlert } from "lucide-react";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import {
  RetryRegionButton,
  useFocusTargetOnMount,
} from "@/components/cms/retry-region-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const HEADING_ID = "shipment-queue-error-heading";

export default function ShipmentQueueError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useFocusTargetOnMount(HEADING_ID);

  return (
    <PageContainer width="data">
      <PageHeader eyebrow="Pengiriman" focusTargetId={HEADING_ID} title="Antrean kiriman" />
      <Alert role="alert" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Antrean tidak dapat dimuat</AlertTitle><AlertDescription className="space-y-4"><p>Terjadi gangguan saat membaca lifecycle kiriman. Lingkup tenant dan detail internal tetap terlindungi.</p><RetryRegionButton focusTargetId={HEADING_ID} onRetry={reset} /></AlertDescription></Alert>
    </PageContainer>
  );
}
