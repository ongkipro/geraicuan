import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlatformLoading() {
  return (
    <PageContainer aria-busy="true" aria-label="Memuat data pemantauan" width="wide">
      {/* The heading is real, not a skeleton. No platform route has its own
          loading file, so this one covers all four — overview, tenant list,
          tenant detail and audit — and without it four routes stream with no
          h1 at all. The title is the shell's, not any one page's: it is
          replaced the moment the route's own header streams in. */}
      <PageHeader
        description="Navigasi dan lingkup platform tetap tersedia saat data pemantauan dimuat."
        eyebrow="Platform"
        title="Pemantauan platform"
      />
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
