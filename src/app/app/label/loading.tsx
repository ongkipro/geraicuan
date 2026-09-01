import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function LabelIndexLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader description="Menyiapkan filter dan label kiriman yang tersedia." eyebrow="Pengiriman" title="Label & riwayat cetak" />
      <div aria-label="Memuat daftar label" className="grid gap-6" role="status">
        <Card className="shadow-none">
          <CardHeader className="border-b"><Skeleton className="h-5 w-28" /></CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[minmax(13rem,0.8fr)_minmax(15rem,1fr)_auto] lg:items-end">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-11 w-32" />
          </CardContent>
        </Card>
        <div className="grid gap-3">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
        <span className="sr-only">Memuat daftar label…</span>
      </div>
    </PageContainer>
  );
}
