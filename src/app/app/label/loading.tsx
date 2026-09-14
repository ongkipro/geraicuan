import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LabelIndexLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader description="Menyiapkan filter dan label kiriman yang tersedia." eyebrow="Pengiriman" title="Label & riwayat cetak" />
      <div aria-label="Memuat daftar label" className="grid gap-4" role="status">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-11 w-[150px] md:h-8 lg:w-[250px]" />
            <Skeleton className="h-11 w-36 md:h-8" />
          </div>
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <div className="overflow-hidden rounded-md border">
          <Skeleton className="h-10 w-full rounded-none" />
          <div className="grid gap-3 p-4">{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-9 w-full" key={index} />)}</div>
        </div>
        <span className="sr-only">Memuat daftar label…</span>
      </div>
    </PageContainer>
  );
}
