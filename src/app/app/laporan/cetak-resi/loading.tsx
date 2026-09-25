import { CardSkeleton, ReportHeaderSkeleton } from "@/app/app/laporan/_components/report-skeleton";

export default function PrintHistoryLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat riwayat cetak resi" className="contents" role="status">
      <ReportHeaderSkeleton controls={3} />
      <CardSkeleton rows={8} />
    </div>
  );
}
