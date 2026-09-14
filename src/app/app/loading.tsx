import {
  dashboardOverviewGridClassName,
  MetricsSkeleton,
  PeriodSummarySkeleton,
  PeriodTrendSkeleton,
  ReadinessSkeleton,
  RecentSkeleton,
} from "@/app/app/dashboard-regions";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function TenantLoading() {
  return (
    <PageContainer
      aria-busy="true"
      aria-label="Memuat ringkasan operasional tenant"
      role="status"
      width="wide"
    >
      <PageHeader eyebrow="Operasional tenant"
        title="Ringkasan"
      />
      <ReadinessSkeleton />
      <div className="grid gap-4">
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <PeriodSummarySkeleton />
      </div>
      <div className={dashboardOverviewGridClassName}>
        <PeriodTrendSkeleton />
        <RecentSkeleton />
      </div>
      <MetricsSkeleton />
    </PageContainer>
  );
}
