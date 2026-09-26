import { SettingsFrame } from "@/app/app/pengaturan/_components/settings-frame";
import { SettingsCardSkeleton } from "@/app/app/pengaturan/_components/settings-skeleton";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function MembersLoading() {
  return (
    <SettingsFrame header={<PageHeader title="Pengaturan" />}>
      <div aria-busy="true" className="flex flex-col gap-6">
        <p className="sr-only" role="status">Memuat anggota…</p>
        <div aria-hidden="true" className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Card className="gap-2 px-(--card-spacing)" key={item}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-4 w-32" />
            </Card>
          ))}
        </div>
        <SettingsCardSkeleton rowHeight="h-16" rows={3} />
        <SettingsCardSkeleton rows={2} />
      </div>
    </SettingsFrame>
  );
}
