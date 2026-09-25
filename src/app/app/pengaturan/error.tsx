"use client";

import { CircleAlert, RefreshCw } from "lucide-react";

import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

/** A settings page failed; the header and sub-menu stay, so another page is one click away. */
export default function SettingsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <DataCard>
      <div role="alert">
        <EmptyState
          action={(
            <Button onClick={reset} type="button" variant="outline">
              <RefreshCw aria-hidden="true" data-icon="inline-start" />Coba lagi
            </Button>
          )}
          description="Pengaturan belum dapat dimuat. Tidak ada perubahan yang tersimpan dari halaman ini."
          icon={CircleAlert}
          title="Halaman belum dapat dimuat"
        />
      </div>
    </DataCard>
  );
}
