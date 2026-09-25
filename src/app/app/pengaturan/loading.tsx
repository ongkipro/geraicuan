import {
  administrationNavigation,
  SETTINGS_INDEX_HREF,
} from "@/app/app/pengaturan/settings-nav";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { SettingsLayout } from "@/components/cms/settings-layout";
import { Skeleton } from "@/components/ui/skeleton";

export default function TenantProfileSettingsLoading() {
  return (
    <PageContainer aria-busy="true">
      <SettingsLayout
        currentHref="/app/pengaturan"
        header={
          <PageHeader
            description="Profil gerai: nama, awalan nomor kiriman, serta format tanggal dan angka."
            eyebrow="Pengelolaan"
            title="Pengaturan"
          />
        }
        indexHref={SETTINGS_INDEX_HREF}
        items={administrationNavigation}
        navLabel="Menu pengaturan"
      >
        <div
          aria-label="Memuat profil gerai"
          className="grid min-w-0 gap-6"
          role="status"
        >
          {Array.from({ length: 3 }, (_, index) => (
            <div className="grid gap-3 rounded-xl p-4 border" key={index}>
              <Skeleton className="h-5 w-40 max-w-full" />
              <Skeleton className="h-4 w-72 max-w-full" />
              <Skeleton className="h-11 w-56 max-w-full" />
            </div>
          ))}
        </div>
      </SettingsLayout>
    </PageContainer>
  );
}
