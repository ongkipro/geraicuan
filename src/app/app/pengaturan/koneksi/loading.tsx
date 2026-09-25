import {
  administrationNavigation,
  SETTINGS_INDEX_HREF,
} from "@/app/app/pengaturan/settings-nav";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { SettingsLayout } from "@/components/cms/settings-layout";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default function MengantarConnectionSettingsLoading() {
  return (
    <PageContainer aria-busy="true">
      <SettingsLayout
        currentHref="/app/pengaturan/koneksi"
        header={
          <PageHeader
            description="Sumber koneksi Mengantar tiap outlet: koneksi bawaan GeraiCUAN atau akun sendiri."
            eyebrow="Pengelolaan"
            title="Koneksi Mengantar"
          />
        }
        indexHref={SETTINGS_INDEX_HREF}
        items={administrationNavigation}
        navLabel="Menu pengaturan"
      >
        <div className="grid min-w-0 gap-6">
          <section
            aria-label="Memuat koneksi Mengantar"
            className="grid min-w-0 gap-6"
            role="status"
          >
            <div className="min-w-0">
              <Skeleton className="h-14 w-full" />
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
