import type { Metadata } from "next";

import { MonitoringView } from "@/app/platform/_components/monitoring-view";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PlatformTenantPage({ searchParams }: Props) {
  return <MonitoringView kind="tenant-list" rawParams={await searchParams} route="/platform/tenant" />;
}
