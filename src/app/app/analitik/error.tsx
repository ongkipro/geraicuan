"use client";

import { CircleAlert } from "lucide-react";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import {
  RetryRegionButton,
  useFocusTargetOnMount,
} from "@/components/cms/retry-region-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const HEADING_ID = "analytics-page-heading";

type AnalyticsErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AnalyticsError({ reset }: AnalyticsErrorProps) {
  useFocusTargetOnMount(HEADING_ID);

  return (
    <PageContainer width="wide">
      <PageHeader
        description="Ringkasan operasional dan nilai kiriman tenant."
        eyebrow="Wawasan"
        focusTargetId={HEADING_ID}
        title="Analitik"
      />
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Analitik tidak dapat dimuat</AlertTitle>
        <AlertDescription>
          Rentang dan zona waktu tetap tersimpan pada alamat halaman. Coba muat ulang data analitik.
          <div className="mt-3">
            <RetryRegionButton
              focusTargetId={HEADING_ID}
              label="Muat ulang"
              onRetry={reset}
            />
          </div>
        </AlertDescription>
      </Alert>
    </PageContainer>
  );
}
