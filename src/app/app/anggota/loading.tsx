import { SettingsFrame } from "@/app/app/pengaturan/_components/settings-frame";
import { SettingsCardSkeleton } from "@/app/app/pengaturan/_components/settings-skeleton";
import { PageHeader } from "@/components/app/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** T-256: the final shape — section header with its button, the stat strip, then the member list. */
export default function MembersLoading() {
  return (
    <SettingsFrame header={<PageHeader title="Pengaturan" />}>
      <div aria-busy="true" className="flex flex-col gap-6">
        <p className="sr-only" role="status">Memuat anggota…</p>
        <div aria-hidden="true" className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-11 w-full rounded-lg sm:h-10 sm:w-44" />
        </div>
        <div aria-hidden="true" className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-border shadow-card">
          {[0, 1, 2].map((item) => (
            <div className="grid min-h-16 gap-2 bg-card px-3 py-2.5" key={item}>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-8" />
            </div>
          ))}
        </div>
        <SettingsCardSkeleton rowHeight="h-16" rows={3} />
      </div>
    </SettingsFrame>
  );
}
