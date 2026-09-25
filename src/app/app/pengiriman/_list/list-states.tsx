"use client";

import { CircleAlert, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Spec 10 §6 loading state of the shipment lists, in their final shape: header, filter row,
 * tiles, and one card with a toolbar, rows and the pagination footer.
 */
export function ListSkeleton({
  actions,
  label,
  tiles,
  title,
}: {
  actions?: ReactNode;
  label: string;
  tiles: number;
  title: string;
}) {
  return (
    <>
      <PageHeader actions={actions} title={title} />
      <div aria-busy="true" aria-label={label} className="flex flex-col gap-6" role="status">
        <div className="grid gap-2">
          <div className="flex gap-3">
            <Skeleton className="h-10 w-64 max-md:h-11" />
            <Skeleton className="h-10 w-24 max-md:h-11" />
          </div>
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className={cn("grid grid-cols-2 gap-3", tiles === 3 ? "md:grid-cols-3" : tiles === 5 ? "md:grid-cols-3 lg:grid-cols-5" : "md:grid-cols-3 lg:grid-cols-6")}>
          {Array.from({ length: tiles }, (_, index) => <Skeleton className="h-28 rounded-xl" key={index} />)}
        </div>
        <Card className="gap-0 py-0">
          <div className="flex flex-wrap items-center gap-3 border-b p-4">
            <Skeleton className="h-10 w-56 max-md:h-11 max-md:w-full" />
            <Skeleton className="ml-auto h-4 w-56 max-md:ml-0" />
          </div>
          <div className="grid gap-3 p-4">
            {Array.from({ length: 6 }, (_, index) => <Skeleton className="h-20 md:h-14" key={index} />)}
          </div>
          <div className="flex items-center justify-between border-t p-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-10 w-56 max-md:hidden" />
          </div>
        </Card>
        <span className="sr-only">Memuat…</span>
      </div>
    </>
  );
}

/** Spec 10 §6 error state: the cause in one line and a retry; nothing already recorded changes. */
export function ListError({ reset, title, what }: { reset: () => void; title: string; what: string }) {
  return (
    <>
      <PageHeader eyebrow="Pengiriman" title={title} />
      <Alert role="alert" variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{what} belum dapat dimuat</AlertTitle>
        <AlertDescription className="grid gap-3">
          <p>Coba lagi. Data yang sudah tersimpan tidak berubah.</p>
          <div>
            <Button onClick={reset} type="button" variant="outline">
              <RotateCw aria-hidden="true" />
              Coba lagi
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </>
  );
}
