"use client";

import { CircleAlert } from "lucide-react";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import {
  RetryRegionButton,
  useFocusTargetOnMount,
} from "@/components/cms/retry-region-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const HEADING_ID = "rts-dashboard-error-heading";

export default function RtsDashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useFocusTargetOnMount(HEADING_ID);

  return (
    <PageContainer>
      <PageHeader eyebrow="Operasional kiriman" focusTargetId={HEADING_ID} title="Retur (RTS)" />
      <Alert role="alert" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Daftar retur tidak dapat dimuat</AlertTitle><AlertDescription className="space-y-4"><p>Terjadi gangguan saat membaca kiriman retur. Lingkup tenant dan detail internal tetap terlindungi.</p><RetryRegionButton focusTargetId={HEADING_ID} onRetry={reset} /></AlertDescription></Alert>
    </PageContainer>
  );
}
