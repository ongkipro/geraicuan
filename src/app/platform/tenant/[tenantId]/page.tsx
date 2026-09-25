import type { Metadata } from "next";

import { MonitoringView } from "@/app/platform/_components/monitoring-view";

export const metadata: Metadata = { title: "Detail tenant · GeraiCUAN", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlatformTenantDetailPage({ params, searchParams }: Props) {
  const { tenantId } = await params;
  return <MonitoringView kind="tenant-detail" rawParams={await searchParams} route="/platform/tenant/[tenantId]" tenantId={tenantId} />;
}
