import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function ContactDirectoryLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader
        actions={<Skeleton className="h-11 w-32 md:h-8" />}
        description="Simpan data pengirim dan penerima sekali, lalu gunakan kembali pada draf berikutnya."
        eyebrow="Data"
        title="Kontak"
      />
      <div aria-label="Memuat direktori kontak" className="grid gap-4" role="status">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 w-20 md:h-8" />
          <Skeleton className="h-11 w-28 md:h-8" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-11 min-w-0 flex-1 md:h-8" />
          <Skeleton className="h-11 w-20 md:h-8" />
        </div>
        <div className="overflow-hidden rounded-md border">
          <Skeleton className="h-10 w-full rounded-none" />
          <div className="grid gap-3 p-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-4" key={index}>
                <Skeleton className="h-5 w-full max-w-72" />
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
        </div>
        <span className="sr-only">Memuat kontak…</span>
      </div>
    </PageContainer>
  );
}
