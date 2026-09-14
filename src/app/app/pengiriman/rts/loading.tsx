import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function RtsDashboardLoading() {
  return (
    <PageContainer aria-busy="true" width="data">
      <PageHeader description="Navigasi dan lingkup tenant tetap tersedia saat daftar retur dimuat." eyebrow="Operasional kiriman" title="Retur (RTS)" />
      <div aria-label="Memuat ringkasan dan daftar kiriman retur" className="grid gap-4" role="status">
        <div className="flex flex-wrap gap-2">{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-11 w-32 md:h-8" key={index} />)}</div>
        <div className="overflow-hidden rounded-md border">
          <Skeleton className="h-10 w-full rounded-none" />
          <div className="grid gap-3 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-9 w-full" key={index} />)}</div>
        </div>
        <Skeleton className="h-4 w-40" />
      </div>
    </PageContainer>
  );
}
