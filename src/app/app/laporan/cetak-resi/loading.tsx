import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function PrintHistoryLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader description="Menyiapkan filter dan riwayat permintaan cetak." eyebrow="Laporan" title="Riwayat cetak resi" />
      <div aria-label="Memuat riwayat cetak resi" className="grid gap-4" role="status">
        <div className="grid gap-3 md:grid-cols-[minmax(0,20rem)_minmax(0,14rem)]">
          <Skeleton className="h-11 w-full md:h-10" />
          <Skeleton className="h-11 w-full md:h-10" />
        </div>
        <Skeleton className="h-3 w-72 max-w-full" />
        <div className="overflow-hidden rounded-xl bg-card border">
          <Skeleton className="h-10 w-full rounded-none" />
          <div className="grid gap-3 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-9 w-full" key={index} />)}</div>
        </div>
        <span className="sr-only">Memuat riwayat cetak resi…</span>
      </div>
    </PageContainer>
  );
}
