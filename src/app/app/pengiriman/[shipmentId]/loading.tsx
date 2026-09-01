import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function ShipmentDetailLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader description="Snapshot operasional kiriman sedang dimuat." eyebrow="Detail pengiriman" title="Menyiapkan detail kiriman" />
      <div aria-label="Memuat status dan konteks kiriman" className="grid gap-5" role="status">
        <div className="rounded-lg border p-5"><div className="flex justify-between gap-4"><Skeleton className="h-5 w-36" /><Skeleton className="h-6 w-28" /></div><Skeleton className="mt-4 h-4 w-3/4" /><Skeleton className="mt-3 h-3 w-1/2" /></div>
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.75fr)]"><Skeleton className="h-48 w-full" /><Skeleton className="h-64 w-full" /></div>
        <Skeleton className="h-56 w-full" />
      </div>
    </PageContainer>
  );
}
