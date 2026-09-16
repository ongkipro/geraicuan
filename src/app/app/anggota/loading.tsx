import {
  administrationNavigation,
  SETTINGS_INDEX_HREF,
} from "@/app/app/pengaturan/settings-nav";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { SettingsLayout } from "@/components/cms/settings-layout";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";


export default function TenantMembersLoading() {
  return (
    <PageContainer aria-busy="true">
      <SettingsLayout
        currentHref="/app/anggota"
        header={
          <PageHeader
            description="Undang anggota, ubah peran, dan nonaktifkan akses tenant."
            eyebrow="Pengaturan"
            title="Anggota & akses"
          />
        }
        indexHref={SETTINGS_INDEX_HREF}
        items={administrationNavigation}
        navLabel="Menu pengaturan"
      >
        {/* Three card frames, matching the settled page's card stack (PR-46). */}
        <div className="grid min-w-0 gap-6">
          <Card aria-label="Memuat ringkasan anggota">
            <CardHeader>
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <div className="grid gap-2 bg-background px-4 py-3" key={index}>
                    <Skeleton className="h-3 w-24 max-w-full" />
                    <Skeleton className="h-7 w-10" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card aria-label="Memuat daftar anggota" role="status">
            <CardHeader>
              <Skeleton className="h-5 w-40 max-w-full" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </CardHeader>
            <CardContent>
              <div className="min-w-0 overflow-hidden rounded-md border">
                <div className="hidden h-10 border-b bg-muted/50 sm:block" />
                <div className="divide-y">
                  {Array.from({ length: 3 }, (_, index) => (
                    <div className="grid gap-3 px-4 py-4" key={index}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                        <div className="grid gap-1.5">
                          <Skeleton className="h-4 w-44 max-w-full" />
                          <Skeleton className="h-4 w-72 max-w-full" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                        <Skeleton className="h-5 w-36" />
                      </div>
                      <Skeleton className="h-11 w-full sm:w-32" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card aria-label="Memuat formulir undangan">
            <CardHeader>
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </CardHeader>
            <CardContent className="grid gap-5">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
            <CardFooter className="justify-end">
              <Skeleton className="h-11 w-full sm:w-36" />
            </CardFooter>
          </Card>
        </div>
      </SettingsLayout>
    </PageContainer>
  );
}
