import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function RtsDashboardLoading() {
  return (
    <PageContainer aria-busy="true" width="data">
      <PageHeader description="Navigasi dan lingkup tenant tetap tersedia saat daftar retur dimuat." eyebrow="Operasional kiriman" title="Manajemen Retur (RTS)" />
      <div aria-label="Memuat ringkasan dan daftar kiriman retur" className="grid gap-4" role="status">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="rounded-lg border p-4" key={index}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-7 w-12" />
              <Skeleton className="mt-2 h-3 w-20" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border p-4"><Skeleton className="h-4 w-40" /><div className="mt-4 flex flex-wrap gap-1.5">{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-9 w-32" key={index} />)}</div></div>
        <div className="overflow-hidden rounded-lg border"><Skeleton className="h-12 w-full" /><div className="grid gap-3 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-10 w-full" key={index} />)}</div></div>
      </div>
    </PageContainer>
  );
}
