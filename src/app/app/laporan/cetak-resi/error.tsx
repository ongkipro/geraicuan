"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { RetryRegionButton, useFocusTargetOnMount } from "@/components/cms/retry-region-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const HEADING_ID = "print-history-heading";

export default function PrintHistoryError({ reset }: { reset: () => void }) {
  useFocusTargetOnMount(HEADING_ID);
  return (
    <PageContainer>
      <PageHeader eyebrow="Laporan" focusTargetId={HEADING_ID} title="Riwayat cetak resi" />
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Riwayat cetak belum dapat dimuat</AlertTitle>
        <AlertDescription className="space-y-4">
          <p>Coba muat ulang halaman. Catatan cetak yang sudah tersimpan tidak berubah.</p>
          <div className="flex flex-wrap gap-2">
            <RetryRegionButton focusTargetId={HEADING_ID} onRetry={reset} />
            <Button asChild className="min-h-11" variant="outline"><Link href="/app/label">Buka Cetak resi</Link></Button>
          </div>
        </AlertDescription>
      </Alert>
    </PageContainer>
  );
}
