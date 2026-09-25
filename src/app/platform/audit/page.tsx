import type { Metadata } from "next";

import { MonitoringView } from "@/app/platform/_components/monitoring-view";

export const metadata: Metadata = { title: "Audit · GeraiCUAN", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PlatformAuditPage({ searchParams }: Props) {
  return <MonitoringView kind="audit" rawParams={await searchParams} route="/platform/audit" />;
}
