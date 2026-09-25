import { CardSkeleton, ReportHeaderSkeleton } from "@/app/app/laporan/_components/report-skeleton";

export default function ShipmentReportLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat laporan pengiriman" className="contents" role="status">
      <ReportHeaderSkeleton controls={4} />
      <div className="grid gap-6 xl:grid-cols-2">
        <CardSkeleton rows={3} />
        <CardSkeleton rows={3} />
      </div>
      <CardSkeleton rows={4} />
      <CardSkeleton rows={8} />
    </div>
  );
}
