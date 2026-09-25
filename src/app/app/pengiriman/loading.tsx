import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the page (T-206): filter row, status summary, then one card with toolbar, rows and pagination. */
export default function ShipmentQueueLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader description="Kelola draf, penerbitan resi, dan tindak lanjut kiriman." eyebrow="Pengiriman" title="Histori kiriman" />
      <div aria-label="Memuat filter dan histori kiriman" className="grid gap-4" role="status">
        <div className="grid gap-2">
          <Skeleton className="h-11 w-full md:h-10 md:w-80" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-20 w-full rounded-xl" key={index} />)}</div>
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-col gap-2 border-b p-4 md:flex-row md:justify-between">
            <Skeleton className="h-11 w-full md:h-10 md:w-56" />
            <Skeleton className="h-11 w-full md:h-10 md:w-48" />
          </div>
          <div className="grid gap-3 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-20 w-full md:h-9" key={index} />)}</div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-60 md:h-10" />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
