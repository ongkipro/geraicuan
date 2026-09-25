import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function LabelDetailLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader description="Data kiriman dan riwayat cetak sedang disiapkan." eyebrow="Pengiriman" title="Memuat label kiriman…" />
      {/* T-206: mirrors the page — controls and history left, the thermal preview right from the split. */}
      <div aria-label="Memuat detail label" className="grid gap-6 @4xl/page:grid-cols-[minmax(0,1fr)_26rem] @4xl/page:items-start" role="status">
        <div className="grid min-w-0 gap-6">
          <Card><CardContent className="grid gap-4"><div className="grid gap-2 sm:grid-cols-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><Skeleton className="h-11 w-40 md:h-8" /><Skeleton className="h-4 w-64 max-w-full" /></div></CardContent></Card>
          <Card><CardHeader><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-64 max-w-full" /></CardHeader><CardContent><Skeleton className="h-24 w-full rounded-md" /></CardContent></Card>
        </div>
        <Skeleton className="aspect-[2/3] w-full max-w-[100mm] rounded-lg" />
        <span className="sr-only">Memuat detail label…</span>
      </div>
    </PageContainer>
  );
}
