import { CardSkeleton, ReportHeaderSkeleton } from "@/app/app/laporan/_components/report-skeleton";

export default function PayoutLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat pencairan COD" className="contents" role="status">
      <ReportHeaderSkeleton controls={2} />
      <CardSkeleton rows={3} />
      <CardSkeleton rows={8} />
    </div>
  );
}
