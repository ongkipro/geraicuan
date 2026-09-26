import type { ReactNode } from "react";

import { requireReportAdmin } from "@/app/app/laporan/_components/report-access";

/**
 * T-236: guard above the report `loading.tsx` skeletons, so an Operator is redirected before a
 * report frame renders. Each page and the CSV route check again.
 */
export default async function ReportLayout({ children }: { children: ReactNode }) {
  await requireReportAdmin();
  return children;
}
