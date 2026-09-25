import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <Card className="gap-4">
      <CardHeader className="gap-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-56 max-w-full" /></CardHeader>
      <CardContent className="grid gap-3">{Array.from({ length: rows }, (_, index) => <Skeleton className="h-9 w-full" key={index} />)}</CardContent>
    </Card>
  );
}

/** The dashboard's final shape while its reads run: filter row, four KPIs, two rows of two cards. */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat dasbor" className="flex flex-col gap-6" role="status">
      <PageHeader description="Ringkasan operasional pengiriman, status paket, dan kinerja ekspedisi." eyebrow="Utama" title="Dasbor" />
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-3"><Skeleton className="h-11 w-60 md:h-10" /><Skeleton className="h-11 w-44 md:h-10" /><Skeleton className="h-11 w-28 md:h-10" /></div>
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card className="gap-3 px-5 max-md:px-4" key={index}><Skeleton className="h-5 w-32" /><Skeleton className="h-9 w-16" /><Skeleton className="h-6 w-44" /></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><CardSkeleton rows={5} /><CardSkeleton rows={5} /></div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><CardSkeleton rows={6} /><CardSkeleton rows={6} /></div>
    </div>
  );
}
