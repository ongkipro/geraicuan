import { CardSkeleton, ReportHeaderSkeleton } from "@/app/app/laporan/_components/report-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** T-254: the page's final shape — Ringkasan panels, trend beside status, then full-width cards. */
export default function ShipmentReportLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat laporan pengiriman" className="contents" role="status">
      <ReportHeaderSkeleton controls={4} />
      <div className="grid gap-3">
        <Skeleton className="h-6 w-32" />
        <div className="grid gap-3 sm:gap-6 xl:grid-cols-3">
          <Skeleton className="h-24 rounded-2xl xl:col-span-2" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3"><CardSkeleton rows={6} /></div>
        <div className="xl:col-span-2"><CardSkeleton rows={4} /></div>
      </div>
      <CardSkeleton rows={4} />
      <CardSkeleton rows={8} />
    </div>
  );
}
