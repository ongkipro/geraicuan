import {
  AnalyticsCourierSkeleton,
  AnalyticsReconciliationSkeleton,
  AnalyticsShipmentSkeleton,
  AnalyticsSummarySkeleton,
  AnalyticsTrendSkeleton,
} from "@/app/app/analitik/analytics-regions";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <PageContainer
      aria-busy="true"
      aria-label="Memuat analitik"
      role="status"
      width="wide"
    >
      <PageHeader
        description="Menyiapkan ringkasan, perbandingan periode, tren, dan daftar kiriman."
        title="Analitik"
      />
      <Card className="hidden md:flex" size="sm">
        <CardHeader className="border-b">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="h-11" key={index} />
            ))}
          </div>
          <Skeleton className="ml-auto h-9 w-32" />
        </CardContent>
      </Card>
      <Skeleton className="h-11 w-40 md:hidden" />
      <Skeleton className="h-16 w-full" />
      <AnalyticsSummarySkeleton />
      <AnalyticsReconciliationSkeleton />
      <AnalyticsTrendSkeleton />
      <AnalyticsCourierSkeleton />
      <AnalyticsShipmentSkeleton />
    </PageContainer>
  );
}
