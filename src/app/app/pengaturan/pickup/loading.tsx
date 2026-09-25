import {
  administrationNavigation,
  SETTINGS_INDEX_HREF,
} from "@/app/app/pengaturan/settings-nav";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { SettingsLayout } from "@/components/cms/settings-layout";
import { Skeleton } from "@/components/ui/skeleton";

export default function PickupSettingsLoading() {
  return (
    <PageContainer aria-busy="true">
      <SettingsLayout
        currentHref="/app/pengaturan/pickup"
        header={
          <PageHeader
            description="Alamat penjemputan Mengantar yang boleh dipakai tiap outlet."
            eyebrow="Pengelolaan"
            title="Titik pickup"
          />
        }
        indexHref={SETTINGS_INDEX_HREF}
        items={administrationNavigation}
        navLabel="Menu pengaturan"
      >
        <div aria-label="Memuat titik pickup" className="grid min-w-0 gap-6" role="status">
          <div className="grid gap-3 rounded-xl p-4 border">
            <Skeleton className="h-5 w-40 max-w-full" />
            <Skeleton className="h-4 w-72 max-w-full" />
            {[0, 1, 2].map((index) => <Skeleton className="h-16 w-full" key={index} />)}
          </div>
          <div className="grid gap-3 rounded-xl p-4 border">
            <Skeleton className="h-5 w-48 max-w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </SettingsLayout>
    </PageContainer>
  );
}
