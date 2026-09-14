import { administrationNavigation } from "@/app/app/pengaturan/settings-nav";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { SettingsLayout } from "@/components/cms/settings-layout";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";


export default function TenantMembersLoading() {
  return (
    <PageContainer aria-busy="true" width="wide">
      <SettingsLayout
        currentHref="/app/anggota"
        header={
          <PageHeader
            description="Undang anggota, ubah peran, dan nonaktifkan akses tenant."
            eyebrow="Pengaturan"
            title="Anggota & akses"
          />
        }
        items={administrationNavigation}
        navLabel="Administrasi"
      >
        <div className="grid min-w-0 gap-8">
          <section
            aria-label="Memuat ringkasan anggota"
            className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border xl:grid-cols-4"
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div className="grid gap-2 bg-background px-4 py-3" key={index}>
                <Skeleton className="h-3 w-24 max-w-full" />
                <Skeleton className="h-7 w-10" />
              </div>
            ))}
          </section>
          <section aria-label="Memuat daftar anggota" className="grid gap-4" role="status">
            <div className="grid gap-2">
              <Skeleton className="h-6 w-40 max-w-full" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <Separator />
            <div className="min-w-0 overflow-hidden rounded-md border">
              <div className="hidden h-10 border-b bg-muted/50 sm:block" />
              <div className="divide-y">
                {Array.from({ length: 3 }, (_, index) => (
                  <div className="grid gap-3 px-4 py-3" key={index}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                      <div className="grid gap-1.5">
                        <Skeleton className="h-4 w-44 max-w-full" />
                        <Skeleton className="h-4 w-72 max-w-full" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-5 w-36" />
                    </div>
                    <Skeleton className="h-11 w-full sm:w-32 md:h-8" />
                  </div>
                ))}
              </div>
            </div>
          </section>
          <div className="grid gap-4">
            <Skeleton className="h-6 w-36" />
            <Separator />
            <Skeleton className="h-24 w-full lg:max-w-xl" />
          </div>
        </div>
      </SettingsLayout>
    </PageContainer>
  );
}
