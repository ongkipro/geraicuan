"use client";

import { CircleAlert } from "lucide-react";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { RetryRegionButton, useFocusTargetOnMount } from "@/components/cms/retry-region-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const HEADING_ID = "shipment-draft-error-heading";

export default function NewShipmentError({ reset }: { error: Error; reset: () => void }) {
  useFocusTargetOnMount(HEADING_ID);
  return (
    <PageContainer>
      <PageHeader eyebrow="Pengiriman" focusTargetId={HEADING_ID} title="Buat kiriman" />
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Formulir draf tidak dapat dimuat</AlertTitle>
        <AlertDescription className="space-y-4">
          <p>Coba muat kembali. Belum ada draf atau permintaan penyedia yang dibuat.</p>
          <RetryRegionButton focusTargetId={HEADING_ID} onRetry={reset} />
        </AlertDescription>
      </Alert>
    </PageContainer>
  );
}
