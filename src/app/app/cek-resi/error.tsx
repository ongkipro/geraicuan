"use client";

import { CircleAlert } from "lucide-react";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { RetryRegionButton, useFocusTargetOnMount } from "@/components/cms/retry-region-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const HEADING_ID = "tracking-lookup-page-heading";

export default function TrackingLookupError({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useFocusTargetOnMount(HEADING_ID);

  return (
    <PageContainer>
      <PageHeader focusTargetId={HEADING_ID} title="Cek resi" />
      <Alert role="alert" variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Cek resi belum dapat dimuat</AlertTitle>
        <AlertDescription>
          Terjadi gangguan saat menyiapkan halaman. Lingkup tenant dan detail internal tetap terlindungi.
          <div className="mt-3">
            <RetryRegionButton focusTargetId={HEADING_ID} onRetry={reset} />
          </div>
        </AlertDescription>
      </Alert>
    </PageContainer>
  );
}
