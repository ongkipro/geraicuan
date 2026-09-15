import { administrationNavigation } from "@/app/app/pengaturan/settings-nav";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { SettingsLayout } from "@/components/cms/settings-layout";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";


export default function OutletSettingsLoading() {
  return (
    <PageContainer aria-busy="true" width="wide">
      <SettingsLayout
        currentHref="/app/pengaturan"
        header={
          <PageHeader
            description="Kelola lokasi pickup dan koneksi pengiriman outlet."
            eyebrow="Pengaturan"
            title="Outlet & koneksi"
          />
        }
        items={administrationNavigation}
        navLabel="Administrasi"
      >
        <div className="grid min-w-0 gap-6">
          <section
            aria-label="Memuat ringkasan kesiapan outlet"
            className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border xl:grid-cols-4"
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div className="grid gap-2 bg-background px-4 py-3" key={index}>
                <Skeleton className="h-3 w-24 max-w-full" />
                <Skeleton className="h-7 w-10" />
              </div>
            ))}
          </section>
          <section
            aria-label="Memuat pengaturan outlet"
            className="grid min-w-0 gap-6 xl:grid-cols-[14rem_minmax(0,1fr)] xl:gap-10"
            role="status"
          >
            <div className="min-w-0">
              <Skeleton className="h-14 w-full xl:hidden" />
              <div className="hidden gap-1 xl:grid">
                {Array.from({ length: 6 }, (_, index) => (
                  <div className="grid min-h-11 gap-2 px-3 py-2" key={index}>
                    <Skeleton className="h-4 w-32 max-w-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid min-w-0 gap-8">
              <div className="grid gap-2 border-b pb-5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-48 max-w-full" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
              {Array.from({ length: 2 }, (_, index) => (
                <div className="grid gap-4" key={index}>
                  <div className="grid gap-2">
                    <Skeleton className="h-6 w-40 max-w-full" />
                    <Skeleton className="h-4 w-72 max-w-full" />
                  </div>
                  <Separator />
                  <div className="grid gap-4 lg:max-w-xl">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-11 w-40 max-sm:w-full sm:ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </SettingsLayout>
    </PageContainer>
  );
}
