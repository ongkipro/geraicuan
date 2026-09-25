"use client";

import { CircleAlert, RotateCw } from "lucide-react";
import { useTransition } from "react";

import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

/** Spec 10 §6 error state of a report route: the page frame, the cause, and a retry. */
export function ReportError({ retry, title }: { retry: () => void; title: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <>
      <PageHeader eyebrow="Laporan" title={title} />
      <DataCard>
        <div role="alert">
          <EmptyState
            action={(
              <Button disabled={pending} onClick={() => startTransition(retry)} type="button" variant="outline">
                <RotateCw aria-hidden="true" className={pending ? "animate-spin motion-reduce:animate-none" : undefined} />
                {pending ? "Memuat ulang…" : "Coba lagi"}
              </Button>
            )}
            description="Data laporan belum dapat dimuat. Coba lagi sebentar lagi."
            icon={CircleAlert}
            title="Laporan tidak dapat dimuat"
          />
        </div>
      </DataCard>
    </>
  );
}
