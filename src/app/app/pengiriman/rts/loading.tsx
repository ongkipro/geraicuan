import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the page (T-206): filter row, status summary, then one card with the rows. */
export default function RtsDashboardLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader description="Pantau retur, tindak lanjuti kendala kurir, dan cek barang yang kembali ke outlet." eyebrow="Pengiriman" title="Retur (RTS)" />
      <div aria-label="Memuat ringkasan dan daftar kiriman retur" className="grid gap-4" role="status">
        <div className="grid gap-2">
          <Skeleton className="h-11 w-full md:h-10 md:w-80" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-20 w-full rounded-xl" key={index} />)}</div>
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b p-4"><Skeleton className="h-5 w-56" /></div>
          <div className="grid gap-3 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-20 w-full md:h-9" key={index} />)}</div>
          <div className="border-t p-4"><Skeleton className="h-4 w-40" /></div>
        </div>
      </div>
    </PageContainer>
  );
}
