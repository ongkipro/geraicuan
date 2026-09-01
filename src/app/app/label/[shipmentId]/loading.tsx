import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LabelDetailLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader description="Data kiriman dan riwayat cetak sedang disiapkan." eyebrow="Label 100 × 150 mm" title="Memuat label kiriman…" />
      <div aria-label="Memuat detail label" className="grid gap-6" role="status">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><Skeleton className="h-11 w-40" /><Skeleton className="h-4 w-64 max-w-full" /></div>
        <Skeleton className="aspect-[2/3] w-full max-w-[100mm] rounded-lg" />
        <div className="grid gap-3"><Skeleton className="h-6 w-32" /><Skeleton className="h-40 w-full rounded-lg" /></div>
        <span className="sr-only">Memuat detail label…</span>
      </div>
    </PageContainer>
  );
}
