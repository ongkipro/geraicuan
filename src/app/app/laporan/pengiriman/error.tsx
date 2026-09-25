"use client";

import { ReportError } from "@/app/app/laporan/_components/report-error";

export default function ShipmentReportError({ retry }: { retry: () => void }) {
  return <ReportError retry={retry} title="Laporan pengiriman" />;
}
