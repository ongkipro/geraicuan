import type { Metadata } from "next";

import { MonitoringView } from "@/app/platform/_components/monitoring-view";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PlatformPage({ searchParams }: Props) {
  return <MonitoringView kind="overview" rawParams={await searchParams} route="/platform" />;
}
