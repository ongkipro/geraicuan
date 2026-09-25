import { PlatformSkeleton } from "./_components/platform-skeleton";

export default function PlatformOverviewLoading() {
  return <PlatformSkeleton cards={[3, 6, 5, 5]} description="Kesehatan pengajuan ke Mengantar, antrean, dan aktivitas seluruh tenant." label="Memuat ringkasan" tiles={5} title="Ringkasan" />;
}
