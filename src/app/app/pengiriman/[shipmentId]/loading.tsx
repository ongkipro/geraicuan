import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ShipmentDetailLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader description="Snapshot operasional kiriman sedang dimuat." eyebrow="Detail pengiriman" title="Menyiapkan detail kiriman" />
      <div aria-label="Memuat status dan konteks kiriman" className="grid gap-6" role="status">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
          <Card className="lg:col-span-4">
            <CardHeader><div className="flex justify-between gap-4"><Skeleton className="h-5 w-36" /><Skeleton className="h-6 w-28" /></div><Skeleton className="h-4 w-3/4" /></CardHeader>
            <CardContent className="grid gap-3"><Skeleton className="h-3 w-1/2" /><Skeleton className="h-16 w-full" /></CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader><Skeleton className="h-5 w-28" /></CardHeader>
            <CardContent className="grid gap-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardContent>
          </Card>
        </div>
        <Skeleton className="h-12 w-full" />
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-64 max-w-full" /></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
