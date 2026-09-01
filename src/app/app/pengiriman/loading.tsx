import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function ShipmentQueueLoading() {
  return (
    <PageContainer aria-busy="true" width="data">
      <PageHeader description="Navigasi dan lingkup tenant tetap tersedia saat antrean dimuat." eyebrow="Operasional kiriman" title="Pengiriman" />
      <div aria-label="Memuat filter dan antrean kiriman" className="grid gap-4" role="status">
        <div className="rounded-lg border p-4"><Skeleton className="h-4 w-32" /><Skeleton className="mt-4 h-11 w-full max-w-72" /></div>
        <Skeleton className="h-12 w-full" />
        <div className="overflow-hidden rounded-lg border"><Skeleton className="h-12 w-full" /><div className="grid gap-3 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-10 w-full" key={index} />)}</div></div>
      </div>
    </PageContainer>
  );
}
