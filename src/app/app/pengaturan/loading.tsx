import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function OutletSettingsLoading() {
  return (
    <PageContainer aria-busy="true" width="wide">
      <PageHeader
        description="Lengkapi pickup, area asal, dan sumber koneksi. Nilai kredensial tidak pernah dikirim ke browser."
        eyebrow="Pengaturan"
        title="Outlet & koneksi"
      />
      <section
        aria-label="Memuat ringkasan kesiapan outlet"
        className="grid grid-cols-2 border-y xl:grid-cols-4"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className={`grid gap-2 px-3 py-3 ${index % 2 === 1 ? "border-l" : ""} ${index > 1 ? "border-t xl:border-t-0" : ""} ${index > 0 ? "xl:border-l" : ""}`}
            key={index}
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </section>
      <section
        aria-label="Memuat pengaturan outlet"
        className="grid min-w-0 border-y xl:grid-cols-[15rem_minmax(0,1fr)]"
        role="status"
      >
        <div className="min-w-0 xl:border-r">
          <div className="flex min-h-14 items-center justify-between gap-3 px-1 py-3 xl:hidden">
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-40 max-w-full" />
            </div>
            <Skeleton className="h-6 w-28" />
          </div>
          <div className="hidden gap-0 xl:grid">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="grid min-h-14 gap-2 border-b px-3 py-3" key={index}>
                <Skeleton className="h-4 w-32 max-w-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-6 border-t py-6 xl:border-t-0 xl:px-6">
          <div className="grid gap-2 border-b pb-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-48 max-w-full" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-11 w-40 max-sm:w-full" />
        </div>
      </section>
    </PageContainer>
  );
}
