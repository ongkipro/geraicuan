import { DetailLayout } from "@/components/cms/cms-layouts";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// T-206: mirrors the page — status and actions on the rail (first on mobile), the resi card first in the main column.
export default function ShipmentDetailLoading() {
  return (
    <PageContainer aria-busy="true">
      <div className="grid gap-1">
        <Skeleton className="h-5 w-48" />
        <PageHeader description="Status, tindakan berikutnya, pihak, paket, dan biaya satu kiriman." eyebrow="Pengiriman" title="Detail kiriman" />
      </div>
      <div aria-label="Memuat status dan konteks kiriman" role="status">
        <DetailLayout
          asideFirst
          aside={(
            <>
              <Card>
                <CardHeader><div className="flex justify-between gap-4"><Skeleton className="h-5 w-28" /><Skeleton className="h-6 w-24" /></div></CardHeader>
                <CardContent className="grid gap-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></CardContent>
              </Card>
              <Card>
                <CardHeader><Skeleton className="h-5 w-36" /></CardHeader>
                <CardContent><Skeleton className="h-10 w-full" /></CardContent>
              </Card>
            </>
          )}
        >
          <Card>
            <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent><Skeleton className="h-24 w-full" /></CardContent>
          </Card>
          <Card>
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardContent>
          </Card>
        </DetailLayout>
      </div>
    </PageContainer>
  );
}
