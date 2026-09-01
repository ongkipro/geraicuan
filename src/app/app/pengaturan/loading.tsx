import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function OutletSettingsLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader
        description="Lengkapi pickup, area asal, dan sumber koneksi. Nilai kredensial tidak pernah dikirim ke browser."
        eyebrow="Pengaturan"
        title="Outlet & koneksi"
      />
      <section
        aria-label="Memuat ringkasan kesiapan outlet"
        className="grid overflow-hidden rounded-lg border sm:grid-cols-2"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className={`grid gap-2 p-3 ${index > 0 ? "border-t" : ""} ${index === 1 ? "sm:border-t-0" : ""} ${index % 2 === 1 ? "sm:border-l" : ""}`}
            key={index}
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </section>
      <Card
        aria-label="Memuat pengaturan outlet"
        className="max-w-3xl shadow-none"
        role="status"
      >
        <CardHeader className="border-b">
          <Skeleton className="h-5 w-48 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="h-3 w-40 max-w-full" />
        </CardHeader>
        <CardContent className="grid gap-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-11 w-40 max-sm:w-full" />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
