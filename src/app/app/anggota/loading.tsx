import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TenantMembersLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader description="Daftar anggota dan izin tenant sedang disiapkan." eyebrow="Pengaturan" title="Anggota & akses" />
      <section aria-label="Memuat ringkasan anggota" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-20 rounded-none bg-card" key={index} />)}
      </section>
      <section aria-label="Memuat daftar anggota" className="grid gap-3" role="status">
        <Skeleton className="h-12 w-56 max-w-full" />
        {Array.from({ length: 3 }, (_, index) => (
          <Card className="shadow-none" key={index} size="sm">
            <CardHeader><Skeleton className="h-5 w-44 max-w-full" /><Skeleton className="h-4 w-72 max-w-full" /><Skeleton className="h-4 w-32" /></CardHeader>
          </Card>
        ))}
      </section>
      <Skeleton className="h-14 w-full rounded-xl" />
    </PageContainer>
  );
}
