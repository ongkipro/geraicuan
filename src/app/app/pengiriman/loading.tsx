import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function ShipmentQueueLoading() {
  return (
    <PageContainer aria-busy="true" width="data">
      <PageHeader eyebrow="Operasional kiriman" title="Pengiriman" />
      <div aria-label="Memuat filter dan antrean kiriman" className="grid gap-4" role="status">
        <div className="flex flex-col items-stretch gap-2 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <Skeleton className="h-11 w-full md:h-8 md:w-[13.5rem]" />
          <Skeleton className="h-11 w-full md:h-8 md:w-56" />
        </div>
        <div className="overflow-hidden rounded-md border">
          <Skeleton className="h-10 w-full rounded-none" />
          <div className="grid gap-3 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-9 w-full" key={index} />)}</div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-11 w-60 md:h-8" />
        </div>
      </div>
    </PageContainer>
  );
}
