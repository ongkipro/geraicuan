import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function ShipmentReportLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader description="Menyiapkan filter, total periode, dan baris laporan." eyebrow="Laporan" title="Laporan pengiriman" />
      <div aria-label="Memuat laporan pengiriman" className="grid gap-4" role="status">
        <div className="grid gap-3 md:grid-cols-[minmax(0,20rem)_minmax(0,14rem)]">
          <Skeleton className="h-11 w-full md:h-9" />
          <Skeleton className="h-11 w-full md:h-9" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => (
            <div className="overflow-hidden rounded-md border" key={index}>
              <Skeleton className="h-10 w-full rounded-none" />
              <div className="grid gap-3 p-4">{Array.from({ length: 3 }, (_, row) => <Skeleton className="h-6 w-full" key={row} />)}</div>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-md border">
          <Skeleton className="h-10 w-full rounded-none" />
          <div className="grid gap-3 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-9 w-full" key={index} />)}</div>
        </div>
        <span className="sr-only">Memuat laporan pengiriman…</span>
      </div>
    </PageContainer>
  );
}
