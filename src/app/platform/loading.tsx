import { PageContainer } from "@/components/cms/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlatformLoading() {
  return (
    <PageContainer aria-busy="true" aria-label="Memuat data pemantauan" width="wide">
      <div className="space-y-3 border-b pb-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-5 w-[32rem] max-w-full" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <section aria-label="Memuat ringkasan keputusan" className="grid gap-3 border-t pt-6 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-40 rounded-xl" key={index} />)}
      </section>
      <section aria-label="Memuat tabel operasional" className="grid gap-3 border-t pt-6">
        <Skeleton className="h-7 w-56 max-w-full" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </section>
    </PageContainer>
  );
}
