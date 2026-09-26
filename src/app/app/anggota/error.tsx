"use client";

import { CircleAlert, RefreshCw } from "lucide-react";

import { SettingsFrame } from "@/app/app/pengaturan/_components/settings-frame";
import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

export default function MembersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SettingsFrame header={<PageHeader title="Pengaturan" />}>
      <DataCard>
        <div role="alert">
          <EmptyState
            action={(
              <Button onClick={reset} type="button" variant="outline">
                <RefreshCw aria-hidden="true" data-icon="inline-start" />Coba lagi
              </Button>
            )}
            description="Daftar anggota belum dapat dimuat. Tidak ada akses yang berubah."
            icon={CircleAlert}
            title="Halaman belum dapat dimuat"
          />
        </div>
      </DataCard>
    </SettingsFrame>
  );
}
