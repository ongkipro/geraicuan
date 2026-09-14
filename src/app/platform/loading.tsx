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
        eyebrow="Operasi platform"
        title="Pemantauan platform"
      />
      {/* Mirrors the page: scope line, visible primary filter controls, the four
          StatCard tiles, then a bordered table. */}
      <Skeleton className="h-5 w-full max-w-lg" />
      <div className="grid grid-cols-2 gap-3 border-y py-3 md:max-w-xl">
        <Skeleton className="h-16 md:h-13"/><Skeleton className="h-16 md:h-13"/>
        <Skeleton className="h-11 md:h-8"/><Skeleton className="h-11 md:h-8"/>
      </div>
      <section aria-label="Memuat ringkasan keputusan" className="grid gap-4">
        <Skeleton className="h-7 w-56 max-w-full" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-56 rounded-xl md:h-44" key={index} />)}
        </div>
      </section>
      <section aria-label="Memuat tabel operasional" className="grid gap-4">
        <Skeleton className="h-7 w-56 max-w-full" />
        <Skeleton className="h-72 w-full rounded-md" />
      </section>
    </PageContainer>
  );
}
