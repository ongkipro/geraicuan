"use client";

import { CircleAlert, RefreshCw } from "lucide-react";

import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

/** Spec 10 §6: the cause and a retry; no draft is lost (a saved draft stays under Histori kiriman). */
export default function NewShipmentError({ reset }: { reset: () => void }) {
  return (
    <>
      <PageHeader eyebrow="Pengiriman" title="Buat kiriman" />
      <DataCard>
        <EmptyState
          action={<Button onClick={reset} type="button"><RefreshCw aria-hidden="true" />Coba lagi</Button>}
          description="Halaman belum dapat dimuat. Draf yang sudah disimpan tetap ada di Histori kiriman."
          icon={CircleAlert}
          title="Buat kiriman gagal dimuat"
        />
      </DataCard>
    </>
  );
}
