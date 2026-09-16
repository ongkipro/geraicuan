"use client";

import { CircleAlert } from "lucide-react";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { RetryRegionButton, useFocusTargetOnMount } from "@/components/cms/retry-region-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type FinanceErrorProps = { error: Error & { digest?: string }; reset: () => void };

export default function FinanceError({ reset }: FinanceErrorProps) {
  useFocusTargetOnMount("finance-error-title");
  return <PageContainer>
    <PageHeader description="Telusuri sumber nilai dan pertahankan koreksi sebagai catatan append-only." eyebrow="Keuangan" title="Ledger & rekonsiliasi" />
    <Alert role="alert" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" id="finance-error-title" tabIndex={-1}>Ledger dan rekonsiliasi tidak dapat dimuat</AlertTitle><AlertDescription className="max-w-2xl space-y-3"><p>Filter tetap tersimpan pada alamat halaman. Coba muat ulang data tanpa mengubah pilihan Anda.</p><RetryRegionButton focusTargetId="finance-error-title" label="Coba muat ulang" onRetry={reset} /></AlertDescription></Alert>
  </PageContainer>;
}
