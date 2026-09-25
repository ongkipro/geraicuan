import {
  administrationNavigation,
  SETTINGS_INDEX_HREF,
} from "@/app/app/pengaturan/settings-nav";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { SettingsLayout } from "@/components/cms/settings-layout";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default function OutletSettingsLoading() {
  return (
    <PageContainer aria-busy="true">
      <SettingsLayout
        currentHref="/app/pengaturan/outlet"
        header={
          <PageHeader
            description="Kelola lokasi pickup dan koneksi pengiriman outlet."
            eyebrow="Pengelolaan"
            title="Outlet"
          />
        }
        indexHref={SETTINGS_INDEX_HREF}
        items={administrationNavigation}
        navLabel="Menu pengaturan"
      >
        <div className="grid min-w-0 gap-6">
          <section
            aria-label="Memuat ringkasan kesiapan outlet"
            className="grid grid-cols-2 gap-4 rounded-xl bg-card p-4 border xl:grid-cols-4"
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div className="grid gap-2" key={index}>
                <Skeleton className="h-3 w-24 max-w-full" />
                <Skeleton className="h-7 w-10" />
              </div>
            ))}
          </section>
          <section
            aria-label="Memuat pengaturan outlet"
            className="grid min-w-0 gap-6"
            role="status"
          >
            <div className="min-w-0">
              <Skeleton className="h-14 w-full" />
            </div>
            {/* T-206: mirrors OutletDetail — one card with title, badge, rows and footer actions. */}
            <div className="grid min-w-0 gap-4 rounded-xl border bg-card p-4 md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-2">
                  <Skeleton className="h-6 w-48 max-w-full" />
                  <Skeleton className="h-4 w-64 max-w-full" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
              {Array.from({ length: 3 }, (_, index) => <Skeleton className="h-12 w-full" key={index} />)}
              <Separator />
              <div className="flex flex-wrap justify-end gap-2">
                <Skeleton className="h-10 w-40 max-sm:w-full" />
                <Skeleton className="h-10 w-48 max-sm:w-full" />
              </div>
            </div>
          </section>
        </div>
      </SettingsLayout>
    </PageContainer>
  );
}
