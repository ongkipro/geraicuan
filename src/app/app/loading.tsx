import {
  CourierRecapSkeleton,
  dashboardOverviewGridClassName,
  OutcomeSkeleton,
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
    >
      <PageHeader description="Ringkasan operasional pengiriman, status paket, dan kinerja ekspedisi." eyebrow="Utama"
        title="Dasbor"
      />
      <ReadinessSkeleton />
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Skeleton className="h-11 w-full max-w-xl md:h-10" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <PeriodSummarySkeleton />
      </div>
      <div className={dashboardOverviewGridClassName}>
        <OutcomeSkeleton />
        <PeriodTrendSkeleton />
      </div>
      <div className={dashboardOverviewGridClassName}>
        <RecentSkeleton />
        <CourierRecapSkeleton />
      </div>
    </PageContainer>
  );
}
