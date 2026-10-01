"use client";

import { ReportError } from "@/app/app/laporan/_components/report-error";

export default function PayoutError({ retry }: { retry: () => void }) {
  return <ReportError retry={retry} title="Pencairan COD" />;
}
