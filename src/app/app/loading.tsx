import {
  ActionSkeleton,
  MetricsSkeleton,
  PeriodSummarySkeleton,
  PeriodTrendSkeleton,
  ReadinessSkeleton,
  RecentSkeleton,
} from "@/app/app/dashboard-regions";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TenantLoading() {
  return (
    <PageContainer
      aria-busy="true"
      aria-label="Memuat ringkasan operasional tenant"
      role="status"
      width="wide"
    >
      <PageHeader
        description="Menyiapkan data operasional dan pekerjaan yang perlu ditindaklanjuti."
        eyebrow="Operasional tenant"
        title="Ringkasan"
      />
      <ReadinessSkeleton />
      <Card className="overflow-hidden rounded-lg shadow-none">
        <CardHeader className="space-y-3 border-b">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-4 border-b py-4">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-6 w-56 max-w-full" />
        </CardContent>
        <PeriodSummarySkeleton />
        <PeriodTrendSkeleton />
      </Card>
      <MetricsSkeleton />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
        <ActionSkeleton />
        <Card className="h-fit rounded-lg shadow-none">
          <CardHeader className="space-y-3 border-b">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-52 max-w-full" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton className="h-9 w-full" key={index} />
            ))}
          </CardContent>
        </Card>
      </div>
      <RecentSkeleton />
    </PageContainer>
  );
}
