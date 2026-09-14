import {
  AnalyticsCourierSkeleton,
  AnalyticsReconciliationSkeleton,
  AnalyticsShipmentSkeleton,
  AnalyticsSummarySkeleton,
  AnalyticsFinancialSkeleton,
  AnalyticsTrendSkeleton,
} from "@/app/app/analitik/analytics-regions";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <PageContainer
      aria-busy="true"
      aria-label="Memuat analitik"
      role="status"
      width="wide"
    >
      <PageHeader eyebrow="Wawasan"
        description="Menyiapkan ringkasan, perbandingan periode, tren, dan daftar kiriman."
        title="Analitik"
      />
      <div className="grid grid-cols-2 gap-3 border-y py-3"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-9 w-36" /></div>
      <Skeleton className="h-10 w-full" />
      <AnalyticsSummarySkeleton />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-7">
        <AnalyticsTrendSkeleton />
        <AnalyticsCourierSkeleton />
      </div>
      <AnalyticsFinancialSkeleton />
      <AnalyticsReconciliationSkeleton />
      <AnalyticsShipmentSkeleton />
    </PageContainer>
  );
}
