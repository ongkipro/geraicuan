"use client";

import { ReportError } from "@/app/app/laporan/_components/report-error";

export default function PrintHistoryError({ retry }: { retry: () => void }) {
  return <ReportError retry={retry} title="Riwayat cetak resi" />;
}
