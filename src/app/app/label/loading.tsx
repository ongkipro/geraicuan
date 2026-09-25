import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the page (T-206): filter row, print-state summary, then one card with search and rows. */
export default function LabelIndexLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader description="Label tersedia setelah nomor resi resmi terbit dari Mengantar." eyebrow="Pengiriman" title="Cetak resi" />
      <div aria-label="Memuat daftar label" className="grid gap-4" role="status">
        <div className="grid gap-2">
          <Skeleton className="h-11 w-full md:h-10 md:w-80" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton className="h-20 w-full rounded-xl" key={index} />)}</div>
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b p-4">
            <Skeleton className="h-11 w-40 md:h-10 lg:w-64" />
            <Skeleton className="h-11 w-36 md:h-10" />
          </div>
          <div className="grid gap-3 p-4">{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-20 w-full md:h-9" key={index} />)}</div>
        </div>
        <span className="sr-only">Memuat daftar label…</span>
      </div>
    </PageContainer>
  );
}
