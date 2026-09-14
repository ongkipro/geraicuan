"use client";

import { CircleAlert } from "lucide-react";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import {
  RetryRegionButton,
  useFocusTargetOnMount,
} from "@/components/cms/retry-region-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const HEADING_ID = "dashboard-page-heading";

export default function TenantError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useFocusTargetOnMount(HEADING_ID);

  return (
    <PageContainer width="wide">
      <PageHeader eyebrow="Operasional tenant"
        focusTargetId={HEADING_ID}
        title="Ringkasan"
      />
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Konten tidak dapat dimuat</AlertTitle>
        <AlertDescription>
          Terjadi gangguan saat membaca data operasional. Lingkup akun dan
          detail internal tetap terlindungi.
          <div className="mt-3">
            <RetryRegionButton focusTargetId={HEADING_ID} onRetry={reset} />
          </div>
        </AlertDescription>
      </Alert>
    </PageContainer>
  );
}
